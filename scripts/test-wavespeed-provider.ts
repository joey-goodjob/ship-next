import assert from 'node:assert/strict';
import { AIMediaType, AITaskStatus, WaveSpeedProvider } from '@/core/ai';

type MockFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function withMockFetch<T>(mockFetch: MockFetch, fn: () => Promise<T>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testGenerateWrappedResponse() {
  let requestUrl = '';
  let requestBody: any = null;
  let authorization = '';

  await withMockFetch(async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body || '{}'));
    authorization = String((init?.headers as Record<string, string>)?.Authorization || '');
    return jsonResponse({
      code: 200,
      data: {
        id: 'req_generate',
        status: 'created',
        outputs: [],
      },
    });
  }, async () => {
    const provider = new WaveSpeedProvider({ apiKey: 'test-key' });
    const result = await provider.generate({
      params: {
        mediaType: AIMediaType.IMAGE,
        prompt: 'a small red cube',
        options: {
          aspect_ratio: '16:9',
          resolution: '1k',
          quality: 'medium',
          output_format: 'png',
        },
      },
    });

    assert.equal(requestUrl, 'https://api.wavespeed.ai/api/v3/openai/gpt-image-2/text-to-image');
    assert.equal(authorization, 'Bearer test-key');
    assert.deepEqual(requestBody, {
      prompt: 'a small red cube',
      enable_sync_mode: false,
      enable_base64_output: false,
      aspect_ratio: '16:9',
      resolution: '1k',
      quality: 'medium',
      output_format: 'png',
    });
    assert.equal(result.taskId, 'req_generate');
    assert.equal(result.taskStatus, AITaskStatus.PENDING);
  });
}

async function testQueryStatusMappingAndOutputs() {
  const responses = [
    { id: 'req_created', status: 'created', outputs: [] },
    { id: 'req_processing', status: 'processing', outputs: [] },
    { id: 'req_completed', status: 'completed', outputs: ['https://cdn.example.com/out.png'], created_at: '2026-06-07T00:00:00.000Z' },
    { id: 'req_failed', status: 'failed', outputs: [], error: 'provider failed' },
  ];
  let index = 0;

  await withMockFetch(async () => jsonResponse(responses[index++]), async () => {
    const provider = new WaveSpeedProvider({ apiKey: 'test-key' });
    const created = await provider.query({ taskId: 'req_created', mediaType: AIMediaType.IMAGE });
    const processing = await provider.query({ taskId: 'req_processing', mediaType: AIMediaType.IMAGE });
    const completed = await provider.query({ taskId: 'req_completed', mediaType: AIMediaType.IMAGE });
    const failed = await provider.query({ taskId: 'req_failed', mediaType: AIMediaType.IMAGE });

    assert.equal(created.taskStatus, AITaskStatus.PENDING);
    assert.equal(processing.taskStatus, AITaskStatus.PROCESSING);
    assert.equal(completed.taskStatus, AITaskStatus.SUCCESS);
    assert.equal(completed.taskInfo?.images?.[0]?.imageUrl, 'https://cdn.example.com/out.png');
    assert.equal(failed.taskStatus, AITaskStatus.FAILED);
    assert.equal(failed.taskInfo?.errorMessage, 'provider failed');
  });
}

async function testErrors() {
  const provider = new WaveSpeedProvider({ apiKey: 'test-key' });

  await withMockFetch(async () => jsonResponse({ error: 'bad gateway' }, 502), async () => {
    await assert.rejects(
      () => provider.generate({ params: { mediaType: AIMediaType.IMAGE, prompt: 'x' } }),
      /request failed with status: 502/
    );
  });

  await withMockFetch(async () => jsonResponse({ code: 401, message: 'unauthorized' }), async () => {
    await assert.rejects(
      () => provider.generate({ params: { mediaType: AIMediaType.IMAGE, prompt: 'x' } }),
      /generate image failed: unauthorized/
    );
  });

  await withMockFetch(async () => jsonResponse({ status: 'created' }), async () => {
    await assert.rejects(
      () => provider.generate({ params: { mediaType: AIMediaType.IMAGE, prompt: 'x' } }),
      /no task id/
    );
  });

  await withMockFetch(async () => jsonResponse({ id: 'req_unknown', status: 'paused' }), async () => {
    await assert.rejects(
      () => provider.query({ taskId: 'req_unknown', mediaType: AIMediaType.IMAGE }),
      /unknown status: paused/
    );
  });
}

async function testCustomStorage() {
  let savedKey = '';
  let savedContentType = '';
  const provider = new WaveSpeedProvider({
    apiKey: 'test-key',
    customStorage: true,
    uuid: () => 'uuid-1',
    saveFiles: async (files) => {
      savedKey = files[0]?.key || '';
      savedContentType = files[0]?.contentType || '';
      return files.map((file) => ({ ...file, url: `https://r2.example.com/${file.key}` }));
    },
  });

  await withMockFetch(async () => jsonResponse({
    id: 'req_completed',
    status: 'completed',
    outputs: ['https://wavespeed.example.com/image.png'],
  }), async () => {
    const result = await provider.query({ taskId: 'req_completed', mediaType: AIMediaType.IMAGE });
    assert.equal(savedKey, 'wavespeed/image/uuid-1.png');
    assert.equal(savedContentType, 'image/png');
    assert.equal(result.taskInfo?.images?.[0]?.imageUrl, 'https://r2.example.com/wavespeed/image/uuid-1.png');
  });
}

async function main() {
  await testGenerateWrappedResponse();
  await testQueryStatusMappingAndOutputs();
  await testErrors();
  await testCustomStorage();
  console.log('WaveSpeed provider tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

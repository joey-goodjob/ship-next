import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

type UploadAudioResponse = {
  url: string;
  key: string;
  filename: string;
  size: number;
};

type ProjectDetails = {
  project: any;
  generationRun?: any | null;
  generationSteps?: any[];
  lines?: any[];
  words?: any[];
  scenes?: any[];
  runtimeState?: any;
};

const DEFAULT_AUDIO_FILE = '/Users/joey/Music/Music/Media.localized/Music/Unknown Artist/Unknown Album/Open Sky Tonight （素材）.mp3';
const DEFAULT_AUDIO_FILENAME = 'Open Sky Tonight （素材）.mp3';

function argValue(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function numberArg(name: string, fallback: number) {
  const value = Number(argValue(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function readDebugCookie() {
  try {
    const content = await readFile(path.join(process.cwd(), 'debug', 'lyric-video-e2e.http'), 'utf-8');
    const match = content.match(/^@cookie\s*=\s*(.+)$/m);
    return match?.[1]?.trim() || '';
  } catch {
    return '';
  }
}

async function resolveCookie() {
  return process.env.LYRIC_VIDEO_E2E_COOKIE || process.env.E2E_COOKIE || (await readDebugCookie());
}

async function requestJson<T>(url: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error: any) {
    const wrapped = new Error(error?.message || `Fetch failed: ${url}`);
    (wrapped as any).cause = error;
    (wrapped as any).request = {
      url,
      method: init.method || 'GET',
    };
    throw wrapped;
  }
  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok || body.code !== 0) {
    const error = new Error(body.message || `Request failed: ${response.status}`);
    (error as any).response = body;
    (error as any).status = response.status;
    throw error;
  }
  return body.data as T;
}

function stepByStage(details: ProjectDetails, stage: string) {
  return (details.generationSteps || []).find((step) => step.stage === stage);
}

function parseJsonField(value: unknown) {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    return JSON.parse(value) as Record<string, any>;
  } catch {
    return {};
  }
}

function sceneHasImage(scene: any) {
  return Boolean(scene?.imageUrl || scene?.status === 'success');
}

function summarizeDetails(details: ProjectDetails) {
  const scenes = details.scenes || [];
  return {
    projectId: details.project?.id,
    pipelineStage: details.project?.pipelineStage,
    pipelineError: details.project?.pipelineError,
    lyricsStatus: details.project?.lyricsStatus,
    scenesStatus: details.project?.scenesStatus,
    generationRun: details.generationRun
      ? {
          id: details.generationRun.id,
          status: details.generationRun.status,
          currentStage: details.generationRun.currentStage,
          progressPercent: details.generationRun.progressPercent,
          errorCode: details.generationRun.errorCode,
          errorMessage: details.generationRun.errorMessage,
        }
      : null,
    steps: (details.generationSteps || []).map((step) => ({
      stage: step.stage,
      status: step.status,
      progressPercent: step.progressPercent,
      errorCode: step.errorCode,
      errorMessage: step.errorMessage,
      failure: parseJsonField(step.outputJson)?.failure ? parseJsonField(step.outputJson) : null,
    })),
    counts: {
      lines: details.lines?.length || 0,
      words: details.words?.length || 0,
      scenes: scenes.length,
      imageSuccess: scenes.filter(sceneHasImage).length,
      imageProcessing: scenes.filter((scene) => scene.status === 'processing' && !scene.imageUrl).length,
      imageFailed: scenes.filter((scene) => scene.status === 'failed' && !scene.imageUrl).length,
    },
    failedScenes: scenes
      .filter((scene) => scene.status === 'failed' && !scene.imageUrl)
      .map((scene) => ({
        id: scene.id,
        sort: scene.sort,
        providerTaskId: scene.providerTaskId,
        imageTaskId: scene.imageTaskId,
        error: scene.error,
        failureCode: scene.failureCode,
      })),
  };
}

function assertStoryboardReady(details: ProjectDetails) {
  const promptStep = stepByStage(details, 'prompt_generation');
  const promptOutput = parseJsonField(promptStep?.outputJson);
  const fixedSceneCount = Number(promptOutput.fixedSceneCount || promptOutput.fixedScenes?.length || 0);
  const sceneCount = details.scenes?.length || 0;
  const promptReadyCount = (details.scenes || []).filter((scene) => String(scene.prompt || '').trim()).length;

  if (!promptStep || promptStep.status !== 'success') {
    throw new Error(`Prompt2 step is not successful: ${promptStep?.status || 'missing'}`);
  }
  if (sceneCount === 0 || promptReadyCount !== sceneCount) {
    throw new Error(`Storyboard prompts are incomplete: promptReady=${promptReadyCount}, scenes=${sceneCount}`);
  }
  if (fixedSceneCount > 0 && sceneCount !== fixedSceneCount) {
    const fallbackSceneIds = Array.isArray(promptOutput.fallbackSceneIds) ? promptOutput.fallbackSceneIds : [];
    throw new Error(`Storyboard scene count mismatch: scenes=${sceneCount}, fixed=${fixedSceneCount}, fallback=${fallbackSceneIds.length}`);
  }
}

function assertPreImageStages(details: ProjectDetails) {
  const lines = details.lines?.length || 0;
  const words = details.words?.length || 0;
  const scenes = details.scenes?.length || 0;
  if (lines === 0 || words === 0) {
    throw new Error(`Lyrics were not persisted: lines=${lines}, words=${words}`);
  }
  if (scenes === 0) {
    throw new Error('Scene timing skeleton/storyboard was not persisted');
  }

  const songStep = stepByStage(details, 'song_analysis');
  if (!songStep || songStep.status !== 'success') {
    throw new Error(`Prompt1 step is not successful: ${songStep?.status || 'missing'}`);
  }
  assertStoryboardReady(details);
}

function isImageReady(details: ProjectDetails) {
  const scenes = details.scenes || [];
  return (
    scenes.length > 0 &&
    scenes.every(sceneHasImage) &&
    details.project?.scenesStatus === 'ready' &&
    details.project?.pipelineStage === 'images_ready' &&
    details.generationRun?.status === 'success'
  );
}

function isTerminalFailure(details: ProjectDetails) {
  return (
    details.generationRun?.status === 'failed' ||
    details.generationRun?.status === 'partial_success' ||
    details.project?.scenesStatus === 'partial_success' ||
    (details.scenes || []).some((scene) => scene.status === 'failed' && !scene.imageUrl)
  );
}

function isGenerationActive(details: ProjectDetails) {
  return ['queued', 'running', 'waiting_provider'].includes(String(details.generationRun?.status || details.project?.generationStatus || ''));
}

async function waitForPreImageStages(params: {
  baseUrl: string;
  cookie: string;
  projectId: string;
  runIndex: number;
  pollMs: number;
  timeoutMs: number;
  startedAt: number;
}) {
  let lastDetails = await getProjectDetails(params);
  while (Date.now() - params.startedAt < params.timeoutMs) {
    try {
      assertPreImageStages(lastDetails);
      return lastDetails;
    } catch (error) {
      if (isTerminalFailure(lastDetails) || !isGenerationActive(lastDetails)) {
        const wrapped = error instanceof Error ? error : new Error(String(error || 'Pre-image stages failed'));
        (wrapped as any).summary = summarizeDetails(lastDetails);
        throw wrapped;
      }
    }

    console.log(
      `[lyric-e2e] run ${params.runIndex}: waiting ${lastDetails.generationRun?.currentStage || lastDetails.project?.pipelineStage} ${lastDetails.generationRun?.status || lastDetails.project?.generationStatus}`
    );
    await new Promise((resolve) => setTimeout(resolve, params.pollMs));
    lastDetails = await getProjectDetails(params);
  }

  const error = new Error(`Timed out waiting for pre-image generation stages for project ${params.projectId}`);
  (error as any).summary = { ...summarizeDetails(lastDetails), errorKind: 'async_pending' };
  throw error;
}

async function uploadAudio(params: { baseUrl: string; cookie: string; audioFile: string; audioFilename: string }) {
  const buffer = await readFile(params.audioFile);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: 'audio/mpeg' }), params.audioFilename);
  return requestJson<UploadAudioResponse>(`${params.baseUrl}/api/storage/upload-audio`, {
    method: 'POST',
    headers: { Cookie: params.cookie },
    body: form,
  });
}

async function getProjectDetails(params: { baseUrl: string; cookie: string; projectId: string }) {
  return requestJson<ProjectDetails>(`${params.baseUrl}/api/lyric-videos/${params.projectId}`, {
    headers: { Cookie: params.cookie },
  });
}

async function runOnce(params: {
  baseUrl: string;
  cookie: string;
  audioFile: string;
  audioFilename: string;
  runIndex: number;
  pollMs: number;
  timeoutMs: number;
}) {
  const startedAt = Date.now();
  console.log(`\n[lyric-e2e] run ${params.runIndex}: upload`);
  const uploaded = await uploadAudio(params);

  console.log(`[lyric-e2e] run ${params.runIndex}: create project`);
  const project = await requestJson<any>(`${params.baseUrl}/api/lyric-videos`, {
    method: 'POST',
    headers: { Cookie: params.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `Open Sky Tonight E2E ${new Date().toISOString()}`,
      language: 'auto',
      audioUrl: uploaded.url,
      audioStorageKey: uploaded.key,
      originalAudioUrl: uploaded.url,
      originalAudioStorageKey: uploaded.key,
      audioFilename: uploaded.filename,
      audioMimeType: 'audio/mpeg',
      audioSizeBytes: uploaded.size,
      artStyle: 'cinematic lyric video',
      palette: 'teal, amber, black',
      aspectRatio: '16:9',
      resolution: '1080p',
    }),
  });

  console.log(`[lyric-e2e] run ${params.runIndex}: generate wait=true project=${project.id}`);
  try {
    await requestJson<any>(`${params.baseUrl}/api/lyric-videos/${project.id}/generate`, {
      method: 'POST',
      headers: { Cookie: params.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wait: true,
        transcribeModel: 'scribe_v2',
        songAnalysisModel: 'gpt-5-5',
        storyboardModel: 'gpt-5-5',
        imageModel: 'nano-banana-2',
      }),
    });
  } catch (error: any) {
    const details = await getProjectDetails({ ...params, projectId: project.id }).catch(() => null);
    if (!details || (!isGenerationActive(details) && !details.scenes?.length)) {
      error.summary = details ? summarizeDetails(details) : null;
      throw error;
    }
    console.warn(
      `[lyric-e2e] run ${params.runIndex}: generate request ended early, recovering from DB state project=${project.id} stage=${details.generationRun?.currentStage || details.project?.pipelineStage}`
    );
  }

  let details = await waitForPreImageStages({
    ...params,
    projectId: project.id,
    startedAt,
  });

  while (Date.now() - startedAt < params.timeoutMs) {
    if (isImageReady(details)) {
      const summary = summarizeDetails(details);
      console.log(`[lyric-e2e] run ${params.runIndex}: pass project=${project.id}`);
      return { status: 'pass', durationMs: Date.now() - startedAt, summary };
    }

    if (isTerminalFailure(details)) {
      const summary = summarizeDetails(details);
      const error = new Error(`Image generation reached terminal failure for project ${project.id}`);
      (error as any).summary = summary;
      throw error;
    }

    await requestJson<any[]>(`${params.baseUrl}/api/lyric-videos/${project.id}/images`, {
      headers: { Cookie: params.cookie },
    });
    await new Promise((resolve) => setTimeout(resolve, params.pollMs));
    details = await getProjectDetails({ ...params, projectId: project.id });
    console.log(
      `[lyric-e2e] run ${params.runIndex}: poll ${details.project?.pipelineStage} images ${summarizeDetails(details).counts.imageSuccess}/${summarizeDetails(details).counts.scenes}`
    );
  }

  const summary = summarizeDetails(details);
  const error = new Error(`Timed out waiting for images_ready for project ${project.id}`);
  (error as any).summary = { ...summary, errorKind: 'async_pending' };
  throw error;
}

async function main() {
  const runs = numberArg('runs', 3);
  const pollMs = numberArg('poll-ms', 15000);
  const timeoutMs = numberArg('timeout-ms', 20 * 60 * 1000);
  const baseUrl = argValue('base-url', process.env.LYRIC_VIDEO_E2E_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')!;
  const audioFile = argValue('audio-file', process.env.LYRIC_VIDEO_E2E_AUDIO_FILE || DEFAULT_AUDIO_FILE)!;
  const audioFilename = argValue('audio-filename', process.env.LYRIC_VIDEO_E2E_AUDIO_FILENAME || DEFAULT_AUDIO_FILENAME)!;
  const cookie = await resolveCookie();
  if (!cookie) {
    throw new Error('Set LYRIC_VIDEO_E2E_COOKIE or @cookie in debug/lyric-video-e2e.http before running E2E.');
  }

  const results = [];
  for (let index = 1; index <= runs; index += 1) {
    try {
      results.push(await runOnce({ baseUrl, cookie, audioFile, audioFilename, runIndex: index, pollMs, timeoutMs }));
    } catch (error: any) {
      const failed = {
        status: 'failed',
        runIndex: index,
        message: error?.message || String(error),
        summary: error?.summary || null,
      };
      results.push(failed);
      await writeReport(results);
      console.error('[lyric-e2e] failed', JSON.stringify(failed, null, 2));
      process.exit(1);
    }
  }

  await writeReport(results);
  console.log(`\n[lyric-e2e] ${runs}/${runs} consecutive runs passed`);
}

async function writeReport(results: unknown[]) {
  const dir = path.join(process.cwd(), 'output', 'lyric-video-e2e');
  await mkdir(dir, { recursive: true });
  const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(path.join(dir, filename), `${JSON.stringify({ results }, null, 2)}\n`, 'utf-8');
  console.log(`[lyric-e2e] report output/lyric-video-e2e/${filename}`);
}

main().catch((error) => {
  console.error('[lyric-e2e] fatal', error?.message || error);
  process.exit(1);
});

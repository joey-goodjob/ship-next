import { respData, respErr } from '@/lib/resp';
import * as service from '@/modules/lyric-videos/service';
import { debugFixtureName, readDebugFixture, withDebugFixture } from '../../_lib/fixtures';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return respErr('Debug API is disabled in production');
  }

  try {
    const body = await req.json();
    const provider = body?.provider || 'kie_codex';
    const model = body?.model || 'gpt-5-5';
    const analyzeFixture = body?.preprocess ? null : await readDebugFixture<any>(body?.fixtureKey, 'analyze.json');
    const preprocess = body?.preprocess || analyzeFixture?.preprocess || body;
    const data = await withDebugFixture({
      fixtureKey: body?.fixtureKey,
      cache: body?.cache,
      refreshCache: body?.refreshCache,
      stage: 'prompt1',
      filename: debugFixtureName('prompt1', [provider, model]),
    }, async () => service.analyzeSongWithKieForDebug({
        preprocess,
        provider,
        model,
      }));
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Debug song analysis failed');
  }
}

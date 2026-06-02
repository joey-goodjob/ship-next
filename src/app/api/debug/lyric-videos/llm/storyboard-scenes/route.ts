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
    const model = body?.model || 'gpt-5-5';
    const analyzeFixture = body?.preprocess ? null : await readDebugFixture<any>(body?.fixtureKey, 'analyze.json');
    const prompt1Fixture = body?.songAnalysis || body?.prompt1_output
      ? null
      : await readDebugFixture<any>(body?.fixtureKey, debugFixtureName('prompt1', ['kie_codex', model]));
    const data = await withDebugFixture({
      fixtureKey: body?.fixtureKey,
      cache: body?.cache,
      refreshCache: body?.refreshCache,
      stage: 'prompt2',
      filename: debugFixtureName('prompt2', ['kie_codex', model]),
    }, async () => service.generateStoryboardScenesWithKieForDebug({
        songAnalysis: body?.songAnalysis || body?.prompt1_output || prompt1Fixture?.songAnalysis,
        preprocess: body?.preprocess || analyzeFixture?.preprocess,
        audioAnalysis: body?.audioAnalysis || analyzeFixture?.audioAnalysis,
        fixedScenes: body?.fixedScenes || analyzeFixture?.fixedScenes,
        model,
      }));
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Debug storyboard scenes failed');
  }
}

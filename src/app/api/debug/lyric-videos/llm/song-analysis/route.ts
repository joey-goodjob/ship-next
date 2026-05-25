import { respData, respErr } from '@/lib/resp';
import * as service from '@/modules/lyric-videos/service';
import { debugFixtureName, withDebugFixture } from '../../_lib/fixtures';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return respErr('Debug API is disabled in production');
  }

  try {
    const body = await req.json();
    const preprocess = body?.preprocess || body;
    const provider = body?.provider || 'kie_claude';
    const model = body?.model || 'default';
    const data = await withDebugFixture({
      fixtureKey: body?.fixtureKey,
      cache: body?.cache,
      refreshCache: body?.refreshCache,
      stage: 'prompt1',
      filename: debugFixtureName('prompt1', [provider, model]),
    }, async () => service.analyzeSongWithKieForDebug({
        preprocess,
        provider,
        model: body?.model,
      }));
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Debug song analysis failed');
  }
}

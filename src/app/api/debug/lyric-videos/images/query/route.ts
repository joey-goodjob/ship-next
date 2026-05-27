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
    const taskIds = Array.isArray(body?.taskIds)
      ? body.taskIds
      : Array.isArray(body?.providerTaskIds)
        ? body.providerTaskIds
        : body?.taskId
          ? [body.taskId]
          : [];
    const data = await withDebugFixture({
      fixtureKey: body?.fixtureKey,
      cache: body?.cache,
      refreshCache: body?.refreshCache,
      stage: 'image-query',
      filename: debugFixtureName('image-query', ['kie', taskIds.join('-')]),
    }, async () => service.queryStoryboardSceneImagesWithKieForDebug({ taskIds }));
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Debug image generation query failed');
  }
}

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
    const aspectRatio = body?.aspectRatio === '9:16' || body?.aspect_ratio === '9:16' ? '9:16' : '16:9';
    const gridSize = Math.max(
      1,
      Math.min(
        5,
        Math.floor(Number(body?.gridSize || body?.grid_size || service.GRID_SCENE_IMAGE_SIZE) || service.GRID_SCENE_IMAGE_SIZE)
      )
    );
    const data = await withDebugFixture({
      fixtureKey: body?.fixtureKey,
      cache: body?.cache,
      refreshCache: body?.refreshCache,
      stage: 'image-split',
      filename: debugFixtureName('image-split', ['kie', 'batched', `grid-${gridSize}x${gridSize}`, aspectRatio, taskIds.join('-')]),
    }, async () => service.splitStoryboardGridImageForDebug({
      taskIds,
      fixtureKey: body?.fixtureKey,
      gridSize,
      aspectRatio,
      panels: Array.isArray(body?.panels) ? body.panels : undefined,
      batches: Array.isArray(body?.batches) ? body.batches : undefined,
    }));
    return respData(data);
  } catch (error: any) {
    console.error('[debug lyric-videos images/split] failed', {
      message: error?.message || 'Debug image grid split failed',
    });
    return respErr(error?.message || 'Debug image grid split failed');
  }
}

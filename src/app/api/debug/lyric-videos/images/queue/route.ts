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
    const model = typeof body?.model === 'string' ? body.model : undefined;
    const aspectRatio = body?.aspectRatio === '9:16' || body?.aspect_ratio === '9:16' ? '9:16' : '16:9';
    const resolution = body?.resolution || '4K';
    const gridSize = Math.max(1, Math.min(5, Math.floor(Number(body?.gridSize || body?.grid_size || 4) || 4)));
    const data = await withDebugFixture({
      fixtureKey: body?.fixtureKey,
      cache: body?.cache,
      refreshCache: body?.refreshCache,
      stage: 'image-queue',
      filename: debugFixtureName('image-queue', ['kie', 'batched', `grid-${gridSize}x${gridSize}`, model || 'default-image-model', aspectRatio, resolution]),
    }, async () => service.queueStoryboardSceneImagesWithKieForDebug({
        scenes: body?.scenes,
        model,
        aspectRatio,
        resolution,
        outputFormat: body?.outputFormat || body?.output_format,
        sceneIds: body?.sceneIds,
        limit: body?.limit,
        gridSize,
      }));
    return respData(data);
  } catch (error: any) {
    console.error('[debug lyric-videos images/queue] failed', {
      message: error?.message || 'Debug image generation queue failed',
    });
    return respErr(error?.message || 'Debug image generation queue failed');
  }
}

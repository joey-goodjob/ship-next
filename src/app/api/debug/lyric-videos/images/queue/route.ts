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
    const model = body?.model || 'gpt-image-2-text-to-image';
    const aspectRatio = body?.aspectRatio || body?.aspect_ratio || '16:9';
    const resolution = body?.resolution || '1K';
    const data = await withDebugFixture({
      fixtureKey: body?.fixtureKey,
      cache: body?.cache,
      refreshCache: body?.refreshCache,
      stage: 'image-queue',
      filename: debugFixtureName('image-queue', ['kie', 'grid-5x5', model, aspectRatio, resolution]),
    }, async () => service.queueStoryboardSceneImagesWithKieForDebug({
        scenes: body?.scenes,
        model,
        aspectRatio,
        resolution,
        outputFormat: body?.outputFormat || body?.output_format,
        sceneIds: body?.sceneIds,
        limit: body?.limit,
      }));
    return respData(data);
  } catch (error: any) {
    console.error('[debug lyric-videos images/queue] failed', {
      message: error?.message || 'Debug image generation queue failed',
    });
    return respErr(error?.message || 'Debug image generation queue failed');
  }
}

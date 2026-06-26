import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { respData, respErr } from '@/lib/resp';
import * as service from '@/modules/lyric-videos/service';

async function getUserId() {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  const startedAt = Date.now();
  const { id, sceneId } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    logLyricStage('scene-images', 'route-retry-start', {
      userId,
      projectId: id,
      sceneId,
      model: body.model,
      billingMode: 'extra_regeneration',
      allowConcurrentImageGeneration: Boolean(body.allowConcurrentImageGeneration),
    });
    const data = await service.queueSceneImages({
      userId,
      projectId: id,
      sceneId,
      model: body.model,
      skipActiveGenerationGuard: Boolean(body.allowConcurrentImageGeneration),
    });
    logLyricStage('scene-images', 'route-retry-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      sceneId,
      queuedCount: data.length,
      scenes: data.map((scene: any) => ({
        id: scene.id,
        status: scene.status,
        providerTaskId: scene.providerTaskId,
        hasImageUrl: Boolean(scene.imageUrl),
      })),
    });
    return respData(data);
  } catch (error: any) {
    logLyricStageError('scene-images', 'route-retry-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
      sceneId,
    });
    return respErr(error?.message || 'Retry scene image failed');
  }
}

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
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  const startedAt = Date.now();
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    logLyricStage('scene-images', 'route-queue-start', {
      userId,
      projectId: id,
      sceneId: body.sceneId,
      sceneIds: body.sceneIds,
      model: body.model,
    });
    const data = body.sceneId
      ? await service.queueSceneImages({
          userId,
          projectId: id,
          sceneId: body.sceneId,
          model: body.model,
        })
      : await service.queueSceneImagesGrid({
          userId,
          projectId: id,
          sceneIds: Array.isArray(body.sceneIds) ? body.sceneIds : undefined,
          model: body.model,
          clearExistingImages: Boolean(body.clearExistingImages),
        });
    logLyricStage('scene-images', 'route-queue-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
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
    logLyricStageError('scene-images', 'route-queue-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    return respErr(error?.message || 'Queue image generation failed');
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  const startedAt = Date.now();
  const { id } = await params;
  try {
    logLyricStage('scene-images', 'route-sync-start', { userId, projectId: id });
    const data = await service.syncSceneImages({ userId, projectId: id });
    logLyricStage('scene-images', 'route-sync-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      syncedCount: data.length,
      scenes: data.map((scene: any) => ({
        id: scene.id,
        status: scene.status,
        providerTaskId: scene.providerTaskId,
        hasImageUrl: Boolean(scene.imageUrl),
      })),
    });
    return respData(data);
  } catch (error: any) {
    logLyricStageError('scene-images', 'route-sync-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    return respErr(error?.message || 'Sync image generation failed');
  }
}

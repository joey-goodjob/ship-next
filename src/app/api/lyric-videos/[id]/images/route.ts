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
      generateVideoPrompts: body.generateVideoPrompts !== false,
    });
    const selectedSceneIds = body.sceneId
      ? [body.sceneId].filter(Boolean)
      : Array.isArray(body.sceneIds)
        ? body.sceneIds.filter(Boolean)
        : undefined;
    const imageQueuePromise = body.sceneId
      ? service.queueSceneImages({
          userId,
          projectId: id,
          sceneId: body.sceneId,
          model: body.model,
          billingMode: 'extra_regeneration',
        })
      : service.queueSceneImagesGrid({
          userId,
          projectId: id,
          sceneIds: selectedSceneIds,
          model: body.model,
          clearExistingImages: Boolean(body.clearExistingImages),
          billingMode: 'extra_regeneration',
        });
    const videoPromptPromise =
      body.generateVideoPrompts !== false
        ? service.generateMissingSceneVideoPrompts({
            userId,
            projectId: id,
            sceneIds: selectedSceneIds,
            model: body.videoPromptModel,
          })
        : Promise.resolve(null);
    const [imageQueueResult, videoPromptResult] = await Promise.allSettled([imageQueuePromise, videoPromptPromise]);
    if (imageQueueResult.status === 'rejected') throw imageQueueResult.reason;
    const queuedScenes = imageQueueResult.value || [];
    if (videoPromptResult.status === 'rejected') {
      logLyricStageError('scene-images', 'route-video-prompts-fail', videoPromptResult.reason, {
        projectId: id,
        sceneId: body.sceneId,
        sceneIds: selectedSceneIds,
      });
    }
    const returnSceneIds = queuedScenes.map((scene: any) => scene.id).filter(Boolean);
    const data =
      returnSceneIds.length > 0
        ? await service.getProjectScenesByIds({
            userId,
            projectId: id,
            sceneIds: returnSceneIds,
          })
        : queuedScenes;
    logLyricStage('scene-images', 'route-queue-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      queuedCount: data.length,
      videoPromptStatus:
        videoPromptResult.status === 'fulfilled'
          ? videoPromptResult.value?.status || 'skipped'
          : 'failed',
      videoPromptPersistedSceneCount:
        videoPromptResult.status === 'fulfilled'
          ? videoPromptResult.value?.persistedSceneCount || 0
          : 0,
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

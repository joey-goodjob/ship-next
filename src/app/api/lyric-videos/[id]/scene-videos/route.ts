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
    const sceneIds = Array.isArray(body.sceneIds) ? body.sceneIds.filter(Boolean) : undefined;
    logLyricStage('scene-videos', 'route-queue-start', {
      userId,
      projectId: id,
      sceneIds,
      model: body.model,
    });
    const data = await service.queueSceneVideos({
      userId,
      projectId: id,
      sceneIds,
      model: body.model,
    });
    logLyricStage('scene-videos', 'route-queue-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      queuedCount: data.length,
      scenes: data.map((scene: any) => ({
        id: scene.id,
        videoStatus: scene.videoStatus,
        videoProviderTaskId: scene.videoProviderTaskId,
      })),
    });
    return respData(data);
  } catch (error: any) {
    logLyricStageError('scene-videos', 'route-queue-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    return respErr(error?.message || 'Queue scene video generation failed');
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
    const data = await service.syncSceneVideos({ userId, projectId: id });
    logLyricStage('scene-videos', 'route-sync-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      sceneCount: data.length,
    });
    return respData(data);
  } catch (error: any) {
    logLyricStageError('scene-videos', 'route-sync-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    return respErr(error?.message || 'Sync scene videos failed');
  }
}

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
    logLyricStage('scene-images-grid', 'route-retry-failed-batches-start', {
      userId,
      projectId: id,
      batchKeys: body.batchKeys,
      model: body.model,
    });
    const data = await service.retryFailedSceneImageBatches({
      userId,
      projectId: id,
      batchKeys: Array.isArray(body.batchKeys) ? body.batchKeys.filter(Boolean).map(String) : undefined,
      model: body.model,
      billingMode: 'extra_regeneration',
    });
    logLyricStage('scene-images-grid', 'route-retry-failed-batches-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      queuedSceneCount: data.queuedScenes.length,
      batchCount: data.batches.length,
      summary: data.summary,
    });
    return respData(data);
  } catch (error: any) {
    logLyricStageError('scene-images-grid', 'route-retry-failed-batches-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    return respErr(error?.message || 'Retry failed image batches failed');
  }
}

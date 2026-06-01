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
    logLyricStage('export-video', 'route-start', {
      userId,
      projectId: id,
      hasSettings: Boolean(body.settings),
    });
    const data = await service.queueExport({
      userId,
      projectId: id,
      settings: body.settings,
    });
    logLyricStage('export-video', 'route-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      exportId: data.id,
      status: data.status,
      videoUrl: data.videoUrl,
      hasVideoUrl: Boolean(data.videoUrl),
    });
    return respData(data);
  } catch (error: any) {
    logLyricStageError('export-video', 'route-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    return respErr(error?.message || 'Queue export failed');
  }
}

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
    logLyricStage('direction-detail', 'route-start', {
      userId,
      projectId: id,
      hasStoryPrompt: typeof body.storyPrompt === 'string' && Boolean(body.storyPrompt.trim()),
      force: Boolean(body.force),
      model: body.model,
    });
    const data = await service.ensureProductionDirectionDetail({
      userId,
      projectId: id,
      storyPrompt: typeof body.storyPrompt === 'string' ? body.storyPrompt : undefined,
      model: typeof body.model === 'string' ? body.model : undefined,
      force: Boolean(body.force),
    });
    logLyricStage('direction-detail', 'route-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      storyPromptHash: data.storyPromptHash,
      reused: data.reused,
      status: data.status,
    });
    return respData(data);
  } catch (error: any) {
    logLyricStageError('direction-detail', 'route-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    return respErr(error?.message || 'Prepare direction detail failed');
  }
}

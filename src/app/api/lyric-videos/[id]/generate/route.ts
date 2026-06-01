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
    const idempotencyKey = req.headers.get('idempotency-key') || body.idempotencyKey;
    logLyricStage('generation-run', 'route-start', {
      userId,
      projectId: id,
      idempotencyKey,
      maxScenes: body.maxScenes,
      transcribeModel: body.transcribeModel,
      songAnalysisModel: body.songAnalysisModel,
      storyboardModel: body.storyboardModel,
    });
    const data = await service.startGenerationRun({
      userId,
      projectId: id,
      idempotencyKey,
      input: body,
    });
    logLyricStage('generation-run', 'route-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      reused: data.reused,
      runId: data.run?.id,
      runStatus: data.run?.status,
      currentStage: data.run?.currentStage,
      stepCount: data.steps?.length || 0,
      lineCount: data.lines?.length || 0,
      wordCount: data.words?.length || 0,
      sceneCount: data.scenes?.length || 0,
      pipelineStage: data.project?.pipelineStage,
      generationStatus: data.project?.generationStatus,
    });
    return respData(data);
  } catch (error: any) {
    logLyricStageError('generation-run', 'route-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    return respErr(error?.message || 'Start generation failed');
  }
}

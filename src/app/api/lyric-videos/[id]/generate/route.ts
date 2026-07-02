import { after } from 'next/server';
import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { respData, respErr } from '@/lib/resp';
import { recordBugProblemEvent } from '@/modules/bug-radar/service';
import * as service from '@/modules/lyric-videos/service';

export const runtime = 'nodejs';
export const maxDuration = 900;

async function getUserId() {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id;
}

function getClientIp(req: Request) {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    ''
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  const startedAt = Date.now();
  const { id } = await params;
  const userAgent = req.headers.get('user-agent') || '';
  const ip = getClientIp(req);
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
      imageModel: body.imageModel,
      mode: body.mode,
      wait: Boolean(body.wait),
      debugStopAfter: body.debug?.stopAfter,
    });
    const data = body.wait
      ? await service.startGenerationRun({
          userId,
          projectId: id,
          idempotencyKey,
          input: body,
        })
      : await service.startGenerationRunQueued({
          userId,
          projectId: id,
          idempotencyKey,
          input: body,
        });

    const queuedData = data as Awaited<ReturnType<typeof service.startGenerationRunQueued>>;
    if (!body.wait && queuedData.shouldExecute && queuedData.execution) {
      const execution = queuedData.execution;
      after(async () => {
        const backgroundStartedAt = Date.now();
        try {
          await service.executeGenerationRun({
            userId,
            projectId: id,
            run: execution.run,
            steps: execution.steps,
            project: execution.project,
            input: execution.input,
            inputSnapshot: execution.inputSnapshot,
          });
          logLyricStage('generation-run', 'route-background-success', {
            durationMs: Date.now() - backgroundStartedAt,
            projectId: id,
            runId: execution.run.id,
          });
        } catch (error: any) {
          logLyricStageError('generation-run', 'route-background-fail', error, {
            durationMs: Date.now() - backgroundStartedAt,
            projectId: id,
            runId: execution.run.id,
          });
          await recordBugProblemEvent({
            eventType: 'generation_failed',
            severity: 'error',
            source: 'api',
            flow: 'lyric_video_generation',
            action: 'generation_background_failed',
            pathname: `/api/lyric-videos/${id}/generate`,
            apiPath: `/api/lyric-videos/${id}/generate`,
            method: 'POST',
            statusCode: 500,
            projectId: id,
            runId: execution.run.id,
            message: error?.message || 'Generation background failed',
            stack: error?.stack || '',
            userId,
            userAgent,
            ip,
            metadata: { durationMs: Date.now() - backgroundStartedAt },
          }).catch(() => undefined);
        }
      });
    }
    const responseData = body.wait
      ? data
      : (() => {
          const { execution: _execution, shouldExecute: _shouldExecute, ...publicData } = queuedData;
          return publicData;
        })();

    logLyricStage('generation-run', 'route-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      reused: responseData.reused,
      runId: responseData.run?.id,
      runStatus: responseData.run?.status,
      currentStage: responseData.run?.currentStage,
      stepCount: responseData.steps?.length || 0,
      lineCount: responseData.lines?.length || 0,
      wordCount: responseData.words?.length || 0,
      sceneCount: responseData.scenes?.length || 0,
      pipelineStage: responseData.project?.pipelineStage,
      generationStatus: responseData.project?.generationStatus,
      queued: queuedData.queued,
      wait: Boolean(body.wait),
    });
    return respData(responseData);
  } catch (error: any) {
    logLyricStageError('generation-run', 'route-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    await recordBugProblemEvent({
      eventType: 'generation_failed',
      severity: 'error',
      source: 'api',
      flow: 'lyric_video_generation',
      action: 'generation_route_failed',
      pathname: `/api/lyric-videos/${id}/generate`,
      apiPath: `/api/lyric-videos/${id}/generate`,
      method: 'POST',
      statusCode: 500,
      projectId: id,
      message: error?.message || 'Start generation failed',
      stack: error?.stack || '',
      userId,
      userAgent,
      ip,
      metadata: { durationMs: Date.now() - startedAt },
    }).catch(() => undefined);
    return respErr(error?.message || 'Start generation failed');
  }
}

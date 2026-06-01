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
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  const startedAt = Date.now();
  const { id } = await params;
  try {
    logLyricStage('asr', 'route-start', { userId, projectId: id });
    const data = await service.runAsr({
      userId,
      projectId: id,
    });
    const scenes = await service.replaceLyricsSceneSkeleton({
      userId,
      projectId: id,
    });
    const responseData = {
      ...data,
      scenes,
      project: data.project
        ? {
            ...data.project,
            scenesStatus: scenes.length > 0 ? 'lyrics_draft' : 'empty',
          }
        : data.project,
    };
    logLyricStage('asr', 'route-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      provider: data.provider,
      model: data.model,
      taskId: data.taskId,
      rawTextLength: data.rawText?.length || 0,
      rawSegmentsCount: data.rawSegments?.length || 0,
      lineCount: data.lines?.length || 0,
      wordCount: data.words?.length || 0,
      sceneCount: scenes.length,
      pipelineStage: responseData.project?.pipelineStage,
      lyricsStatus: responseData.project?.lyricsStatus,
      scenesStatus: responseData.project?.scenesStatus,
    });
    return respData(responseData);
  } catch (error: any) {
    logLyricStageError('asr', 'route-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    return respErr(error?.message || 'ASR failed');
  }
}

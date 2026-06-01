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
    logLyricStage('story-prompt', 'route-start', { userId, projectId: id });
    const data = await service.generateStoryPrompt({
      userId,
      projectId: id,
    });
    logLyricStage('story-prompt', 'route-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      taskId: data.taskId,
      storyPromptLength: data.storyPrompt?.length || 0,
      storyPromptPreview: data.storyPrompt,
      storyPromptPersisted: Boolean(data.project?.storyPrompt),
    });
    return respData(data);
  } catch (error: any) {
    logLyricStageError('story-prompt', 'route-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    return respErr(error?.message || 'Generate story failed');
  }
}

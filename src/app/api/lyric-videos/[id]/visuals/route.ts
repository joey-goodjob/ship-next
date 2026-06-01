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
    logLyricStage('visuals', 'route-start', {
      userId,
      projectId: id,
      hasStoryPrompt: typeof body.storyPrompt === 'string' && Boolean(body.storyPrompt.trim()),
      model: body.model,
      regenerateStoryboard: Boolean(body.regenerateStoryboard),
      regenerateImages: Boolean(body.regenerateImages),
    });
    const data = await service.generateVisualsFromStory({
      userId,
      projectId: id,
      storyPrompt: typeof body.storyPrompt === 'string' ? body.storyPrompt : undefined,
      model: typeof body.model === 'string' ? body.model : undefined,
      regenerateStoryboard: Boolean(body.regenerateStoryboard),
      regenerateImages: Boolean(body.regenerateImages),
    });
    logLyricStage('visuals', 'route-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      generatedStoryboard: data.generatedStoryboard,
      sceneCount: data.scenes?.length || 0,
      queuedImagesCount: data.queuedImages?.length || 0,
      storyPromptLength: data.storyPrompt?.length || 0,
      pipelineStage: data.project?.pipelineStage,
      scenesStatus: data.project?.scenesStatus,
    });
    return respData(data);
  } catch (error: any) {
    logLyricStageError('visuals', 'route-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    return respErr(error?.message || 'Generate visuals failed');
  }
}

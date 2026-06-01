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
    logLyricStage('storyboard', 'route-start', {
      userId,
      projectId: id,
      hasStoryPrompt: Boolean(body.storyPrompt),
    });
    const data = await service.generateStoryboard({
      userId,
      projectId: id,
      storyPrompt: body.storyPrompt,
    });
    logLyricStage('storyboard', 'route-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      sceneCount: data.length,
      scenes: data.map((scene: any) => ({
        id: scene.id,
        status: scene.status,
        promptLength: scene.prompt?.length || 0,
      })),
    });
    return respData(data);
  } catch (error: any) {
    logLyricStageError('storyboard', 'route-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    return respErr(error?.message || 'Generate storyboard failed');
  }
}

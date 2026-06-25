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
    logLyricStage('kie-video-prompts', 'route-missing-start', {
      userId,
      projectId: id,
      sceneIds,
      model: body.model,
    });
    const result = await service.generateMissingSceneVideoPrompts({
      userId,
      projectId: id,
      sceneIds,
      model: body.model,
    });
    logLyricStage('kie-video-prompts', 'route-missing-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      status: result.status,
      sceneCount: result.sceneCount,
      persistedSceneCount: result.persistedSceneCount,
    });
    return respData(result.scenes || []);
  } catch (error: any) {
    logLyricStageError('kie-video-prompts', 'route-missing-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    return respErr(error?.message || 'Generate video prompts failed');
  }
}

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

export async function GET() {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  const startedAt = Date.now();
  const data = await service.listProjects(userId);
  logLyricStage('list-projects', 'route-success', {
    durationMs: Date.now() - startedAt,
    userId,
    projectCount: data.length,
  });
  return respData(data);
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  const startedAt = Date.now();
  try {
    const body = await req.json();
    logLyricStage('create-project', 'route-start', {
      userId,
      title: body.title,
      hasAudioUrl: Boolean(body.audioUrl),
      audioFilename: body.audioFilename,
      audioDurationMs: body.audioDurationMs,
      trimStartMs: body.trimStartMs,
      trimEndMs: body.trimEndMs,
    });
    const project = await service.createProject({ userId, ...body });
    logLyricStage('create-project', 'route-success', {
      durationMs: Date.now() - startedAt,
      projectId: project.id,
      title: project.title,
      pipelineStage: project.pipelineStage,
      lyricsStatus: project.lyricsStatus,
      scenesStatus: project.scenesStatus,
    });
    return respData(project);
  } catch (error: any) {
    logLyricStageError('create-project', 'route-fail', error, { durationMs: Date.now() - startedAt });
    return respErr(error?.message || 'Create lyric video failed');
  }
}

import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { respData, respErr } from '@/lib/resp';
import { recordBugProblemEvent } from '@/modules/bug-radar/service';
import * as service from '@/modules/lyric-videos/service';
import { pickLyricVideoCreateProjectInput } from './create-project-input';

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
    const createInput = pickLyricVideoCreateProjectInput(body);
    logLyricStage('create-project', 'route-start', {
      userId,
      title: createInput.title,
      hasAudioUrl: Boolean(createInput.audioUrl),
      audioFilename: createInput.audioFilename,
      audioDurationMs: createInput.audioDurationMs,
      trimStartMs: createInput.trimStartMs,
      trimEndMs: createInput.trimEndMs,
    });
    const project = await service.createProject({ ...createInput, userId });
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
    await recordBugProblemEvent({
      eventType: 'create_task_failed',
      severity: 'error',
      source: 'api',
      flow: 'lyric_video_generation',
      action: 'create_project_api',
      pathname: '/api/lyric-videos',
      apiPath: '/api/lyric-videos',
      method: 'POST',
      statusCode: 500,
      message: error?.message || 'Create lyric video failed',
      stack: error?.stack || '',
      userId,
      userAgent: req.headers.get('user-agent') || '',
      ip: getClientIp(req),
      metadata: { durationMs: Date.now() - startedAt },
    }).catch(() => undefined);
    return respErr(error?.message || 'Create lyric video failed');
  }
}

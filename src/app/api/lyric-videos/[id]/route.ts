import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { respData, respErr, respOk } from '@/lib/resp';
import { MOCK_LYRIC_VIDEO_PROJECT_ID, mockLyricVideoPreviewDetails } from '@/mocks/lyric-video-preview';
import * as service from '@/modules/lyric-videos/service';

async function getUserId() {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const startedAt = Date.now();
  if (id === MOCK_LYRIC_VIDEO_PROJECT_ID && process.env.NODE_ENV !== 'production') {
    logLyricStage('preview-fetch', 'mock-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    return respData(mockLyricVideoPreviewDetails);
  }

  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  try {
    const data = await service.getProjectDetails({ userId, id });
    if (!data) return respErr('Project not found');
    logLyricStage('preview-fetch', 'route-success', {
      durationMs: Date.now() - startedAt,
      projectId: id,
      pipelineStage: data.project.pipelineStage,
      lyricsStatus: data.project.lyricsStatus,
      scenesStatus: data.project.scenesStatus,
      renderStatus: data.project.renderStatus,
      linesCount: data.lines.length,
      wordsCount: data.words.length,
      scenesCount: data.scenes.length,
      exportsCount: data.exports.length,
      generationRun: data.generationRun
        ? {
            id: data.generationRun.id,
            status: data.generationRun.status,
            currentStage: data.generationRun.currentStage,
            progressPercent: data.generationRun.progressPercent,
          }
        : null,
    });
    return respData(data);
  } catch (error: any) {
    logLyricStageError('preview-fetch', 'route-fail', error, {
      durationMs: Date.now() - startedAt,
      projectId: id,
    });
    return respErr(error?.message || 'Project details failed');
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  try {
    const { id } = await params;
    const body = await req.json();
    const data = await service.updateProject({ userId, id, data: body });
    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Update project failed');
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return respErr('Unauthorized');

  const { id } = await params;
  await service.removeProject({ userId, id });
  return respOk();
}

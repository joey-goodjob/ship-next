import { and, count, desc, eq, inArray, isNull, like, or, type SQL } from 'drizzle-orm';
import { db } from '@/core/db';
import {
  lyricVideoExport,
  lyricVideoGenerationRun,
  lyricVideoGenerationStep,
  lyricVideoMediaJob,
  lyricVideoProject,
  lyricVideoScene,
  user,
} from '@/config/db/schema';

export type AdminCreationMediaKind = 'source-audio' | 'processed-audio' | 'rendered-video';

type MetricInput = {
  scenes?: Array<{ imageUrl?: string | null; status?: string | null }>;
  exports?: Array<{ status?: string | null; videoUrl?: string | null }>;
  mediaJobs?: Array<{ status?: string | null }>;
};

export type AdminCreationMetrics = {
  sceneCount: number;
  imageReadyCount: number;
  imageFailedCount: number;
  exportCount: number;
  exportReadyCount: number;
  exportFailedCount: number;
  mediaJobQueuedCount: number;
  mediaJobFailedCount: number;
};

type MediaLookupInput = {
  project: {
    originalAudioUrl?: string | null;
    audioUrl?: string | null;
    processedAudioUrl?: string | null;
    renderUrl?: string | null;
  };
  exports?: Array<{ videoUrl?: string | null }>;
};

function firstText(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() || '';
}

function toTime(value: unknown) {
  return value instanceof Date ? value.getTime() : 0;
}

export function formatAdminCreationDuration(durationMs?: number | null) {
  if (!durationMs || durationMs <= 0) return '-';
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

export function compactAdminCreationId(value?: string | null) {
  if (!value) return '-';
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function deriveAdminCreationMetrics({
  scenes = [],
  exports = [],
  mediaJobs = [],
}: MetricInput): AdminCreationMetrics {
  return {
    sceneCount: scenes.length,
    imageReadyCount: scenes.filter((scene) => Boolean(scene.imageUrl)).length,
    imageFailedCount: scenes.filter((scene) => scene.status === 'failed' && !scene.imageUrl).length,
    exportCount: exports.length,
    exportReadyCount: exports.filter((item) => item.status === 'ready' || Boolean(item.videoUrl)).length,
    exportFailedCount: exports.filter((item) => item.status === 'failed').length,
    mediaJobQueuedCount: mediaJobs.filter((job) => job.status === 'queued' || job.status === 'processing').length,
    mediaJobFailedCount: mediaJobs.filter((job) => job.status === 'failed').length,
  };
}

export function findAdminCreationMediaUrl(input: MediaLookupInput, kind: AdminCreationMediaKind) {
  if (kind === 'source-audio') {
    return firstText(input.project.originalAudioUrl, input.project.audioUrl, input.project.processedAudioUrl);
  }

  if (kind === 'processed-audio') {
    return firstText(input.project.processedAudioUrl, input.project.audioUrl, input.project.originalAudioUrl);
  }

  return firstText(input.exports?.find((item) => item.videoUrl)?.videoUrl, input.project.renderUrl);
}

export async function getAdminCreations(params: {
  page?: number;
  pageSize?: number;
  search?: string | null;
}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize || 12)));
  const offset = (page - 1) * pageSize;
  const search = params.search?.trim();

  const conditions: SQL[] = [isNull(lyricVideoProject.deletedAt)];
  if (search) {
    conditions.push(
      or(
        like(lyricVideoProject.title, `%${search}%`),
        like(lyricVideoProject.audioFilename, `%${search}%`),
        like(user.email, `%${search}%`),
        like(user.name, `%${search}%`)
      )!
    );
  }
  const where = and(...conditions);

  const [totalResult] = await db()
    .select({ count: count() })
    .from(lyricVideoProject)
    .leftJoin(user, eq(user.id, lyricVideoProject.userId))
    .where(where);

  const rows = await db()
    .select({
      project: lyricVideoProject,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userImage: user.image,
      userUtmSource: user.utmSource,
    })
    .from(lyricVideoProject)
    .leftJoin(user, eq(user.id, lyricVideoProject.userId))
    .where(where)
    .orderBy(desc(lyricVideoProject.createdAt))
    .limit(pageSize)
    .offset(offset);

  const projectIds = rows.map((row: any) => row.project.id);
  if (projectIds.length === 0) {
    return { items: [], total: Number(totalResult?.count || 0) };
  }

  const [runs, steps, scenes, exports, mediaJobs] = await Promise.all([
    db()
      .select()
      .from(lyricVideoGenerationRun)
      .where(inArray(lyricVideoGenerationRun.projectId, projectIds))
      .orderBy(desc(lyricVideoGenerationRun.createdAt)),
    db()
      .select()
      .from(lyricVideoGenerationStep)
      .where(inArray(lyricVideoGenerationStep.projectId, projectIds))
      .orderBy(lyricVideoGenerationStep.sort),
    db()
      .select()
      .from(lyricVideoScene)
      .where(inArray(lyricVideoScene.projectId, projectIds))
      .orderBy(lyricVideoScene.sort),
    db()
      .select()
      .from(lyricVideoExport)
      .where(inArray(lyricVideoExport.projectId, projectIds))
      .orderBy(desc(lyricVideoExport.createdAt)),
    db()
      .select()
      .from(lyricVideoMediaJob)
      .where(inArray(lyricVideoMediaJob.projectId, projectIds))
      .orderBy(desc(lyricVideoMediaJob.createdAt)),
  ]);

  const items = rows.map((row: any) => {
    const projectRuns = runs.filter((run: any) => run.projectId === row.project.id);
    const latestRun =
      projectRuns.find((run: any) => run.id === row.project.activeRunId) || projectRuns[0] || null;
    const projectSteps = latestRun
      ? steps.filter((step: any) => step.runId === latestRun.id)
      : [];
    const projectScenes = scenes.filter((scene: any) => scene.projectId === row.project.id);
    const projectExports = exports.filter((item: any) => item.projectId === row.project.id);
    const projectMediaJobs = mediaJobs.filter((job: any) => job.projectId === row.project.id);
    const metrics = deriveAdminCreationMetrics({
      scenes: projectScenes,
      exports: projectExports,
      mediaJobs: projectMediaJobs,
    });
    const firstError = firstText(
      row.project.pipelineError,
      latestRun?.errorMessage,
      projectSteps.find((step: any) => step.errorMessage)?.errorMessage,
      projectScenes.find((scene: any) => scene.error)?.error,
      projectExports.find((item: any) => item.error)?.error,
      projectMediaJobs.find((job: any) => job.error)?.error
    );
    const completedAt = latestRun?.completedAt || projectExports.find((item: any) => item.videoUrl)?.updatedAt || null;
    const elapsedMs = latestRun?.startedAt && completedAt
      ? Math.max(0, toTime(completedAt) - toTime(latestRun.startedAt))
      : row.project.lastGeneratedAt
        ? Math.max(0, toTime(row.project.lastGeneratedAt) - toTime(row.project.createdAt))
        : 0;

    return {
      id: row.project.id,
      compactId: compactAdminCreationId(row.project.id),
      title: row.project.title,
      status: row.project.status,
      pipelineStage: row.project.pipelineStage,
      pipelineError: row.project.pipelineError,
      generationStatus: row.project.generationStatus,
      generationProgress: row.project.generationProgress,
      lyricsStatus: row.project.lyricsStatus,
      scenesStatus: row.project.scenesStatus,
      renderStatus: row.project.renderStatus,
      createdAt: row.project.createdAt,
      updatedAt: row.project.updatedAt,
      audioFilename: row.project.audioFilename,
      audioDurationMs: row.project.audioDurationMs,
      audioDurationLabel: formatAdminCreationDuration(row.project.audioDurationMs),
      audioMimeType: row.project.audioMimeType,
      audioSizeBytes: row.project.audioSizeBytes,
      aspectRatio: row.project.aspectRatio,
      resolution: row.project.resolution,
      language: row.project.language,
      artStyle: row.project.artStyle,
      user: {
        id: row.userId || row.project.userId,
        name: row.userName || '',
        email: row.userEmail || '',
        image: row.userImage || '',
        utmSource: row.userUtmSource || '',
      },
      latestRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            currentStage: latestRun.currentStage,
            progressPercent: latestRun.progressPercent,
            completedSteps: latestRun.completedSteps,
            failedSteps: latestRun.failedSteps,
            totalSteps: latestRun.totalSteps,
            startedAt: latestRun.startedAt,
            completedAt: latestRun.completedAt,
            errorMessage: latestRun.errorMessage,
          }
        : null,
      generationSteps: projectSteps.map((step: any) => ({
        id: step.id,
        stage: step.stage,
        status: step.status,
        provider: step.provider,
        model: step.model,
        providerTaskId: step.providerTaskId,
        errorMessage: step.errorMessage,
      })),
      scenes: projectScenes.slice(0, 8).map((scene: any) => ({
        id: scene.id,
        sort: scene.sort,
        status: scene.status,
        text: scene.text,
        imageUrl: scene.imageUrl,
        providerTaskId: scene.providerTaskId,
        error: scene.error,
      })),
      exports: projectExports.slice(0, 4).map((item: any) => ({
        id: item.id,
        status: item.status,
        format: item.format,
        resolution: item.resolution,
        aspectRatio: item.aspectRatio,
        videoUrl: item.videoUrl,
        taskId: item.taskId,
        error: item.error,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      mediaJobs: projectMediaJobs.slice(0, 6).map((job: any) => ({
        id: job.id,
        kind: job.kind,
        status: job.status,
        exportId: job.exportId,
        runId: job.runId,
        attemptCount: job.attemptCount,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })),
      metrics,
      firstError,
      elapsedMs,
      elapsedLabel: formatAdminCreationDuration(elapsedMs),
      hasSourceAudio: Boolean(findAdminCreationMediaUrl({ project: row.project, exports: projectExports }, 'source-audio')),
      hasProcessedAudio: Boolean(findAdminCreationMediaUrl({ project: row.project, exports: projectExports }, 'processed-audio')),
      hasRenderedVideo: Boolean(findAdminCreationMediaUrl({ project: row.project, exports: projectExports }, 'rendered-video')),
      previewHref: `/creations/${row.project.id}/preview`,
    };
  });

  return { items, total: Number(totalResult?.count || 0) };
}

export async function findAdminCreationMedia(params: {
  projectId: string;
  kind: AdminCreationMediaKind;
}) {
  const [project] = await db()
    .select()
    .from(lyricVideoProject)
    .where(and(eq(lyricVideoProject.id, params.projectId), isNull(lyricVideoProject.deletedAt)))
    .limit(1);
  if (!project) return null;

  const exports = await db()
    .select()
    .from(lyricVideoExport)
    .where(eq(lyricVideoExport.projectId, params.projectId))
    .orderBy(desc(lyricVideoExport.createdAt));

  return findAdminCreationMediaUrl({ project, exports }, params.kind);
}

import { and, desc, eq, inArray, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/core/db';
import {
  lyricVideoExport,
  lyricVideoProject,
  user,
} from '@/config/db/schema';

export type AdminCreationMediaKind = 'source-audio' | 'processed-audio' | 'rendered-video';
export type AdminCreationView = 'all' | 'processing' | 'preview' | 'rendered' | 'failed';

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

export type AdminCreationUsageSummary = {
  total: number;
  completed: number;
  processing: number;
  failed: number;
  needsAttention: number;
  withSourceAudio: number;
  withProcessedAudio: number;
  withRenderedVideo: number;
  consumedCredits: number;
};

type UsageSummaryInput = {
  pipelineStage?: string | null;
  generationStatus?: string | null;
  renderStatus?: string | null;
  generationProgress?: number | null;
  metrics?: Partial<AdminCreationMetrics>;
  exports?: Array<{ costCredits?: number | null }>;
  firstError?: string | null;
  hasSourceAudio?: boolean;
  hasProcessedAudio?: boolean;
  hasRenderedVideo?: boolean;
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

function isProcessingStatus(value?: string | null) {
  return ['queued', 'pending', 'processing', 'running'].includes(value || '');
}

function isFailedStatus(value?: string | null) {
  return ['failed', 'error'].includes(value || '');
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

export function deriveAdminCreationUsageSummary(items: UsageSummaryInput[]): AdminCreationUsageSummary {
  return items.reduce<AdminCreationUsageSummary>(
    (summary, item) => {
      const failed =
        isFailedStatus(item.pipelineStage) ||
        isFailedStatus(item.generationStatus) ||
        isFailedStatus(item.renderStatus) ||
        Boolean(item.firstError);
      const processing =
        !failed &&
        (isProcessingStatus(item.generationStatus) ||
          isProcessingStatus(item.pipelineStage) ||
          (Number(item.generationProgress || 0) > 0 && Number(item.generationProgress || 0) < 100));
      const completed = item.renderStatus === 'ready' || Boolean(item.hasRenderedVideo);
      const needsAttention =
        failed ||
        Boolean(item.metrics?.imageFailedCount) ||
        Boolean(item.metrics?.exportFailedCount) ||
        Boolean(item.metrics?.mediaJobFailedCount);

      summary.total += 1;
      if (completed) summary.completed += 1;
      if (processing) summary.processing += 1;
      if (failed) summary.failed += 1;
      if (needsAttention) summary.needsAttention += 1;
      if (item.hasSourceAudio) summary.withSourceAudio += 1;
      if (item.hasProcessedAudio) summary.withProcessedAudio += 1;
      if (item.hasRenderedVideo) summary.withRenderedVideo += 1;
      summary.consumedCredits += (item.exports || []).reduce(
        (total, exportItem) => total + Math.max(0, Number(exportItem.costCredits || 0)),
        0
      );

      return summary;
    },
    {
      total: 0,
      completed: 0,
      processing: 0,
      failed: 0,
      needsAttention: 0,
      withSourceAudio: 0,
      withProcessedAudio: 0,
      withRenderedVideo: 0,
      consumedCredits: 0,
    }
  );
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

function normalizeAdminCreationView(value?: string | null): AdminCreationView {
  return ['processing', 'preview', 'rendered', 'failed'].includes(value || '')
    ? (value as AdminCreationView)
    : 'all';
}

function getAdminCreationViewCondition(view: AdminCreationView) {
  if (view === 'processing') {
    return or(
      inArray(lyricVideoProject.generationStatus, ['queued', 'pending', 'processing', 'running']),
      inArray(lyricVideoProject.pipelineStage, ['queued', 'pending', 'processing', 'running'])
    );
  }

  if (view === 'preview') {
    return or(
      eq(lyricVideoProject.pipelineStage, 'preview_ready'),
      eq(lyricVideoProject.scenesStatus, 'ready')
    );
  }

  if (view === 'rendered') {
    return eq(lyricVideoProject.renderStatus, 'ready');
  }

  if (view === 'failed') {
    return or(
      inArray(lyricVideoProject.pipelineStage, ['failed', 'error']),
      inArray(lyricVideoProject.generationStatus, ['failed', 'error']),
      inArray(lyricVideoProject.renderStatus, ['failed', 'error'])
    );
  }

  return undefined;
}

function getAdminCreationWhere(search?: string | null, view: AdminCreationView = 'all') {
  const conditions: SQL[] = [isNull(lyricVideoProject.deletedAt)];
  const cleanSearch = search?.trim();

  if (cleanSearch) {
    conditions.push(
      or(
        like(lyricVideoProject.title, `%${cleanSearch}%`),
        like(lyricVideoProject.audioFilename, `%${cleanSearch}%`),
        like(user.email, `%${cleanSearch}%`),
        like(user.name, `%${cleanSearch}%`)
      )!
    );
  }

  const viewCondition = getAdminCreationViewCondition(view);
  if (viewCondition) {
    conditions.push(viewCondition);
  }

  return and(...conditions);
}

function countWhen(condition?: SQL) {
  if (!condition) return sql<number>`count(*)`;
  return sql<number>`coalesce(sum(case when ${condition} then 1 else 0 end), 0)`;
}

async function countAdminCreationsByViews(search: string | null | undefined) {
  const [result] = await db()
    .select({
      all: countWhen(),
      processing: countWhen(getAdminCreationViewCondition('processing')),
      preview: countWhen(getAdminCreationViewCondition('preview')),
      rendered: countWhen(getAdminCreationViewCondition('rendered')),
      failed: countWhen(getAdminCreationViewCondition('failed')),
    })
    .from(lyricVideoProject)
    .leftJoin(user, eq(user.id, lyricVideoProject.userId))
    .where(getAdminCreationWhere(search));

  return {
    all: Number(result?.all || 0),
    processing: Number(result?.processing || 0),
    preview: Number(result?.preview || 0),
    rendered: Number(result?.rendered || 0),
    failed: Number(result?.failed || 0),
  };
}

export async function getAdminCreations(params: {
  page?: number;
  pageSize?: number;
  search?: string | null;
  view?: string | null;
}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize || 12)));
  const offset = (page - 1) * pageSize;
  const search = params.search?.trim();
  const view = normalizeAdminCreationView(params.view);

  const where = getAdminCreationWhere(search, view);

  const viewCounts = await countAdminCreationsByViews(search);
  const total = viewCounts[view];

  const rows = await db()
    .select({
      project: {
        id: lyricVideoProject.id,
        userId: lyricVideoProject.userId,
        title: lyricVideoProject.title,
        status: lyricVideoProject.status,
        audioUrl: lyricVideoProject.audioUrl,
        originalAudioUrl: lyricVideoProject.originalAudioUrl,
        audioFilename: lyricVideoProject.audioFilename,
        audioDurationMs: lyricVideoProject.audioDurationMs,
        audioMimeType: lyricVideoProject.audioMimeType,
        audioSizeBytes: lyricVideoProject.audioSizeBytes,
        processedAudioUrl: lyricVideoProject.processedAudioUrl,
        pipelineStage: lyricVideoProject.pipelineStage,
        pipelineError: lyricVideoProject.pipelineError,
        activeRunId: lyricVideoProject.activeRunId,
        generationStatus: lyricVideoProject.generationStatus,
        generationProgress: lyricVideoProject.generationProgress,
        lastGeneratedAt: lyricVideoProject.lastGeneratedAt,
        language: lyricVideoProject.language,
        artStyle: lyricVideoProject.artStyle,
        aspectRatio: lyricVideoProject.aspectRatio,
        resolution: lyricVideoProject.resolution,
        lyricsStatus: lyricVideoProject.lyricsStatus,
        scenesStatus: lyricVideoProject.scenesStatus,
        renderStatus: lyricVideoProject.renderStatus,
        renderUrl: lyricVideoProject.renderUrl,
        createdAt: lyricVideoProject.createdAt,
        updatedAt: lyricVideoProject.updatedAt,
      },
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
    return {
      items: [],
      total,
      summary: {
        total: viewCounts.all,
        completed: viewCounts.rendered,
        processing: viewCounts.processing,
        failed: viewCounts.failed,
        needsAttention: viewCounts.failed,
        withSourceAudio: 0,
        withProcessedAudio: 0,
        withRenderedVideo: 0,
        consumedCredits: 0,
      },
      viewCounts: {
        all: viewCounts.all,
        processing: viewCounts.processing,
        preview: viewCounts.preview,
        rendered: viewCounts.rendered,
        failed: viewCounts.failed,
      },
    };
  }

  const items = rows.map((row: any) => {
    const latestRun: any | null = null;
    const projectSteps: any[] = [];
    const projectScenes: any[] = [];
    const projectExports: any[] = [];
    const projectMediaJobs: any[] = [];
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
        attemptCount: step.attemptCount,
        provider: step.provider,
        model: step.model,
        providerTaskId: step.providerTaskId,
        errorMessage: step.errorMessage,
        updatedAt: step.updatedAt,
        completedAt: step.completedAt,
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
        costCredits: item.costCredits,
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

  const visibleSummary = deriveAdminCreationUsageSummary(items);

  return {
    items,
    total,
    summary: {
      ...visibleSummary,
      total: viewCounts.all,
      completed: viewCounts.rendered,
      processing: viewCounts.processing,
      failed: viewCounts.failed,
      needsAttention: viewCounts.failed + visibleSummary.needsAttention - visibleSummary.failed,
    },
    viewCounts: {
      all: viewCounts.all,
      processing: viewCounts.processing,
      preview: viewCounts.preview,
      rendered: viewCounts.rendered,
      failed: viewCounts.failed,
    },
  };
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

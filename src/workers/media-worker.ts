import os from 'node:os';
import { and, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { lyricVideoExport, lyricVideoProject } from '@/config/db/schema';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { AITaskStatus, updateTask } from '@/modules/ai-tasks/service';
import {
  claimNextMediaJob,
  markMediaJobFailed,
  markMediaJobReady,
} from '@/modules/lyric-videos/lyric/media-jobs';
import { getProjectDetails } from '@/modules/lyric-videos/lyric/project';
import { parseJsonField } from '@/modules/lyric-videos/lyric/json';
import { renderStaticVideoForWorker } from '@/modules/lyric-videos/lyric/worker-render';
import { analyzeAudioForWorker } from '@/modules/lyric-videos/lyric/worker-audio-analysis';
import { trimAudioForWorker } from '@/modules/lyric-videos/lyric/worker-audio-trim';

const workerId = process.env.MEDIA_WORKER_ID || `${os.hostname()}:${process.pid}`;
const pollIntervalMs = Math.max(250, Number(process.env.MEDIA_WORKER_POLL_INTERVAL_MS) || 2000);
const concurrency = Math.max(1, Number(process.env.MEDIA_WORKER_CONCURRENCY) || 1);
const runOnce = process.env.MEDIA_WORKER_RUN_ONCE === 'true';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getExportById(exportId: string) {
  const [exportJob] = await db()
    .select()
    .from(lyricVideoExport)
    .where(eq(lyricVideoExport.id, exportId))
    .limit(1);
  return exportJob || null;
}

async function markVideoExportFailed(params: {
  exportId?: string | null;
  error: unknown;
}) {
  if (!params.exportId) return;
  const message = params.error instanceof Error ? params.error.message : String(params.error || 'Export failed');
  const exportJob = await getExportById(params.exportId);
  if (!exportJob) return;

  await Promise.all([
    exportJob.taskId
      ? updateTask({ taskId: exportJob.taskId, status: AITaskStatus.FAILED, taskResult: { error: message } }).catch(() => undefined)
      : Promise.resolve(),
    db()
      .update(lyricVideoExport)
      .set({ status: 'failed', error: message })
      .where(eq(lyricVideoExport.id, exportJob.id)),
    db()
      .update(lyricVideoProject)
      .set({ renderStatus: 'failed', pipelineStage: 'export_failed', pipelineError: message })
      .where(and(eq(lyricVideoProject.id, exportJob.projectId), eq(lyricVideoProject.userId, exportJob.userId))),
  ]);
}

async function processVideoExportJob(job: Awaited<ReturnType<typeof claimNextMediaJob>>) {
  if (!job?.exportId) throw new Error('video_export job requires exportId');
  const exportJob = await getExportById(job.exportId);
  if (!exportJob) throw new Error(`Export not found: ${job.exportId}`);

  const details = await getProjectDetails({ userId: exportJob.userId, id: exportJob.projectId });
  if (!details) throw new Error(`Project not found: ${exportJob.projectId}`);

  const settings = parseJsonField<Record<string, any>>(exportJob.settings, {});
  const watermark = settings.watermark && typeof settings.watermark === 'object' ? settings.watermark : undefined;

  await Promise.all([
    exportJob.taskId
      ? updateTask({ taskId: exportJob.taskId, status: AITaskStatus.PROCESSING }).catch(() => undefined)
      : Promise.resolve(),
    db()
      .update(lyricVideoExport)
      .set({ status: 'processing', error: null })
      .where(eq(lyricVideoExport.id, exportJob.id)),
    db()
      .update(lyricVideoProject)
      .set({ renderStatus: 'processing', renderTaskId: exportJob.taskId, pipelineStage: 'rendering', pipelineError: null })
      .where(and(eq(lyricVideoProject.id, exportJob.projectId), eq(lyricVideoProject.userId, exportJob.userId))),
  ]);

  logLyricStage('media-worker', 'video-export-start', {
    workerId,
    jobId: job.id,
    exportId: exportJob.id,
    projectId: exportJob.projectId,
    userId: exportJob.userId,
    sceneCount: details.scenes.length,
  });

  const rendered = await renderStaticVideoForWorker({
    project: details.project,
    lines: details.lines,
    words: details.words,
    scenes: details.scenes,
    settings,
    watermark,
    exportId: exportJob.id,
  });

  await Promise.all([
    exportJob.taskId
      ? updateTask({ taskId: exportJob.taskId, status: AITaskStatus.SUCCESS, taskResult: rendered })
      : Promise.resolve(),
    db()
      .update(lyricVideoExport)
      .set({ status: 'ready', videoUrl: rendered.url, storageKey: rendered.storageKey, error: null })
      .where(eq(lyricVideoExport.id, exportJob.id)),
    db()
      .update(lyricVideoProject)
      .set({ renderStatus: 'ready', renderUrl: rendered.url, pipelineStage: 'export_ready', pipelineError: null })
      .where(and(eq(lyricVideoProject.id, exportJob.projectId), eq(lyricVideoProject.userId, exportJob.userId))),
    markMediaJobReady({ jobId: job.id, output: rendered }),
  ]);

  logLyricStage('media-worker', 'video-export-ready', {
    workerId,
    jobId: job.id,
    exportId: exportJob.id,
    projectId: exportJob.projectId,
    videoUrl: rendered.url,
    storageKey: rendered.storageKey,
  });
}

async function processAudioAnalysisJob(job: Awaited<ReturnType<typeof claimNextMediaJob>>) {
  if (!job) throw new Error('audio_analysis job is required');
  const details = await getProjectDetails({ userId: job.userId, id: job.projectId });
  if (!details) throw new Error(`Project not found: ${job.projectId}`);

  const input = parseJsonField<Record<string, unknown>>(job.inputJson, {});

  logLyricStage('media-worker', 'audio-analysis-start', {
    workerId,
    jobId: job.id,
    projectId: job.projectId,
    userId: job.userId,
    runId: job.runId,
    stepId: job.stepId,
  });

  const result = await analyzeAudioForWorker({
    jobId: job.id,
    input,
    project: details.project,
  });

  await markMediaJobReady({ jobId: job.id, output: result });

  logLyricStage('media-worker', 'audio-analysis-ready', {
    workerId,
    jobId: job.id,
    projectId: job.projectId,
    userId: job.userId,
    runId: job.runId,
    stepId: job.stepId,
    bpm: result.audioAnalysis?.bpm,
    key: result.audioAnalysis?.key,
  });
}

async function processAudioTrimJob(job: Awaited<ReturnType<typeof claimNextMediaJob>>) {
  if (!job) throw new Error('audio_trim job is required');
  const details = await getProjectDetails({ userId: job.userId, id: job.projectId });
  if (!details) throw new Error(`Project not found: ${job.projectId}`);

  const input = parseJsonField<Record<string, unknown>>(job.inputJson, {});

  logLyricStage('media-worker', 'audio-trim-start', {
    workerId,
    jobId: job.id,
    projectId: job.projectId,
    userId: job.userId,
    runId: job.runId,
    stepId: job.stepId,
  });

  const result = await trimAudioForWorker({
    jobId: job.id,
    input,
    project: details.project,
  });

  await Promise.all([
    db()
      .update(lyricVideoProject)
      .set({
        audioUrl: result.processedAudioUrl,
        audioStorageKey: result.processedAudioStorageKey,
        originalAudioUrl: result.originalAudioUrl || details.project.originalAudioUrl,
        originalAudioStorageKey: result.originalAudioStorageKey || details.project.originalAudioStorageKey,
        audioDurationMs: result.audioDurationMs,
        trimStartMs: result.trimStartMs,
        trimEndMs: result.trimEndMs,
        processedAudioUrl: result.processedAudioUrl,
        processedAudioStorageKey: result.processedAudioStorageKey,
        lyricsStatus: 'asr_processing',
        pipelineStage: 'asr_processing',
        pipelineError: null,
      })
      .where(and(eq(lyricVideoProject.id, job.projectId), eq(lyricVideoProject.userId, job.userId))),
    markMediaJobReady({ jobId: job.id, output: result }),
  ]);

  logLyricStage('media-worker', 'audio-trim-ready', {
    workerId,
    jobId: job.id,
    projectId: job.projectId,
    userId: job.userId,
    runId: job.runId,
    stepId: job.stepId,
    processedAudioStorageKey: result.processedAudioStorageKey,
    trimStartMs: result.trimStartMs,
    trimEndMs: result.trimEndMs,
  });
}

async function processClaimedJob() {
  const job = await claimNextMediaJob({ workerId });
  if (!job) return false;

  try {
    if (job.kind === 'video_export') {
      await processVideoExportJob(job);
      return true;
    }
    if (job.kind === 'audio_analysis') {
      await processAudioAnalysisJob(job);
      return true;
    }
    if (job.kind === 'audio_trim') {
      await processAudioTrimJob(job);
      return true;
    }
    throw new Error(`Unsupported media job kind: ${job.kind}`);
  } catch (error) {
    logLyricStageError('media-worker', 'job-failed', error, {
      workerId,
      jobId: job.id,
      kind: job.kind,
      exportId: job.exportId,
    });
    await Promise.all([
      markMediaJobFailed({ jobId: job.id, error }),
      job.kind === 'video_export' ? markVideoExportFailed({ exportId: job.exportId, error }) : Promise.resolve(),
    ]);
    return true;
  }
}

async function tick() {
  const results = await Promise.all(
    Array.from({ length: concurrency }, () => processClaimedJob())
  );
  return results.some(Boolean);
}

async function main() {
  logLyricStage('media-worker', 'started', {
    workerId,
    pollIntervalMs,
    concurrency,
    runOnce,
  });

  while (true) {
    const processed = await tick();
    if (runOnce) break;
    if (!processed) await sleep(pollIntervalMs);
  }
}

main().catch((error) => {
  logLyricStageError('media-worker', 'fatal', error, { workerId });
  process.exitCode = 1;
});

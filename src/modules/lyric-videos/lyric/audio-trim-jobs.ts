import { and, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { lyricVideoProject } from '@/config/db/schema';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { createMediaJob, waitForMediaJob } from './media-jobs';
import { parseJsonLoose } from './json';

const DEFAULT_AUDIO_TRIM_WAIT_MS = 90_000;
const DEFAULT_AUDIO_TRIM_POLL_MS = 1_000;

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeClipMs(params: { startMs?: unknown; endMs?: unknown; durationMs?: unknown }) {
  const sourceDurationMs = Math.max(0, Math.round(Number(params.durationMs) || 0));
  const maxStartMs = sourceDurationMs > 1000 ? sourceDurationMs - 1000 : Number.POSITIVE_INFINITY;
  const startMs = Math.max(0, Math.min(Math.round(Number(params.startMs) || 0), maxStartMs));
  const requestedEndMs = Math.max(startMs + 1000, Math.round(Number(params.endMs) || sourceDurationMs || startMs + 1000));
  const endMs = sourceDurationMs > 0 ? Math.min(requestedEndMs, sourceDurationMs) : requestedEndMs;
  return {
    startMs,
    endMs: Math.max(startMs + 1000, endMs),
    durationMs: Math.max(1000, Math.max(startMs + 1000, endMs) - startMs),
  };
}

function hasMeaningfulTrim(project: any, clip: { startMs: number; endMs: number; durationMs: number }) {
  const sourceDurationMs = Math.max(0, Math.round(Number(project.audioDurationMs) || 0));
  if (clip.startMs > 0) return true;
  if (sourceDurationMs > 0 && clip.endMs < sourceDurationMs - 250) return true;
  if (!sourceDurationMs && Number(project.trimEndMs) > 0) return true;
  return false;
}

export function shouldQueueAudioTrimJob(project: any) {
  const input = buildAudioTrimJobInput({ project });
  return hasMeaningfulTrim(project, {
    startMs: input.trimStartMs,
    endMs: input.trimEndMs,
    durationMs: input.clipDurationMs,
  });
}

export function buildAudioTrimJobInput(params: { project: any }) {
  const project = params.project;
  const originalAudioUrl = trimString(project.originalAudioUrl) || trimString(project.audioUrl);
  const originalAudioStorageKey = trimString(project.originalAudioStorageKey) || trimString(project.audioStorageKey);
  const clip = normalizeClipMs({
    startMs: project.trimStartMs,
    endMs: project.trimEndMs,
    durationMs: project.audioDurationMs,
  });

  return {
    sourceAudioUrl: originalAudioUrl,
    sourceAudioStorageKey: originalAudioStorageKey,
    originalAudioUrl,
    originalAudioStorageKey,
    audioDurationMs: Number(project.audioDurationMs) || null,
    trimStartMs: clip.startMs,
    trimEndMs: clip.endMs,
    clipDurationMs: clip.durationMs,
  };
}

export function parseAudioTrimJobOutput(value: unknown) {
  const output = parseJsonLoose<Record<string, any>>(value, {});
  const processedAudioUrl = trimString(output.processedAudioUrl);
  const processedAudioStorageKey = trimString(output.processedAudioStorageKey);
  if (!processedAudioUrl || !processedAudioStorageKey) {
    throw new Error('Audio trim job returned no processed audio');
  }

  return {
    audioUrl: processedAudioUrl,
    audioStorageKey: processedAudioStorageKey,
    originalAudioUrl: trimString(output.originalAudioUrl),
    originalAudioStorageKey: trimString(output.originalAudioStorageKey),
    audioDurationMs: Math.max(1000, Math.round(Number(output.audioDurationMs) || 0)),
    trimStartMs: Math.max(0, Math.round(Number(output.trimStartMs) || 0)),
    trimEndMs: Math.max(1000, Math.round(Number(output.trimEndMs) || 0)),
    processedAudioUrl,
    processedAudioStorageKey,
  };
}

async function markProjectAsrProcessing(params: { userId: string; projectId: string; pipelineStage?: string }) {
  await db()
    .update(lyricVideoProject)
    .set({
      lyricsStatus: 'asr_processing',
      pipelineStage: params.pipelineStage || 'asr_processing',
      pipelineError: null,
    })
    .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));
}

export async function prepareAudioClipWithMediaWorker(params: {
  userId: string;
  project: any;
  runId?: string | null;
  stepId?: string | null;
}) {
  const existingProcessedUrl = trimString(params.project.processedAudioUrl);
  if (existingProcessedUrl && params.project.audioUrl === existingProcessedUrl) {
    await markProjectAsrProcessing({ userId: params.userId, projectId: params.project.id });
    return params.project;
  }

  const input = buildAudioTrimJobInput({ project: params.project });
  if (!input.sourceAudioUrl && !input.sourceAudioStorageKey) {
    throw new Error('Upload audio before transcription');
  }

  if (!shouldQueueAudioTrimJob(params.project)) {
    const [updated] = await db()
      .update(lyricVideoProject)
      .set({
        originalAudioUrl: input.originalAudioUrl || params.project.originalAudioUrl,
        originalAudioStorageKey: input.originalAudioStorageKey || params.project.originalAudioStorageKey,
        lyricsStatus: 'asr_processing',
        pipelineStage: 'asr_processing',
        pipelineError: null,
      })
      .where(and(eq(lyricVideoProject.id, params.project.id), eq(lyricVideoProject.userId, params.userId)))
      .returning();
    return updated || {
      ...params.project,
      originalAudioUrl: input.originalAudioUrl || params.project.originalAudioUrl,
      originalAudioStorageKey: input.originalAudioStorageKey || params.project.originalAudioStorageKey,
    };
  }

  await markProjectAsrProcessing({ userId: params.userId, projectId: params.project.id, pipelineStage: 'audio_processing' });

  try {
    const job = await createMediaJob({
      kind: 'audio_trim',
      projectId: params.project.id,
      userId: params.userId,
      runId: params.runId,
      stepId: params.stepId,
      input,
    });

    logLyricStage('audio-trim', 'job-queued', {
      projectId: params.project.id,
      userId: params.userId,
      runId: params.runId,
      stepId: params.stepId,
      jobId: job.id,
      trimStartMs: input.trimStartMs,
      trimEndMs: input.trimEndMs,
    });

    const timeoutMs = numberFromEnv('LYRIC_VIDEO_AUDIO_TRIM_WAIT_MS', DEFAULT_AUDIO_TRIM_WAIT_MS);
    const pollIntervalMs = numberFromEnv('LYRIC_VIDEO_AUDIO_TRIM_POLL_MS', DEFAULT_AUDIO_TRIM_POLL_MS);
    const completed = await waitForMediaJob({ jobId: job.id, userId: params.userId, timeoutMs, pollIntervalMs });

    if (!completed) throw new Error('Audio trim job disappeared');
    if (completed.status === 'failed') throw new Error(completed.error || 'Audio trim failed');
    if (completed.status !== 'ready') throw new Error('Audio trim timed out');

    const audioPatch = parseAudioTrimJobOutput(completed.outputJson);
    const [updated] = await db()
      .update(lyricVideoProject)
      .set({
        ...audioPatch,
        lyricsStatus: 'asr_processing',
        pipelineStage: 'asr_processing',
        pipelineError: null,
      })
      .where(and(eq(lyricVideoProject.id, params.project.id), eq(lyricVideoProject.userId, params.userId)))
      .returning();

    return updated || { ...params.project, ...audioPatch };
  } catch (error: any) {
    logLyricStageError('audio-trim', 'job-failed-or-timeout', error, {
      projectId: params.project.id,
      userId: params.userId,
      runId: params.runId,
      stepId: params.stepId,
    });
    throw new Error(error?.message ? `Audio trim failed: ${error.message}` : 'Audio trim failed');
  }
}

import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { createMediaJob, waitForMediaJob } from './media-jobs';
import { parseJsonField } from './json';
import type { AudioAnalysisResult } from './types';

const DEFAULT_AUDIO_ANALYSIS_WAIT_MS = 45_000;
const DEFAULT_AUDIO_ANALYSIS_POLL_MS = 1_000;

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildAudioAnalysisInput(params: {
  project: any;
  audioUrl?: string | null;
}) {
  return {
    audioUrl: params.audioUrl || params.project.processedAudioUrl || params.project.audioUrl || params.project.originalAudioUrl,
    audioStorageKey:
      trimString(params.project.processedAudioStorageKey)
      || trimString(params.project.audioStorageKey)
      || trimString(params.project.originalAudioStorageKey),
    processedAudioUrl: params.project.processedAudioUrl,
    processedAudioStorageKey: params.project.processedAudioStorageKey,
    originalAudioUrl: params.project.originalAudioUrl,
    originalAudioStorageKey: params.project.originalAudioStorageKey,
    trimStartMs: params.project.trimStartMs,
    trimEndMs: params.project.trimEndMs,
    audioDurationMs: params.project.audioDurationMs,
  };
}

export async function analyzeAudioWithMediaWorker(params: {
  userId: string;
  projectId: string;
  project: any;
  audioUrl?: string | null;
  runId?: string | null;
  stepId?: string | null;
}): Promise<{ audioAnalysis?: AudioAnalysisResult; audioAnalysisError?: string; audioAnalysisJobId?: string }> {
  const input = buildAudioAnalysisInput({ project: params.project, audioUrl: params.audioUrl });
  if (!trimString(input.audioUrl) && !trimString(input.audioStorageKey)) {
    return { audioAnalysisError: 'No audio available for analysis' };
  }

  try {
    const job = await createMediaJob({
      kind: 'audio_analysis',
      projectId: params.projectId,
      userId: params.userId,
      runId: params.runId,
      stepId: params.stepId,
      input,
    });

    logLyricStage('audio-analysis', 'job-queued', {
      projectId: params.projectId,
      userId: params.userId,
      runId: params.runId,
      stepId: params.stepId,
      jobId: job.id,
    });

    const timeoutMs = numberFromEnv('LYRIC_VIDEO_AUDIO_ANALYSIS_WAIT_MS', DEFAULT_AUDIO_ANALYSIS_WAIT_MS);
    const pollIntervalMs = numberFromEnv('LYRIC_VIDEO_AUDIO_ANALYSIS_POLL_MS', DEFAULT_AUDIO_ANALYSIS_POLL_MS);
    const completed = await waitForMediaJob({ jobId: job.id, userId: params.userId, timeoutMs, pollIntervalMs });

    if (!completed) {
      return { audioAnalysisError: 'Audio analysis job disappeared', audioAnalysisJobId: job.id };
    }
    if (completed.status === 'ready') {
      const output = parseJsonField<Record<string, any>>(completed.outputJson, {});
      const audioAnalysis = output.audioAnalysis as AudioAnalysisResult | undefined;
      return audioAnalysis
        ? { audioAnalysis, audioAnalysisJobId: job.id }
        : { audioAnalysisError: 'Audio analysis job returned no result', audioAnalysisJobId: job.id };
    }
    if (completed.status === 'failed') {
      return { audioAnalysisError: completed.error || 'Audio analysis failed', audioAnalysisJobId: job.id };
    }

    return { audioAnalysisError: 'Audio analysis timed out', audioAnalysisJobId: job.id };
  } catch (error: any) {
    logLyricStageError('audio-analysis', 'job-queue-or-wait-failed', error, {
      projectId: params.projectId,
      userId: params.userId,
      runId: params.runId,
      stepId: params.stepId,
    });
    return { audioAnalysisError: error?.message || 'Audio analysis failed' };
  }
}

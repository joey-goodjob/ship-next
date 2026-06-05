import { and, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { lyricVideoGenerationRun, lyricVideoGenerationStep, lyricVideoProject } from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { getAllConfigs } from '@/modules/config/service';
import { analyzeAudioWithLibrosa, prepareAudioClipForTranscription } from './audio';
import { asrSnapshot, asrTimingDebugSummary, cleanAsrWordsForLyrics, groupWordsIntoLyricLines, refineAsrSegmentsWithWords, transcribeWithElevenLabs } from './asr';
import { buildFailureSnapshot, createLyricVideoError } from './diagnostics';
import { requestHash, safeJson } from './json';
import { assertUsableSongAnalysis, analyzeSongWithKieForDebug, formatStoryActsText, generateStoryboardScenesWithKieClaude } from './llm';
import { getProject, getProjectDetails } from './project';
import { replaceLyrics } from './asr';
import { queueSceneImagesGrid } from './media-generation';
import {
  buildFixedStoryboardSceneDraftsFromPersistedScenes,
  preprocessLyricVideoForLlm,
  replaceLyricsSceneSkeleton,
  replaceScenes,
} from './storyboard';
import { buildProjectGenerationSnapshot, isActiveGenerationRunStatus } from './status';
import {
  DEFAULT_SONG_ANALYSIS_MODEL,
  DEFAULT_STORYBOARD_MODEL,
  DEBUG_STOP_AFTER_GENERATION_STAGES,
  GENERATION_STAGES,
  type AsrDraftResult,
  type GenerationDebugOptions,
  type GenerationDebugStopAfter,
  type GenerationStage,
  type LyricLineInput,
} from './types';

/**
 * 一键生成总控模块。
 *
 * `/api/lyric-videos/:id/generate` 最终会调用这里：
 * 1. `startGenerationRunQueued` 创建 run/steps，并把 project 标记为 generation_queued。
 * 2. `executeGenerationRun` 依次执行 asr_words、song_analysis、
 *    prompt_generation、image_generation。
 * 3. 每一步都会更新 `lyric_video_generation_step`，同时把核心业务结果写回
 *    `lyric_video_project`、`lyric_video_line`、`lyric_video_word`、`lyric_video_scene`。
 */

export function generationOptions(input: unknown) {
  const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const mode = String(body.mode || '').trim();
  return {
    mode: mode === 'guided' ? 'guided' : 'auto',
    transcribeModel: String(body.transcribeModel || 'scribe_v2'),
    songAnalysisModel: String(body.songAnalysisModel || DEFAULT_SONG_ANALYSIS_MODEL),
    storyboardModel: String(body.storyboardModel || DEFAULT_STORYBOARD_MODEL),
    imageModel: String(body.imageModel || '').trim() || undefined,
  };
}

export function generationDebugOptions(input: unknown): GenerationDebugOptions {
  if (process.env.NODE_ENV === 'production') return {};

  const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const debug = body.debug && typeof body.debug === 'object' ? (body.debug as Record<string, unknown>) : {};
  const stopAfter = String(debug.stopAfter || '').trim();
  if (DEBUG_STOP_AFTER_GENERATION_STAGES.includes(stopAfter as GenerationDebugStopAfter)) {
    return { stopAfter: stopAfter as GenerationDebugStopAfter };
  }
  return {};
}

function debugStopOutput(stage: GenerationStage, output: unknown, debug: GenerationDebugOptions) {
  if (debug.stopAfter !== stage) return output;
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    return {
      ...(output as Record<string, unknown>),
      debugStopped: true,
      stopAfter: stage,
    };
  }
  return { value: output, debugStopped: true, stopAfter: stage };
}

export async function createGenerationRunRecord(params: {
  userId: string;
  projectId: string;
  project: any;
  idempotencyKey?: string;
  inputSnapshot: unknown;
}) {
  // 创建一次生成运行记录。run 表记录整体进度，step 表记录每个阶段的输入、
  // 输出和错误，project.activeRunId 用来让前端轮询当前正在跑的任务。
  return db().transaction(async (tx: any) => {
    const now = new Date();
    const [run] = await tx
      .insert(lyricVideoGenerationRun)
      .values({
        id: getUuid(),
        projectId: params.projectId,
        userId: params.userId,
        status: 'queued',
        currentStage: GENERATION_STAGES[0],
        progressPercent: 0,
        totalSteps: GENERATION_STAGES.length,
        completedSteps: 0,
        failedSteps: 0,
        idempotencyKey: params.idempotencyKey,
        requestHash: requestHash(params.inputSnapshot),
        inputSnapshot: safeJson(params.inputSnapshot),
        startedAt: now,
      })
      .returning();

    const steps = await tx
      .insert(lyricVideoGenerationStep)
      .values(
        GENERATION_STAGES.map((stage, index) => ({
          id: getUuid(),
          runId: run.id,
          projectId: params.projectId,
          userId: params.userId,
          stage,
          status: index === 0 ? 'queued' : 'pending',
          sort: index,
          progressPercent: 0,
          maxAttempts: 3,
          inputJson: index === 0 ? safeJson(params.inputSnapshot) : undefined,
        }))
      )
      .returning();

    await tx
      .update(lyricVideoProject)
      .set({
        ...buildProjectGenerationSnapshot(run, {
          activeRunId: run.id,
          pipelineStage: 'generation_queued',
          pipelineError: null,
        }),
      })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));

    logLyricStage('generation-run', 'db-created', {
      projectId: params.projectId,
      userId: params.userId,
      runId: run.id,
      stepCount: steps.length,
      steps: steps.map((step: any) => ({
        id: step.id,
        stage: step.stage,
        status: step.status,
      })),
      pipelineStage: 'generation_queued',
      generationStatus: 'queued',
    });

    return { run, steps };
  });
}

export function findGenerationStep(steps: any[], stage: GenerationStage) {
  const step = steps.find((item) => item.stage === stage);
  if (!step) throw new Error(`Generation step not found: ${stage}`);
  return step;
}

export async function markGenerationStepRunning(params: {
  userId: string;
  projectId: string;
  runId: string;
  step: any;
  progress: number;
  input?: unknown;
}) {
  const stepPatch: any = {
    status: 'running',
    progressPercent: params.progress,
    attemptCount: (params.step.attemptCount || 0) + 1,
    startedAt: new Date(),
    errorCode: null,
    errorMessage: null,
    lockedAt: new Date(),
    lockedBy: 'api:generate',
  };
  if (params.input !== undefined) stepPatch.inputJson = safeJson(params.input);

  await Promise.all([
    db()
      .update(lyricVideoGenerationStep)
      .set(stepPatch)
      .where(and(eq(lyricVideoGenerationStep.id, params.step.id), eq(lyricVideoGenerationStep.userId, params.userId))),
    db()
      .update(lyricVideoGenerationRun)
      .set({
        status: 'running',
        currentStage: params.step.stage,
        progressPercent: params.progress,
      })
      .where(and(eq(lyricVideoGenerationRun.id, params.runId), eq(lyricVideoGenerationRun.userId, params.userId))),
    db()
      .update(lyricVideoProject)
      .set(
        buildProjectGenerationSnapshot(
          { status: 'running', currentStage: params.step.stage, progressPercent: params.progress },
          { pipelineError: null }
        )
      )
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
  ]);
  logLyricStage('generation-step', 'running', {
    projectId: params.projectId,
    userId: params.userId,
    runId: params.runId,
    stepId: params.step.id,
    stage: params.step.stage,
    progress: params.progress,
    attemptCount: (params.step.attemptCount || 0) + 1,
  });
}

export async function markGenerationStepSuccess(params: {
  userId: string;
  runId: string;
  step: any;
  progress: number;
  output?: unknown;
}) {
  await Promise.all([
    db()
      .update(lyricVideoGenerationStep)
      .set({
        status: 'success',
        progressPercent: 100,
        outputJson: params.output === undefined ? undefined : safeJson(params.output),
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      })
      .where(and(eq(lyricVideoGenerationStep.id, params.step.id), eq(lyricVideoGenerationStep.userId, params.userId))),
    db()
      .update(lyricVideoGenerationRun)
      .set({
        completedSteps: Math.max((params.step.sort || 0) + 1, 1),
        progressPercent: params.progress,
      })
      .where(and(eq(lyricVideoGenerationRun.id, params.runId), eq(lyricVideoGenerationRun.userId, params.userId))),
  ]);
  logLyricStage('generation-step', 'success', {
    userId: params.userId,
    runId: params.runId,
    stepId: params.step.id,
    stage: params.step.stage,
    progress: params.progress,
    outputPresent: params.output !== undefined,
  });
}

export async function markGenerationStepWaitingProvider(params: {
  userId: string;
  projectId: string;
  runId: string;
  step: any;
  progress: number;
  output?: unknown;
}) {
  await Promise.all([
    db()
      .update(lyricVideoGenerationStep)
      .set({
        status: 'waiting_provider',
        progressPercent: params.progress,
        outputJson: params.output === undefined ? undefined : safeJson(params.output),
        lockedAt: null,
        lockedBy: null,
      })
      .where(and(eq(lyricVideoGenerationStep.id, params.step.id), eq(lyricVideoGenerationStep.userId, params.userId))),
    db()
      .update(lyricVideoGenerationRun)
      .set({
        status: 'waiting_provider',
        currentStage: params.step.stage,
        completedSteps: Math.max((params.step.sort || 0) + 1, 1),
        progressPercent: params.progress,
      })
      .where(and(eq(lyricVideoGenerationRun.id, params.runId), eq(lyricVideoGenerationRun.userId, params.userId))),
    db()
      .update(lyricVideoProject)
      .set(
        buildProjectGenerationSnapshot(
          { status: 'waiting_provider', currentStage: params.step.stage, progressPercent: params.progress },
          { pipelineStage: 'images_processing', pipelineError: null }
        )
      )
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
  ]);
  logLyricStage('generation-step', 'waiting-provider', {
    projectId: params.projectId,
    userId: params.userId,
    runId: params.runId,
    stepId: params.step.id,
    stage: params.step.stage,
    progress: params.progress,
  });
}

export async function failGenerationRun(params: {
  userId: string;
  projectId: string;
  runId: string;
  step?: any;
  error: any;
  input?: unknown;
}) {
  const message = params.error?.message || 'Generation failed';
  const failureSnapshot = buildFailureSnapshot({
    stage: params.step?.stage,
    step: params.step,
    error: params.error,
    input: params.input,
  });
  const updates: Promise<unknown>[] = [
    db()
      .update(lyricVideoGenerationRun)
      .set({
        status: 'failed',
        failedSteps: 1,
        errorCode: params.step?.stage || 'generation_failed',
        errorMessage: message,
        completedAt: new Date(),
      })
      .where(and(eq(lyricVideoGenerationRun.id, params.runId), eq(lyricVideoGenerationRun.userId, params.userId))),
    db()
      .update(lyricVideoProject)
      .set(
        buildProjectGenerationSnapshot(
          {
            status: 'failed',
            currentStage: params.step?.stage || 'generation_failed',
            progressPercent: 0,
            errorMessage: message,
          },
          {
            pipelineStage: params.step ? `${params.step.stage}_failed` : 'generation_failed',
            pipelineError: message,
          }
        )
      )
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
  ];

  if (params.step) {
    updates.push(
      db()
        .update(lyricVideoGenerationStep)
        .set({
          status: 'failed',
          errorCode: params.step.stage,
          errorMessage: message,
          outputJson: safeJson(failureSnapshot),
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        })
        .where(and(eq(lyricVideoGenerationStep.id, params.step.id), eq(lyricVideoGenerationStep.userId, params.userId)))
    );
  }

  await Promise.all(updates);
  logLyricStageError('generation-run', 'failed', params.error, {
    projectId: params.projectId,
    userId: params.userId,
    runId: params.runId,
    stage: params.step?.stage,
  });
}

export async function completeGenerationRun(params: {
  userId: string;
  projectId: string;
  runId: string;
  outputSnapshot: unknown;
}) {
  await Promise.all([
    db()
      .update(lyricVideoGenerationRun)
      .set({
        status: 'success',
        currentStage: 'finalize_project',
        progressPercent: 100,
        completedSteps: GENERATION_STAGES.length,
        failedSteps: 0,
        outputSnapshot: safeJson(params.outputSnapshot),
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      })
      .where(and(eq(lyricVideoGenerationRun.id, params.runId), eq(lyricVideoGenerationRun.userId, params.userId))),
    db()
      .update(lyricVideoProject)
      .set({
        lyricsStatus: 'ready',
        scenesStatus: 'ready',
        ...buildProjectGenerationSnapshot(
          { status: 'success', currentStage: 'finalize_project', progressPercent: 100 },
          { pipelineStage: 'storyboard_ready', pipelineError: null }
        ),
        lastGeneratedAt: new Date(),
      })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
  ]);
  logLyricStage('generation-run', 'completed', {
    projectId: params.projectId,
    userId: params.userId,
    runId: params.runId,
    status: 'success',
    pipelineStage: 'storyboard_ready',
    generationStatus: 'success',
  });
}

export async function markGenerationRunDebugStopped(params: {
  userId: string;
  projectId: string;
  runId: string;
  step: any;
  progress: number;
  outputSnapshot?: unknown;
}) {
  await Promise.all([
    db()
      .update(lyricVideoGenerationRun)
      .set({
        status: 'success',
        currentStage: params.step.stage,
        progressPercent: params.progress,
        completedSteps: Math.max((params.step.sort || 0) + 1, 1),
        failedSteps: 0,
        outputSnapshot: safeJson(
          params.outputSnapshot || {
            debugStopped: true,
            stopAfter: params.step.stage,
          }
        ),
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      })
      .where(and(eq(lyricVideoGenerationRun.id, params.runId), eq(lyricVideoGenerationRun.userId, params.userId))),
    db()
      .update(lyricVideoProject)
      .set(
        buildProjectGenerationSnapshot(
          { status: 'success', currentStage: params.step.stage, progressPercent: params.progress },
          { pipelineStage: `debug_stopped:${params.step.stage}`, pipelineError: null }
        )
      )
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
  ]);
  logLyricStage('generation-run', 'debug-stopped', {
    projectId: params.projectId,
    userId: params.userId,
    runId: params.runId,
    stopAfter: params.step.stage,
    progress: params.progress,
  });
}

export async function markGenerationRunDirectionReady(params: {
  userId: string;
  projectId: string;
  runId: string;
  step: any;
  progress: number;
  storyPrompt: string;
  outputSnapshot?: unknown;
}) {
  await Promise.all([
    db()
      .update(lyricVideoGenerationRun)
      .set({
        status: 'success',
        currentStage: 'direction_ready',
        progressPercent: params.progress,
        completedSteps: Math.max((params.step.sort || 0) + 1, 1),
        failedSteps: 0,
        outputSnapshot: safeJson(
          params.outputSnapshot || {
            guidedStopped: true,
            stopAfter: params.step.stage,
            storyPrompt: params.storyPrompt,
          }
        ),
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      })
      .where(and(eq(lyricVideoGenerationRun.id, params.runId), eq(lyricVideoGenerationRun.userId, params.userId))),
    db()
      .update(lyricVideoProject)
      .set({
        storyPrompt: params.storyPrompt,
        scenesStatus: 'lyrics_draft',
        ...buildProjectGenerationSnapshot(
          { status: 'success', currentStage: 'direction_ready', progressPercent: params.progress },
          { pipelineStage: 'direction_ready', pipelineError: null }
        ),
      })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
  ]);
  logLyricStage('generation-run', 'direction-ready', {
    projectId: params.projectId,
    userId: params.userId,
    runId: params.runId,
    stopAfter: params.step.stage,
    progress: params.progress,
    storyPromptLength: params.storyPrompt.length,
  });
}

async function maybeStopAfterGenerationStage(params: {
  userId: string;
  projectId: string;
  runId: string;
  step: any;
  progress: number;
  debug: GenerationDebugOptions;
  outputSnapshot?: unknown;
  songAnalysis?: unknown;
}) {
  if (params.debug.stopAfter !== params.step.stage) return undefined;

  await markGenerationRunDebugStopped({
    userId: params.userId,
    projectId: params.projectId,
    runId: params.runId,
    step: params.step,
    progress: params.progress,
    outputSnapshot: params.outputSnapshot || {
      debugStopped: true,
      stopAfter: params.step.stage,
    },
  });

  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  const finalRun = await getGenerationRun({ userId: params.userId, projectId: params.projectId, runId: params.runId });
  return {
    run: finalRun?.run,
    steps: finalRun?.steps || [],
    project: details?.project,
    lines: details?.lines || [],
    words: details?.words || [],
    scenes: details?.scenes || [],
    songAnalysis: params.songAnalysis,
    debugStopped: true,
    stopAfter: params.step.stage,
  };
}

export async function executeGenerationRun(params: {
  userId: string;
  projectId: string;
  run: any;
  steps: any[];
  project: any;
  input?: unknown;
  inputSnapshot: unknown;
}) {
  // 真正执行一键生成的流水线：
  // asr_words -> song_analysis -> prompt_generation -> image_generation。
  // 这里不直接生成最终 MP4；图片就绪后，导出视频由 render.ts 的 queueExport 负责。
  const startedAt = Date.now();
  const options = generationOptions(params.input);
  const debug = generationDebugOptions(params.input);
  let currentStep: any = undefined;
  let currentStepInput: unknown = undefined;

  try {
    const configs = await getAllConfigs();

    currentStep = findGenerationStep(params.steps, 'asr_words');
    currentStepInput = {
      request: params.inputSnapshot,
      audioUrl: params.project.originalAudioUrl || params.project.audioUrl,
      processedAudioUrl: params.project.processedAudioUrl,
      trimStartMs: params.project.trimStartMs,
      trimEndMs: params.project.trimEndMs,
      transcribeModel: options.transcribeModel,
    };
    await markGenerationStepRunning({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      step: currentStep,
      progress: 5,
      input: currentStepInput,
    });
    if (!(params.project.originalAudioUrl || params.project.audioUrl)) {
      throw createLyricVideoError('Upload audio before generation', {
        errorKind: 'input_missing',
        stage: 'asr_words',
        diagnostics: { projectId: params.projectId, hasAudioUrl: Boolean(params.project.audioUrl), hasOriginalAudioUrl: Boolean(params.project.originalAudioUrl) },
      });
    }
    if (!configs.elevenlabs_api_key) {
      throw createLyricVideoError('ELEVENLABS_API_KEY is required for ElevenLabs transcription', {
        errorKind: 'provider_request_failed',
        stage: 'asr_words',
        provider: 'elevenlabs',
        model: options.transcribeModel,
      });
    }
    const transcriptionProject = await prepareAudioClipForTranscription({
      userId: params.userId,
      project: params.project,
    });
    const transcriptionAudioUrl = transcriptionProject.processedAudioUrl || transcriptionProject.audioUrl;
    const audioPrepareSnapshot = {
      audioUrl: transcriptionProject.audioUrl,
      processedAudioUrl: transcriptionProject.processedAudioUrl,
      trimStartMs: transcriptionProject.trimStartMs,
      trimEndMs: transcriptionProject.trimEndMs,
      language: transcriptionProject.language,
      transcribeModel: options.transcribeModel,
    };
    currentStepInput = audioPrepareSnapshot;
    await Promise.all([
      db()
        .update(lyricVideoGenerationStep)
        .set({ inputJson: safeJson(audioPrepareSnapshot), progressPercent: 20 })
        .where(and(eq(lyricVideoGenerationStep.id, currentStep.id), eq(lyricVideoGenerationStep.userId, params.userId))),
      db()
        .update(lyricVideoGenerationRun)
        .set({ status: 'running', currentStage: currentStep.stage, progressPercent: 20 })
        .where(and(eq(lyricVideoGenerationRun.id, params.run.id), eq(lyricVideoGenerationRun.userId, params.userId))),
      db()
        .update(lyricVideoProject)
        .set(
          buildProjectGenerationSnapshot(
            { status: 'running', currentStage: currentStep.stage, progressPercent: 20 },
            { pipelineError: null }
          )
        )
        .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
    ]);
    const [result, analysisResult] = await Promise.all([
      transcribeWithElevenLabs({
        audioUrl: transcriptionAudioUrl || '',
        configs,
        language: transcriptionProject.language || 'auto',
        prompt: transcriptionProject.title,
        transcribeModel: options.transcribeModel,
      }),
      analyzeAudioWithLibrosa({
        projectId: params.projectId,
        audioUrl: transcriptionAudioUrl,
      }),
    ]);
    const refinedLines = refineAsrSegmentsWithWords({
      segments: result.lines,
      words: result.words || [],
    });
    const cleanedWords = cleanAsrWordsForLyrics(result.words || []);
    const lyricLines = refinedLines.length > 0 ? refinedLines : groupWordsIntoLyricLines(cleanedWords);
    const asrResult: AsrDraftResult = {
      raw: result.raw,
      rawText: String((result as any).text || lyricLines.map((line: LyricLineInput) => line.text).join('\n')).trim(),
      rawSegments: lyricLines,
      words: cleanedWords,
    };
    if (asrResult.rawSegments.length === 0) {
      throw createLyricVideoError('ElevenLabs transcription returned no lyric segments', {
        errorKind: 'provider_invalid_response',
        stage: 'asr_words',
        provider: 'elevenlabs',
        model: options.transcribeModel,
        diagnostics: {
          raw: result.raw,
          wordCount: result.words?.length || 0,
          lineCount: result.lines?.length || 0,
        },
      });
    }
    const snapshot = asrSnapshot({
      provider: 'elevenlabs',
      model: options.transcribeModel,
      result: asrResult,
      audioAnalysis: analysisResult.audioAnalysis,
      audioAnalysisError: analysisResult.audioAnalysisError,
    });
    const lines = await replaceLyrics({
      userId: params.userId,
      projectId: params.projectId,
      lines: asrResult.rawSegments,
      words: asrResult.words,
      runId: params.run.id,
      source: 'asr_words_refined',
    });
    await db()
      .update(lyricVideoProject)
      .set({
        transcriptionRaw: safeJson(snapshot),
        lyricsStatus: 'ready',
        pipelineStage: 'lyrics_ready',
        pipelineError: null,
      })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));
    const skeletonScenes = await replaceLyricsSceneSkeleton({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
    });
    const detailsAfterLyrics = await getProjectDetails({ userId: params.userId, id: params.projectId });
    if (!detailsAfterLyrics || detailsAfterLyrics.lines.length === 0) {
      throw createLyricVideoError('Lyrics were not persisted after transcription', {
        errorKind: 'persist_failed',
        stage: 'asr_words',
        diagnostics: {
          projectId: params.projectId,
          expectedLineCount: asrResult.rawSegments.length,
          persistedLineCount: detailsAfterLyrics?.lines.length || 0,
          persistedWordCount: detailsAfterLyrics?.words.length || 0,
        },
      });
    }
    if (detailsAfterLyrics.scenes.length === 0) {
      throw createLyricVideoError('Scene timing skeleton was not persisted after transcription', {
        errorKind: 'persist_failed',
        stage: 'asr_words',
        diagnostics: {
          projectId: params.projectId,
          lineCount: detailsAfterLyrics.lines.length,
          sceneCount: detailsAfterLyrics.scenes.length,
        },
      });
    }
    const asrOutput = {
      ...audioPrepareSnapshot,
      provider: 'elevenlabs',
      model: options.transcribeModel,
      lineCount: detailsAfterLyrics.lines.length,
      wordCount: detailsAfterLyrics.words.length,
      sceneCount: skeletonScenes.length,
      scenesStatus: skeletonScenes.length > 0 ? 'lyrics_draft' : 'empty',
      audioAnalysis: analysisResult.audioAnalysis,
      audioAnalysisError: analysisResult.audioAnalysisError,
    };
    await markGenerationStepSuccess({
      userId: params.userId,
      runId: params.run.id,
      step: currentStep,
      progress: 45,
      output: debugStopOutput('asr_words', asrOutput, debug),
    });
    const stoppedAfterAsr = await maybeStopAfterGenerationStage({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      step: currentStep,
      progress: 45,
      debug,
      outputSnapshot: debugStopOutput('asr_words', asrOutput, debug),
    });
    if (stoppedAfterAsr) return stoppedAfterAsr;

    currentStep = findGenerationStep(params.steps, 'song_analysis');
    const preprocess = preprocessLyricVideoForLlm({
      song: transcriptionProject.title,
      transcription: {
        rawText: asrResult.rawText,
        rawSegments: asrResult.rawSegments,
        words: asrResult.words,
      },
      audioAnalysis: analysisResult.audioAnalysis,
    });
    currentStepInput = { model: options.songAnalysisModel, preprocess };
    await markGenerationStepRunning({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      step: currentStep,
      progress: 50,
      input: currentStepInput,
    });
    const songAnalysisResult = await analyzeSongWithKieForDebug({
      preprocess,
      provider: 'kie_codex',
      model: options.songAnalysisModel,
    });
    assertUsableSongAnalysis(songAnalysisResult.songAnalysis);
    const storyActsText = formatStoryActsText(songAnalysisResult.songAnalysis);
    const existingStoryPrompt = String(detailsAfterLyrics.project.storyPrompt || '').trim();
    const directionStoryPrompt = existingStoryPrompt || storyActsText || songAnalysisResult.songAnalysis.theme || '';
    const shouldPersistStoryActs = Boolean(directionStoryPrompt && directionStoryPrompt !== existingStoryPrompt);
    const projectForStoryboard = shouldPersistStoryActs
      ? {
          ...detailsAfterLyrics.project,
          storyPrompt: directionStoryPrompt,
        }
      : detailsAfterLyrics.project;
    if (shouldPersistStoryActs) {
      await db()
        .update(lyricVideoProject)
        .set({
          storyPrompt: directionStoryPrompt,
          pipelineError: null,
        })
        .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));
    }
    const songAnalysisOutput = {
      ...songAnalysisResult,
      storyPrompt: directionStoryPrompt,
      storyPromptPersisted: shouldPersistStoryActs,
    };
    await markGenerationStepSuccess({
      userId: params.userId,
      runId: params.run.id,
      step: currentStep,
      progress: 70,
      output: debugStopOutput('song_analysis', songAnalysisOutput, debug),
    });
    const stoppedAfterSongAnalysis = await maybeStopAfterGenerationStage({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      step: currentStep,
      progress: 70,
      debug,
      outputSnapshot: debugStopOutput('song_analysis', songAnalysisOutput, debug),
      songAnalysis: songAnalysisResult.songAnalysis,
    });
    if (stoppedAfterSongAnalysis) return stoppedAfterSongAnalysis;

    if (options.mode === 'guided') {
      const directionOutputSnapshot = debugStopOutput('song_analysis', songAnalysisOutput, debug);
      const directionOutput =
        directionOutputSnapshot && typeof directionOutputSnapshot === 'object' && !Array.isArray(directionOutputSnapshot)
          ? (directionOutputSnapshot as Record<string, unknown>)
          : { value: directionOutputSnapshot };
      await markGenerationRunDirectionReady({
        userId: params.userId,
        projectId: params.projectId,
        runId: params.run.id,
        step: currentStep,
        progress: 70,
        storyPrompt: directionStoryPrompt,
        outputSnapshot: {
          ...directionOutput,
          guidedStopped: true,
          stopAfter: 'song_analysis',
          nextAction: 'review_direction',
        },
      });
      const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
      const finalRun = await getGenerationRun({ userId: params.userId, projectId: params.projectId, runId: params.run.id });
      return {
        run: finalRun?.run,
        steps: finalRun?.steps || [],
        project: details?.project,
        lines: details?.lines || [],
        words: details?.words || [],
        scenes: details?.scenes || [],
        songAnalysis: songAnalysisResult.songAnalysis,
        directionReady: true,
        stopAfter: 'song_analysis',
      };
    }

    currentStep = findGenerationStep(params.steps, 'prompt_generation');
    const fixedScenes = buildFixedStoryboardSceneDraftsFromPersistedScenes({
      scenes: detailsAfterLyrics.scenes,
      lines: detailsAfterLyrics.lines,
      audioAnalysis: analysisResult.audioAnalysis,
    });
    logLyricStage('generation-run', 'asr-timing-summary', {
      projectId: params.projectId,
      userId: params.userId,
      runId: params.run.id,
      ...asrTimingDebugSummary({
        raw: result.raw,
        cleanedWords,
        finalLines: asrResult.rawSegments,
        fixedScenes,
      }),
    });
    currentStepInput = {
      model: options.storyboardModel,
      fixedScenes,
      songAnalysis: songAnalysisResult.songAnalysis,
      storyPrompt: projectForStoryboard.storyPrompt,
    };
    await markGenerationStepRunning({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      step: currentStep,
      progress: 75,
      input: currentStepInput,
    });
    const storyboard = await generateStoryboardScenesWithKieClaude({
      songAnalysis: songAnalysisResult.songAnalysis,
      fixedScenes,
      project: projectForStoryboard,
      model: options.storyboardModel,
      cast: detailsAfterLyrics.cast,
    });
    const scenes = await replaceScenes({
      userId: params.userId,
      projectId: params.projectId,
      scenes: storyboard.scenes,
      runId: params.run.id,
    });
    if (scenes.length === 0) {
      throw createLyricVideoError('Storyboard prompts were not persisted', {
        errorKind: 'persist_failed',
        stage: 'prompt_generation',
        provider: storyboard.provider,
        model: storyboard.actualModel || options.storyboardModel,
        diagnostics: {
          expectedSceneCount: storyboard.scenes?.length || 0,
          persistedSceneCount: scenes.length,
          fixedSceneCount: fixedScenes.length,
          retryMode: storyboard.retryMode,
          missingSceneIds: storyboard.missingSceneIds,
          incompleteSceneIds: storyboard.incompleteSceneIds,
          fallbackSceneIds: storyboard.fallbackSceneIds,
          warnings: storyboard.warnings,
        },
      });
    }
    const promptGenerationOutput = {
      provider: storyboard.provider,
      model: storyboard.model,
      actualModel: storyboard.actualModel,
      sceneCount: scenes.length,
      fixedSceneCount: storyboard.fixedSceneCount || storyboard.fixedScenes?.length || fixedScenes.length,
      retryMode: storyboard.retryMode || 'none',
      missingSceneIds: storyboard.missingSceneIds || [],
      incompleteSceneIds: storyboard.incompleteSceneIds || [],
      retriedSceneIds: storyboard.retriedSceneIds || [],
      fallbackSceneIds: storyboard.fallbackSceneIds || [],
      warnings: storyboard.warnings || [],
      retryAttempts: storyboard.retryAttempts || [],
      fixedScenes: storyboard.fixedScenes,
      rawText: storyboard.rawText,
      raw: storyboard.raw,
    };
    await markGenerationStepSuccess({
      userId: params.userId,
      runId: params.run.id,
      step: currentStep,
      progress: 90,
      output: debugStopOutput('prompt_generation', promptGenerationOutput, debug),
    });
    const stoppedAfterPromptGeneration = await maybeStopAfterGenerationStage({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      step: currentStep,
      progress: 90,
      debug,
      outputSnapshot: debugStopOutput('prompt_generation', promptGenerationOutput, debug),
      songAnalysis: songAnalysisResult.songAnalysis,
    });
    if (stoppedAfterPromptGeneration) return stoppedAfterPromptGeneration;

    currentStep = findGenerationStep(params.steps, 'image_generation');
    currentStepInput = {
      model: options.imageModel,
      sceneCount: scenes.length,
      sceneIds: scenes.map((scene: any) => scene.id),
      gridSize: 4,
      batchSize: 16,
    };
    await markGenerationStepRunning({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      step: currentStep,
      progress: 92,
      input: currentStepInput,
    });
    const queuedImages = await queueSceneImagesGrid({
      userId: params.userId,
      projectId: params.projectId,
      sceneIds: scenes.map((scene: any) => scene.id),
      model: options.imageModel,
      clearExistingImages: true,
    });
    const imageProviderTaskIds = Array.from(
      new Set(queuedImages.map((scene: any) => scene.providerTaskId).filter(Boolean))
    );
    if (imageProviderTaskIds.length === 0) {
      throw createLyricVideoError('Scene image grid generation did not queue any provider tasks', {
        errorKind: 'provider_request_failed',
        stage: 'image_generation',
        provider: 'kie',
        model: options.imageModel || 'nano-banana-2',
        diagnostics: {
          queuedSceneCount: queuedImages.length,
          failedQueuedSceneCount: queuedImages.filter((scene: any) => scene.status === 'failed').length,
          failedScenes: queuedImages
            .filter((scene: any) => scene.status === 'failed')
            .map((scene: any) => ({
              id: scene.id,
              sort: scene.sort,
              failureCode: scene.failureCode,
              error: scene.error,
              imageTaskId: scene.imageTaskId,
              providerTaskId: scene.providerTaskId,
            })),
        },
      });
    }
    const outputSnapshot = {
      songAnalysis: songAnalysisResult.songAnalysis,
      models: {
        transcribe: options.transcribeModel,
        songAnalysis: songAnalysisResult.actualModel || options.songAnalysisModel,
        storyboard: storyboard.actualModel || options.storyboardModel,
        image: options.imageModel || 'nano-banana-2',
      },
      lineCount: lines.length,
      wordCount: detailsAfterLyrics.words.length,
      sceneCount: scenes.length,
      imageGeneration: {
        mode: 'grid_4x4',
        queuedSceneCount: queuedImages.length,
        failedQueuedSceneCount: queuedImages.filter((scene: any) => scene.status === 'failed').length,
        providerTaskIds: imageProviderTaskIds,
        batchCount: imageProviderTaskIds.length,
        failedScenes: queuedImages
          .filter((scene: any) => scene.status === 'failed')
          .map((scene: any) => ({
            id: scene.id,
            sort: scene.sort,
            failureCode: scene.failureCode,
            error: scene.error,
            imageTaskId: scene.imageTaskId,
            providerTaskId: scene.providerTaskId,
          })),
      },
      durationMs: Date.now() - startedAt,
      projectStatus: {
        lyricsStatus: 'ready',
        scenesStatus: 'processing',
        generationStatus: 'waiting_provider',
        pipelineStage: 'images_processing',
      },
    };
    await markGenerationStepWaitingProvider({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      step: currentStep,
      progress: 95,
      output: debugStopOutput('image_generation', outputSnapshot, debug),
    });
    const stoppedAfterImageGeneration = await maybeStopAfterGenerationStage({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      step: currentStep,
      progress: 95,
      debug,
      outputSnapshot: debugStopOutput('image_generation', outputSnapshot, debug),
      songAnalysis: songAnalysisResult.songAnalysis,
    });
    if (stoppedAfterImageGeneration) return stoppedAfterImageGeneration;

    const finalDetails = await getProjectDetails({ userId: params.userId, id: params.projectId });
    const finalRun = await getGenerationRun({ userId: params.userId, projectId: params.projectId, runId: params.run.id });
    return {
      run: finalRun?.run || params.run,
      steps: finalRun?.steps || params.steps,
      project: finalDetails?.project,
      lines: finalDetails?.lines || [],
      words: finalDetails?.words || [],
      scenes: finalDetails?.scenes || [],
      songAnalysis: songAnalysisResult.songAnalysis,
    };
  } catch (error: any) {
    await failGenerationRun({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      step: currentStep,
      error,
      input: currentStepInput || params.inputSnapshot,
    });
    throw error;
  }
}

export async function startGenerationRun(params: {
  userId: string;
  projectId: string;
  idempotencyKey?: string;
  input?: unknown;
}) {
  logLyricStage('generation-run', 'service-start', {
    projectId: params.projectId,
    userId: params.userId,
    idempotencyKey: params.idempotencyKey,
  });
  const project = await getProject({ userId: params.userId, id: params.projectId });
  if (!project) throw new Error('Project not found');

  if (project.activeRunId) {
    const [activeRun] = await db()
      .select()
      .from(lyricVideoGenerationRun)
      .where(and(eq(lyricVideoGenerationRun.id, project.activeRunId), eq(lyricVideoGenerationRun.userId, params.userId)))
      .limit(1);
    if (activeRun && isActiveGenerationRunStatus(activeRun.status)) {
      const steps = await listGenerationSteps({ userId: params.userId, runId: activeRun.id });
      const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
      logLyricStage('generation-run', 'reused-active-run', {
        projectId: params.projectId,
        userId: params.userId,
        runId: activeRun.id,
        runStatus: activeRun.status,
        currentStage: activeRun.currentStage,
        stepCount: steps.length,
        lineCount: details?.lines.length || 0,
        wordCount: details?.words.length || 0,
        sceneCount: details?.scenes.length || 0,
      });
      return {
        run: activeRun,
        steps,
        project: details?.project,
        lines: details?.lines || [],
        words: details?.words || [],
        scenes: details?.scenes || [],
        reused: true,
      };
    }
  }

  const inputSnapshot = {
    projectId: params.projectId,
    title: project.title,
    audioUrl: project.audioUrl,
    originalAudioUrl: project.originalAudioUrl || project.audioUrl,
    trimStartMs: project.trimStartMs || 0,
    trimEndMs: project.trimEndMs || project.audioDurationMs || 0,
    audioDurationMs: project.audioDurationMs || 0,
    storyPrompt: project.storyPrompt,
    artStyle: project.artStyle,
    palette: project.palette,
    aspectRatio: project.aspectRatio,
    resolution: project.resolution,
    request: params.input || {},
  };

  const created = await createGenerationRunRecord({
    userId: params.userId,
    projectId: params.projectId,
    project,
    idempotencyKey: params.idempotencyKey,
    inputSnapshot,
  });

  const result = await executeGenerationRun({
    userId: params.userId,
    projectId: params.projectId,
    run: created.run,
    steps: created.steps,
    project,
    input: params.input,
    inputSnapshot,
  });

  return { ...result, reused: false };
}

export async function startGenerationRunQueued(params: {
  userId: string;
  projectId: string;
  idempotencyKey?: string;
  input?: unknown;
}) {
  // 默认的一键生成入口。它先把 run/steps 写进数据库并立刻返回给前端，
  // route 再用 Next.js `after()` 在后台调用 executeGenerationRun 继续执行。
  logLyricStage('generation-run', 'service-queue-start', {
    projectId: params.projectId,
    userId: params.userId,
    idempotencyKey: params.idempotencyKey,
  });
  const project = await getProject({ userId: params.userId, id: params.projectId });
  if (!project) throw new Error('Project not found');

  if (project.activeRunId) {
    const [activeRun] = await db()
      .select()
      .from(lyricVideoGenerationRun)
      .where(and(eq(lyricVideoGenerationRun.id, project.activeRunId), eq(lyricVideoGenerationRun.userId, params.userId)))
      .limit(1);
    if (activeRun && isActiveGenerationRunStatus(activeRun.status)) {
      const steps = await listGenerationSteps({ userId: params.userId, runId: activeRun.id });
      const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
      logLyricStage('generation-run', 'queue-reused-active-run', {
        projectId: params.projectId,
        userId: params.userId,
        runId: activeRun.id,
        runStatus: activeRun.status,
        currentStage: activeRun.currentStage,
      });
      return {
        run: activeRun,
        steps,
        project: details?.project,
        lines: details?.lines || [],
        words: details?.words || [],
        scenes: details?.scenes || [],
        reused: true,
        queued: true,
        shouldExecute: false,
      };
    }
  }

  const inputSnapshot = {
    projectId: params.projectId,
    title: project.title,
    audioUrl: project.audioUrl,
    originalAudioUrl: project.originalAudioUrl || project.audioUrl,
    trimStartMs: project.trimStartMs || 0,
    trimEndMs: project.trimEndMs || project.audioDurationMs || 0,
    audioDurationMs: project.audioDurationMs || 0,
    storyPrompt: project.storyPrompt,
    artStyle: project.artStyle,
    palette: project.palette,
    aspectRatio: project.aspectRatio,
    resolution: project.resolution,
    request: params.input || {},
  };

  const created = await createGenerationRunRecord({
    userId: params.userId,
    projectId: params.projectId,
    project,
    idempotencyKey: params.idempotencyKey,
    inputSnapshot,
  });

  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  return {
    run: created.run,
    steps: created.steps,
    project: details?.project || project,
    lines: details?.lines || [],
    words: details?.words || [],
    scenes: details?.scenes || [],
    reused: false,
    queued: true,
    shouldExecute: true,
    execution: {
      run: created.run,
      steps: created.steps,
      project,
      input: params.input,
      inputSnapshot,
    },
  };
}

export async function getGenerationRun(params: { userId: string; projectId: string; runId: string }) {
  const [run] = await db()
    .select()
    .from(lyricVideoGenerationRun)
    .where(
      and(
        eq(lyricVideoGenerationRun.id, params.runId),
        eq(lyricVideoGenerationRun.projectId, params.projectId),
        eq(lyricVideoGenerationRun.userId, params.userId)
      )
    )
    .limit(1);
  if (!run) return null;
  const steps = await listGenerationSteps({ userId: params.userId, runId: run.id });
  return { run, steps };
}

export async function listGenerationSteps(params: { userId: string; runId: string }) {
  return db()
    .select()
    .from(lyricVideoGenerationStep)
    .where(and(eq(lyricVideoGenerationStep.runId, params.runId), eq(lyricVideoGenerationStep.userId, params.userId)))
    .orderBy(lyricVideoGenerationStep.sort);
}

export async function retryGenerationRun(params: { userId: string; projectId: string; runId: string }) {
  const data = await getGenerationRun(params);
  if (!data) throw new Error('Generation run not found');
  const retrySteps = data.steps.filter((step: any) => ['failed', 'canceled'].includes(step.status));
  if (retrySteps.length === 0) return data;

  await db().transaction(async (tx: any) => {
    for (const step of retrySteps) {
      await tx
        .update(lyricVideoGenerationStep)
        .set({
          status: 'queued',
          errorCode: null,
          errorMessage: null,
          nextRetryAt: null,
          attemptCount: step.attemptCount || 0,
        })
        .where(and(eq(lyricVideoGenerationStep.id, step.id), eq(lyricVideoGenerationStep.userId, params.userId)));
    }

    await tx
      .update(lyricVideoGenerationRun)
      .set({
        status: 'queued',
        currentStage: retrySteps[0].stage,
        failedSteps: 0,
        errorCode: null,
        errorMessage: null,
      })
      .where(and(eq(lyricVideoGenerationRun.id, params.runId), eq(lyricVideoGenerationRun.userId, params.userId)));

    await tx
      .update(lyricVideoProject)
      .set(
        buildProjectGenerationSnapshot(
          { status: 'queued', currentStage: retrySteps[0].stage, progressPercent: data.run.progressPercent || 0 },
          { activeRunId: params.runId, pipelineStage: 'generation_retry_queued', pipelineError: null }
        )
      )
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));
  });

  return getGenerationRun(params);
}

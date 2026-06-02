import { and, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { lyricVideoGenerationRun, lyricVideoGenerationStep, lyricVideoProject } from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { getAllConfigs } from '@/modules/config/service';
import { analyzeAudioWithLibrosa, prepareAudioClipForTranscription } from './audio';
import { asrSnapshot, asrTimingDebugSummary, cleanAsrWordsForLyrics, groupWordsIntoLyricLines, refineAsrSegmentsWithWords, transcribeWithElevenLabs } from './asr';
import { isActiveRunStatus, requestHash, safeJson } from './json';
import { assertUsableSongAnalysis, analyzeSongWithKieForDebug, generateStoryboardScenesWithKieClaude } from './llm';
import { getProject, getProjectDetails } from './project';
import { replaceLyrics } from './asr';
import { buildFixedStoryboardSceneDrafts, preprocessLyricVideoForLlm, replaceScenes } from './storyboard';
import {
  DEFAULT_SONG_ANALYSIS_MODEL,
  DEFAULT_STORYBOARD_MODEL,
  GENERATION_STAGES,
  type AsrDraftResult,
  type GenerationStage,
  type LyricLineInput,
} from './types';

export function generationOptions(input: unknown) {
  const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    transcribeModel: String(body.transcribeModel || 'scribe_v2'),
    songAnalysisModel: String(body.songAnalysisModel || DEFAULT_SONG_ANALYSIS_MODEL),
    storyboardModel: String(body.storyboardModel || DEFAULT_STORYBOARD_MODEL),
  };
}

export async function createGenerationRunRecord(params: {
  userId: string;
  projectId: string;
  project: any;
  idempotencyKey?: string;
  inputSnapshot: unknown;
}) {
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
        activeRunId: run.id,
        generationStatus: 'queued',
        generationProgress: 0,
        pipelineStage: 'generation_queued',
        pipelineError: null,
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
      .set({
        generationStatus: 'running',
        generationProgress: params.progress,
        pipelineStage: params.step.stage,
        pipelineError: null,
      })
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

export async function failGenerationRun(params: {
  userId: string;
  projectId: string;
  runId: string;
  step?: any;
  error: any;
}) {
  const message = params.error?.message || 'Generation failed';
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
      .set({
        generationStatus: 'failed',
        pipelineStage: params.step ? `${params.step.stage}_failed` : 'generation_failed',
        pipelineError: message,
      })
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
          outputJson: safeJson({ error: message }),
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
        generationStatus: 'success',
        generationProgress: 100,
        pipelineStage: 'storyboard_ready',
        pipelineError: null,
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

export async function executeGenerationRun(params: {
  userId: string;
  projectId: string;
  run: any;
  steps: any[];
  project: any;
  input?: unknown;
  inputSnapshot: unknown;
}) {
  const startedAt = Date.now();
  const options = generationOptions(params.input);
  let currentStep: any = undefined;

  try {
    const configs = await getAllConfigs();

    currentStep = findGenerationStep(params.steps, 'audio_prepare');
    await markGenerationStepRunning({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      step: currentStep,
      progress: 5,
      input: params.inputSnapshot,
    });
    if (!(params.project.originalAudioUrl || params.project.audioUrl)) {
      throw new Error('Upload audio before generation');
    }
    if (!configs.elevenlabs_api_key) {
      throw new Error('ELEVENLABS_API_KEY is required for ElevenLabs transcription');
    }
    const transcriptionProject = await prepareAudioClipForTranscription({
      userId: params.userId,
      project: params.project,
    });
    const transcriptionAudioUrl = transcriptionProject.processedAudioUrl || transcriptionProject.audioUrl;
    await markGenerationStepSuccess({
      userId: params.userId,
      runId: params.run.id,
      step: currentStep,
      progress: 15,
      output: {
        audioUrl: transcriptionProject.audioUrl,
        processedAudioUrl: transcriptionProject.processedAudioUrl,
        trimStartMs: transcriptionProject.trimStartMs,
        trimEndMs: transcriptionProject.trimEndMs,
      },
    });

    currentStep = findGenerationStep(params.steps, 'asr_words');
    await markGenerationStepRunning({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      step: currentStep,
      progress: 20,
      input: {
        audioUrl: transcriptionAudioUrl,
        language: transcriptionProject.language,
        transcribeModel: options.transcribeModel,
      },
    });
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
      throw new Error('ElevenLabs transcription returned no lyric segments');
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
    const detailsAfterLyrics = await getProjectDetails({ userId: params.userId, id: params.projectId });
    if (!detailsAfterLyrics || detailsAfterLyrics.lines.length === 0) {
      throw new Error('Lyrics were not persisted after transcription');
    }
    await markGenerationStepSuccess({
      userId: params.userId,
      runId: params.run.id,
      step: currentStep,
      progress: 45,
      output: {
        provider: 'elevenlabs',
        model: options.transcribeModel,
        lineCount: detailsAfterLyrics.lines.length,
        wordCount: detailsAfterLyrics.words.length,
        audioAnalysis: analysisResult.audioAnalysis,
        audioAnalysisError: analysisResult.audioAnalysisError,
      },
    });

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
    await markGenerationStepRunning({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      step: currentStep,
      progress: 50,
      input: { model: options.songAnalysisModel, preprocess },
    });
    const songAnalysisResult = await analyzeSongWithKieForDebug({
      preprocess,
      provider: 'kie_codex',
      model: options.songAnalysisModel,
    });
    assertUsableSongAnalysis(songAnalysisResult.songAnalysis);
    await markGenerationStepSuccess({
      userId: params.userId,
      runId: params.run.id,
      step: currentStep,
      progress: 70,
      output: songAnalysisResult,
    });

    currentStep = findGenerationStep(params.steps, 'prompt_generation');
    const fixedScenes = buildFixedStoryboardSceneDrafts({
      lines: detailsAfterLyrics.lines,
      audioAnalysis: analysisResult.audioAnalysis,
      words: detailsAfterLyrics.words,
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
    await markGenerationStepRunning({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      step: currentStep,
      progress: 75,
      input: {
        model: options.storyboardModel,
        fixedScenes,
        songAnalysis: songAnalysisResult.songAnalysis,
      },
    });
    const storyboard = await generateStoryboardScenesWithKieClaude({
      songAnalysis: songAnalysisResult.songAnalysis,
      fixedScenes,
      project: detailsAfterLyrics.project,
      model: options.storyboardModel,
    });
    const scenes = await replaceScenes({
      userId: params.userId,
      projectId: params.projectId,
      scenes: storyboard.scenes,
      runId: params.run.id,
    });
    if (scenes.length === 0) {
      throw new Error('Storyboard prompts were not persisted');
    }
    await markGenerationStepSuccess({
      userId: params.userId,
      runId: params.run.id,
      step: currentStep,
      progress: 90,
      output: {
        provider: storyboard.provider,
        model: storyboard.model,
        actualModel: storyboard.actualModel,
        sceneCount: scenes.length,
        fixedScenes: storyboard.fixedScenes,
        rawText: storyboard.rawText,
        raw: storyboard.raw,
      },
    });

    currentStep = findGenerationStep(params.steps, 'finalize_project');
    const outputSnapshot = {
      songAnalysis: songAnalysisResult.songAnalysis,
      models: {
        transcribe: options.transcribeModel,
        songAnalysis: songAnalysisResult.actualModel || options.songAnalysisModel,
        storyboard: storyboard.actualModel || options.storyboardModel,
      },
      lineCount: lines.length,
      wordCount: detailsAfterLyrics.words.length,
      sceneCount: scenes.length,
      durationMs: Date.now() - startedAt,
      projectStatus: {
        lyricsStatus: 'ready',
        scenesStatus: 'ready',
        generationStatus: 'success',
        pipelineStage: 'storyboard_ready',
      },
    };
    await markGenerationStepRunning({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      step: currentStep,
      progress: 95,
      input: outputSnapshot,
    });
    await markGenerationStepSuccess({
      userId: params.userId,
      runId: params.run.id,
      step: currentStep,
      progress: 100,
      output: outputSnapshot,
    });
    await completeGenerationRun({
      userId: params.userId,
      projectId: params.projectId,
      runId: params.run.id,
      outputSnapshot,
    });

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

  if (project.activeRunId && isActiveRunStatus(project.generationStatus)) {
    const [activeRun] = await db()
      .select()
      .from(lyricVideoGenerationRun)
      .where(and(eq(lyricVideoGenerationRun.id, project.activeRunId), eq(lyricVideoGenerationRun.userId, params.userId)))
      .limit(1);
    if (activeRun && isActiveRunStatus(activeRun.status)) {
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
      .set({
        activeRunId: params.runId,
        generationStatus: 'queued',
        pipelineStage: 'generation_retry_queued',
        pipelineError: null,
      })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));
  });

  return getGenerationRun(params);
}

import { and, desc, eq } from 'drizzle-orm';
import { lyricVideoGenerationStep } from '@/config/db/schema';
import { db } from '@/core/db';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { getAllConfigs } from '@/modules/config/service';
import { readAudioAnalysis } from './asr';
import { parseJsonField, requestHash, safeJson } from './json';
import {
  formatStoryActsText,
  generateProductionDirectionWithKie,
  mergeSongAnalysisParts,
  normalizePreviewStoryDraft,
  type PreviewStoryDraft,
  type ProductionDirectionDetail,
} from './llm';
import { getProjectDetails } from './project';
import { secondsFromMs } from './storyboard';
import { DEFAULT_STORYBOARD_MODEL, type LyricVideoLlmPreprocessResult, type LyricVideoSongAnalysisResult } from './types';

const DIRECTION_DETAIL_WAIT_MS = 30000;
const DIRECTION_DETAIL_POLL_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function storyHash(storyPrompt: string) {
  return requestHash({ storyPrompt: storyPrompt.trim() });
}

function preprocessFromDetails(details: any): LyricVideoLlmPreprocessResult {
  const audioAnalysis = readAudioAnalysis(details.project);
  const durationMs = Math.max(
    Math.round((audioAnalysis?.durationSec || 0) * 1000),
    Number(details.project.audioDurationMs || 0),
    ...details.lines.map((line: any) => Number(line.endMs || 0))
  );
  return {
    song: details.project.title || 'Untitled song',
    duration_s: Number((Math.max(0, durationMs) / 1000).toFixed(3)),
    bpm: audioAnalysis?.bpm,
    key: audioAnalysis?.key,
    lines: details.lines.map((line: any) => ({
      start_s: secondsFromMs(Number(line.startMs || 0)),
      end_s: secondsFromMs(Number(line.endMs || 0)),
      text: String(line.text || ''),
    })),
    energy_per_second: (audioAnalysis?.rmsBySecond || []).map((point: any) => Number(point.rms || 0)),
  };
}

async function latestSongAnalysisStep(params: { userId: string; projectId: string }) {
  const steps = await db()
    .select()
    .from(lyricVideoGenerationStep)
    .where(
      and(
        eq(lyricVideoGenerationStep.userId, params.userId),
        eq(lyricVideoGenerationStep.projectId, params.projectId),
        eq(lyricVideoGenerationStep.stage, 'song_analysis')
      )
    )
    .orderBy(desc(lyricVideoGenerationStep.updatedAt))
    .limit(10);

  return (
    steps.find((step: any) => {
      const output = parseJsonField<any>(step.outputJson, {});
      return output?.previewStoryDraft || output?.songAnalysis || output?.song_analysis || output?.value?.songAnalysis;
    }) || steps[0]
  );
}

function outputFromStep(step: any) {
  return parseJsonField<any>(step?.outputJson, {});
}

function previewDraftFromOutput(params: {
  output: any;
  details: any;
  storyPrompt: string;
}): PreviewStoryDraft {
  const fromOutput = params.output?.previewStoryDraft
    || params.output?.songAnalysis
    || params.output?.song_analysis
    || params.output?.value?.songAnalysis
    || {};
  const normalized = normalizePreviewStoryDraft(fromOutput);
  const formattedActs = formatStoryActsText(normalized).trim();
  const currentStoryPrompt = params.storyPrompt.trim();

  return {
    theme: normalized.theme || params.details.project.title || 'Lyric video story',
    story_acts:
      currentStoryPrompt && currentStoryPrompt !== formattedActs
        ? [{ title: 'User Story Direction', description: currentStoryPrompt }]
        : normalized.story_acts,
    visual_style: normalized.visual_style || params.details.project.artStyle || 'realistic',
    color_palette:
      normalized.color_palette.length > 0
        ? normalized.color_palette
        : String(params.details.project.palette || '')
            .split(',')
            .map((color) => color.trim())
            .filter(Boolean),
  };
}

function cachedSongAnalysis(params: {
  output: any;
  storyPromptHash: string;
  previewStoryDraft: PreviewStoryDraft;
}): LyricVideoSongAnalysisResult | null {
  if (
    params.output?.productionDirectionStatus !== 'success' ||
    params.output?.productionDirectionStoryPromptHash !== params.storyPromptHash ||
    !params.output?.productionDirectionDetail
  ) {
    return null;
  }
  return mergeSongAnalysisParts({
    previewStoryDraft: params.previewStoryDraft,
    productionDirectionDetail: params.output.productionDirectionDetail as ProductionDirectionDetail,
    fallback: params.output?.songAnalysis,
  });
}

async function updateDirectionOutput(step: any, patch: Record<string, unknown>) {
  if (!step?.id) return;
  const output = outputFromStep(step);
  await db()
    .update(lyricVideoGenerationStep)
    .set({
      outputJson: safeJson({
        ...output,
        ...patch,
      }),
    })
    .where(and(eq(lyricVideoGenerationStep.id, step.id), eq(lyricVideoGenerationStep.userId, step.userId)));
}

async function waitForMatchingDirection(params: {
  step: any;
  storyPromptHash: string;
  previewStoryDraft: PreviewStoryDraft;
}) {
  const deadline = Date.now() + DIRECTION_DETAIL_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(DIRECTION_DETAIL_POLL_MS);
    const [freshStep] = await db()
      .select()
      .from(lyricVideoGenerationStep)
      .where(and(eq(lyricVideoGenerationStep.id, params.step.id), eq(lyricVideoGenerationStep.userId, params.step.userId)))
      .limit(1);
    const output = outputFromStep(freshStep);
    const cached = cachedSongAnalysis({
      output,
      storyPromptHash: params.storyPromptHash,
      previewStoryDraft: params.previewStoryDraft,
    });
    if (cached) return { songAnalysis: cached, output, reused: true };
    if (output.productionDirectionStatus === 'failed') return null;
  }
  return null;
}

export async function ensureProductionDirectionDetail(params: {
  userId: string;
  projectId: string;
  storyPrompt?: string;
  model?: string;
  force?: boolean;
}) {
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');
  if (details.lines.length === 0) throw new Error('Generate lyrics before preparing direction detail');

  const effectiveStoryPrompt = (params.storyPrompt || details.project.storyPrompt || '').trim();
  if (!effectiveStoryPrompt) throw new Error('Create a story before preparing direction detail');

  const step = await latestSongAnalysisStep({ userId: params.userId, projectId: params.projectId });
  const output = outputFromStep(step);
  const promptHash = storyHash(effectiveStoryPrompt);
  const previewStoryDraft = previewDraftFromOutput({
    output,
    details,
    storyPrompt: effectiveStoryPrompt,
  });
  const cached = cachedSongAnalysis({
    output,
    storyPromptHash: promptHash,
    previewStoryDraft,
  });
  if (cached && !params.force) {
    logLyricStage('direction-detail', 'cache-hit', {
      projectId: params.projectId,
      userId: params.userId,
      storyPromptHash: promptHash,
    });
    return {
      songAnalysis: cached,
      previewStoryDraft,
      productionDirectionDetail: output.productionDirectionDetail as ProductionDirectionDetail,
      storyPrompt: effectiveStoryPrompt,
      storyPromptHash: promptHash,
      reused: true,
      status: 'success',
    };
  }

  if (
    !params.force &&
    step &&
    output.productionDirectionStatus === 'running' &&
    output.productionDirectionStoryPromptHash === promptHash
  ) {
    const waited = await waitForMatchingDirection({ step, storyPromptHash: promptHash, previewStoryDraft });
    if (waited?.songAnalysis) {
      return {
        songAnalysis: waited.songAnalysis,
        previewStoryDraft,
        productionDirectionDetail: waited.output.productionDirectionDetail as ProductionDirectionDetail,
        storyPrompt: effectiveStoryPrompt,
        storyPromptHash: promptHash,
        reused: true,
        status: 'success',
      };
    }
  }

  await updateDirectionOutput(step, {
    previewStoryDraft,
    productionDirectionStatus: 'running',
    productionDirectionStoryPromptHash: promptHash,
    productionDirectionStoryPrompt: effectiveStoryPrompt,
    productionDirectionStartedAt: new Date().toISOString(),
  });

  const configs = await getAllConfigs();
  const preprocess = preprocessFromDetails(details);
  if (!configs.kie_api_key) {
    const songAnalysis = mergeSongAnalysisParts({ previewStoryDraft });
    await updateDirectionOutput(step, {
      previewStoryDraft,
      productionDirectionDetail: {
        key_props: [],
        narrative_arc: [],
        location_plan: [],
        emotion_arc: [],
        notes: 'Skipped production direction detail because Kie API is not configured.',
      },
      productionDirectionStatus: 'skipped',
      productionDirectionStoryPromptHash: promptHash,
      productionDirectionStoryPrompt: effectiveStoryPrompt,
      songAnalysis,
    });
    return {
      songAnalysis,
      previewStoryDraft,
      productionDirectionDetail: {
        key_props: [],
        narrative_arc: [],
        location_plan: [],
        emotion_arc: [],
        notes: 'Skipped production direction detail because Kie API is not configured.',
      },
      storyPrompt: effectiveStoryPrompt,
      storyPromptHash: promptHash,
      reused: false,
      status: 'skipped',
    };
  }
  try {
    logLyricStage('direction-detail', 'service-start', {
      projectId: params.projectId,
      userId: params.userId,
      storyPromptHash: promptHash,
      storyPromptLength: effectiveStoryPrompt.length,
      model: params.model || configs.kie_codex_model || DEFAULT_STORYBOARD_MODEL,
    });
    const result = await generateProductionDirectionWithKie({
      preprocess,
      previewStoryDraft,
      storyPrompt: effectiveStoryPrompt,
      model: params.model || configs.kie_codex_model || DEFAULT_STORYBOARD_MODEL,
      cast: details.cast,
    });
    const songAnalysis = mergeSongAnalysisParts({
      previewStoryDraft,
      productionDirectionDetail: result.productionDirectionDetail,
      fallback: output?.songAnalysis,
    });
    await updateDirectionOutput(step, {
      previewStoryDraft,
      productionDirectionDetail: result.productionDirectionDetail,
      productionDirectionStatus: 'success',
      productionDirectionStoryPromptHash: promptHash,
      productionDirectionStoryPrompt: effectiveStoryPrompt,
      productionDirectionCompletedAt: new Date().toISOString(),
      productionDirectionProvider: result.provider,
      productionDirectionModel: result.model,
      productionDirectionActualModel: result.actualModel,
      productionDirectionRawText: result.rawText,
      productionDirectionRaw: result.raw,
      songAnalysis,
    });
    logLyricStage('direction-detail', 'service-success', {
      projectId: params.projectId,
      userId: params.userId,
      storyPromptHash: promptHash,
      narrativeArcCount: result.productionDirectionDetail.narrative_arc.length,
      locationPlanCount: result.productionDirectionDetail.location_plan.length,
      keyPropCount: result.productionDirectionDetail.key_props.length,
    });
    return {
      songAnalysis,
      previewStoryDraft,
      productionDirectionDetail: result.productionDirectionDetail,
      storyPrompt: effectiveStoryPrompt,
      storyPromptHash: promptHash,
      reused: false,
      status: 'success',
    };
  } catch (error) {
    await updateDirectionOutput(step, {
      productionDirectionStatus: 'failed',
      productionDirectionStoryPromptHash: promptHash,
      productionDirectionError: error instanceof Error ? error.message : String(error || 'Direction detail failed'),
      productionDirectionFailedAt: new Date().toISOString(),
    });
    logLyricStageError('direction-detail', 'service-fail', error, {
      projectId: params.projectId,
      userId: params.userId,
      storyPromptHash: promptHash,
    });
    throw error;
  }
}

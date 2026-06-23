import { and, eq, isNotNull, isNull, notInArray, or } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '@/core/db';
import { AIMediaType, AITaskStatus as ProviderTaskStatus, KIE_Z_IMAGE_MODEL } from '@/core/ai';
import { lyricVideoGenerationRun, lyricVideoGenerationStep, lyricVideoProject, lyricVideoScene } from '@/config/db/schema';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { getUuid } from '@/lib/hash';
import { createTask, updateTask, AITaskStatus } from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { fetchBytes, saveGeneratedFile } from './audio';
import {
  createLyricVideoImageProviderSelection,
  createLyricVideoImageQueryProvider,
  configuredLyricVideoImageProviderName,
  lyricVideoImageProviderFromGenerationParams,
  type LyricVideoImageProviderName,
  type LyricVideoImageProviderSelection,
} from './image-provider';
import { ensureProductionDirectionDetail } from './direction-detail';
import { LYRIC_VIDEO_IMAGE_SUCCESS_COST_CREDITS } from './costs';
import { parseJsonField, safeJson } from './json';
import { getProjectDetails } from './project';
import { buildProjectGenerationSnapshot } from './status';
import { generateStoryboard } from './storyboard';
import { ACTIVE_RUN_STATUSES, GENERATION_STAGES } from './types';
import { activeCastForStoryboard, cleanSceneCastIds, groupScenesByCastCombination } from './cast-library';

/**
 * 图片生成模块：把已有的 `lyric_video_scene.prompt` 送去图片供应商，并把结果写回 scene。
 *
 * 主链路里，`executeGenerationRun` 会在 prompt_generation 之后调用
 * `queueSceneImagesGrid`，把多个 scene 拼成网格图任务。前端随后通过
 * `GET /api/lyric-videos/:id/images` 调 `syncSceneImages` 轮询供应商，
 * 成功后把裁剪出的图片 URL 写回 `lyric_video_scene.imageUrl`。
 */

function resolveKieImageModel(configs: Record<string, string>, model?: string) {
  return model || configs.kie_image_model || KIE_Z_IMAGE_MODEL;
}

function normalizeKieImageResolution(model: string, resolution: unknown) {
  const normalizedModel = String(model || '').trim().toLowerCase();
  const normalizedResolution = String(resolution || '').trim().toUpperCase();
  if (normalizedModel !== 'nano-banana-2') return resolution || '1080p';
  if (normalizedResolution === '1K' || normalizedResolution === '2K' || normalizedResolution === '4K') {
    return normalizedResolution;
  }
  return '2K';
}

export const DEFAULT_SCENE_IMAGE_BATCH_LIMIT = 16;
export const GRID_SCENE_IMAGE_SIZE = 3;
export const GRID_SCENE_IMAGE_MODE = 'grid_3x3';
export const GRID_SCENE_IMAGE_RESOLUTION = '2K';
export const GRID_SCENE_IMAGE_BATCH_SIZE = GRID_SCENE_IMAGE_SIZE * GRID_SCENE_IMAGE_SIZE;
const GRID_IMAGE_QUEUE_CONCURRENCY = 4;
const GRID_IMAGE_SYNC_READY_BATCH_LIMIT = 1;
const GRID_IMAGE_AUTO_RETRY_MAX_ATTEMPTS = 2;
const VISUALS_ALREADY_RUNNING = 'VISUALS_ALREADY_RUNNING';

type GridImagePanelScene = any & {
  finalPrompt?: string;
  boundCast?: any;
  boundCastMembers?: any[];
  castIdsForGeneration?: string[];
  referenceImageUrl?: string;
  referenceImageUrls?: string[];
};

type GridImageBatchDescriptor = {
  batchIndex: number;
  start: number;
  scenes: GridImagePanelScene[];
  gridPrompt: ReturnType<typeof buildGridSceneImagePrompt>;
  imageOptions: Record<string, unknown>;
  provider: LyricVideoImageProviderSelection['provider'];
  providerName: LyricVideoImageProviderName;
  model: string;
  fallbackReason?: string;
  referenceImageUrl: string;
  referenceImageUrls: string[];
  castId?: string;
  castIds?: string[];
};

function isActiveGenerationStatus(status?: string | null) {
  return ACTIVE_RUN_STATUSES.includes(status as (typeof ACTIVE_RUN_STATUSES)[number]);
}

export function hasActiveSceneImageGeneration(scenes: Array<{ status?: string | null; imageUrl?: string | null; providerTaskId?: string | null }>) {
  return scenes.some((scene) => scene.status === 'processing' && !scene.imageUrl && Boolean(scene.providerTaskId));
}

export function hasActiveVisualGeneration(params: {
  project?: { generationStatus?: string | null; pipelineStage?: string | null; scenesStatus?: string | null } | null;
  scenes: Array<{ status?: string | null; imageUrl?: string | null; providerTaskId?: string | null }>;
}) {
  return (
    isActiveGenerationStatus(params.project?.generationStatus) ||
    params.project?.pipelineStage === 'storyboard_generating' ||
    params.project?.pipelineStage === 'images_queueing' ||
    params.project?.pipelineStage === 'images_processing' ||
    hasActiveSceneImageGeneration(params.scenes)
  );
}

function activeOrCurrentScenes(scenes: any[]) {
  const active = scenes.filter((scene: any) => scene.status === 'processing' && !scene.imageUrl);
  return active.length > 0 ? active : scenes;
}

async function claimImageQueueStart(params: {
  userId: string;
  projectId: string;
  pipelineStage?: 'storyboard_generating' | 'images_queueing' | 'images_processing';
  currentStage?: 'prompt_generation' | 'image_generation';
  progressPercent?: number;
}) {
  const [claimed] = await db()
    .update(lyricVideoProject)
    .set({
      scenesStatus: 'processing',
      ...buildProjectGenerationSnapshot(
        {
          status: 'running',
          currentStage: params.currentStage || 'image_generation',
          progressPercent: params.progressPercent || 80,
        },
        { pipelineStage: params.pipelineStage || 'images_queueing', pipelineError: null }
      ),
    })
    .where(
      and(
        eq(lyricVideoProject.id, params.projectId),
        eq(lyricVideoProject.userId, params.userId),
        or(isNull(lyricVideoProject.generationStatus), notInArray(lyricVideoProject.generationStatus, [...ACTIVE_RUN_STATUSES]))
      )
    )
    .returning();

  return claimed || null;
}

function alreadyRunningVisualsResponse(params: { details: any; storyPrompt: string }) {
  return {
    project: params.details.project,
    scenes: params.details.scenes,
    queuedImages: activeOrCurrentScenes(params.details.scenes),
    storyPrompt: params.storyPrompt,
    generatedStoryboard: false,
    alreadyRunning: true,
  };
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      }
    })
  );
  return results;
}

function isProviderReachableUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    return hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1' && hostname !== '[::1]';
  } catch {
    return false;
  }
}

function uniqueProviderReachableUrls(urls: unknown[]) {
  return Array.from(new Set(urls.filter(isProviderReachableUrl).map((url) => url.trim())));
}

function getCastReferenceImageUrls(castMember: any) {
  if (!castMember) return [];
  const generationParams = parseJsonField<{ referenceImageUrls?: unknown }>(castMember.generationParams, {});
  const primaryReferenceImageUrls = uniqueProviderReachableUrls([castMember.referenceImageUrl]);
  if (primaryReferenceImageUrls.length > 0) return primaryReferenceImageUrls;

  return Array.isArray(generationParams.referenceImageUrls)
    ? uniqueProviderReachableUrls(generationParams.referenceImageUrls)
    : [];
}

function sceneShotType(scene: any) {
  const timelineConfig = scene.timelineConfig && typeof scene.timelineConfig === 'object'
    ? scene.timelineConfig
    : parseJsonField<Record<string, any>>(scene.timelineConfig, {});
  return String(timelineConfig?.shotType || '').trim();
}

function resolveSceneCastMembers(params: { scene: any; cast: any[] }) {
  const activeCast = activeCastForStoryboard(params.cast);
  const sceneCastIds = cleanSceneCastIds(params.scene.castIds || [], activeCast);
  if (sceneCastIds.length > 0) {
    return activeCast.filter((member: any) => sceneCastIds.includes(member.id));
  }
  if (activeCast.length === 1 && sceneShotType(params.scene) === 'character_shot') {
    return activeCast;
  }
  return [];
}

function combinedCastPromptFragment(castMembers: any[]) {
  return castMembers
    .map((member: any) => {
      const name = String(member?.name || 'character').trim();
      const fragment = String(member?.promptFragment || member?.description || '').trim();
      return fragment ? `${name}: ${fragment}` : name;
    })
    .filter(Boolean)
    .join(' ');
}

function combinedReferenceCast(castMembers: any[]) {
  if (castMembers.length === 0) return null;
  if (castMembers.length === 1) return castMembers[0];
  return {
    id: castMembers.map((member: any) => member.id).join('+'),
    name: castMembers.map((member: any) => member.name || 'character').join(' and '),
    description: combinedCastPromptFragment(castMembers),
    promptFragment: combinedCastPromptFragment(castMembers),
  };
}

function scenePromptWithCast(params: { scene: any; cast: any[] }) {
  const boundCastMembers = resolveSceneCastMembers(params);
  const boundCast = boundCastMembers[0] || null;
  const referenceImageUrls = uniqueProviderReachableUrls(boundCastMembers.flatMap((member: any) => getCastReferenceImageUrls(member)));
  const prompt = String(params.scene.prompt || '').trim();
  const explicitCastIds = cleanSceneCastIds(params.scene.castIds || [], params.cast);
  const castIdsForGeneration = explicitCastIds.length > 0 ? explicitCastIds : boundCastMembers.map((member: any) => member.id);
  return {
    ...params.scene,
    finalPrompt: prompt,
    boundCast,
    boundCastMembers,
    castIdsForGeneration,
    referenceImageUrl: referenceImageUrls[0] || '',
    referenceImageUrls,
  };
}

function buildGridSceneImagePrompt(params: {
  scenes: any[];
  gridSize?: number;
  aspectRatio?: string;
  resolution?: string;
  referenceCast?: any;
  hasReferenceImage?: boolean;
}) {
  const gridSize = Math.max(1, Math.min(5, Math.floor(Number(params.gridSize || GRID_SCENE_IMAGE_SIZE) || GRID_SCENE_IMAGE_SIZE)));
  const totalPanels = gridSize * gridSize;
  const aspectRatio = params.aspectRatio === '9:16' ? '9:16' : '16:9';
  const resolution = String(params.resolution || GRID_SCENE_IMAGE_RESOLUTION).trim().toUpperCase();
  const baseLandscapeWidth = resolution === '1K' ? 1024 : resolution === '4K' ? 3840 : 2048;
  const baseLandscapeHeight = resolution === '1K' ? 576 : resolution === '4K' ? 2160 : 1152;
  const sourceWidth = aspectRatio === '9:16' ? baseLandscapeHeight : baseLandscapeWidth;
  const sourceHeight = aspectRatio === '9:16' ? baseLandscapeWidth : baseLandscapeHeight;
  const panelWidth = Math.round(sourceWidth / gridSize);
  const panelHeight = Math.round(sourceHeight / gridSize);
  const frameOrientation = aspectRatio === '9:16' ? 'vertical portrait' : 'landscape';
  const expectedPanel = aspectRatio === '9:16'
    ? `Each panel must be a 9:16 vertical portrait frame, approximately ${panelWidth}x${panelHeight} when cropped from a ${resolution} ${gridSize}x${gridSize} grid.`
    : `Each panel must be a 16:9 landscape frame, approximately ${panelWidth}x${panelHeight} when cropped from a ${resolution} ${gridSize}x${gridSize} grid.`;
  const layoutRules = [
    `The final image canvas itself must be ${aspectRatio}.`,
    `Divide the canvas into exactly ${gridSize} columns and exactly ${gridSize} rows: ${totalPanels} equal rectangular cells.`,
    `Draw thin straight black divider lines at every 1/${gridSize} grid boundary so the ${gridSize}x${gridSize} layout is visually unambiguous.`,
    'Do not create a collage, masonry layout, contact sheet, stacked strips, overlapping frames, variable-size panels, 2-column layout, 4-column layout, or any layout other than the requested square grid.',
    'Do not crop, merge, rotate, or resize individual cells differently. All cell edges must align perfectly.',
  ];
  const globalStyle = 'Global visual style for all panels: cinematic realistic live-action lyric video stills, photorealistic, natural human proportions, consistent art direction, consistent color grading, consistent lighting language, same visual universe across every panel, no mixed illustration styles, no anime, no cartoon, no 3D render, no text, no subtitles, no logos.';
  const referenceCast = params.referenceCast;
  const mainCharacter = referenceCast
    ? [
        `Main character: ${referenceCast.name || 'main character'}.`,
        params.hasReferenceImage ? 'Use the provided reference image as the primary identity reference.' : '',
        String(referenceCast.promptFragment || referenceCast.description || '').trim(),
        `Whenever a panel mentions ${referenceCast.name || 'the main character'}, preserve the same face, hair, outfit, and body proportions.`,
      ].filter(Boolean).join(' ')
    : '';
  const panels = params.scenes.map((scene, index) => ({
    panel: index + 1,
    sceneId: scene.id,
    startMs: scene.startMs,
    endMs: scene.endMs,
    prompt: String(scene.finalPrompt || scene.prompt || '').trim(),
  }));
  const panelLines = panels.map((panel) => `Panel ${panel.panel}: ${panel.prompt}`);
  const compiledPrompt = [
    globalStyle,
    mainCharacter,
    `Create one exact ${gridSize}x${gridSize} storyboard grid, ${totalPanels} equal panels, no labels.`,
    ...layoutRules,
    expectedPanel,
    `Panels are ordered left to right, top to bottom. Every panel is a ${frameOrientation} ${aspectRatio} frame. Empty unused panels must be pure white blank panels with no content.`,
    '',
    ...panelLines,
  ].filter(Boolean).join('\n');

  return {
    compiledPrompt,
    gridSize,
    aspectRatio,
    resolution,
    totalPanels,
    panelCount: panels.length,
    panels,
  };
}

function getGridGenerationParams(scene: any) {
  const parsed = scene.generationParams && typeof scene.generationParams === 'object'
    ? scene.generationParams as Record<string, any>
    : parseJsonField<Record<string, any>>(scene.generationParams, {});
  return (parsed?.mode === GRID_SCENE_IMAGE_MODE || parsed?.mode === 'grid_4x4') && parsed.grid ? parsed : null;
}

function sceneHasImage(scene: any) {
  return Boolean(scene.imageUrl || scene.status === 'success');
}

function gridBatchKeyForScene(scene: any) {
  const gridParams = getGridGenerationParams(scene);
  const grid = gridParams?.grid || {};
  if (grid.providerTaskId || scene.providerTaskId) return `provider:${grid.providerTaskId || scene.providerTaskId}`;
  if (grid.imageTaskId || scene.imageTaskId) return `task:${grid.imageTaskId || scene.imageTaskId}`;
  return '';
}

function groupFailedSceneImageBatches(scenes: any[]) {
  const failed = scenes
    .filter((scene: any) => scene.status === 'failed' && !scene.imageUrl)
    .sort((a: any, b: any) => (a.sort || 0) - (b.sort || 0));
  const groups = new Map<string, any[]>();
  const fallbackScenes: any[] = [];

  for (const scene of failed) {
    const key = gridBatchKeyForScene(scene);
    if (!key) {
      fallbackScenes.push(scene);
      continue;
    }
    const group = groups.get(key) || [];
    group.push(scene);
    groups.set(key, group);
  }

  let fallbackGroup: any[] = [];
  let lastSort: number | null = null;
  for (const scene of fallbackScenes) {
    const sort = Number(scene.sort || 0);
    if (fallbackGroup.length > 0 && lastSort !== null && sort !== lastSort + 1) {
      const key = `range:${fallbackGroup[0].sort || 0}:${fallbackGroup[fallbackGroup.length - 1].sort || 0}`;
      groups.set(key, fallbackGroup);
      fallbackGroup = [];
    }
    fallbackGroup.push(scene);
    lastSort = sort;
  }
  if (fallbackGroup.length > 0) {
    const key = `range:${fallbackGroup[0].sort || 0}:${fallbackGroup[fallbackGroup.length - 1].sort || 0}`;
    groups.set(key, fallbackGroup);
  }

  return Array.from(groups.entries()).map(([batchKey, batchScenes]) => {
    const firstGridParams = getGridGenerationParams(batchScenes[0]);
    const firstGrid = firstGridParams?.grid || {};
    return {
      batchKey,
      batchIndex: firstGrid.batchIndex ?? null,
      batchNumber: firstGrid.batchNumber ?? null,
      providerTaskId: firstGrid.providerTaskId || batchScenes[0]?.providerTaskId || null,
      imageTaskId: firstGrid.imageTaskId || batchScenes[0]?.imageTaskId || null,
      sceneIds: batchScenes.map((scene: any) => scene.id),
      failedCount: batchScenes.length,
      scenes: batchScenes,
    };
  });
}

function summarizeSceneImageProgress(scenes: any[]) {
  const failedBatches = groupFailedSceneImageBatches(scenes);
  return {
    total: scenes.length,
    success: scenes.filter(sceneHasImage).length,
    processing: scenes.filter((scene: any) => scene.status === 'processing').length,
    failed: scenes.filter((scene: any) => scene.status === 'failed' && !scene.imageUrl).length,
    failedBatches: failedBatches.length,
    retryable: failedBatches.length > 0,
  };
}

function failedSceneImageDetails(scenes: any[]) {
  return scenes
    .filter((scene: any) => scene.status === 'failed' && !scene.imageUrl)
    .map((scene: any) => ({
      id: scene.id,
      sort: scene.sort,
      providerTaskId: scene.providerTaskId || null,
      imageTaskId: scene.imageTaskId || null,
      failureCode: scene.failureCode || null,
      error: scene.error || null,
      grid: getGridGenerationParams(scene)?.grid || null,
    }));
}

function canAutoRetryGridBatch(scenes: any[]) {
  if (scenes.length === 0) return false;
  return scenes.every((scene: any) => Number(scene.attemptCount || 0) < GRID_IMAGE_AUTO_RETRY_MAX_ATTEMPTS);
}

function generationStageSort(stage: string) {
  const index = (GENERATION_STAGES as readonly string[]).indexOf(stage);
  return index >= 0 ? index : GENERATION_STAGES.length;
}

function generationStepByStage(steps: any[], stage: string) {
  return steps.find((step: any) => step.stage === stage);
}

async function getGenerationLedgerByRunId(params: {
  userId: string;
  projectId: string;
  runId?: string | null;
}) {
  if (!params.runId) return null;

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

  const existingSteps = await db()
    .select()
    .from(lyricVideoGenerationStep)
    .where(and(eq(lyricVideoGenerationStep.runId, run.id), eq(lyricVideoGenerationStep.userId, params.userId)));
  const existingStages = new Set(existingSteps.map((step: any) => step.stage));
  const missingStages = GENERATION_STAGES.filter((stage) => !existingStages.has(stage));
  if (missingStages.length > 0) {
    await db()
      .insert(lyricVideoGenerationStep)
      .values(
        missingStages.map((stage) => ({
          id: getUuid(),
          runId: run.id,
          projectId: params.projectId,
          userId: params.userId,
          stage,
          status: 'pending',
          sort: generationStageSort(stage),
          progressPercent: 0,
          maxAttempts: 3,
        }))
      );
  }

  const steps = await db()
    .select()
    .from(lyricVideoGenerationStep)
    .where(and(eq(lyricVideoGenerationStep.runId, run.id), eq(lyricVideoGenerationStep.userId, params.userId)));

  return {
    run,
    steps: steps.sort((a: any, b: any) => generationStageSort(a.stage) - generationStageSort(b.stage)),
  };
}

async function createVisualsGenerationLedger(params: {
  userId: string;
  projectId: string;
  details: any;
  storyPrompt: string;
}) {
  return db().transaction(async (tx: any) => {
    const now = new Date();
    const runId = getUuid();
    const inputSnapshot = {
      mode: 'visuals',
      source: 'generate_all_scenes',
      lineCount: params.details.lines.length,
      sceneCount: params.details.scenes.length,
      storyPromptLength: params.storyPrompt.length,
    };
    const [claimed] = await tx
      .update(lyricVideoProject)
      .set({
        ...buildProjectGenerationSnapshot(
          { status: 'running', currentStage: 'prompt_generation', progressPercent: 70 },
          {
            activeRunId: runId,
            pipelineStage: 'storyboard_generating',
            pipelineError: null,
          }
        ),
      })
      .where(
        and(
          eq(lyricVideoProject.id, params.projectId),
          eq(lyricVideoProject.userId, params.userId),
          or(isNull(lyricVideoProject.generationStatus), notInArray(lyricVideoProject.generationStatus, [...ACTIVE_RUN_STATUSES]))
        )
      )
      .returning();
    if (!claimed) throw new Error(VISUALS_ALREADY_RUNNING);

    const [run] = await tx
      .insert(lyricVideoGenerationRun)
      .values({
        id: runId,
        projectId: params.projectId,
        userId: params.userId,
        status: 'running',
        currentStage: 'prompt_generation',
        progressPercent: 70,
        totalSteps: GENERATION_STAGES.length,
        completedSteps: 2,
        failedSteps: 0,
        inputSnapshot: safeJson(inputSnapshot),
        startedAt: now,
      })
      .returning();
    const steps = await tx
      .insert(lyricVideoGenerationStep)
      .values(
        GENERATION_STAGES.map((stage) => {
          const isDirectionPrerequisite = stage === 'asr_words' || stage === 'song_analysis';
          return {
            id: getUuid(),
            runId,
            projectId: params.projectId,
            userId: params.userId,
            stage,
            status: isDirectionPrerequisite ? 'success' : stage === 'prompt_generation' ? 'queued' : 'pending',
            sort: generationStageSort(stage),
            progressPercent: isDirectionPrerequisite ? 100 : 0,
            maxAttempts: 3,
            inputJson: stage === 'prompt_generation' ? safeJson(inputSnapshot) : undefined,
            outputJson: isDirectionPrerequisite ? safeJson({ recoveredForVisuals: true }) : undefined,
            startedAt: isDirectionPrerequisite ? now : undefined,
            completedAt: isDirectionPrerequisite ? now : undefined,
          };
        })
      )
      .returning();

    logLyricStage('visuals', 'ledger-created', {
      projectId: params.projectId,
      userId: params.userId,
      runId: run.id,
      stepCount: steps.length,
    });

    return { run, steps };
  });
}

async function ensureVisualsGenerationLedger(params: {
  userId: string;
  projectId: string;
  details: any;
  storyPrompt: string;
}) {
  const existing = await getGenerationLedgerByRunId({
    userId: params.userId,
    projectId: params.projectId,
    runId: params.details.project.activeRunId,
  });
  if (existing && isActiveGenerationStatus(existing.run.status)) {
    return { alreadyRunning: true as const, ledger: existing };
  }
  try {
    return { alreadyRunning: false as const, ledger: await createVisualsGenerationLedger(params) };
  } catch (error: any) {
    if (error?.message === VISUALS_ALREADY_RUNNING) {
      return { alreadyRunning: true as const, ledger: existing || null };
    }
    throw error;
  }
}

function visualsStepOrThrow(steps: any[], stage: 'prompt_generation' | 'image_generation' | 'finalize_project') {
  const step = generationStepByStage(steps, stage);
  if (!step) throw new Error(`Generation step not found: ${stage}`);
  return step;
}

async function markVisualsStepRunning(params: {
  userId: string;
  projectId: string;
  runId: string;
  step: any;
  progress: number;
  input?: unknown;
}) {
  const patch: Record<string, unknown> = {
    status: 'running',
    progressPercent: params.progress,
    attemptCount: Number(params.step.attemptCount || 0) + 1,
    startedAt: new Date(),
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    lockedAt: new Date(),
    lockedBy: 'api:visuals',
  };
  if (params.input !== undefined) patch.inputJson = safeJson(params.input);

  await Promise.all([
    db()
      .update(lyricVideoGenerationStep)
      .set(patch)
      .where(and(eq(lyricVideoGenerationStep.id, params.step.id), eq(lyricVideoGenerationStep.userId, params.userId))),
    db()
      .update(lyricVideoGenerationRun)
      .set({
        status: 'running',
        currentStage: params.step.stage,
        progressPercent: params.progress,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
      })
      .where(and(eq(lyricVideoGenerationRun.id, params.runId), eq(lyricVideoGenerationRun.userId, params.userId))),
    db()
      .update(lyricVideoProject)
      .set(
        buildProjectGenerationSnapshot(
          { status: 'running', currentStage: params.step.stage, progressPercent: params.progress },
          { pipelineStage: params.step.stage === 'prompt_generation' ? 'storyboard_generating' : 'images_queueing', pipelineError: null }
        )
      )
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
  ]);

  logLyricStage('visuals', 'step-running', {
    projectId: params.projectId,
    userId: params.userId,
    runId: params.runId,
    stage: params.step.stage,
    progress: params.progress,
  });
}

async function markVisualsStepSuccess(params: {
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
        errorCode: null,
        errorMessage: null,
      })
      .where(and(eq(lyricVideoGenerationStep.id, params.step.id), eq(lyricVideoGenerationStep.userId, params.userId))),
    db()
      .update(lyricVideoGenerationRun)
      .set({
        status: 'running',
        currentStage: params.step.stage,
        completedSteps: Math.max(generationStageSort(params.step.stage) + 1, 1),
        progressPercent: params.progress,
        completedAt: null,
      })
      .where(and(eq(lyricVideoGenerationRun.id, params.runId), eq(lyricVideoGenerationRun.userId, params.userId))),
  ]);

  logLyricStage('visuals', 'step-success', {
    userId: params.userId,
    runId: params.runId,
    stage: params.step.stage,
    progress: params.progress,
  });
}

async function markVisualsImageWaitingProvider(params: {
  userId: string;
  projectId: string;
  runId: string;
  steps: any[];
  output: unknown;
}) {
  const imageStep = visualsStepOrThrow(params.steps, 'image_generation');
  const finalizeStep = generationStepByStage(params.steps, 'finalize_project');
  const updates: Promise<unknown>[] = [
    db()
      .update(lyricVideoGenerationStep)
      .set({
        status: 'waiting_provider',
        progressPercent: 95,
        outputJson: safeJson(params.output),
        lockedAt: null,
        lockedBy: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
      })
      .where(and(eq(lyricVideoGenerationStep.id, imageStep.id), eq(lyricVideoGenerationStep.userId, params.userId))),
    db()
      .update(lyricVideoGenerationRun)
      .set({
        status: 'waiting_provider',
        currentStage: 'image_generation',
        completedSteps: Math.max(generationStageSort('image_generation') + 1, 1),
        progressPercent: 95,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        outputSnapshot: safeJson(params.output),
      })
      .where(and(eq(lyricVideoGenerationRun.id, params.runId), eq(lyricVideoGenerationRun.userId, params.userId))),
    db()
      .update(lyricVideoProject)
      .set({
        scenesStatus: 'processing',
        ...buildProjectGenerationSnapshot(
          { status: 'waiting_provider', currentStage: 'image_generation', progressPercent: 95 },
          { pipelineStage: 'images_processing', pipelineError: null }
        ),
      })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
  ];

  if (finalizeStep) {
    updates.push(
      db()
        .update(lyricVideoGenerationStep)
        .set({
          status: 'pending',
          progressPercent: 0,
          outputJson: null,
          completedAt: null,
          lockedAt: null,
          lockedBy: null,
          errorCode: null,
          errorMessage: null,
        })
        .where(and(eq(lyricVideoGenerationStep.id, finalizeStep.id), eq(lyricVideoGenerationStep.userId, params.userId)))
    );
  }

  await Promise.all(updates);

  logLyricStage('visuals', 'image-waiting-provider', {
    projectId: params.projectId,
    userId: params.userId,
    runId: params.runId,
  });
}

async function markVisualsFinalizeSuccess(params: {
  userId: string;
  projectId: string;
  runId: string;
  steps: any[];
  output: unknown;
}) {
  const imageStep = generationStepByStage(params.steps, 'image_generation');
  const finalizeStep = visualsStepOrThrow(params.steps, 'finalize_project');
  const now = new Date();
  const updates: Promise<unknown>[] = [
    db()
      .update(lyricVideoGenerationRun)
      .set({
        status: 'success',
        currentStage: 'finalize_project',
        completedSteps: GENERATION_STAGES.length,
        failedSteps: 0,
        progressPercent: 100,
        outputSnapshot: safeJson(params.output),
        completedAt: now,
        errorCode: null,
        errorMessage: null,
      })
      .where(and(eq(lyricVideoGenerationRun.id, params.runId), eq(lyricVideoGenerationRun.userId, params.userId))),
    db()
      .update(lyricVideoGenerationStep)
      .set({
        status: 'success',
        progressPercent: 100,
        outputJson: safeJson(params.output),
        completedAt: now,
        lockedAt: null,
        lockedBy: null,
        errorCode: null,
        errorMessage: null,
      })
      .where(and(eq(lyricVideoGenerationStep.id, finalizeStep.id), eq(lyricVideoGenerationStep.userId, params.userId))),
    db()
      .update(lyricVideoProject)
      .set({
        scenesStatus: 'ready',
        ...buildProjectGenerationSnapshot(
          { status: 'success', currentStage: 'finalize_project', progressPercent: 100 },
          { pipelineStage: 'images_ready', pipelineError: null }
        ),
        lastGeneratedAt: now,
      })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
  ];

  if (imageStep) {
    updates.push(
      db()
        .update(lyricVideoGenerationStep)
        .set({
          status: 'success',
          progressPercent: 100,
          outputJson: safeJson(params.output),
          completedAt: now,
          lockedAt: null,
          lockedBy: null,
          errorCode: null,
          errorMessage: null,
        })
        .where(and(eq(lyricVideoGenerationStep.id, imageStep.id), eq(lyricVideoGenerationStep.userId, params.userId)))
    );
  }

  await Promise.all(updates);
}

async function markVisualsGenerationFailed(params: {
  userId: string;
  projectId: string;
  runId: string;
  steps: any[];
  stage: 'prompt_generation' | 'image_generation';
  error: any;
}) {
  const step = generationStepByStage(params.steps, params.stage);
  const message = params.error?.message || 'Generate visuals failed';
  const updates: Promise<unknown>[] = [
    db()
      .update(lyricVideoGenerationRun)
      .set({
        status: 'failed',
        currentStage: params.stage,
        failedSteps: 1,
        errorCode: params.stage,
        errorMessage: message,
        completedAt: new Date(),
      })
      .where(and(eq(lyricVideoGenerationRun.id, params.runId), eq(lyricVideoGenerationRun.userId, params.userId))),
    db()
      .update(lyricVideoProject)
      .set(
        buildProjectGenerationSnapshot(
          { status: 'failed', currentStage: params.stage, progressPercent: params.stage === 'prompt_generation' ? 70 : 90, errorMessage: message },
          { pipelineStage: `${params.stage}_failed`, pipelineError: message }
        )
      )
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
  ];

  if (step) {
    updates.push(
      db()
        .update(lyricVideoGenerationStep)
        .set({
          status: 'failed',
          errorCode: params.stage,
          errorMessage: message,
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        })
        .where(and(eq(lyricVideoGenerationStep.id, step.id), eq(lyricVideoGenerationStep.userId, params.userId)))
    );
  }

  await Promise.all(updates);
}

async function finalizeActiveImageGenerationRun(params: {
  userId: string;
  projectId: string;
  project: any;
  status: 'success' | 'partial_success';
  outputSnapshot: unknown;
  errorMessage?: string;
}) {
  const runId = params.project?.activeRunId;
  if (!runId) return;

  const [run] = await db()
    .select()
    .from(lyricVideoGenerationRun)
    .where(
      and(
        eq(lyricVideoGenerationRun.id, runId),
        eq(lyricVideoGenerationRun.projectId, params.projectId),
        eq(lyricVideoGenerationRun.userId, params.userId)
      )
    )
    .limit(1);
  if (!run || !['queued', 'running', 'waiting_provider'].includes(run.status)) return;

  const steps = await db()
    .select()
    .from(lyricVideoGenerationStep)
    .where(and(eq(lyricVideoGenerationStep.runId, runId), eq(lyricVideoGenerationStep.userId, params.userId)));
  const imageStep = steps.find((step: any) => step.stage === 'image_generation');
  const finalizeStep = steps.find((step: any) => step.stage === 'finalize_project');
  const now = new Date();

  const updates: Promise<unknown>[] = [
    db()
      .update(lyricVideoGenerationRun)
      .set({
        status: params.status,
        currentStage: 'finalize_project',
        progressPercent: params.status === 'success' ? 100 : 90,
        completedSteps: params.status === 'success' ? GENERATION_STAGES.length : Math.max(GENERATION_STAGES.length - 1, 0),
        failedSteps: params.status === 'success' ? 0 : 1,
        outputSnapshot: safeJson(params.outputSnapshot),
        completedAt: now,
        errorCode: params.status === 'success' ? null : 'images_partial_success',
        errorMessage: params.errorMessage || null,
      })
      .where(and(eq(lyricVideoGenerationRun.id, runId), eq(lyricVideoGenerationRun.userId, params.userId))),
  ];

  if (imageStep) {
    updates.push(
      db()
        .update(lyricVideoGenerationStep)
        .set({
          status: params.status,
          progressPercent: params.status === 'success' ? 100 : 90,
          outputJson: safeJson(params.outputSnapshot),
          errorCode: params.status === 'success' ? null : 'images_partial_success',
          errorMessage: params.errorMessage || null,
          completedAt: now,
          lockedAt: null,
          lockedBy: null,
        })
        .where(and(eq(lyricVideoGenerationStep.id, imageStep.id), eq(lyricVideoGenerationStep.userId, params.userId)))
    );
  }

  if (finalizeStep) {
    updates.push(
      db()
        .update(lyricVideoGenerationStep)
        .set({
          status: params.status,
          progressPercent: params.status === 'success' ? 100 : 90,
          outputJson: safeJson(params.outputSnapshot),
          errorCode: params.status === 'success' ? null : 'images_partial_success',
          errorMessage: params.errorMessage || null,
          completedAt: now,
          lockedAt: null,
          lockedBy: null,
        })
        .where(and(eq(lyricVideoGenerationStep.id, finalizeStep.id), eq(lyricVideoGenerationStep.userId, params.userId)))
    );
  }

  await Promise.all(updates);
  logLyricStage('scene-images', 'generation-run-finalized', {
    projectId: params.projectId,
    userId: params.userId,
    runId,
    status: params.status,
  });
}

export async function queueSceneImages(params: {
  userId: string;
  projectId: string;
  sceneId?: string;
  sceneIds?: string[];
  model?: string;
  onlyMissing?: boolean;
  clearExistingImages?: boolean;
  skipActiveGenerationGuard?: boolean;
}) {
  // 单张或少量 scene 图片排队入口。会创建 `ai_task`，然后把 providerTaskId、
  // imageTaskId、status=processing 写回对应 `lyric_video_scene`。
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');

  let scenes = details.scenes;
  if (params.sceneId) {
    scenes = scenes.filter((scene: any) => scene.id === params.sceneId);
  } else if (params.sceneIds && params.sceneIds.length > 0) {
    const sceneIdSet = new Set(params.sceneIds);
    scenes = scenes.filter((scene: any) => sceneIdSet.has(scene.id));
  }
  if (params.onlyMissing) {
    scenes = scenes.filter((scene: any) => !scene.imageUrl && scene.status !== 'processing');
  }
  if (!params.sceneId && !(params.sceneIds && params.sceneIds.length > 0)) {
    scenes = scenes.slice(0, DEFAULT_SCENE_IMAGE_BATCH_LIMIT);
  }

  if (scenes.length === 0) throw new Error('No scenes to generate');
  const scenesMissingPrompts = scenes.filter((scene: any) => !String(scene.prompt || '').trim());
  if (scenesMissingPrompts.length > 0) {
    throw new Error('Generate storyboard prompts before creating scene images');
  }
  if (!params.skipActiveGenerationGuard && hasActiveVisualGeneration({ project: details.project, scenes: details.scenes })) {
    logLyricStage('scene-images', 'queue-already-running', {
      projectId: params.projectId,
      userId: params.userId,
      sceneIds: scenes.map((scene: any) => scene.id),
      pipelineStage: details.project.pipelineStage,
      generationStatus: details.project.generationStatus,
    });
    return activeOrCurrentScenes(scenes);
  }
  if (!params.skipActiveGenerationGuard) {
    const claimed = await claimImageQueueStart({
      userId: params.userId,
      projectId: params.projectId,
      pipelineStage: 'images_queueing',
      currentStage: 'image_generation',
      progressPercent: 80,
    });
    if (!claimed) {
      const refreshed = await getProjectDetails({ userId: params.userId, id: params.projectId });
      const refreshedScenes = refreshed?.scenes || details.scenes;
      const selectedIds = new Set(scenes.map((scene: any) => scene.id));
      return activeOrCurrentScenes(refreshedScenes.filter((scene: any) => selectedIds.has(scene.id)));
    }
  }

  const configs = await getAllConfigs();
  const defaultModel = resolveKieImageModel(configs, params.model);
  const characterImageModel = configs.kie_character_image_model || 'nano-banana-2';
  const configuredProvider = configuredLyricVideoImageProviderName(configs);
  const queued = [];
  logLyricStage('scene-images', 'queue-start', {
    projectId: params.projectId,
    userId: params.userId,
    provider: configuredProvider,
    model: configuredProvider === 'wavespeed' ? configs.wavespeed_image_model : defaultModel,
    sceneCount: scenes.length,
    sceneIds: scenes.map((scene: any) => scene.id),
    clearExistingImages: params.clearExistingImages,
  });
  for (const scene of scenes) {
    const activeCast = activeCastForStoryboard(details.cast);
    const sceneCastIds = cleanSceneCastIds(scene.castIds || [], activeCast);
    const boundCastMembers =
      sceneCastIds.length > 0
        ? activeCast.filter((member: any) => sceneCastIds.includes(member.id) && getCastReferenceImageUrls(member).length > 0)
        : activeCast.length === 1
          ? activeCast.filter((member: any) => getCastReferenceImageUrls(member).length > 0)
          : [];
    const boundCast = combinedReferenceCast(boundCastMembers);
    const referenceImageUrls = uniqueProviderReachableUrls(boundCastMembers.flatMap((member: any) => getCastReferenceImageUrls(member)));
    const referenceImageUrl = referenceImageUrls[0] || '';
    const model = referenceImageUrls.length > 0 ? characterImageModel : defaultModel;
    const imageOptions: Record<string, unknown> = {
      aspect_ratio: details.project.aspectRatio,
      resolution: normalizeKieImageResolution(model, details.project.resolution),
    };
    if (referenceImageUrls.length > 0) {
      imageOptions.image_input = referenceImageUrls;
      imageOptions.output_format = 'jpg';
    }
    const providerSelection = await createLyricVideoImageProviderSelection({
      configs,
      model,
      needsReferenceImage: referenceImageUrls.length > 0,
      defaultKieModel: defaultModel,
      defaultKieCharacterModel: characterImageModel,
    });
    const normalizedImageOptions = providerSelection.normalizeOptions(imageOptions);
    const actualModel = providerSelection.model;
    const prompt = referenceImageUrls.length > 0 && boundCast?.promptFragment
      ? `${scene.prompt}\n\nKeep the character identity consistent with this reference: ${boundCast.promptFragment}.`
      : scene.prompt;

    const task = await createTask({
      userId: params.userId,
      mediaType: 'image',
      provider: providerSelection.providerName,
      model: actualModel,
      prompt,
      costCredits: LYRIC_VIDEO_IMAGE_SUCCESS_COST_CREDITS,
      options: {
        projectId: params.projectId,
        sceneId: scene.id,
        provider: providerSelection.providerName,
        fallbackReason: providerSelection.fallbackReason,
        ...normalizedImageOptions,
        castId: boundCastMembers[0]?.id,
        castIds: boundCastMembers.map((member: any) => member.id),
      },
    });

    try {
      const result = await providerSelection.provider.generate({
        params: {
          mediaType: AIMediaType.IMAGE,
          model: actualModel,
          prompt,
          options: normalizedImageOptions,
        },
      });
      await updateTask({
        taskId: task.id,
        status: AITaskStatus.PROCESSING,
        providerTaskId: result.taskId,
        taskResult: result.taskResult,
      });

      const [updated] = await db()
        .update(lyricVideoScene)
        .set({
          imageUrl: params.clearExistingImages ? null : scene.imageUrl,
          imageTaskId: task.id,
          providerTaskId: result.taskId,
          status: 'processing',
          attemptCount: (scene.attemptCount || 0) + 1,
          lastAttemptAt: new Date(),
          completedAt: null,
          failureCode: null,
          imageModel: actualModel,
          imagePromptSnapshot: prompt,
          generationParams: safeJson({
            provider: providerSelection.providerName,
            fallbackReason: providerSelection.fallbackReason,
            model: actualModel,
            castId: boundCast?.id,
            referenceImageUrl,
            referenceImageUrls,
          }),
          error: null,
        })
        .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
        .returning();
      queued.push(updated);
      logLyricStage('scene-images', 'scene-queued', {
        projectId: params.projectId,
        userId: params.userId,
        sceneId: updated.id,
        taskId: task.id,
        providerTaskId: result.taskId,
        provider: providerSelection.providerName,
        status: updated.status,
        hasImageUrl: Boolean(updated.imageUrl),
        promptLength: prompt.length,
        castId: boundCast?.id,
        hasReferenceImage: Boolean(referenceImageUrl),
      });
    } catch (error: any) {
      logLyricStageError('scene-images', 'scene-queue-fail', error, {
        projectId: params.projectId,
        userId: params.userId,
        sceneId: scene.id,
        taskId: task.id,
      });
      await updateTask({ taskId: task.id, status: AITaskStatus.FAILED, taskResult: { error: error?.message } });
      const [updated] = await db()
        .update(lyricVideoScene)
        .set({
          imageUrl: params.clearExistingImages ? null : scene.imageUrl,
          imageTaskId: task.id,
          status: 'failed',
          attemptCount: (scene.attemptCount || 0) + 1,
          lastAttemptAt: new Date(),
          completedAt: null,
          failureCode: 'queue_failed',
          error: error?.message || 'Image generation failed',
        })
        .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
        .returning();
      queued.push(updated);
    }
  }

  await db()
    .update(lyricVideoProject)
    .set({
      scenesStatus: 'processing',
      ...buildProjectGenerationSnapshot(
        { status: 'waiting_provider', currentStage: 'image_generation', progressPercent: 80 },
        { pipelineStage: 'images_processing', pipelineError: null }
      ),
    })
    .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));

  logLyricStage('scene-images', 'queue-complete', {
    projectId: params.projectId,
    userId: params.userId,
    queuedCount: queued.length,
    scenes: queued.map((scene: any) => ({
      id: scene.id,
      status: scene.status,
      providerTaskId: scene.providerTaskId,
      hasImageUrl: Boolean(scene.imageUrl),
    })),
    pipelineStage: 'images_processing',
    generationStatus: 'waiting_provider',
  });

  return queued;
}

export async function queueSceneImagesGrid(params: {
  userId: string;
  projectId: string;
  sceneIds?: string[];
  model?: string;
  onlyMissing?: boolean;
  clearExistingImages?: boolean;
  skipActiveGenerationGuard?: boolean;
}) {
  // 主链路默认使用的批量图片入口：把最多 9 个 scene 合成一个 3x3 grid prompt，
  // 降低供应商调用次数。每个 scene 会记录同一个 providerTaskId 和自己的 panel 信息。
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');

  let scenes = details.scenes;
  if (params.sceneIds && params.sceneIds.length > 0) {
    const sceneIdSet = new Set(params.sceneIds);
    scenes = scenes.filter((scene: any) => sceneIdSet.has(scene.id));
  }
  if (params.onlyMissing) {
    scenes = scenes.filter((scene: any) => !scene.imageUrl && scene.status !== 'processing');
  }
  if (scenes.length === 0) throw new Error('No scenes to generate');
  const scenesMissingPrompts = scenes.filter((scene: any) => !String(scene.prompt || '').trim());
  if (scenesMissingPrompts.length > 0) {
    throw new Error('Generate storyboard prompts before creating scene images');
  }
  if (!params.skipActiveGenerationGuard && hasActiveVisualGeneration({ project: details.project, scenes: details.scenes })) {
    logLyricStage('scene-images-grid', 'queue-already-running', {
      projectId: params.projectId,
      userId: params.userId,
      sceneIds: scenes.map((scene: any) => scene.id),
      pipelineStage: details.project.pipelineStage,
      generationStatus: details.project.generationStatus,
    });
    return activeOrCurrentScenes(scenes);
  }
  if (!params.skipActiveGenerationGuard) {
    const claimed = await claimImageQueueStart({
      userId: params.userId,
      projectId: params.projectId,
      pipelineStage: 'images_queueing',
      currentStage: 'image_generation',
      progressPercent: 80,
    });
    if (!claimed) {
      const refreshed = await getProjectDetails({ userId: params.userId, id: params.projectId });
      const refreshedScenes = refreshed?.scenes || details.scenes;
      const selectedIds = new Set(scenes.map((scene: any) => scene.id));
      return activeOrCurrentScenes(refreshedScenes.filter((scene: any) => selectedIds.has(scene.id)));
    }
  }

  const model = params.model || 'nano-banana-2';
  const aspectRatio = details.project.aspectRatio === '9:16' ? '9:16' : '16:9';
  const resolution = GRID_SCENE_IMAGE_RESOLUTION;
  const configs = await getAllConfigs();
  const configuredProvider = configuredLyricVideoImageProviderName(configs);
  const queued: any[] = [];
  const queuedBatchRecords: any[] = [];
  const cast = Array.isArray(details.cast) ? details.cast : [];

  logLyricStage('scene-images-grid', 'queue-start', {
    projectId: params.projectId,
    userId: params.userId,
    provider: configuredProvider,
    model: configuredProvider === 'wavespeed' ? configs.wavespeed_image_model : model,
    aspectRatio,
    resolution,
    sceneCount: scenes.length,
    sceneIds: scenes.map((scene: any) => scene.id),
    queueConcurrency: GRID_IMAGE_QUEUE_CONCURRENCY,
  });

  const descriptors: GridImageBatchDescriptor[] = [];
  let batchIndex = 0;
  let sceneOffset = 0;
  const groupedScenes = groupScenesByCastCombination(scenes, activeCastForStoryboard(cast));
  for (const group of groupedScenes) {
    for (let start = 0; start < group.scenes.length; start += GRID_SCENE_IMAGE_BATCH_SIZE) {
      const batchScenes = group.scenes
        .slice(start, start + GRID_SCENE_IMAGE_BATCH_SIZE)
        .map((scene: any) => scenePromptWithCast({ scene, cast }));
      const castMembersById = new Map<string, any>();
      for (const scene of batchScenes) {
        for (const member of scene.boundCastMembers || []) {
          if (member?.id) castMembersById.set(member.id, member);
        }
      }
      const batchReferenceCastMembers = Array.from(castMembersById.values());
      const batchReferenceCast = combinedReferenceCast(batchReferenceCastMembers);
      const referenceImageUrls = uniqueProviderReachableUrls(batchScenes.flatMap((scene) => scene.referenceImageUrls || []));
      const castIds = batchReferenceCastMembers.map((member: any) => member.id);
      const gridPrompt = buildGridSceneImagePrompt({
        scenes: batchScenes,
        gridSize: GRID_SCENE_IMAGE_SIZE,
        aspectRatio,
        resolution,
        referenceCast: batchReferenceCast,
        hasReferenceImage: referenceImageUrls.length > 0,
      });
      const imageOptions: Record<string, unknown> = {
        aspect_ratio: aspectRatio,
        resolution,
        output_format: 'jpg',
      };
      if (referenceImageUrls.length > 0) {
        imageOptions.image_input = referenceImageUrls;
      }
      const providerSelection = await createLyricVideoImageProviderSelection({
        configs,
        model,
        needsReferenceImage: referenceImageUrls.length > 0,
        defaultKieModel: model,
        defaultKieCharacterModel: configs.kie_character_image_model || 'nano-banana-2',
      });
      descriptors.push({
        batchIndex,
        start: sceneOffset,
        scenes: batchScenes,
        gridPrompt,
        imageOptions: providerSelection.normalizeOptions(imageOptions),
        provider: providerSelection.provider,
        providerName: providerSelection.providerName,
        model: providerSelection.model,
        fallbackReason: providerSelection.fallbackReason,
        referenceImageUrl: referenceImageUrls[0] || '',
        referenceImageUrls,
        castId: castIds[0],
        castIds,
      });
      batchIndex += 1;
      sceneOffset += batchScenes.length;
    }
  }

  async function queueBatch(descriptor: GridImageBatchDescriptor) {
    const { batchIndex, gridPrompt } = descriptor;
    let task: any = null;
    try {
      task = await createTask({
        userId: params.userId,
        mediaType: 'image',
        provider: descriptor.providerName,
        model: descriptor.model,
        prompt: gridPrompt.compiledPrompt,
        costCredits: descriptor.scenes.length * LYRIC_VIDEO_IMAGE_SUCCESS_COST_CREDITS,
        options: {
          projectId: params.projectId,
          provider: descriptor.providerName,
          fallbackReason: descriptor.fallbackReason,
          mode: GRID_SCENE_IMAGE_MODE,
          batchIndex,
          sceneIds: descriptor.scenes.map((scene: any) => scene.id),
          gridSize: GRID_SCENE_IMAGE_SIZE,
          ...descriptor.imageOptions,
          castId: descriptor.castId,
          castIds: descriptor.castIds || [],
          referenceImageUrl: descriptor.referenceImageUrl,
          referenceImageUrls: descriptor.referenceImageUrls,
        },
      });
      logLyricStage('scene-images-grid', 'batch-queue-start', {
        projectId: params.projectId,
        userId: params.userId,
        batchIndex,
        taskId: task.id,
        sceneCount: descriptor.scenes.length,
        sceneIds: descriptor.scenes.map((scene: any) => scene.id),
        provider: descriptor.providerName,
        queueConcurrency: GRID_IMAGE_QUEUE_CONCURRENCY,
        hasReferenceImage: descriptor.referenceImageUrls.length > 0,
        castIds: descriptor.castIds || [],
      });
      const result = await descriptor.provider.generate({
        params: {
          mediaType: AIMediaType.IMAGE,
          model: descriptor.model,
          prompt: gridPrompt.compiledPrompt,
          options: descriptor.imageOptions,
        },
      });
      await updateTask({
        taskId: task.id,
        status: AITaskStatus.PROCESSING,
        providerTaskId: result.taskId,
        taskResult: result.taskResult,
      });

      const batchRecord = {
        batchIndex,
        providerTaskId: result.taskId,
        provider: descriptor.providerName,
        taskId: task.id,
        panelCount: descriptor.scenes.length,
        sceneOffset: descriptor.start,
        castId: descriptor.castId,
        referenceImageUrl: descriptor.referenceImageUrl,
        referenceImageUrls: descriptor.referenceImageUrls,
      };
      queuedBatchRecords.push(batchRecord);

      const batchQueued = [];
      for (const [index, scene] of descriptor.scenes.entries()) {
        const grid = {
          batchIndex,
          batchNumber: batchIndex + 1,
          sceneOffset: descriptor.start,
          panel: index + 1,
          globalPanel: descriptor.start + index + 1,
          gridSize: GRID_SCENE_IMAGE_SIZE,
          totalPanels: GRID_SCENE_IMAGE_BATCH_SIZE,
          aspectRatio,
          resolution,
          providerTaskId: result.taskId,
          imageTaskId: task.id,
        };
        const castIds = scene.castIdsForGeneration || [];
        const [updated] = await db()
          .update(lyricVideoScene)
          .set({
            imageUrl: params.clearExistingImages ? null : scene.imageUrl,
            imageTaskId: task.id,
            providerTaskId: result.taskId,
            status: 'processing',
            attemptCount: (scene.attemptCount || 0) + 1,
            lastAttemptAt: new Date(),
            completedAt: null,
            failureCode: null,
            imageModel: descriptor.model,
            imagePromptSnapshot: scene.finalPrompt || scene.prompt,
            generationParams: safeJson({
              mode: GRID_SCENE_IMAGE_MODE,
              provider: descriptor.providerName,
              fallbackReason: descriptor.fallbackReason,
              model: descriptor.model,
              castId: castIds[0],
              castIds,
              referenceImageUrl: scene.referenceImageUrl || descriptor.referenceImageUrl,
              referenceImageUrls: (scene.referenceImageUrls || []).length > 0 ? scene.referenceImageUrls : descriptor.referenceImageUrls,
              grid,
            }),
            error: null,
          })
          .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
          .returning();
        batchQueued.push(updated);
      }

      logLyricStage('scene-images-grid', 'batch-queued', {
        projectId: params.projectId,
        userId: params.userId,
        batchIndex,
        providerTaskId: result.taskId,
        provider: descriptor.providerName,
        sceneCount: descriptor.scenes.length,
        sceneIds: descriptor.scenes.map((scene: any) => scene.id),
        promptLength: gridPrompt.compiledPrompt.length,
        hasReferenceImage: descriptor.referenceImageUrls.length > 0,
        queueConcurrency: GRID_IMAGE_QUEUE_CONCURRENCY,
      });
      return batchQueued;
    } catch (error: any) {
      logLyricStageError('scene-images-grid', 'batch-queue-fail', error, {
        projectId: params.projectId,
        userId: params.userId,
        batchIndex,
        taskId: task?.id,
        sceneIds: descriptor.scenes.map((scene: any) => scene.id),
        queueConcurrency: GRID_IMAGE_QUEUE_CONCURRENCY,
      });
      if (task?.id) {
        await updateTask({ taskId: task.id, status: AITaskStatus.FAILED, taskResult: { error: error?.message } });
      }
      const batchQueued = [];
      for (const [index, scene] of descriptor.scenes.entries()) {
        const grid = {
          batchIndex,
          batchNumber: batchIndex + 1,
          sceneOffset: descriptor.start,
          panel: index + 1,
          globalPanel: descriptor.start + index + 1,
          gridSize: GRID_SCENE_IMAGE_SIZE,
          totalPanels: GRID_SCENE_IMAGE_BATCH_SIZE,
          aspectRatio,
          resolution,
          providerTaskId: null,
          imageTaskId: task?.id || null,
        };
        const castIds = scene.castIdsForGeneration || [];
        const [updated] = await db()
          .update(lyricVideoScene)
          .set({
            imageUrl: params.clearExistingImages ? null : scene.imageUrl,
            imageTaskId: task?.id || null,
            providerTaskId: null,
            status: 'failed',
            attemptCount: (scene.attemptCount || 0) + 1,
            lastAttemptAt: new Date(),
            completedAt: null,
            failureCode: 'queue_failed',
            imageModel: descriptor.model,
            imagePromptSnapshot: scene.finalPrompt || scene.prompt,
            generationParams: safeJson({
              mode: GRID_SCENE_IMAGE_MODE,
              provider: descriptor.providerName,
              fallbackReason: descriptor.fallbackReason,
              model: descriptor.model,
              castId: castIds[0],
              castIds,
              referenceImageUrl: scene.referenceImageUrl || descriptor.referenceImageUrl,
              referenceImageUrls: (scene.referenceImageUrls || []).length > 0 ? scene.referenceImageUrls : descriptor.referenceImageUrls,
              grid,
            }),
            error: error?.message || 'Grid image generation failed',
          })
          .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
          .returning();
        batchQueued.push(updated);
      }
      return batchQueued;
    }
  }

  const batchResults = await runWithConcurrency(descriptors, GRID_IMAGE_QUEUE_CONCURRENCY, queueBatch);
  queued.push(...batchResults.flat());
  const sceneOrder = new Map<string, number>(scenes.map((scene: any, index: number) => [scene.id, index]));
  queued.sort((a: any, b: any) => (sceneOrder.get(a.id) ?? 0) - (sceneOrder.get(b.id) ?? 0));

  await db()
    .update(lyricVideoProject)
    .set({
      scenesStatus: 'processing',
      ...buildProjectGenerationSnapshot(
        { status: 'waiting_provider', currentStage: 'image_generation', progressPercent: 80 },
        { pipelineStage: 'images_processing', pipelineError: null }
      ),
    })
    .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));

  logLyricStage('scene-images-grid', 'queue-complete', {
    projectId: params.projectId,
    userId: params.userId,
    queuedCount: queued.length,
    batchCount: queuedBatchRecords.length,
    queueConcurrency: GRID_IMAGE_QUEUE_CONCURRENCY,
    batches: queuedBatchRecords.sort((a: any, b: any) => a.batchIndex - b.batchIndex),
  });

  return queued;
}

async function reopenActiveImageGenerationRunForRetry(params: {
  userId: string;
  projectId: string;
  project: any;
  outputSnapshot: unknown;
}) {
  const runId = params.project?.activeRunId;
  if (!runId) return;

  const steps = await db()
    .select()
    .from(lyricVideoGenerationStep)
    .where(and(eq(lyricVideoGenerationStep.runId, runId), eq(lyricVideoGenerationStep.userId, params.userId)));
  const imageStep = steps.find((step: any) => step.stage === 'image_generation');
  const finalizeStep = steps.find((step: any) => step.stage === 'finalize_project');
  const updates: Promise<unknown>[] = [
    db()
      .update(lyricVideoGenerationRun)
      .set({
        status: 'waiting_provider',
        currentStage: 'image_generation',
        progressPercent: 95,
        failedSteps: 0,
        errorCode: null,
        errorMessage: null,
        completedAt: null,
        outputSnapshot: safeJson(params.outputSnapshot),
      })
      .where(
        and(
          eq(lyricVideoGenerationRun.id, runId),
          eq(lyricVideoGenerationRun.projectId, params.projectId),
          eq(lyricVideoGenerationRun.userId, params.userId)
        )
      ),
  ];

  if (imageStep) {
    updates.push(
      db()
        .update(lyricVideoGenerationStep)
        .set({
          status: 'waiting_provider',
          progressPercent: 95,
          outputJson: safeJson(params.outputSnapshot),
          errorCode: null,
          errorMessage: null,
          lockedAt: null,
          lockedBy: null,
          completedAt: null,
        })
        .where(and(eq(lyricVideoGenerationStep.id, imageStep.id), eq(lyricVideoGenerationStep.userId, params.userId)))
    );
  }

  if (finalizeStep) {
    updates.push(
      db()
        .update(lyricVideoGenerationStep)
        .set({
          status: 'pending',
          progressPercent: 0,
          errorCode: null,
          errorMessage: null,
          outputJson: null,
          lockedAt: null,
          lockedBy: null,
          completedAt: null,
        })
        .where(and(eq(lyricVideoGenerationStep.id, finalizeStep.id), eq(lyricVideoGenerationStep.userId, params.userId)))
    );
  }

  await Promise.all(updates);
}

export async function retryFailedSceneImageBatches(params: {
  userId: string;
  projectId: string;
  batchKeys?: string[];
  model?: string;
}) {
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');

  const requestedBatchKeys = new Set((params.batchKeys || []).filter(Boolean));
  const failedBatches = groupFailedSceneImageBatches(details.scenes).filter((batch) =>
    requestedBatchKeys.size > 0 ? requestedBatchKeys.has(batch.batchKey) : true
  );
  const beforeSummary = summarizeSceneImageProgress(details.scenes);
  if (failedBatches.length === 0) {
    return {
      queuedScenes: [],
      batches: [],
      summary: beforeSummary,
    };
  }

  const queuedScenes = [];
  const queuedBatches = [];
  for (const batch of failedBatches) {
    const queued = await queueSceneImagesGrid({
      userId: params.userId,
      projectId: params.projectId,
      sceneIds: batch.sceneIds,
      model: params.model,
      clearExistingImages: false,
      skipActiveGenerationGuard: true,
    });
    queuedScenes.push(...queued);
    queuedBatches.push({
      batchKey: batch.batchKey,
      previousProviderTaskId: batch.providerTaskId,
      previousImageTaskId: batch.imageTaskId,
      batchIndex: batch.batchIndex,
      batchNumber: batch.batchNumber,
      sceneIds: batch.sceneIds,
      queuedCount: queued.length,
      providerTaskIds: Array.from(new Set(queued.map((scene: any) => scene.providerTaskId).filter(Boolean))),
      imageTaskIds: Array.from(new Set(queued.map((scene: any) => scene.imageTaskId).filter(Boolean))),
    });
  }

  const refreshed = await getProjectDetails({ userId: params.userId, id: params.projectId });
  const summary = summarizeSceneImageProgress(refreshed?.scenes || details.scenes);
  const outputSnapshot = {
    mode: GRID_SCENE_IMAGE_MODE,
    retry: true,
    retriedBatchCount: queuedBatches.length,
    retriedSceneCount: queuedScenes.length,
    beforeSummary,
    summary,
    batches: queuedBatches,
  };
  await reopenActiveImageGenerationRunForRetry({
    userId: params.userId,
    projectId: params.projectId,
    project: refreshed?.project || details.project,
    outputSnapshot,
  });
  await db()
    .update(lyricVideoProject)
    .set({
      scenesStatus: 'processing',
      ...buildProjectGenerationSnapshot(
        { status: 'waiting_provider', currentStage: 'image_generation', progressPercent: 95 },
        { pipelineStage: 'images_processing', pipelineError: null }
      ),
    })
    .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));

  logLyricStage('scene-images-grid', 'retry-failed-batches', {
    projectId: params.projectId,
    userId: params.userId,
    retriedBatchCount: queuedBatches.length,
    retriedSceneCount: queuedScenes.length,
    beforeSummary,
    summary,
    batches: queuedBatches,
  });

  return {
    queuedScenes,
    batches: queuedBatches,
    summary,
  };
}

export async function generateVisualsFromStory(params: {
  userId: string;
  projectId: string;
  storyPrompt?: string;
  model?: string;
  regenerateStoryboard?: boolean;
  regenerateImages?: boolean;
}) {
  // 给“已有歌词和故事方向”的手动生成入口：必要时先补正式 storyboard，
  // 然后只给缺图或要求重生的 scene 调 queueSceneImagesGrid。
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');
  if (details.lines.length === 0) throw new Error('Generate lyrics before creating visuals');

  const storyPrompt = (params.storyPrompt || details.project.storyPrompt || '').trim();
  if (!storyPrompt) throw new Error('Create a story before creating visuals');
  if (hasActiveVisualGeneration({ project: details.project, scenes: details.scenes })) {
    logLyricStage('visuals', 'already-running', {
      projectId: params.projectId,
      userId: params.userId,
      pipelineStage: details.project.pipelineStage,
      generationStatus: details.project.generationStatus,
      activeRunId: details.project.activeRunId,
    });
    return alreadyRunningVisualsResponse({ details, storyPrompt });
  }

  const ledgerResult = await ensureVisualsGenerationLedger({
    userId: params.userId,
    projectId: params.projectId,
    details,
    storyPrompt,
  });
  if (ledgerResult.alreadyRunning || !ledgerResult.ledger) {
    const refreshed = await getProjectDetails({ userId: params.userId, id: params.projectId });
    return alreadyRunningVisualsResponse({ details: refreshed || details, storyPrompt });
  }

  const directionDetail = await ensureProductionDirectionDetail({
    userId: params.userId,
    projectId: params.projectId,
    storyPrompt,
    model: params.model,
  });
  logLyricStage('visuals', 'service-start', {
    projectId: params.projectId,
    userId: params.userId,
    pipelineStage: details.project.pipelineStage,
    lyricsStatus: details.project.lyricsStatus,
    scenesStatus: details.project.scenesStatus,
    renderStatus: details.project.renderStatus,
    lineCount: details.lines.length,
    sceneCount: details.scenes.length,
    storyPromptLength: storyPrompt.length,
    directionDetailStatus: directionDetail.status,
    directionDetailReused: directionDetail.reused,
    directionDetailStoryPromptHash: directionDetail.storyPromptHash,
    regenerateStoryboard: Boolean(params.regenerateStoryboard),
    regenerateImages: Boolean(params.regenerateImages),
    model: params.model,
  });

  const ledger = ledgerResult.ledger;
  let currentVisualsStage: 'prompt_generation' | 'image_generation' = 'prompt_generation';

  try {
    const shouldGenerateStoryboard =
      params.regenerateStoryboard ||
      details.scenes.length === 0 ||
      details.scenes.some((scene: any) => scene.status === 'lyrics_draft' || !String(scene.prompt || '').trim());
    let scenes = details.scenes;
    const promptStep = visualsStepOrThrow(ledger.steps, 'prompt_generation');
    await markVisualsStepRunning({
      userId: params.userId,
      projectId: params.projectId,
      runId: ledger.run.id,
      step: promptStep,
      progress: 75,
      input: {
        storyPrompt,
        regenerateStoryboard: Boolean(params.regenerateStoryboard),
        existingSceneCount: details.scenes.length,
        mode: 'generate_all_scenes',
      },
    });

    if (shouldGenerateStoryboard) {
      scenes = await generateStoryboard({
        userId: params.userId,
        projectId: params.projectId,
        storyPrompt,
        songAnalysis: directionDetail.songAnalysis,
      });
    } else if (params.storyPrompt && params.storyPrompt.trim() !== details.project.storyPrompt) {
      await db()
        .update(lyricVideoProject)
        .set({
          storyPrompt,
          pipelineError: null,
        })
        .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));
    }

    await markVisualsStepSuccess({
      userId: params.userId,
      runId: ledger.run.id,
      step: promptStep,
      progress: 90,
      output: {
        generatedStoryboard: Boolean(shouldGenerateStoryboard),
        sceneCount: scenes.length,
        storyPromptLength: storyPrompt.length,
      },
    });

    const scenesToQueue = params.regenerateImages
      ? scenes
      : scenes.filter((scene: any) => !scene.imageUrl && scene.status !== 'processing');

    currentVisualsStage = 'image_generation';
    const imageStep = visualsStepOrThrow(ledger.steps, 'image_generation');
    const imageInput = {
      model: params.model,
      sceneCount: scenesToQueue.length,
      sceneIds: scenesToQueue.map((scene: any) => scene.id),
      gridSize: GRID_SCENE_IMAGE_SIZE,
      batchSize: GRID_SCENE_IMAGE_BATCH_SIZE,
      mode: GRID_SCENE_IMAGE_MODE,
    };
    await markVisualsStepRunning({
      userId: params.userId,
      projectId: params.projectId,
      runId: ledger.run.id,
      step: imageStep,
      progress: 92,
      input: imageInput,
    });

    const queuedImages =
      scenesToQueue.length > 0
        ? await queueSceneImagesGrid({
            userId: params.userId,
            projectId: params.projectId,
            sceneIds: scenesToQueue.map((scene: any) => scene.id),
            model: params.model,
            clearExistingImages: Boolean(params.regenerateImages),
            skipActiveGenerationGuard: true,
          })
        : [];

    const imageOutput = {
      ...imageInput,
      queuedSceneCount: queuedImages.length,
      processingSceneCount: queuedImages.filter((scene: any) => scene.status === 'processing' && !scene.imageUrl).length,
      failedQueuedSceneCount: queuedImages.filter((scene: any) => scene.status === 'failed' && !scene.imageUrl).length,
      providerTaskIds: Array.from(new Set(queuedImages.map((scene: any) => scene.providerTaskId).filter(Boolean))),
    };

    if (scenesToQueue.length > 0) {
      await markVisualsImageWaitingProvider({
        userId: params.userId,
        projectId: params.projectId,
        runId: ledger.run.id,
        steps: ledger.steps,
        output: imageOutput,
      });
    } else {
      await markVisualsFinalizeSuccess({
        userId: params.userId,
        projectId: params.projectId,
        runId: ledger.run.id,
        steps: ledger.steps,
        output: {
          ...imageOutput,
          skippedImageQueue: true,
          projectStatus: {
            scenesStatus: 'ready',
            pipelineStage: 'images_ready',
            generationStatus: 'success',
          },
        },
      });
    }

    const refreshed = await getProjectDetails({ userId: params.userId, id: params.projectId });

    return {
      project: refreshed?.project || details.project,
      scenes: refreshed?.scenes || scenes,
      queuedImages,
      storyPrompt,
      generatedStoryboard: Boolean(shouldGenerateStoryboard),
    };
  } catch (error: any) {
    await markVisualsGenerationFailed({
      userId: params.userId,
      projectId: params.projectId,
      runId: ledger.run.id,
      steps: ledger.steps,
      stage: currentVisualsStage,
      error,
    });
    throw error;
  }
}

async function syncGridSceneImageBatch(params: {
  userId: string;
  projectId: string;
  provider: LyricVideoImageProviderSelection['provider'];
  providerTaskId: string;
  scenes: any[];
  queryResult?: any;
  providerQueryMs?: number;
}) {
  const batchStartedAt = Date.now();
  const firstGridParams = getGridGenerationParams(params.scenes[0]);
  const grid = firstGridParams?.grid || {};
  let providerQueryMs = params.providerQueryMs ?? 0;
  let result = params.queryResult;
  if (!result) {
    const providerQueryStartedAt = Date.now();
    result = await params.provider.query({ taskId: params.providerTaskId, mediaType: AIMediaType.IMAGE });
    providerQueryMs = Date.now() - providerQueryStartedAt;
  }
  const sourceImageUrl = result.taskInfo?.images?.[0]?.imageUrl;

  if (result.taskStatus === ProviderTaskStatus.FAILED && !sourceImageUrl) {
    const message = result.taskInfo?.errorMessage || 'Grid image generation failed';
    const failed = [];
    const updatedTaskIds = new Set<string>();
    for (const scene of params.scenes) {
      const [updated] = await db()
        .update(lyricVideoScene)
        .set({ status: 'failed', failureCode: 'provider_failed', error: message })
        .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
        .returning();
      if (scene.imageTaskId && !updatedTaskIds.has(scene.imageTaskId)) {
        updatedTaskIds.add(scene.imageTaskId);
        await updateTask({ taskId: scene.imageTaskId, status: AITaskStatus.FAILED, taskResult: result.taskResult });
      }
      failed.push(updated);
    }
    return failed;
  }

  if (result.taskStatus !== ProviderTaskStatus.SUCCESS && !(result.taskStatus === ProviderTaskStatus.FAILED && sourceImageUrl)) {
    return [];
  }

  if (!sourceImageUrl) {
    const failed = [];
    const updatedTaskIds = new Set<string>();
    for (const scene of params.scenes) {
      const [updated] = await db()
        .update(lyricVideoScene)
        .set({
          status: 'failed',
          completedAt: null,
          failureCode: 'missing_image_url',
          error: 'No grid image URL returned',
        })
        .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
        .returning();
      if (scene.imageTaskId && !updatedTaskIds.has(scene.imageTaskId)) {
        updatedTaskIds.add(scene.imageTaskId);
        await updateTask({ taskId: scene.imageTaskId, status: AITaskStatus.FAILED, taskResult: result.taskResult });
      }
      failed.push(updated);
    }
    return failed;
  }

  const downloadStartedAt = Date.now();
  const imageBuffer = await fetchBytes(sourceImageUrl);
  const downloadMs = Date.now() - downloadStartedAt;
  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Could not read generated grid image dimensions');
  }

  const cropSaveDbStartedAt = Date.now();
  const gridSize = Math.max(1, Math.floor(Number(grid.gridSize || GRID_SCENE_IMAGE_SIZE) || GRID_SCENE_IMAGE_SIZE));
  const totalPanels = gridSize * gridSize;
  const synced = [];
  const updatedTaskIds = new Set<string>();
  for (const scene of params.scenes) {
    const sceneGridParams = getGridGenerationParams(scene);
    const sceneGrid = sceneGridParams?.grid || {};
    const panel = Math.floor(Number(sceneGrid.panel || 1) || 1);
    if (panel < 1 || panel > totalPanels) {
      const mergedGenerationParams = {
        ...sceneGridParams,
        grid: {
          ...sceneGrid,
          sourceImageUrl,
          sourceWidth: metadata.width,
          sourceHeight: metadata.height,
        },
      };
      const [updated] = await db()
        .update(lyricVideoScene)
        .set({
          status: 'failed',
          completedAt: null,
          failureCode: 'invalid_grid_panel',
          error: `Grid panel ${panel} is outside ${gridSize}x${gridSize}`,
          generationParams: safeJson(mergedGenerationParams),
        })
        .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
        .returning();
      synced.push(updated);
      continue;
    }
    const row = Math.floor((panel - 1) / gridSize);
    const col = (panel - 1) % gridSize;
    const left = Math.round((col * metadata.width) / gridSize);
    const top = Math.round((row * metadata.height) / gridSize);
    const right = Math.round(((col + 1) * metadata.width) / gridSize);
    const bottom = Math.round(((row + 1) * metadata.height) / gridSize);
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    const cropped = await sharp(imageBuffer)
      .extract({ left, top, width, height })
      .jpeg({ quality: 95 })
      .toBuffer();
    const saved = await saveGeneratedFile({
      body: cropped,
      key: `lyric-videos/${params.projectId}/scene-images/${scene.id}-${getUuid()}.jpg`,
      contentType: 'image/jpeg',
      localDir: `lyric-videos/${params.projectId}/scene-images`,
    });
    const mergedGenerationParams = {
      ...sceneGridParams,
      grid: {
        ...sceneGrid,
        sourceImageUrl,
        sourceWidth: metadata.width,
        sourceHeight: metadata.height,
        crop: { left, top, width, height },
      },
    };
    const [updated] = await db()
      .update(lyricVideoScene)
      .set({
        imageUrl: saved.url,
        status: 'success',
        completedAt: new Date(),
        failureCode: null,
        error: null,
        generationParams: safeJson(mergedGenerationParams),
      })
      .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
      .returning();
    if (scene.imageTaskId && !updatedTaskIds.has(scene.imageTaskId)) {
      updatedTaskIds.add(scene.imageTaskId);
      await updateTask({
        taskId: scene.imageTaskId,
        status: AITaskStatus.SUCCESS,
        taskInfo: result.taskInfo,
        taskResult: result.taskResult,
      });
    }
    synced.push(updated);
  }

  logLyricStage('scene-images-grid', 'batch-synced', {
    projectId: params.projectId,
    userId: params.userId,
    providerTaskId: params.providerTaskId,
    providerQueryMs,
    downloadMs,
    cropSaveDbMs: Date.now() - cropSaveDbStartedAt,
    batchTotalMs: Date.now() - batchStartedAt,
    sourceImageUrl,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    sceneCount: synced.length,
    scenes: synced.map((scene: any) => ({ id: scene.id, imageUrl: scene.imageUrl })),
  });

  return synced;
}

async function updateSceneImageProjectStatus(params: {
  userId: string;
  projectId: string;
  project: any;
  scenes: any[];
}) {
  const hasProcessing = params.scenes.some((scene: any) => scene.status === 'processing' && !scene.imageUrl);
  const allDone = params.scenes.length && params.scenes.every((scene: any) => scene.status === 'success' || scene.imageUrl);
  const hasFailures = params.scenes.some((scene: any) => scene.status === 'failed' && !scene.imageUrl);
  const hasImages = params.scenes.some((scene: any) => scene.imageUrl || scene.status === 'success');

  if (allDone) {
    const outputSnapshot = {
      mode: GRID_SCENE_IMAGE_MODE,
      sceneCount: params.scenes.length || 0,
      imageCount: params.scenes.filter((scene: any) => scene.imageUrl || scene.status === 'success').length || 0,
      failedCount: 0,
      failedScenes: [],
      failedBatches: [],
      projectStatus: {
        scenesStatus: 'ready',
        pipelineStage: 'images_ready',
        generationStatus: 'success',
      },
    };
    await finalizeActiveImageGenerationRun({
      userId: params.userId,
      projectId: params.projectId,
      project: params.project,
      status: 'success',
      outputSnapshot,
    });
    await db()
      .update(lyricVideoProject)
      .set({
        scenesStatus: 'ready',
        ...buildProjectGenerationSnapshot(
          { status: 'success', currentStage: 'finalize_project', progressPercent: 100 },
          { pipelineStage: 'images_ready', pipelineError: null }
        ),
        lastGeneratedAt: new Date(),
      })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));
  } else if (!hasProcessing && (hasFailures || hasImages)) {
    const outputSnapshot = {
      mode: GRID_SCENE_IMAGE_MODE,
      sceneCount: params.scenes.length || 0,
      imageCount: params.scenes.filter((scene: any) => scene.imageUrl || scene.status === 'success').length || 0,
      failedCount: params.scenes.filter((scene: any) => scene.status === 'failed' && !scene.imageUrl).length || 0,
      failedScenes: failedSceneImageDetails(params.scenes),
      failedBatches: groupFailedSceneImageBatches(params.scenes).map((batch) => ({
        batchKey: batch.batchKey,
        batchIndex: batch.batchIndex,
        batchNumber: batch.batchNumber,
        providerTaskId: batch.providerTaskId,
        imageTaskId: batch.imageTaskId,
        sceneIds: batch.sceneIds,
        failedCount: batch.failedCount,
      })),
      projectStatus: {
        scenesStatus: 'partial_success',
        pipelineStage: 'images_partial_success',
        generationStatus: 'partial_success',
      },
    };
    await finalizeActiveImageGenerationRun({
      userId: params.userId,
      projectId: params.projectId,
      project: params.project,
      status: 'partial_success',
      outputSnapshot,
      errorMessage: 'Some scene images failed',
    });
    await db()
      .update(lyricVideoProject)
      .set({
        scenesStatus: 'partial_success',
        ...buildProjectGenerationSnapshot(
          { status: 'partial_success', currentStage: 'finalize_project', progressPercent: 90 },
          { pipelineStage: 'images_partial_success', pipelineError: 'Some scene images failed' }
        ),
      })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));
  }

  return { allDone: Boolean(allDone), hasFailures: Boolean(hasFailures), hasProcessing: Boolean(hasProcessing) };
}

export async function syncSceneImages(params: { userId: string; projectId: string }) {
  // 图片轮询入口：根据 scene.providerTaskId 查询供应商。
  // 成功时裁剪/保存图片并写 `lyric_video_scene.imageUrl/status=success`；
  // 所有图片完成后，再更新 `lyric_video_project.scenesStatus/generationStatus`。
  const normalizedFailedWithImages = await db()
    .update(lyricVideoScene)
    .set({
      status: 'success',
      completedAt: new Date(),
      failureCode: null,
      error: null,
    })
    .where(
      and(
        eq(lyricVideoScene.projectId, params.projectId),
        eq(lyricVideoScene.userId, params.userId),
        eq(lyricVideoScene.status, 'failed'),
        isNotNull(lyricVideoScene.imageUrl)
      )
    )
    .returning();
  const processingRows = await db()
    .select({ id: lyricVideoScene.id })
    .from(lyricVideoScene)
    .where(
      and(
        eq(lyricVideoScene.projectId, params.projectId),
        eq(lyricVideoScene.userId, params.userId),
        eq(lyricVideoScene.status, 'processing'),
        isNotNull(lyricVideoScene.providerTaskId)
      )
    );
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');
  if (processingRows.length === 0) {
    const autoRetryableFailedBatches = groupFailedSceneImageBatches(details.scenes).filter((batch) => canAutoRetryGridBatch(batch.scenes));
    if (autoRetryableFailedBatches.length > 0) {
      logLyricStage('scene-images-grid', 'sync-auto-retry-failed-batches', {
        projectId: params.projectId,
        userId: params.userId,
        batchCount: autoRetryableFailedBatches.length,
        batches: autoRetryableFailedBatches.map((batch) => ({
          batchKey: batch.batchKey,
          providerTaskId: batch.providerTaskId,
          sceneIds: batch.sceneIds,
          attemptCounts: batch.scenes.map((scene: any) => Number(scene.attemptCount || 0)),
        })),
      });
      const retry = await retryFailedSceneImageBatches({
        userId: params.userId,
        projectId: params.projectId,
        batchKeys: autoRetryableFailedBatches.map((batch) => batch.batchKey),
      });
      return retry.queuedScenes;
    }
    const status = await updateSceneImageProjectStatus({
      userId: params.userId,
      projectId: params.projectId,
      project: details.project,
      scenes: details.scenes,
    });
    logLyricStage('scene-images', 'sync-skip-no-processing', {
      projectId: params.projectId,
      userId: params.userId,
      normalizedCount: normalizedFailedWithImages.length,
      sceneCount: details.scenes.length,
      allDone: status.allDone,
      hasFailures: status.hasFailures,
    });
    return normalizedFailedWithImages;
  }

  const configs = await getAllConfigs();
  const queryProviders = new Map<LyricVideoImageProviderName, LyricVideoImageProviderSelection['provider']>();
  async function getQueryProvider(providerName: LyricVideoImageProviderName) {
    const existing = queryProviders.get(providerName);
    if (existing) return existing;
    const provider = await createLyricVideoImageQueryProvider({ providerName, configs });
    queryProviders.set(providerName, provider);
    return provider;
  }
  const processing = details.scenes.filter((scene: any) => scene.status === 'processing' && scene.providerTaskId);
  const gridProcessing = processing.filter((scene: any) => getGridGenerationParams(scene));
  const singleProcessing = processing.filter((scene: any) => !getGridGenerationParams(scene));
  const synced = [];
  logLyricStage('scene-images', 'sync-start', {
    projectId: params.projectId,
    userId: params.userId,
    processingCount: processing.length,
    sceneIds: processing.map((scene: any) => scene.id),
  });

  const gridGroups = new Map<string, { providerName: LyricVideoImageProviderName; providerTaskId: string; scenes: any[] }>();
  for (const scene of gridProcessing) {
    const providerName = lyricVideoImageProviderFromGenerationParams(scene.generationParams);
    const providerTaskId = String(scene.providerTaskId);
    const key = `${providerName}:${providerTaskId}`;
    const group = gridGroups.get(key) || { providerName, providerTaskId, scenes: [] };
    group.scenes.push(scene);
    gridGroups.set(key, group);
  }

  const gridBatchQueries = await Promise.all(
    Array.from(gridGroups.values()).map(async ({ providerName, providerTaskId, scenes }) => {
      const providerQueryStartedAt = Date.now();
      try {
        const provider = await getQueryProvider(providerName);
        const result = await provider.query({ taskId: providerTaskId, mediaType: AIMediaType.IMAGE });
        const sourceImageUrl = result.taskInfo?.images?.[0]?.imageUrl;
        const ready =
          result.taskStatus === ProviderTaskStatus.SUCCESS ||
          (result.taskStatus === ProviderTaskStatus.FAILED && Boolean(sourceImageUrl));
        const failed = result.taskStatus === ProviderTaskStatus.FAILED && !sourceImageUrl;
        return {
          providerName,
          providerTaskId,
          scenes,
          result,
          sourceImageUrl,
          ready,
          failed,
          providerQueryMs: Date.now() - providerQueryStartedAt,
        };
      } catch (error: any) {
        return {
          providerName,
          providerTaskId,
          scenes,
          result: null,
          sourceImageUrl: null,
          ready: false,
          failed: true,
          error,
          providerQueryMs: Date.now() - providerQueryStartedAt,
        };
      }
    })
  );
  const autoRetryGridBatchQueries = gridBatchQueries.filter((batch) => !batch.ready && batch.failed && canAutoRetryGridBatch(batch.scenes));
  const finishedGridBatchQueries = [
    ...autoRetryGridBatchQueries,
    ...gridBatchQueries.filter((batch) => batch.ready),
    ...gridBatchQueries.filter((batch) => !batch.ready && batch.failed && !autoRetryGridBatchQueries.includes(batch)),
  ].slice(0, GRID_IMAGE_SYNC_READY_BATCH_LIMIT);

  logLyricStage('scene-images-grid', 'sync-ready-batches', {
    projectId: params.projectId,
    userId: params.userId,
    processingBatchCount: gridGroups.size,
    readyBatchCount: gridBatchQueries.filter((batch) => batch.ready).length,
    failedBatchCount: gridBatchQueries.filter((batch) => batch.failed).length,
    autoRetryableFailedBatchCount: autoRetryGridBatchQueries.length,
    selectedBatchCount: finishedGridBatchQueries.length,
    syncReadyBatchLimit: GRID_IMAGE_SYNC_READY_BATCH_LIMIT,
    batches: gridBatchQueries.map((batch) => ({
      providerTaskId: batch.providerTaskId,
      provider: batch.providerName,
      sceneCount: batch.scenes.length,
      providerStatus: batch.result?.taskStatus || null,
      providerQueryMs: batch.providerQueryMs,
      hasSourceImageUrl: Boolean(batch.sourceImageUrl),
      selected: finishedGridBatchQueries.includes(batch),
    })),
  });

  for (const batch of finishedGridBatchQueries) {
    const { providerTaskId, scenes } = batch;
    try {
      if (batch.failed && !batch.sourceImageUrl && canAutoRetryGridBatch(scenes)) {
        logLyricStage('scene-images-grid', 'batch-auto-retry', {
          projectId: params.projectId,
          userId: params.userId,
          provider: batch.providerName,
          providerTaskId,
          sceneIds: scenes.map((scene: any) => scene.id),
          attemptCounts: scenes.map((scene: any) => Number(scene.attemptCount || 0)),
          maxAttempts: GRID_IMAGE_AUTO_RETRY_MAX_ATTEMPTS,
        });
        synced.push(...await queueSceneImagesGrid({
          userId: params.userId,
          projectId: params.projectId,
          sceneIds: scenes.map((scene: any) => scene.id),
          clearExistingImages: false,
          skipActiveGenerationGuard: true,
        }));
        continue;
      }
      if (batch.error) throw batch.error;
      const provider = await getQueryProvider(batch.providerName);
      synced.push(...await syncGridSceneImageBatch({
        userId: params.userId,
        projectId: params.projectId,
        provider,
        providerTaskId,
        scenes,
        queryResult: batch.result,
        providerQueryMs: batch.providerQueryMs,
      }));
    } catch (error: any) {
      logLyricStageError('scene-images-grid', 'batch-sync-fail', error, {
        projectId: params.projectId,
        userId: params.userId,
        provider: batch.providerName,
        providerTaskId,
        sceneIds: scenes.map((scene: any) => scene.id),
      });
      for (const scene of scenes) {
        const [updated] = await db()
          .update(lyricVideoScene)
          .set({ status: 'failed', failureCode: 'sync_failed', error: error?.message || 'Grid image sync failed' })
          .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
          .returning();
        synced.push(updated);
      }
    }
  }

  for (const scene of singleProcessing) {
    try {
      const providerName = lyricVideoImageProviderFromGenerationParams(scene.generationParams);
      const provider = await getQueryProvider(providerName);
      const result = await provider.query({ taskId: scene.providerTaskId, mediaType: AIMediaType.IMAGE });
      if (result.taskStatus === ProviderTaskStatus.SUCCESS) {
        const imageUrl = result.taskInfo?.images?.[0]?.imageUrl;
        const [updated] = await db()
          .update(lyricVideoScene)
          .set({
            imageUrl,
            status: imageUrl ? 'success' : 'failed',
            completedAt: imageUrl ? new Date() : null,
            failureCode: imageUrl ? null : 'missing_image_url',
            error: imageUrl ? null : 'No image URL returned',
          })
          .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
          .returning();
        if (scene.imageTaskId) {
          await updateTask({
            taskId: scene.imageTaskId,
            status: imageUrl ? AITaskStatus.SUCCESS : AITaskStatus.FAILED,
            taskInfo: result.taskInfo,
            taskResult: result.taskResult,
          });
        }
        synced.push(updated);
        logLyricStage('scene-images', 'scene-synced', {
          projectId: params.projectId,
          userId: params.userId,
          sceneId: updated.id,
          provider: providerName,
          providerTaskId: scene.providerTaskId,
          providerStatus: result.taskStatus,
          status: updated.status,
          hasImageUrl: Boolean(updated.imageUrl),
        });
      } else if (result.taskStatus === ProviderTaskStatus.FAILED) {
        const imageUrl = result.taskInfo?.images?.[0]?.imageUrl;
        const message = result.taskInfo?.errorMessage || 'Image generation failed';
        const [updated] = await db()
          .update(lyricVideoScene)
          .set({
            imageUrl,
            status: imageUrl ? 'success' : 'failed',
            completedAt: imageUrl ? new Date() : null,
            failureCode: imageUrl ? null : 'provider_failed',
            error: imageUrl ? null : message,
          })
          .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
          .returning();
        if (scene.imageTaskId) {
          await updateTask({
            taskId: scene.imageTaskId,
            status: imageUrl ? AITaskStatus.SUCCESS : AITaskStatus.FAILED,
            taskInfo: result.taskInfo,
            taskResult: result.taskResult,
          });
        }
        synced.push(updated);
        logLyricStage('scene-images', 'scene-synced', {
          projectId: params.projectId,
          userId: params.userId,
          sceneId: updated.id,
          provider: providerName,
          providerTaskId: scene.providerTaskId,
          providerStatus: result.taskStatus,
          status: updated.status,
          hasImageUrl: Boolean(updated.imageUrl),
        });
      }
    } catch (error: any) {
      logLyricStageError('scene-images', 'scene-sync-fail', error, {
        projectId: params.projectId,
        userId: params.userId,
        sceneId: scene.id,
        providerTaskId: scene.providerTaskId,
      });
      const [updated] = await db()
        .update(lyricVideoScene)
        .set({ status: 'failed', failureCode: 'sync_failed', error: error?.message || 'Image sync failed' })
        .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
        .returning();
      synced.push(updated);
    }
  }

  if (synced.length === 0 && normalizedFailedWithImages.length === 0) {
    logLyricStage('scene-images', 'sync-complete', {
      projectId: params.projectId,
      userId: params.userId,
      syncedCount: 0,
      allDone: false,
      hasFailures: false,
      skippedStatusRefresh: true,
      scenes: [],
    });
    return synced;
  }

  const refreshed = await getProjectDetails({ userId: params.userId, id: params.projectId });
  const status = await updateSceneImageProjectStatus({
    userId: params.userId,
    projectId: params.projectId,
    project: refreshed?.project,
    scenes: refreshed?.scenes || [],
  });

  logLyricStage('scene-images', 'sync-complete', {
    projectId: params.projectId,
    userId: params.userId,
    syncedCount: synced.length,
    allDone: status.allDone,
    hasFailures: status.hasFailures,
    scenes: synced.map((scene: any) => ({
      id: scene.id,
      status: scene.status,
      providerTaskId: scene.providerTaskId,
      hasImageUrl: Boolean(scene.imageUrl),
    })),
  });

  return synced;
}

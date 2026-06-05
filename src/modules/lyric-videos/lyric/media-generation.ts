import { and, eq, isNotNull } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '@/core/db';
import { AIMediaType, AITaskStatus as ProviderTaskStatus, KIE_Z_IMAGE_MODEL } from '@/core/ai';
import { lyricVideoGenerationRun, lyricVideoGenerationStep, lyricVideoProject, lyricVideoScene } from '@/config/db/schema';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { getUuid } from '@/lib/hash';
import { createTask, updateTask, AITaskStatus } from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { fetchBytes, saveGeneratedFile } from './audio';
import { createKieProvider } from './llm';
import { parseJsonField, safeJson } from './json';
import { getProjectDetails } from './project';
import { buildProjectGenerationSnapshot } from './status';
import { generateStoryboard } from './storyboard';
import { GENERATION_STAGES } from './types';

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
const GRID_SCENE_IMAGE_SIZE = 4;
const GRID_SCENE_IMAGE_BATCH_SIZE = GRID_SCENE_IMAGE_SIZE * GRID_SCENE_IMAGE_SIZE;
const GRID_IMAGE_QUEUE_CONCURRENCY = 4;

type GridImagePanelScene = any & {
  finalPrompt?: string;
  boundCast?: any;
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
  referenceImageUrl: string;
  referenceImageUrls: string[];
  castId?: string;
};

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

function activeMainCast(cast: any[]) {
  return (Array.isArray(cast) ? cast : [])
    .filter((member: any) => !member.deletedAt)
    .filter((member: any) => String(member.status || 'active') === 'active')
    .filter((member: any) => String(member.role || '').toLowerCase() === 'main' || !String(member.role || '').trim())
    .sort((a: any, b: any) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
}

function sceneShotType(scene: any) {
  const timelineConfig = scene.timelineConfig && typeof scene.timelineConfig === 'object'
    ? scene.timelineConfig
    : parseJsonField<Record<string, any>>(scene.timelineConfig, {});
  return String(timelineConfig?.shotType || '').trim();
}

function resolveSceneCast(params: { scene: any; cast: any[] }) {
  const sceneCastIds = Array.isArray(params.scene.castIds) ? params.scene.castIds : [];
  if (sceneCastIds.length > 0) {
    return params.cast.find((member: any) => sceneCastIds.includes(member.id) && String(member.status || 'active') === 'active');
  }
  const mainCast = activeMainCast(params.cast);
  if (mainCast.length === 1 && sceneShotType(params.scene) === 'character_shot') {
    return mainCast[0];
  }
  return null;
}

function scenePromptWithCast(params: { scene: any; cast: any[] }) {
  const boundCast = resolveSceneCast(params);
  const referenceImageUrls = getCastReferenceImageUrls(boundCast);
  const prompt = String(params.scene.prompt || '').trim();
  const explicitCastIds = Array.isArray(params.scene.castIds) ? params.scene.castIds.filter(Boolean) : [];
  const castIdsForGeneration = explicitCastIds.length > 0 ? explicitCastIds : boundCast?.id ? [boundCast.id] : [];
  return {
    ...params.scene,
    finalPrompt: prompt,
    boundCast,
    castIdsForGeneration,
    referenceImageUrl: referenceImageUrls[0] || '',
    referenceImageUrls,
  };
}

function buildGridSceneImagePrompt(params: {
  scenes: any[];
  gridSize?: number;
  aspectRatio?: string;
  referenceCast?: any;
  hasReferenceImage?: boolean;
}) {
  const gridSize = Math.max(1, Math.min(5, Math.floor(Number(params.gridSize || GRID_SCENE_IMAGE_SIZE) || GRID_SCENE_IMAGE_SIZE)));
  const totalPanels = gridSize * gridSize;
  const aspectRatio = params.aspectRatio === '9:16' ? '9:16' : '16:9';
  const frameOrientation = aspectRatio === '9:16' ? 'vertical portrait' : 'landscape';
  const expectedPanel = aspectRatio === '9:16'
    ? 'Each panel must be a 9:16 vertical frame, approximately 540x960 when cropped from a 4K 4x4 grid.'
    : 'Each panel must be a 16:9 landscape frame, approximately 960x540 when cropped from a 4K 4x4 grid.';
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
    `Create one exact ${gridSize}x${gridSize} storyboard grid, ${totalPanels} equal panels, no gaps, no borders, no labels.`,
    expectedPanel,
    `Panels are ordered left to right, top to bottom. Every panel is a ${frameOrientation} ${aspectRatio} frame. Empty unused panels must be pure white blank panels with no content.`,
    '',
    ...panelLines,
  ].filter(Boolean).join('\n');

  return {
    compiledPrompt,
    gridSize,
    aspectRatio,
    totalPanels,
    panelCount: panels.length,
    panels,
  };
}

function getGridGenerationParams(scene: any) {
  const parsed = scene.generationParams && typeof scene.generationParams === 'object'
    ? scene.generationParams as Record<string, any>
    : parseJsonField<Record<string, any>>(scene.generationParams, {});
  return parsed?.mode === 'grid_4x4' && parsed.grid ? parsed : null;
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

  const configs = await getAllConfigs();
  const defaultModel = resolveKieImageModel(configs, params.model);
  const characterImageModel = configs.kie_character_image_model || 'nano-banana-2';
  const provider = await createKieProvider();
  const queued = [];
  logLyricStage('scene-images', 'queue-start', {
    projectId: params.projectId,
    userId: params.userId,
    model: defaultModel,
    sceneCount: scenes.length,
    sceneIds: scenes.map((scene: any) => scene.id),
    clearExistingImages: params.clearExistingImages,
  });
  for (const scene of scenes) {
    const sceneCastIds = Array.isArray(scene.castIds) ? scene.castIds : [];
    const boundCast =
      sceneCastIds.length > 0
        ? details.cast.find((member: any) => sceneCastIds.includes(member.id) && getCastReferenceImageUrls(member).length > 0)
        : activeMainCast(details.cast).find((member: any) => getCastReferenceImageUrls(member).length > 0) ||
          details.cast.find((member: any) => member.status === 'active' && getCastReferenceImageUrls(member).length > 0);
    const referenceImageUrls = getCastReferenceImageUrls(boundCast);
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
    const prompt = referenceImageUrls.length > 0 && boundCast?.promptFragment
      ? `${scene.prompt}\n\nKeep the main character consistent with this reference: ${boundCast.promptFragment}.`
      : scene.prompt;

    const task = await createTask({
      userId: params.userId,
      mediaType: 'image',
      provider: 'kie',
      model,
      prompt,
      costCredits: 5,
      options: {
        projectId: params.projectId,
        sceneId: scene.id,
        ...imageOptions,
        castId: boundCast?.id,
      },
    });

    try {
      const result = await provider.generate({
        params: {
          mediaType: AIMediaType.IMAGE,
          model,
          prompt,
          options: imageOptions,
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
          imageModel: model,
          imagePromptSnapshot: prompt,
          generationParams: safeJson({ model, castId: boundCast?.id, referenceImageUrl, referenceImageUrls }),
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
}) {
  // 主链路默认使用的批量图片入口：把最多 16 个 scene 合成一个 4x4 grid prompt，
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

  const model = params.model || 'nano-banana-2';
  const aspectRatio = details.project.aspectRatio === '9:16' ? '9:16' : '16:9';
  const resolution = '4K';
  const provider = await createKieProvider();
  const queued: any[] = [];
  const queuedBatchRecords: any[] = [];
  const cast = Array.isArray(details.cast) ? details.cast : [];

  logLyricStage('scene-images-grid', 'queue-start', {
    projectId: params.projectId,
    userId: params.userId,
    model,
    aspectRatio,
    resolution,
    sceneCount: scenes.length,
    sceneIds: scenes.map((scene: any) => scene.id),
    queueConcurrency: GRID_IMAGE_QUEUE_CONCURRENCY,
  });

  const descriptors: GridImageBatchDescriptor[] = [];
  for (let start = 0; start < scenes.length; start += GRID_SCENE_IMAGE_BATCH_SIZE) {
    const batchIndex = Math.floor(start / GRID_SCENE_IMAGE_BATCH_SIZE);
    const batchScenes = scenes
      .slice(start, start + GRID_SCENE_IMAGE_BATCH_SIZE)
      .map((scene: any) => scenePromptWithCast({ scene, cast }));
    const batchReferenceCast =
      batchScenes.find((scene: GridImagePanelScene) => scene.boundCast && (scene.referenceImageUrls || []).length > 0)?.boundCast ||
      activeMainCast(cast).find((member: any) => getCastReferenceImageUrls(member).length > 0);
    const referenceImageUrls = getCastReferenceImageUrls(batchReferenceCast);
    const gridPrompt = buildGridSceneImagePrompt({
      scenes: batchScenes,
      gridSize: GRID_SCENE_IMAGE_SIZE,
      aspectRatio,
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
    descriptors.push({
      batchIndex,
      start,
      scenes: batchScenes,
      gridPrompt,
      imageOptions,
      referenceImageUrl: referenceImageUrls[0] || '',
      referenceImageUrls,
      castId: batchReferenceCast?.id,
    });
  }

  async function queueBatch(descriptor: GridImageBatchDescriptor) {
    const { batchIndex, gridPrompt } = descriptor;
    let task: any = null;
    try {
      task = await createTask({
        userId: params.userId,
        mediaType: 'image',
        provider: 'kie',
        model,
        prompt: gridPrompt.compiledPrompt,
        costCredits: descriptor.scenes.length * 5,
        options: {
          projectId: params.projectId,
          mode: 'grid_4x4',
          batchIndex,
          sceneIds: descriptor.scenes.map((scene: any) => scene.id),
          gridSize: GRID_SCENE_IMAGE_SIZE,
          ...descriptor.imageOptions,
          castId: descriptor.castId,
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
        queueConcurrency: GRID_IMAGE_QUEUE_CONCURRENCY,
        hasReferenceImage: descriptor.referenceImageUrls.length > 0,
      });
      const result = await provider.generate({
        params: {
          mediaType: AIMediaType.IMAGE,
          model,
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
            imageModel: model,
            imagePromptSnapshot: scene.finalPrompt || scene.prompt,
            generationParams: safeJson({
              mode: 'grid_4x4',
              model,
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
            imageModel: model,
            imagePromptSnapshot: scene.finalPrompt || scene.prompt,
            generationParams: safeJson({
              mode: 'grid_4x4',
              model,
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
    mode: 'grid_4x4',
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

  const shouldGenerateStoryboard =
    params.regenerateStoryboard ||
    details.scenes.length === 0 ||
    details.scenes.some((scene: any) => scene.status === 'lyrics_draft' || !String(scene.prompt || '').trim());
  let scenes = details.scenes;
  if (shouldGenerateStoryboard) {
    scenes = await generateStoryboard({
      userId: params.userId,
      projectId: params.projectId,
      storyPrompt,
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

  const scenesToQueue = params.regenerateImages
    ? scenes
    : scenes.filter((scene: any) => !scene.imageUrl && scene.status !== 'processing');

  const queuedImages =
    scenesToQueue.length > 0
      ? await queueSceneImagesGrid({
          userId: params.userId,
          projectId: params.projectId,
          sceneIds: scenesToQueue.map((scene: any) => scene.id),
          model: params.model,
          clearExistingImages: Boolean(params.regenerateImages),
        })
      : [];

  const refreshed = await getProjectDetails({ userId: params.userId, id: params.projectId });

  return {
    project: refreshed?.project || details.project,
    scenes: refreshed?.scenes || scenes,
    queuedImages,
    storyPrompt,
    generatedStoryboard: Boolean(shouldGenerateStoryboard),
  };
}

async function syncGridSceneImageBatch(params: {
  userId: string;
  projectId: string;
  provider: Awaited<ReturnType<typeof createKieProvider>>;
  providerTaskId: string;
  scenes: any[];
}) {
  const firstGridParams = getGridGenerationParams(params.scenes[0]);
  const grid = firstGridParams?.grid || {};
  const result = await params.provider.query({ taskId: params.providerTaskId, mediaType: AIMediaType.IMAGE });
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

  const imageBuffer = await fetchBytes(sourceImageUrl);
  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Could not read generated grid image dimensions');
  }

  const gridSize = Math.max(1, Math.floor(Number(grid.gridSize || GRID_SCENE_IMAGE_SIZE) || GRID_SCENE_IMAGE_SIZE));
  const synced = [];
  const updatedTaskIds = new Set<string>();
  for (const scene of params.scenes) {
    const sceneGridParams = getGridGenerationParams(scene);
    const sceneGrid = sceneGridParams?.grid || {};
    const panel = Math.max(1, Math.floor(Number(sceneGrid.panel || 1) || 1));
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
      mode: 'grid_4x4',
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
      mode: 'grid_4x4',
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

  const provider = await createKieProvider();
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

  const gridGroups = new Map<string, any[]>();
  for (const scene of gridProcessing) {
    const group = gridGroups.get(scene.providerTaskId) || [];
    group.push(scene);
    gridGroups.set(scene.providerTaskId, group);
  }

  for (const [providerTaskId, scenes] of gridGroups.entries()) {
    try {
      synced.push(...await syncGridSceneImageBatch({
        userId: params.userId,
        projectId: params.projectId,
        provider,
        providerTaskId,
        scenes,
      }));
    } catch (error: any) {
      logLyricStageError('scene-images-grid', 'batch-sync-fail', error, {
        projectId: params.projectId,
        userId: params.userId,
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

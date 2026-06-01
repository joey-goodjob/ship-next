import { and, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { AIMediaType, AITaskStatus as ProviderTaskStatus, KIE_Z_IMAGE_MODEL } from '@/core/ai';
import { lyricVideoProject, lyricVideoScene } from '@/config/db/schema';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { createTask, updateTask, AITaskStatus } from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { createKieProvider } from './llm';
import { safeJson } from './json';
import { getProjectDetails } from './project';
import { generateStoryboard } from './storyboard';

function resolveKieImageModel(configs: Record<string, string>, model?: string) {
  return model || configs.kie_image_model || KIE_Z_IMAGE_MODEL;
}

export const DEFAULT_SCENE_IMAGE_BATCH_LIMIT = 16;

export async function queueSceneImages(params: {
  userId: string;
  projectId: string;
  sceneId?: string;
  sceneIds?: string[];
  model?: string;
  onlyMissing?: boolean;
  clearExistingImages?: boolean;
}) {
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
        ? details.cast.find((member: any) => sceneCastIds.includes(member.id) && member.referenceImageUrl)
        : details.cast.find((member: any) => member.status === 'active' && member.referenceImageUrl);
    const referenceImageUrl = boundCast?.referenceImageUrl || '';
    const model = referenceImageUrl ? characterImageModel : defaultModel;
    const imageOptions: Record<string, unknown> = {
      aspect_ratio: details.project.aspectRatio,
      resolution: details.project.resolution,
    };
    if (referenceImageUrl) {
      imageOptions.image_input = [referenceImageUrl];
      imageOptions.output_format = 'jpg';
    }
    const prompt = referenceImageUrl && boundCast?.promptFragment
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
          generationParams: safeJson({ model, castId: boundCast?.id, referenceImageUrl }),
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
      pipelineStage: 'images_processing',
      generationStatus: 'waiting_provider',
      generationProgress: 80,
      pipelineError: null,
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

export async function generateVisualsFromStory(params: {
  userId: string;
  projectId: string;
  storyPrompt?: string;
  model?: string;
  regenerateStoryboard?: boolean;
  regenerateImages?: boolean;
}) {
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
      ? await queueSceneImages({
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

export async function syncSceneImages(params: { userId: string; projectId: string }) {
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');
  const provider = await createKieProvider();
  const processing = details.scenes.filter((scene: any) => scene.status === 'processing' && scene.providerTaskId);
  const synced = [];
  logLyricStage('scene-images', 'sync-start', {
    projectId: params.projectId,
    userId: params.userId,
    processingCount: processing.length,
    sceneIds: processing.map((scene: any) => scene.id),
  });

  for (const scene of processing) {
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
        const message = result.taskInfo?.errorMessage || 'Image generation failed';
        const [updated] = await db()
          .update(lyricVideoScene)
          .set({ status: 'failed', failureCode: 'provider_failed', error: message })
          .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
          .returning();
        if (scene.imageTaskId) {
          await updateTask({ taskId: scene.imageTaskId, status: AITaskStatus.FAILED, taskResult: result.taskResult });
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
  const allDone = refreshed?.scenes.length && refreshed.scenes.every((scene: any) => scene.status === 'success');
  const hasFailures = refreshed?.scenes.some((scene: any) => scene.status === 'failed');
  if (allDone) {
    await db()
      .update(lyricVideoProject)
      .set({
        scenesStatus: 'ready',
        pipelineStage: 'images_ready',
        generationStatus: 'success',
        generationProgress: 100,
        lastGeneratedAt: new Date(),
        pipelineError: null,
      })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));
  } else if (hasFailures) {
    await db()
      .update(lyricVideoProject)
      .set({
        scenesStatus: 'partial_success',
        pipelineStage: 'images_partial_success',
        generationStatus: 'partial_success',
        generationProgress: 90,
        pipelineError: 'Some scene images failed',
      })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));
  }

  logLyricStage('scene-images', 'sync-complete', {
    projectId: params.projectId,
    userId: params.userId,
    syncedCount: synced.length,
    allDone: Boolean(allDone),
    hasFailures: Boolean(hasFailures),
    scenes: synced.map((scene: any) => ({
      id: scene.id,
      status: scene.status,
      providerTaskId: scene.providerTaskId,
      hasImageUrl: Boolean(scene.imageUrl),
    })),
  });

  return synced;
}

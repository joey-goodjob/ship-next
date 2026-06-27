import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { AIMediaType, AITaskStatus, KIE_SEEDANCE_VIDEO_MODEL } from '@/core/ai';
import { db } from '@/core/db';
import { lyricVideoScene, lyricVideoSceneVideoCandidate } from '@/config/db/schema';
import { getAllConfigs } from '@/modules/config/service';
import { getStorage, isStorageConfigured } from '@/modules/storage/service';
import { createTask, updateTask } from '@/modules/ai-tasks/service';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { getUuid } from '@/lib/hash';
import { parseJsonField, safeJson } from './json';
import { getProjectDetails } from './project';
import { createKieProvider } from './llm';
import { calculateSceneVideoCostCredits } from './costs';
import { storageKeyFromUrl } from './worker-render';

const SEEDANCE_SCENE_VIDEO_MIN_DURATION = 4;
const SEEDANCE_SCENE_VIDEO_MAX_DURATION = 12;
const SEEDANCE_SCENE_VIDEO_RESOLUTION = '480p';
const SCENE_VIDEO_QUEUE_CONCURRENCY = 3;

function sceneRequestedDurationSeconds(scene: any) {
  const durationMs = Math.max(0, Number(scene.endMs || 0) - Number(scene.startMs || 0));
  return Math.ceil(durationMs / 1000) || SEEDANCE_SCENE_VIDEO_MIN_DURATION;
}

export function getSeedanceSceneVideoDurationSeconds(scene: any) {
  const requestedDuration = sceneRequestedDurationSeconds(scene);
  return Math.max(
    SEEDANCE_SCENE_VIDEO_MIN_DURATION,
    Math.min(SEEDANCE_SCENE_VIDEO_MAX_DURATION, requestedDuration)
  );
}

export function getSeedanceSceneVideoAspectRatio(project: any) {
  return String(project?.aspectRatio || '') === '9:16' ? '9:16' : '16:9';
}

function sceneVideoPrompt(scene: any) {
  return String(scene.motionPrompt || '').trim() || 'Camera slowly pushes in with subtle ambient motion while preserving the original composition.';
}

function providerVideoUrl(result: any) {
  return String(result?.taskInfo?.videos?.find((video: any) => video?.videoUrl)?.videoUrl || '').trim();
}

function isTerminalProviderFailure(status?: string | null) {
  return status === AITaskStatus.FAILED || status === AITaskStatus.CANCELED;
}

export async function archiveSceneVideoUrl(params: {
  projectId: string;
  sceneId: string;
  videoUrl: string;
  configs: Record<string, string>;
}) {
  const videoUrl = String(params.videoUrl || '').trim();
  if (!videoUrl) throw new Error('Scene video URL is required');
  if (storageKeyFromUrl(videoUrl, params.configs)) return videoUrl;
  if (!isStorageConfigured(params.configs)) throw new Error('Storage is required to archive scene video');

  const key = `scene-videos/${params.projectId}/${params.sceneId}-${Date.now()}.mp4`;
  const result = await getStorage(params.configs).downloadAndUpload({
    url: videoUrl,
    key,
    contentType: 'video/mp4',
  });
  if (!result.success || !result.url) throw new Error(result.error || 'Archive scene video failed');
  return result.url;
}

async function recordSceneVideoCandidate(params: {
  userId: string;
  projectId: string;
  scene: any;
  videoUrl: string;
}) {
  const videoUrl = String(params.videoUrl || '').trim();
  if (!videoUrl) return null;

  const [candidate] = await db()
    .insert(lyricVideoSceneVideoCandidate)
    .values({
      id: getUuid(),
      projectId: params.projectId,
      sceneId: params.scene.id,
      userId: params.userId,
      videoUrl,
      status: 'success',
      videoTaskId: params.scene.videoTaskId || null,
      providerTaskId: params.scene.videoProviderTaskId || null,
      videoModel: params.scene.videoModel || null,
      promptSnapshot: params.scene.videoPromptSnapshot || params.scene.motionPrompt || null,
      sourceImageUrl: params.scene.imageUrl || null,
      generationParams: safeJson(parseJsonField<Record<string, unknown>>(params.scene.videoGenerationParams, {})),
    })
    .returning();

  return candidate;
}

export async function selectSceneVideoCandidate(params: {
  userId: string;
  projectId: string;
  sceneId: string;
  candidateId: string;
}) {
  const [candidate] = await db()
    .select()
    .from(lyricVideoSceneVideoCandidate)
    .where(
      and(
        eq(lyricVideoSceneVideoCandidate.id, params.candidateId),
        eq(lyricVideoSceneVideoCandidate.sceneId, params.sceneId),
        eq(lyricVideoSceneVideoCandidate.projectId, params.projectId),
        eq(lyricVideoSceneVideoCandidate.userId, params.userId)
      )
    )
    .limit(1);

  if (!candidate) throw new Error('Video candidate not found');

  const candidateCreatedAt = candidate.createdAt instanceof Date ? candidate.createdAt : new Date(candidate.createdAt);
  await db()
    .update(lyricVideoScene)
    .set({
      videoUrl: candidate.videoUrl,
      videoStatus: 'success',
      videoCompletedAt: Number.isNaN(candidateCreatedAt.getTime()) ? new Date() : candidateCreatedAt,
      videoError: null,
    })
    .where(
      and(
        eq(lyricVideoScene.id, params.sceneId),
        eq(lyricVideoScene.projectId, params.projectId),
        eq(lyricVideoScene.userId, params.userId)
      )
    );

  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  const scene = details?.scenes?.find((item: any) => item.id === params.sceneId);
  if (!scene) throw new Error('Scene not found');
  return scene;
}

export async function queueSceneVideos(params: {
  userId: string;
  projectId: string;
  sceneIds?: string[];
  model?: string;
}) {
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');
  const project = details.project;

  const selectedIds = new Set((params.sceneIds || []).filter(Boolean));
  const scenes = selectedIds.size > 0
    ? details.scenes.filter((scene: any) => selectedIds.has(scene.id))
    : details.scenes;
  if (scenes.length === 0) throw new Error('No scenes to generate videos');

  const scenesMissingImages = scenes.filter((scene: any) => !scene.imageUrl);
  if (scenesMissingImages.length > 0) throw new Error('Generate scene images before creating scene videos');

  const configs = await getAllConfigs();
  const provider = await createKieProvider();
  const model = params.model || configs.kie_video_model || KIE_SEEDANCE_VIDEO_MODEL;
  const queued = [];

  logLyricStage('scene-videos', 'queue-start', {
    projectId: params.projectId,
    userId: params.userId,
    sceneCount: scenes.length,
    sceneIds: scenes.map((scene: any) => scene.id),
    model,
  });

  async function queueOneSceneVideo(scene: any) {
    const prompt = sceneVideoPrompt(scene);
    const requestedDuration = sceneRequestedDurationSeconds(scene);
    const duration = getSeedanceSceneVideoDurationSeconds(scene);
    const aspectRatio = getSeedanceSceneVideoAspectRatio(project);
    const task = await createTask({
      userId: params.userId,
      mediaType: 'video',
      provider: 'kie',
      model,
      prompt,
      costCredits: calculateSceneVideoCostCredits({ sceneCount: 1 }),
      options: {
        projectId: params.projectId,
        sceneId: scene.id,
        imageUrl: scene.imageUrl,
        requestedDuration,
        duration,
        aspectRatio,
        resolution: SEEDANCE_SCENE_VIDEO_RESOLUTION,
      },
    });

    try {
      const result = await provider.generate({
        params: {
          mediaType: AIMediaType.VIDEO,
          model,
          prompt,
          options: {
            input_urls: [scene.imageUrl],
            aspect_ratio: aspectRatio,
            duration,
            resolution: SEEDANCE_SCENE_VIDEO_RESOLUTION,
            fixed_lens: false,
            generate_audio: false,
            nsfw_checker: true,
          },
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
          videoTaskId: task.id,
          videoProviderTaskId: result.taskId,
          videoStatus: 'processing',
          videoModel: model,
          videoPromptSnapshot: prompt,
          videoGenerationParams: safeJson({
            provider: 'kie',
            model,
            requestedDuration,
            duration,
            aspectRatio,
            resolution: SEEDANCE_SCENE_VIDEO_RESOLUTION,
            fixedLens: false,
            generateAudio: false,
            sourceImageUrl: scene.imageUrl,
          }),
          videoError: null,
          videoCompletedAt: null,
        })
        .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
        .returning();
      return updated;
    } catch (error: any) {
      await updateTask({
        taskId: task.id,
        status: AITaskStatus.FAILED,
        taskInfo: { errorMessage: error?.message || 'Scene video generation failed' },
      });
      await db()
        .update(lyricVideoScene)
        .set({
          videoStatus: 'failed',
          videoTaskId: task.id,
          videoModel: model,
          videoPromptSnapshot: prompt,
          videoError: error?.message || 'Scene video generation failed',
        })
        .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)));
      throw error;
    }
  }

  for (let index = 0; index < scenes.length; index += SCENE_VIDEO_QUEUE_CONCURRENCY) {
    const batch = scenes.slice(index, index + SCENE_VIDEO_QUEUE_CONCURRENCY);
    queued.push(...await Promise.all(batch.map(queueOneSceneVideo)));
  }

  return queued;
}

export async function syncSceneVideos(params: {
  userId: string;
  projectId: string;
  sceneIds?: string[];
}) {
  const sceneWhere = params.sceneIds?.length
    ? and(
        eq(lyricVideoScene.projectId, params.projectId),
        eq(lyricVideoScene.userId, params.userId),
        inArray(lyricVideoScene.id, params.sceneIds)
      )
    : and(
        eq(lyricVideoScene.projectId, params.projectId),
        eq(lyricVideoScene.userId, params.userId),
        eq(lyricVideoScene.videoStatus, 'processing'),
        isNotNull(lyricVideoScene.videoProviderTaskId)
      );

  const scenes = await db()
    .select()
    .from(lyricVideoScene)
    .where(sceneWhere)
    .orderBy(lyricVideoScene.sort);
  const processing = scenes.filter((scene: any) => scene.videoStatus === 'processing' && scene.videoProviderTaskId);
  if (processing.length === 0) return scenes;

  const provider = await createKieProvider();
  const configs = await getAllConfigs();
  const updatedScenes: any[] = [];

  for (const scene of processing) {
    try {
      const result = await provider.query({
        taskId: scene.videoProviderTaskId,
        mediaType: AIMediaType.VIDEO,
      });
      const videoUrl = providerVideoUrl(result);
      if (result.taskStatus === AITaskStatus.SUCCESS && videoUrl) {
        const archivedVideoUrl = await archiveSceneVideoUrl({
          projectId: params.projectId,
          sceneId: scene.id,
          videoUrl,
          configs,
        });
        if (scene.videoTaskId) {
          await updateTask({
            taskId: scene.videoTaskId,
            status: AITaskStatus.SUCCESS,
            taskResult: result.taskResult,
            taskInfo: result.taskInfo,
          });
        }
        await recordSceneVideoCandidate({
          userId: params.userId,
          projectId: params.projectId,
          scene,
          videoUrl: archivedVideoUrl,
        });
        const [updated] = await db()
          .update(lyricVideoScene)
          .set({
            videoUrl: archivedVideoUrl,
            videoStatus: 'success',
            videoCompletedAt: new Date(),
            videoError: null,
          })
          .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
          .returning();
        updatedScenes.push(updated);
        continue;
      }

      if (isTerminalProviderFailure(result.taskStatus)) {
        if (scene.videoTaskId) {
          await updateTask({
            taskId: scene.videoTaskId,
            status: AITaskStatus.FAILED,
            taskResult: result.taskResult,
            taskInfo: result.taskInfo,
          });
        }
        const [updated] = await db()
          .update(lyricVideoScene)
          .set({
            videoStatus: 'failed',
            videoError: result.taskInfo?.errorMessage || 'Scene video generation failed',
          })
          .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
          .returning();
        updatedScenes.push(updated);
      }
    } catch (error) {
      logLyricStageError('scene-videos', 'sync-scene-fail', error, {
        projectId: params.projectId,
        userId: params.userId,
        sceneId: scene.id,
        providerTaskId: scene.videoProviderTaskId,
      });
    }
  }

  if (updatedScenes.length === 0) return scenes;
  const updatedIds = new Set(updatedScenes.map((scene: any) => scene.id));
  return scenes.map((scene: any) => updatedIds.has(scene.id) ? updatedScenes.find((updated: any) => updated.id === scene.id) : scene);
}

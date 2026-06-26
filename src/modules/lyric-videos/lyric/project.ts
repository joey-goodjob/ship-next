import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/core/db';
import {
  lyricVideoCastMember,
  lyricVideoExport,
  lyricVideoGenerationRun,
  lyricVideoGenerationStep,
  lyricVideoLine,
  lyricVideoProject,
  lyricVideoScene,
  lyricVideoSceneImageCandidate,
  lyricVideoWord,
  type NewLyricVideoProject,
} from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { logLyricStage } from '@/lib/lyric-video-log';
import { hasAudioInputPatch } from './audio';
import { parseJsonField, safeJson, sceneTextFromLineIds, normalizeTitle } from './json';
import { deriveRuntimeState, normalizeExportStatus } from './status';
import { LYRIC_VIDEO_DEFAULT_STYLE } from './types';

/**
 * 项目模块：负责歌词视频的“项目主表”和详情聚合。
 *
 * 主链路里，前端上传音频后会先调用 `createProject`，这里把音频 URL、裁剪范围、
 * 风格、分辨率和初始状态写入 `lyric_video_project`。预览页再通过
 * `getProjectDetails` 把 project、lyrics、words、scenes、cast、exports 和最新 run
 * 聚合返回给前端。
 */

/**
 * 创建歌词视频项目。
 *
 * 调用入口：`POST /api/lyric-videos` -> `service.createProject`。
 * 写入：`lyric_video_project`。
 * 返回：刚创建的 project，前端随后会用 project.id 调 `/generate`。
 */
export async function createProject(params: {
  userId: string;
  title?: string;
  audioUrl?: string;
  audioStorageKey?: string;
  originalAudioUrl?: string;
  originalAudioStorageKey?: string;
  audioFilename?: string;
  audioDurationMs?: number;
  audioMimeType?: string;
  audioSizeBytes?: number;
  audioChecksum?: string;
  trimStartMs?: number;
  trimEndMs?: number;
  processedAudioUrl?: string;
  processedAudioStorageKey?: string;
  language?: string;
  storyPrompt?: string;
  palette?: string;
  artStyle?: string;
  customStyle?: string;
  aspectRatio?: string;
  resolution?: string;
}) {
  const data: NewLyricVideoProject = {
    id: getUuid(),
    userId: params.userId,
    title: normalizeTitle(params.title || params.audioFilename),
    status: 'draft',
    audioUrl: params.audioUrl,
    audioStorageKey: params.audioStorageKey,
    originalAudioUrl: params.originalAudioUrl || params.audioUrl,
    originalAudioStorageKey: params.originalAudioStorageKey || params.audioStorageKey,
    audioFilename: params.audioFilename,
    audioDurationMs: params.audioDurationMs || 0,
    audioMimeType: params.audioMimeType,
    audioSizeBytes: params.audioSizeBytes || 0,
    audioChecksum: params.audioChecksum,
    trimStartMs: Math.max(0, params.trimStartMs || 0),
    trimEndMs: Math.max(0, params.trimEndMs || params.audioDurationMs || 0),
    processedAudioUrl: params.processedAudioUrl || params.audioUrl,
    processedAudioStorageKey: params.processedAudioStorageKey || params.audioStorageKey,
    language: params.language || 'auto',
    storyPrompt: params.storyPrompt || '',
    palette: params.palette || 'cinematic',
    artStyle: params.artStyle || 'realistic',
    customStyle: params.customStyle || '',
    aspectRatio: params.aspectRatio || '16:9',
    resolution: params.resolution || '1080p',
    lyricsStatus: 'empty',
    scenesStatus: 'empty',
    renderStatus: 'empty',
    generationStatus: 'idle',
    generationProgress: 0,
    pipelineStage: params.audioUrl ? 'uploaded' : 'draft',
    previewConfig: safeJson(LYRIC_VIDEO_DEFAULT_STYLE),
  };

  const [project] = await db().insert(lyricVideoProject).values(data).returning();
  logLyricStage('create-project', 'db-inserted', {
    projectId: project.id,
    userId: project.userId,
    title: project.title,
    hasAudioUrl: Boolean(project.audioUrl),
    audioUrl: project.audioUrl,
    audioStorageKey: project.audioStorageKey,
    audioFilename: project.audioFilename,
    audioDurationMs: project.audioDurationMs,
    pipelineStage: project.pipelineStage,
    lyricsStatus: project.lyricsStatus,
    scenesStatus: project.scenesStatus,
  });
  return project;
}

export async function listProjects(userId: string) {
  return db()
    .select()
    .from(lyricVideoProject)
    .where(and(eq(lyricVideoProject.userId, userId), isNull(lyricVideoProject.deletedAt)))
    .orderBy(desc(lyricVideoProject.createdAt));
}

export async function getProject(params: { userId: string; id: string }) {
  const [project] = await db()
    .select()
    .from(lyricVideoProject)
    .where(
      and(
        eq(lyricVideoProject.id, params.id),
        eq(lyricVideoProject.userId, params.userId),
        isNull(lyricVideoProject.deletedAt)
      )
    )
    .limit(1);

  return project;
}

export async function getProjectDetails(params: { userId: string; id: string }) {
  const project = await getProject(params);
  if (!project) return null;

  const [lines, scenes, imageCandidates, exports, words, cast, latestRuns, activeRuns] = await Promise.all([
    db()
      .select()
      .from(lyricVideoLine)
      .where(and(eq(lyricVideoLine.projectId, params.id), eq(lyricVideoLine.userId, params.userId)))
      .orderBy(lyricVideoLine.sort),
    db()
      .select()
      .from(lyricVideoScene)
      .where(and(eq(lyricVideoScene.projectId, params.id), eq(lyricVideoScene.userId, params.userId)))
      .orderBy(lyricVideoScene.sort),
    db()
      .select()
      .from(lyricVideoSceneImageCandidate)
      .where(and(eq(lyricVideoSceneImageCandidate.projectId, params.id), eq(lyricVideoSceneImageCandidate.userId, params.userId)))
      .orderBy(desc(lyricVideoSceneImageCandidate.createdAt)),
    db()
      .select()
      .from(lyricVideoExport)
      .where(and(eq(lyricVideoExport.projectId, params.id), eq(lyricVideoExport.userId, params.userId)))
      .orderBy(desc(lyricVideoExport.createdAt)),
    db()
      .select()
      .from(lyricVideoWord)
      .where(and(eq(lyricVideoWord.projectId, params.id), eq(lyricVideoWord.userId, params.userId)))
      .orderBy(lyricVideoWord.sort),
    db()
      .select()
      .from(lyricVideoCastMember)
      .where(
        and(
          eq(lyricVideoCastMember.projectId, params.id),
          eq(lyricVideoCastMember.userId, params.userId),
          isNull(lyricVideoCastMember.deletedAt)
        )
      )
      .orderBy(lyricVideoCastMember.sort),
    db()
      .select()
      .from(lyricVideoGenerationRun)
      .where(and(eq(lyricVideoGenerationRun.projectId, params.id), eq(lyricVideoGenerationRun.userId, params.userId)))
      .orderBy(desc(lyricVideoGenerationRun.createdAt))
      .limit(1),
    project.activeRunId
      ? db()
          .select()
          .from(lyricVideoGenerationRun)
          .where(and(eq(lyricVideoGenerationRun.id, project.activeRunId), eq(lyricVideoGenerationRun.userId, params.userId)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const generationRun = activeRuns[0] || latestRuns[0] || null;
  const generationSteps = generationRun
    ? await db()
        .select()
        .from(lyricVideoGenerationStep)
        .where(and(eq(lyricVideoGenerationStep.runId, generationRun.id), eq(lyricVideoGenerationStep.userId, params.userId)))
        .orderBy(lyricVideoGenerationStep.sort)
    : [];

  logLyricStage('preview-fetch', 'db-loaded', {
    projectId: params.id,
    userId: params.userId,
    pipelineStage: project.pipelineStage,
    lyricsStatus: project.lyricsStatus,
    scenesStatus: project.scenesStatus,
    renderStatus: project.renderStatus,
    linesCount: lines.length,
    wordsCount: words.length,
    scenesCount: scenes.length,
    exportsCount: exports.length,
    generationRun: generationRun
      ? {
          id: generationRun.id,
          status: generationRun.status,
          currentStage: generationRun.currentStage,
          progressPercent: generationRun.progressPercent,
        }
      : null,
    generationStepsCount: generationSteps.length,
  });

  const normalizedProject = {
    ...project,
    previewConfig: parseJsonField(project.previewConfig, LYRIC_VIDEO_DEFAULT_STYLE),
  };

  const normalizedLines = lines.map((line: any) => ({
    ...line,
    words: words.filter((word: any) => word.lineId === line.id),
  }));
  const imageCandidatesBySceneId = new Map<string, any[]>();
  for (const candidate of imageCandidates) {
    const sceneCandidates = imageCandidatesBySceneId.get(candidate.sceneId) || [];
    sceneCandidates.push({
      ...candidate,
      generationParams: parseJsonField<Record<string, unknown>>(candidate.generationParams, {}),
    });
    imageCandidatesBySceneId.set(candidate.sceneId, sceneCandidates);
  }

  const normalizedScenes = scenes.map((scene: any) => {
    const linkedLineIds = parseJsonField<string[]>(scene.linkedLineIds, []);
    const text = scene.text || sceneTextFromLineIds(linkedLineIds, lines);
    return {
      ...scene,
      text,
      linkedLineIds,
      lyricLineIds: linkedLineIds,
      castIds: parseJsonField<string[]>(scene.castIds, []),
      styleOverrides: parseJsonField<Record<string, unknown>>(scene.styleOverrides, {}),
      timelineConfig: parseJsonField<Record<string, unknown>>(scene.timelineConfig, {}),
      generationParams: parseJsonField<Record<string, unknown>>(scene.generationParams, {}),
      videoGenerationParams: parseJsonField<Record<string, unknown>>(scene.videoGenerationParams, {}),
      imageCandidates: imageCandidatesBySceneId.get(scene.id) || [],
    };
  });
  const normalizedExports = exports.map((item: any) => ({
    ...item,
    status: normalizeExportStatus(item.status),
  }));
  const runtimeState = deriveRuntimeState({
    project: normalizedProject,
    generationRun,
    generationSteps,
    scenes: normalizedScenes,
    exports: normalizedExports,
  });

  return {
    project: normalizedProject,
    runtimeState,
    generationRun,
    generationSteps,
    words,
    lines: normalizedLines,
    scenes: normalizedScenes,
    cast,
    exports: normalizedExports,
  };
}

export async function updateProject(params: {
  userId: string;
  id: string;
  data: Partial<{
    title: string;
    audioUrl: string;
    audioStorageKey: string;
    originalAudioUrl: string;
    originalAudioStorageKey: string;
    audioFilename: string;
    audioDurationMs: number;
    audioMimeType: string;
    audioSizeBytes: number;
    audioChecksum: string;
    trimStartMs: number;
    trimEndMs: number;
    processedAudioUrl: string;
    processedAudioStorageKey: string;
    language: string;
    storyPrompt: string;
    palette: string;
    artStyle: string;
    customStyle: string;
    aspectRatio: string;
    resolution: string;
    previewConfig: unknown;
  }>;
}) {
  // 更新项目本身。若 patch 里包含音频字段，说明用户换了歌或裁剪范围，
  // 需要把歌词、分镜相关状态重置，后续 `/generate` 会重新转写和生成。
  const project = await getProject({ userId: params.userId, id: params.id });
  if (!project) throw new Error('Project not found');

  const updateData: any = { ...params.data };
  if (params.data.previewConfig) {
    updateData.previewConfig = safeJson(params.data.previewConfig);
  }
  if (hasAudioInputPatch(updateData)) {
    updateData.originalAudioUrl = updateData.originalAudioUrl || updateData.audioUrl || project.originalAudioUrl || project.audioUrl;
    updateData.originalAudioStorageKey =
      updateData.originalAudioStorageKey || updateData.audioStorageKey || project.originalAudioStorageKey || project.audioStorageKey;
    updateData.processedAudioUrl = null;
    updateData.processedAudioStorageKey = null;
    updateData.lyricsStatus = 'empty';
    updateData.scenesStatus = 'empty';
    updateData.pipelineStage = updateData.audioUrl || updateData.originalAudioUrl ? 'uploaded' : 'draft';
    updateData.pipelineError = null;
  }

  const [updated] = await db()
    .update(lyricVideoProject)
    .set(updateData)
    .where(and(eq(lyricVideoProject.id, params.id), eq(lyricVideoProject.userId, params.userId)))
    .returning();

  return updated;
}

export async function removeProject(params: { userId: string; id: string }) {
  await db()
    .update(lyricVideoProject)
    .set({ deletedAt: new Date(), status: 'deleted' })
    .where(and(eq(lyricVideoProject.id, params.id), eq(lyricVideoProject.userId, params.userId)));
}

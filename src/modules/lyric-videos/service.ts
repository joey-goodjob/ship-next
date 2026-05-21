import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/core/db';
import {
  lyricVideoExport,
  lyricVideoLine,
  lyricVideoProject,
  lyricVideoScene,
  type NewLyricVideoProject,
} from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { createTask } from '@/modules/ai-tasks/service';

export const LYRIC_VIDEO_DEFAULT_STYLE = {
  fontFamily: 'Inter',
  fontSize: 56,
  textColor: '#ffffff',
  shadowColor: '#000000',
  position: 'bottom',
  transition: 'fade',
};

export type LyricLineInput = {
  id?: string;
  startMs?: number;
  endMs?: number;
  text: string;
};

export type SceneInput = {
  id?: string;
  startMs?: number;
  endMs?: number;
  prompt: string;
  motionPrompt?: string;
  imageUrl?: string;
};

function safeJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function normalizeTitle(title?: string) {
  return title?.trim() || 'Untitled lyric video';
}

function parseLinesFromText(text: string): LyricLineInput[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => ({
    text: line,
    startMs: index * 4000,
    endMs: (index + 1) * 4000,
  }));
}

export async function createProject(params: {
  userId: string;
  title?: string;
  audioUrl?: string;
  audioFilename?: string;
  audioDurationMs?: number;
  language?: string;
  storyPrompt?: string;
  palette?: string;
  artStyle?: string;
  aspectRatio?: string;
  resolution?: string;
}) {
  const data: NewLyricVideoProject = {
    id: getUuid(),
    userId: params.userId,
    title: normalizeTitle(params.title || params.audioFilename),
    status: 'draft',
    audioUrl: params.audioUrl,
    audioFilename: params.audioFilename,
    audioDurationMs: params.audioDurationMs || 0,
    language: params.language || 'auto',
    storyPrompt: params.storyPrompt || '',
    palette: params.palette || 'cinematic',
    artStyle: params.artStyle || 'cinematic illustration',
    aspectRatio: params.aspectRatio || '16:9',
    resolution: params.resolution || '1080p',
    lyricsStatus: 'empty',
    scenesStatus: 'empty',
    renderStatus: 'empty',
    previewConfig: safeJson(LYRIC_VIDEO_DEFAULT_STYLE),
  };

  const [project] = await db().insert(lyricVideoProject).values(data).returning();
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

  const [lines, scenes, exports] = await Promise.all([
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
      .from(lyricVideoExport)
      .where(and(eq(lyricVideoExport.projectId, params.id), eq(lyricVideoExport.userId, params.userId)))
      .orderBy(desc(lyricVideoExport.createdAt)),
  ]);

  return { project, lines, scenes, exports };
}

export async function updateProject(params: {
  userId: string;
  id: string;
  data: Partial<{
    title: string;
    audioUrl: string;
    audioFilename: string;
    audioDurationMs: number;
    language: string;
    storyPrompt: string;
    palette: string;
    artStyle: string;
    aspectRatio: string;
    resolution: string;
    previewConfig: unknown;
  }>;
}) {
  const project = await getProject({ userId: params.userId, id: params.id });
  if (!project) throw new Error('Project not found');

  const updateData: any = { ...params.data };
  if (params.data.previewConfig) {
    updateData.previewConfig = safeJson(params.data.previewConfig);
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

export async function replaceLyrics(params: {
  userId: string;
  projectId: string;
  lines: LyricLineInput[];
}) {
  const project = await getProject({ userId: params.userId, id: params.projectId });
  if (!project) throw new Error('Project not found');

  const cleanLines = params.lines
    .map((line) => ({
      text: line.text.trim(),
      startMs: Math.max(0, line.startMs || 0),
      endMs: Math.max(line.startMs || 0, line.endMs || 0),
    }))
    .filter((line) => line.text);

  return db().transaction(async (tx: any) => {
    await tx
      .delete(lyricVideoLine)
      .where(and(eq(lyricVideoLine.projectId, params.projectId), eq(lyricVideoLine.userId, params.userId)));

    const values = cleanLines.map((line, index) => ({
      id: getUuid(),
      projectId: params.projectId,
      userId: params.userId,
      sort: index,
      startMs: line.startMs,
      endMs: line.endMs || line.startMs + 3500,
      text: line.text,
    }));

    const inserted = values.length > 0 ? await tx.insert(lyricVideoLine).values(values).returning() : [];

    await tx
      .update(lyricVideoProject)
      .set({ lyricsStatus: inserted.length > 0 ? 'ready' : 'empty', scenesStatus: 'empty' })
      .where(eq(lyricVideoProject.id, params.projectId));

    return inserted;
  });
}

export async function createTranscriptionDraft(params: {
  userId: string;
  projectId: string;
  rawLyrics?: string;
}) {
  const project = await getProject({ userId: params.userId, id: params.projectId });
  if (!project) throw new Error('Project not found');

  await createTask({
    userId: params.userId,
    mediaType: 'text',
    provider: 'transcription-adapter',
    model: 'mvp-transcription',
    prompt: project.audioUrl || project.title,
    costCredits: 10,
    options: { projectId: params.projectId, stage: 'lyrics_transcription' },
  });

  const fallbackLyrics = [
    'Your song starts here',
    'Every word becomes a scene',
    'Light moves with the rhythm',
    'And the chorus fills the screen',
  ].join('\n');

  return replaceLyrics({
    userId: params.userId,
    projectId: params.projectId,
    lines: parseLinesFromText(params.rawLyrics || fallbackLyrics),
  });
}

export async function generateStoryboard(params: {
  userId: string;
  projectId: string;
  storyPrompt?: string;
}) {
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');
  if (details.lines.length === 0) throw new Error('Add lyrics before generating scenes');

  await createTask({
    userId: params.userId,
    mediaType: 'text',
    provider: 'storyboard-adapter',
    model: 'mvp-storyboard',
    prompt: params.storyPrompt || details.project.storyPrompt || details.project.title,
    costCredits: 15,
    options: { projectId: params.projectId, stage: 'storyboard' },
  });

  const sceneSize = 2;
  const scenes: SceneInput[] = [];
  for (let index = 0; index < details.lines.length; index += sceneSize) {
    const group = details.lines.slice(index, index + sceneSize);
    const text = group.map((line: any) => line.text).join(' ');
    scenes.push({
      startMs: group[0]?.startMs || 0,
      endMs: group[group.length - 1]?.endMs || (group[0]?.startMs || 0) + 4000,
      prompt: [
        details.project.artStyle,
        `${details.project.palette} color palette`,
        params.storyPrompt || details.project.storyPrompt || 'emotional music video imagery',
        `visualize this lyric: ${text}`,
        'no text, no typography, cinematic composition',
      ].filter(Boolean).join(', '),
    });
  }

  return replaceScenes({ userId: params.userId, projectId: params.projectId, scenes });
}

export async function replaceScenes(params: {
  userId: string;
  projectId: string;
  scenes: SceneInput[];
}) {
  const project = await getProject({ userId: params.userId, id: params.projectId });
  if (!project) throw new Error('Project not found');

  const cleanScenes = params.scenes
    .map((scene) => ({
      prompt: scene.prompt.trim(),
      motionPrompt: scene.motionPrompt?.trim() || '',
      imageUrl: scene.imageUrl,
      startMs: Math.max(0, scene.startMs || 0),
      endMs: Math.max(scene.startMs || 0, scene.endMs || 0),
    }))
    .filter((scene) => scene.prompt);

  return db().transaction(async (tx: any) => {
    await tx
      .delete(lyricVideoScene)
      .where(and(eq(lyricVideoScene.projectId, params.projectId), eq(lyricVideoScene.userId, params.userId)));

    const values = cleanScenes.map((scene, index) => ({
      id: getUuid(),
      projectId: params.projectId,
      userId: params.userId,
      sort: index,
      startMs: scene.startMs,
      endMs: scene.endMs || scene.startMs + 8000,
      prompt: scene.prompt,
      motionPrompt: scene.motionPrompt,
      imageUrl: scene.imageUrl,
      status: scene.imageUrl ? 'success' : 'draft',
    }));

    const inserted = values.length > 0 ? await tx.insert(lyricVideoScene).values(values).returning() : [];

    await tx
      .update(lyricVideoProject)
      .set({ scenesStatus: inserted.length > 0 ? 'ready' : 'empty' })
      .where(eq(lyricVideoProject.id, params.projectId));

    return inserted;
  });
}

export async function queueSceneImages(params: {
  userId: string;
  projectId: string;
  sceneId?: string;
  model?: string;
}) {
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');

  const scenes = params.sceneId
    ? details.scenes.filter((scene: any) => scene.id === params.sceneId)
    : details.scenes;

  if (scenes.length === 0) throw new Error('No scenes to generate');

  const queued = [];
  for (const scene of scenes) {
    const task = await createTask({
      userId: params.userId,
      mediaType: 'image',
      provider: 'kie',
      model: params.model || 'flux-kontext-pro',
      prompt: scene.prompt,
      costCredits: 5,
      options: {
        projectId: params.projectId,
        sceneId: scene.id,
        aspect_ratio: details.project.aspectRatio,
        resolution: details.project.resolution,
      },
    });

    const [updated] = await db()
      .update(lyricVideoScene)
      .set({ imageTaskId: task.id, status: 'processing' })
      .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
      .returning();
    queued.push(updated);
  }

  await db()
    .update(lyricVideoProject)
    .set({ scenesStatus: 'processing' })
    .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));

  return queued;
}

export async function queueExport(params: {
  userId: string;
  projectId: string;
  settings?: unknown;
}) {
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');
  if (details.lines.length === 0) throw new Error('Add lyrics before export');
  if (details.scenes.length === 0) throw new Error('Generate scenes before export');

  const costCredits = Math.max(20, Math.ceil((details.project.audioDurationMs || 60000) / 1000 / 10) * 5);
  const task = await createTask({
    userId: params.userId,
    mediaType: 'video',
    provider: 'remotion',
    model: 'static-lyric-video-1080p',
    prompt: details.project.title,
    costCredits,
    options: { projectId: params.projectId, stage: 'render', settings: params.settings },
  });

  const [exportJob] = await db()
    .insert(lyricVideoExport)
    .values({
      id: getUuid(),
      projectId: params.projectId,
      userId: params.userId,
      status: 'pending',
      format: 'mp4',
      resolution: details.project.resolution,
      aspectRatio: details.project.aspectRatio,
      taskId: task.id,
      settings: safeJson(params.settings || LYRIC_VIDEO_DEFAULT_STYLE),
      costCredits,
    })
    .returning();

  await db()
    .update(lyricVideoProject)
    .set({ renderStatus: 'processing', renderTaskId: task.id })
    .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));

  return exportJob;
}

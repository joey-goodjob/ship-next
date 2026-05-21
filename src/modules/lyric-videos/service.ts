import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { envConfigs } from '@/config';
import { db } from '@/core/db';
import { AIMediaType, AITaskStatus as ProviderTaskStatus, KieProvider, YunwuProvider, type AIFile } from '@/core/ai';
import {
  lyricVideoExport,
  lyricVideoLine,
  lyricVideoProject,
  lyricVideoScene,
  type NewLyricVideoProject,
} from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { createTask, updateTask, AITaskStatus } from '@/modules/ai-tasks/service';
import { getStorage, isStorageConfigured } from '@/modules/storage/service';

const execFileAsync = promisify(execFile);

export const LYRIC_VIDEO_DEFAULT_STYLE = {
  fontFamily: 'Inter',
  fontSize: 56,
  textColor: '#ffffff',
  shadowColor: '#000000',
  position: 'bottom',
  transition: 'fade',
};

type StoryboardScene = {
  startMs: number;
  endMs: number;
  prompt: string;
  linkedLineIds?: string[];
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
  linkedLineIds?: string[];
  motionPrompt?: string;
  imageUrl?: string;
};

function safeJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value || typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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

function secondsToMs(value: unknown) {
  const num = Number(value || 0);
  return Math.max(0, Math.round(num * 1000));
}

function getDimensions(aspectRatio?: string) {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

function assTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const centiseconds = Math.floor((ms % 1000) / 10);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

function escapeAssText(text: string) {
  return text.replace(/[{}]/g, '').replace(/\n/g, '\\N');
}

function cssHexToAss(hex: string, fallback: string) {
  const clean = (hex || fallback).replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return cssHexToAss(fallback, '#ffffff');
  const rr = clean.slice(0, 2);
  const gg = clean.slice(2, 4);
  const bb = clean.slice(4, 6);
  return `&H00${bb}${gg}${rr}`;
}

function buildAss(params: {
  lines: LyricLineInput[];
  width: number;
  height: number;
  style?: any;
}) {
  const style = { ...LYRIC_VIDEO_DEFAULT_STYLE, ...(params.style || {}) };
  const alignment = style.position === 'top' ? 8 : style.position === 'center' ? 5 : 2;
  const marginV = style.position === 'bottom' ? Math.round(params.height * 0.1) : Math.round(params.height * 0.08);

  const events = params.lines
    .map(
      (line) =>
        `Dialogue: 0,${assTime(line.startMs || 0)},${assTime(line.endMs || (line.startMs || 0) + 3500)},Default,,0,0,0,,${escapeAssText(line.text)}`
    )
    .join('\n');

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${params.width}
PlayResY: ${params.height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontFamily || 'Inter'},${Number(style.fontSize) || 56},${cssHexToAss(style.textColor, '#ffffff')},&H000000FF,${cssHexToAss(style.shadowColor, '#000000')},&H99000000,-1,0,0,0,100,100,0,0,1,3,1,${alignment},80,80,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}

async function fetchBytes(url: string) {
  if (url.startsWith('/')) {
    return readFile(path.join(process.cwd(), 'public', url));
  }
  if (url.startsWith('data:')) {
    const [, data] = url.split(',');
    return Buffer.from(data || '', 'base64');
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function saveLocalPublicFile(params: { body: Buffer | Uint8Array; dir: string; filename: string }) {
  const targetDir = path.join(process.cwd(), 'public', params.dir);
  await mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, params.filename);
  await writeFile(targetPath, params.body);
  return `/${params.dir}/${params.filename}`;
}

async function saveGeneratedFile(params: {
  body: Buffer | Uint8Array;
  key: string;
  contentType: string;
  localDir: string;
}) {
  if (isStorageConfigured()) {
    const result = await getStorage().uploadFile({
      body: params.body,
      key: params.key,
      contentType: params.contentType,
    });
    if (!result.success || !result.url) throw new Error(result.error || 'Upload failed');
    return { url: result.url, storageKey: result.key || params.key };
  }

  const url = await saveLocalPublicFile({
    body: params.body,
    dir: params.localDir,
    filename: path.basename(params.key),
  });
  return { url, storageKey: params.key };
}

async function saveAIProviderFiles(files: AIFile[]) {
  if (!isStorageConfigured()) return undefined;

  const storage = getStorage();
  const saved: AIFile[] = [];
  for (const file of files) {
    const result = await storage.downloadAndUpload({
      url: file.url,
      key: file.key,
      contentType: file.contentType,
    });
    if (result.success && result.url) {
      saved.push({ ...file, url: result.url });
    }
  }
  return saved;
}

async function callKieGeminiChat(params: {
  text: string;
  mediaUrl?: string;
  responseFormat?: any;
}) {
  if (!envConfigs.kie_api_key) {
    throw new Error('KIE_API_KEY is required for Kie Gemini chat');
  }

  const content: any[] = [{ type: 'text', text: params.text }];
  if (params.mediaUrl) {
    content.push({ type: 'image_url', image_url: { url: params.mediaUrl } });
  }

  const response = await fetch(envConfigs.kie_chat_endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${envConfigs.kie_api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: envConfigs.kie_chat_model,
      stream: false,
      messages: [{ role: 'user', content }],
      response_format: params.responseFormat,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kie Gemini chat failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const contentText = data.choices?.[0]?.message?.content || '';
  return { raw: data, content: contentText };
}

async function transcribeWithKieGemini(audioUrl: string) {
  const schema = {
    type: 'json_schema',
    properties: {
      lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            startMs: { type: 'integer' },
            endMs: { type: 'integer' },
            text: { type: 'string' },
          },
          required: ['startMs', 'endMs', 'text'],
        },
      },
    },
  };

  const result = await callKieGeminiChat({
    mediaUrl: audioUrl,
    responseFormat: schema,
    text: `Transcribe this song audio into lyric lines with approximate millisecond timestamps.
Return only JSON matching the schema. Keep each lyric line concise. If exact timing is uncertain, estimate line timings in order.`,
  });

  const parsed = parseJson<any>(result.content, {});
  const lines = Array.isArray(parsed.lines)
    ? parsed.lines.map((line: any, index: number) => ({
        startMs: Math.max(0, Number(line.startMs) || index * 4000),
        endMs: Math.max(Number(line.startMs) || index * 4000, Number(line.endMs) || index * 4000 + 3500),
        text: String(line.text || '').trim(),
      }))
    : parseLinesFromText(result.content);

  return { raw: result.raw, lines: lines.filter((line: LyricLineInput) => line.text) };
}

async function transcribeWithYunwuWhisper(params: {
  audioUrl: string;
  language?: string;
  prompt?: string;
}) {
  const provider = new YunwuProvider({
    apiKey: envConfigs.yunwu_api_key,
    baseUrl: envConfigs.yunwu_base_url,
    transcribeModel: envConfigs.yunwu_transcribe_model,
  });
  const result = await provider.transcribe({
    audioUrl: params.audioUrl,
    language: params.language && params.language !== 'auto' ? params.language : 'zh',
    prompt: params.prompt,
  });

  return {
    raw: result.raw,
    lines: result.lines.map((line) => ({
      startMs: line.startMs,
      endMs: line.endMs,
      text: line.text,
    })),
  };
}

async function generateStoryboardWithKieGemini(params: {
  lines: any[];
  project: any;
  storyPrompt?: string;
}): Promise<StoryboardScene[]> {
  const fallback = buildHeuristicStoryboard(params);
  if (!envConfigs.kie_api_key) return fallback;

  const lyrics = params.lines
    .map((line, index) => `${index + 1}. [${line.startMs}-${line.endMs}ms] ${line.text}`)
    .join('\n');
  const prompt = `Create a JSON array of static lyric-video visual scenes. Use 1 scene for every 1-3 lyric lines. Return only JSON.
Each item must have: startMs, endMs, prompt, linkedLineIds.
Style: ${params.project.artStyle}. Palette: ${params.project.palette}. Story: ${params.storyPrompt || params.project.storyPrompt || 'emotional cinematic lyric video'}.
No text or typography in images. Keep characters and setting consistent.
Lyrics:
${lyrics}`;

  const result = await callKieGeminiChat({
    text: prompt,
    responseFormat: {
      type: 'json_schema',
      properties: {
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              startMs: { type: 'integer' },
              endMs: { type: 'integer' },
              prompt: { type: 'string' },
              linkedLineIds: { type: 'array', items: { type: 'string' } },
            },
            required: ['startMs', 'endMs', 'prompt'],
          },
        },
      },
    },
  });

  const content = result.content || '{}';
  const parsed = parseJson<any>(content, {});
  const scenes = Array.isArray(parsed) ? parsed : parsed.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) return fallback;

  return scenes
    .map((scene: any) => ({
      startMs: Math.max(0, Number(scene.startMs) || 0),
      endMs: Math.max(Number(scene.startMs) || 0, Number(scene.endMs) || 0),
      prompt: String(scene.prompt || '').trim(),
      linkedLineIds: Array.isArray(scene.linkedLineIds) ? scene.linkedLineIds.map(String) : [],
    }))
    .filter((scene: StoryboardScene) => scene.prompt);
}

function buildHeuristicStoryboard(params: { lines: any[]; project: any; storyPrompt?: string }) {
  const sceneSize = 2;
  const scenes: StoryboardScene[] = [];
  for (let index = 0; index < params.lines.length; index += sceneSize) {
    const group = params.lines.slice(index, index + sceneSize);
    const text = group.map((line: any) => line.text).join(' ');
    scenes.push({
      startMs: group[0]?.startMs || 0,
      endMs: group[group.length - 1]?.endMs || (group[0]?.startMs || 0) + 4000,
      linkedLineIds: group.map((line: any) => line.id).filter(Boolean),
      prompt: [
        params.project.artStyle,
        `${params.project.palette} color palette`,
        params.storyPrompt || params.project.storyPrompt || 'emotional music video imagery',
        `visualize this lyric: ${text}`,
        'consistent characters, no text, no typography, cinematic composition',
      ]
        .filter(Boolean)
        .join(', '),
    });
  }
  return scenes;
}

function createKieProvider() {
  if (!envConfigs.kie_api_key) {
    throw new Error('KIE_API_KEY is required for image generation');
  }
  return new KieProvider({
    apiKey: envConfigs.kie_api_key,
    customStorage: isStorageConfigured(),
    saveFiles: saveAIProviderFiles,
    uuid: getUuid,
  });
}

export async function createProject(params: {
  userId: string;
  title?: string;
  audioUrl?: string;
  audioStorageKey?: string;
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
    audioStorageKey: params.audioStorageKey,
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
    pipelineStage: params.audioUrl ? 'uploaded' : 'draft',
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
    audioStorageKey: string;
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
      .set({
        lyricsStatus: inserted.length > 0 ? 'ready' : 'empty',
        scenesStatus: 'empty',
        pipelineStage: inserted.length > 0 ? 'lyrics_ready' : 'uploaded',
        pipelineError: null,
      })
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
  const transcriptionProvider = params.rawLyrics ? 'manual' : envConfigs.yunwu_api_key ? 'yunwu' : 'kie';
  const transcriptionModel = params.rawLyrics
    ? 'manual-lyrics'
    : envConfigs.yunwu_api_key
      ? envConfigs.yunwu_transcribe_model
      : envConfigs.kie_chat_model;

  const task = await createTask({
    userId: params.userId,
    mediaType: 'text',
    provider: transcriptionProvider,
    model: transcriptionModel,
    prompt: project.audioUrl || project.title,
    costCredits: params.rawLyrics ? 0 : 10,
    options: { projectId: params.projectId, stage: 'lyrics_transcription' },
  });

  try {
    if (!params.rawLyrics && !project.audioUrl) {
      throw new Error('Upload audio before transcription');
    }

    const result = params.rawLyrics
      ? { raw: { text: params.rawLyrics, source: 'manual' }, lines: parseLinesFromText(params.rawLyrics) }
      : envConfigs.yunwu_api_key
        ? await transcribeWithYunwuWhisper({
            audioUrl: project.audioUrl || '',
            language: project.language || 'zh',
            prompt: project.title,
          })
        : await transcribeWithKieGemini(project.audioUrl || '');

    const lines = await replaceLyrics({
      userId: params.userId,
      projectId: params.projectId,
      lines: result.lines,
    });

    await Promise.all([
      updateTask({ taskId: task.id, status: AITaskStatus.SUCCESS, taskResult: result.raw }),
      db()
        .update(lyricVideoProject)
        .set({
          transcriptionRaw: safeJson(result.raw),
          lyricsStatus: 'ready',
          pipelineStage: 'lyrics_ready',
          pipelineError: null,
        })
        .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
    ]);

    return lines;
  } catch (error: any) {
    await Promise.all([
      updateTask({ taskId: task.id, status: AITaskStatus.FAILED, taskResult: { error: error?.message } }),
      db()
        .update(lyricVideoProject)
        .set({ lyricsStatus: 'failed', pipelineStage: 'transcription_failed', pipelineError: error?.message || 'Transcription failed' })
        .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
    ]);
    throw error;
  }
}

export async function generateStoryboard(params: {
  userId: string;
  projectId: string;
  storyPrompt?: string;
}) {
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');
  if (details.lines.length === 0) throw new Error('Add lyrics before generating scenes');

  const task = await createTask({
    userId: params.userId,
    mediaType: 'text',
    provider: envConfigs.kie_api_key ? 'kie' : 'heuristic',
    model: envConfigs.kie_api_key ? envConfigs.kie_chat_model : 'local-storyboard',
    prompt: params.storyPrompt || details.project.storyPrompt || details.project.title,
    costCredits: envConfigs.kie_api_key ? 15 : 0,
    options: { projectId: params.projectId, stage: 'storyboard' },
  });

  try {
    const scenes = await generateStoryboardWithKieGemini({
      lines: details.lines,
      project: details.project,
      storyPrompt: params.storyPrompt,
    });
    const inserted = await replaceScenes({ userId: params.userId, projectId: params.projectId, scenes });
    await Promise.all([
      updateTask({ taskId: task.id, status: AITaskStatus.SUCCESS, taskResult: { scenes } }),
      db()
        .update(lyricVideoProject)
        .set({
          storyPrompt: params.storyPrompt ?? details.project.storyPrompt,
          scenesStatus: 'ready',
          pipelineStage: 'storyboard_ready',
          pipelineError: null,
        })
        .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
    ]);
    return inserted;
  } catch (error: any) {
    await updateTask({ taskId: task.id, status: AITaskStatus.FAILED, taskResult: { error: error?.message } });
    throw error;
  }
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
      linkedLineIds: scene.linkedLineIds || [],
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
      linkedLineIds: safeJson(scene.linkedLineIds),
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

export async function updateScene(params: {
  userId: string;
  projectId: string;
  sceneId: string;
  prompt?: string;
  motionPrompt?: string;
}) {
  const updateData: any = {};
  if (typeof params.prompt === 'string') updateData.prompt = params.prompt.trim();
  if (typeof params.motionPrompt === 'string') updateData.motionPrompt = params.motionPrompt.trim();
  updateData.status = 'draft';
  updateData.error = null;

  const [updated] = await db()
    .update(lyricVideoScene)
    .set(updateData)
    .where(
      and(
        eq(lyricVideoScene.id, params.sceneId),
        eq(lyricVideoScene.projectId, params.projectId),
        eq(lyricVideoScene.userId, params.userId)
      )
    )
    .returning();

  return updated;
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

  const provider = createKieProvider();
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

    try {
      const result = await provider.generate({
        params: {
          mediaType: AIMediaType.IMAGE,
          model: params.model || 'flux-kontext-pro',
          prompt: scene.prompt,
          options: {
            aspect_ratio: details.project.aspectRatio,
            resolution: details.project.resolution,
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
          imageTaskId: task.id,
          providerTaskId: result.taskId,
          status: 'processing',
          generationParams: safeJson({ model: params.model || 'flux-kontext-pro' }),
          error: null,
        })
        .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
        .returning();
      queued.push(updated);
    } catch (error: any) {
      await updateTask({ taskId: task.id, status: AITaskStatus.FAILED, taskResult: { error: error?.message } });
      const [updated] = await db()
        .update(lyricVideoScene)
        .set({ imageTaskId: task.id, status: 'failed', error: error?.message || 'Image generation failed' })
        .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
        .returning();
      queued.push(updated);
    }
  }

  await db()
    .update(lyricVideoProject)
    .set({ scenesStatus: 'processing', pipelineStage: 'images_processing', pipelineError: null })
    .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));

  return queued;
}

export async function syncSceneImages(params: { userId: string; projectId: string }) {
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');
  const provider = createKieProvider();
  const processing = details.scenes.filter((scene: any) => scene.status === 'processing' && scene.providerTaskId);
  const synced = [];

  for (const scene of processing) {
    try {
      const result = await provider.query({ taskId: scene.providerTaskId, mediaType: AIMediaType.IMAGE });
      if (result.taskStatus === ProviderTaskStatus.SUCCESS) {
        const imageUrl = result.taskInfo?.images?.[0]?.imageUrl;
        const [updated] = await db()
          .update(lyricVideoScene)
          .set({ imageUrl, status: imageUrl ? 'success' : 'failed', error: imageUrl ? null : 'No image URL returned' })
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
      } else if (result.taskStatus === ProviderTaskStatus.FAILED) {
        const message = result.taskInfo?.errorMessage || 'Image generation failed';
        const [updated] = await db()
          .update(lyricVideoScene)
          .set({ status: 'failed', error: message })
          .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
          .returning();
        if (scene.imageTaskId) {
          await updateTask({ taskId: scene.imageTaskId, status: AITaskStatus.FAILED, taskResult: result.taskResult });
        }
        synced.push(updated);
      }
    } catch (error: any) {
      const [updated] = await db()
        .update(lyricVideoScene)
        .set({ status: 'failed', error: error?.message || 'Image sync failed' })
        .where(and(eq(lyricVideoScene.id, scene.id), eq(lyricVideoScene.userId, params.userId)))
        .returning();
      synced.push(updated);
    }
  }

  const refreshed = await getProjectDetails({ userId: params.userId, id: params.projectId });
  const allDone = refreshed?.scenes.length && refreshed.scenes.every((scene: any) => scene.status === 'success');
  if (allDone) {
    await db()
      .update(lyricVideoProject)
      .set({ scenesStatus: 'ready', pipelineStage: 'images_ready', pipelineError: null })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));
  }

  return synced;
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
  if (!details.project.audioUrl) throw new Error('Upload audio before export');
  if (!details.scenes.some((scene: any) => scene.imageUrl)) throw new Error('Generate at least one scene image before export');

  const costCredits = Math.max(20, Math.ceil((details.project.audioDurationMs || 60000) / 1000 / 10) * 5);
  const task = await createTask({
    userId: params.userId,
    mediaType: 'video',
    provider: 'ffmpeg',
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
      status: 'processing',
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
    .set({ renderStatus: 'processing', renderTaskId: task.id, pipelineStage: 'rendering', pipelineError: null })
    .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));

  try {
    const rendered = await renderStaticVideo({
      project: details.project,
      lines: details.lines,
      scenes: details.scenes,
      settings: params.settings,
      exportId: exportJob.id,
    });

    await Promise.all([
      updateTask({ taskId: task.id, status: AITaskStatus.SUCCESS, taskResult: rendered }),
      db()
        .update(lyricVideoExport)
        .set({ status: 'success', videoUrl: rendered.url, storageKey: rendered.storageKey })
        .where(and(eq(lyricVideoExport.id, exportJob.id), eq(lyricVideoExport.userId, params.userId))),
      db()
        .update(lyricVideoProject)
        .set({ renderStatus: 'ready', renderUrl: rendered.url, pipelineStage: 'export_ready', pipelineError: null })
        .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
    ]);

    return { ...exportJob, status: 'success', videoUrl: rendered.url, storageKey: rendered.storageKey };
  } catch (error: any) {
    await Promise.all([
      updateTask({ taskId: task.id, status: AITaskStatus.FAILED, taskResult: { error: error?.message } }),
      db()
        .update(lyricVideoExport)
        .set({ status: 'failed', error: error?.message || 'Export failed' })
        .where(and(eq(lyricVideoExport.id, exportJob.id), eq(lyricVideoExport.userId, params.userId))),
      db()
        .update(lyricVideoProject)
        .set({ renderStatus: 'failed', pipelineStage: 'export_failed', pipelineError: error?.message || 'Export failed' })
        .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
    ]);
    throw error;
  }
}

async function renderStaticVideo(params: {
  project: any;
  lines: any[];
  scenes: any[];
  settings?: unknown;
  exportId: string;
}) {
  const { width, height } = getDimensions(params.project.aspectRatio);
  const tmpDir = path.join(process.cwd(), '.next', 'lyric-video-renders', params.exportId);
  await mkdir(tmpDir, { recursive: true });

  try {
    const audioPath = path.join(tmpDir, 'audio');
    await writeFile(audioPath, await fetchBytes(params.project.audioUrl));

    const scenesWithImages = params.scenes.filter((scene) => scene.imageUrl);
    const concatLines: string[] = [];
    for (let index = 0; index < scenesWithImages.length; index += 1) {
      const scene = scenesWithImages[index];
      const imagePath = path.join(tmpDir, `scene-${index}.png`);
      await writeFile(imagePath, await fetchBytes(scene.imageUrl));
      concatLines.push(`file '${imagePath.replace(/'/g, "'\\''")}'`);
      concatLines.push(`duration ${Math.max(1, ((scene.endMs || scene.startMs + 4000) - (scene.startMs || 0)) / 1000)}`);
    }
    const lastImage = path.join(tmpDir, `scene-${scenesWithImages.length - 1}.png`);
    concatLines.push(`file '${lastImage.replace(/'/g, "'\\''")}'`);

    const concatPath = path.join(tmpDir, 'images.txt');
    const assPath = path.join(tmpDir, 'subtitles.ass');
    const outputPath = path.join(tmpDir, 'output.mp4');
    await writeFile(concatPath, concatLines.join('\n'));
    await writeFile(
      assPath,
      buildAss({
        lines: params.lines,
        width,
        height,
        style: params.settings,
      })
    );

    await execFileAsync(envConfigs.ffmpeg_path || 'ffmpeg', [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatPath,
      '-i',
      audioPath,
      '-vf',
      `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},subtitles=${assPath}`,
      '-shortest',
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      outputPath,
    ]);

    const body = await readFile(outputPath);
    return saveGeneratedFile({
      body,
      key: `renders/${params.exportId}.mp4`,
      contentType: 'video/mp4',
      localDir: 'renders',
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

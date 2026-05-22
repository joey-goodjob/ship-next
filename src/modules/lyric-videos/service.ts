import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { envConfigs } from '@/config';
import { db } from '@/core/db';
import { AIMediaType, AITaskStatus as ProviderTaskStatus, GroqProvider, KieProvider, type AIFile } from '@/core/ai';
import {
  lyricVideoCastMember,
  lyricVideoExport,
  lyricVideoGenerationRun,
  lyricVideoGenerationStep,
  lyricVideoLine,
  lyricVideoProject,
  lyricVideoScene,
  lyricVideoWord,
  type NewLyricVideoProject,
} from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { createTask, updateTask, AITaskStatus } from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
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

const GENERATION_STAGES = [
  'audio_prepare',
  'asr_words',
  'scene_segmentation',
  'prompt_generation',
  'image_generation',
  'finalize_project',
] as const;

const ACTIVE_RUN_STATUSES = ['queued', 'running', 'waiting_provider'] as const;

export type LyricLineInput = {
  id?: string;
  startMs?: number;
  endMs?: number;
  text: string;
  source?: string;
  wordStartIndex?: number;
  wordEndIndex?: number;
  confidence?: number;
};

export type LyricWordInput = {
  word: string;
  startMs?: number;
  endMs?: number;
  confidence?: number;
};

export type SceneInput = {
  id?: string;
  startMs?: number;
  endMs?: number;
  text?: string;
  prompt: string;
  negativePrompt?: string;
  linkedLineIds?: string[];
  castIds?: string[];
  styleOverrides?: unknown;
  timelineConfig?: unknown;
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

function normalizePercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function requestHash(value: unknown) {
  return createHash('sha256').update(safeJson(value)).digest('hex');
}

function isActiveRunStatus(status?: string | null) {
  return ACTIVE_RUN_STATUSES.includes(status as any);
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  return parseJson<T>(value, fallback);
}

function sceneTextFromLineIds(linkedLineIds: string[], lines: any[]) {
  const linked = lines.filter((line) => linkedLineIds.includes(line.id));
  return linked.map((line) => line.text).filter(Boolean).join(' ');
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

function hasAudioInputPatch(data: Record<string, unknown>) {
  return [
    'audioUrl',
    'audioStorageKey',
    'originalAudioUrl',
    'originalAudioStorageKey',
    'audioDurationMs',
    'trimStartMs',
    'trimEndMs',
  ].some((key) => Object.prototype.hasOwnProperty.call(data, key));
}

function normalizeClipMs(params: { startMs?: unknown; endMs?: unknown; durationMs?: unknown }) {
  const sourceDurationMs = Math.max(0, Math.round(Number(params.durationMs) || 0));
  const maxStartMs = sourceDurationMs > 1000 ? sourceDurationMs - 1000 : Number.POSITIVE_INFINITY;
  const startMs = Math.max(0, Math.min(Math.round(Number(params.startMs) || 0), maxStartMs));
  const requestedEndMs = Math.max(startMs + 1000, Math.round(Number(params.endMs) || sourceDurationMs || startMs + 1000));
  const endMs = sourceDurationMs > 0 ? Math.min(requestedEndMs, sourceDurationMs) : requestedEndMs;
  return {
    startMs,
    endMs: Math.max(startMs + 1000, endMs),
    durationMs: Math.max(1000, Math.max(startMs + 1000, endMs) - startMs),
  };
}

async function prepareAudioClipForTranscription(params: { userId: string; project: any }) {
  const existingProcessedUrl = params.project.processedAudioUrl || '';
  if (existingProcessedUrl && params.project.audioUrl === existingProcessedUrl) {
    console.info('[lyric-video] reusing existing processed audio', {
      projectId: params.project.id,
      processedAudioUrl: existingProcessedUrl,
    });
    await db()
      .update(lyricVideoProject)
      .set({
        lyricsStatus: 'processing',
        pipelineStage: 'transcription_processing',
        pipelineError: null,
      })
      .where(and(eq(lyricVideoProject.id, params.project.id), eq(lyricVideoProject.userId, params.userId)));
    return params.project;
  }

  const originalAudioUrl = params.project.originalAudioUrl || params.project.audioUrl;
  if (!originalAudioUrl) throw new Error('Upload audio before transcription');

  const clip = normalizeClipMs({
    startMs: params.project.trimStartMs,
    endMs: params.project.trimEndMs,
    durationMs: params.project.audioDurationMs,
  });
  const clipId = getUuid();
  const tmpDir = path.join(process.cwd(), '.next', 'lyric-video-audio', `${params.project.id}-${clipId}`);
  const inputPath = path.join(tmpDir, 'source-audio');
  const outputPath = path.join(tmpDir, 'processed.mp3');
  console.info('[lyric-video] preparing audio clip', {
    projectId: params.project.id,
    originalAudioUrl,
    sourceDurationMs: params.project.audioDurationMs,
    trimStartMs: clip.startMs,
    trimEndMs: clip.endMs,
    clipDurationMs: clip.durationMs,
    ffmpegPath: envConfigs.ffmpeg_path || 'ffmpeg',
    tmpDir,
  });

  await db()
    .update(lyricVideoProject)
    .set({
      lyricsStatus: 'processing',
      pipelineStage: 'audio_processing',
      pipelineError: null,
    })
    .where(and(eq(lyricVideoProject.id, params.project.id), eq(lyricVideoProject.userId, params.userId)));

  try {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(inputPath, await fetchBytes(originalAudioUrl));
    console.info('[lyric-video] running ffmpeg trim', {
      projectId: params.project.id,
      args: ['-ss', String(clip.startMs / 1000), '-i', inputPath, '-t', String(clip.durationMs / 1000), outputPath],
    });
    await execFileAsync(envConfigs.ffmpeg_path || 'ffmpeg', [
      '-y',
      '-ss',
      String(clip.startMs / 1000),
      '-i',
      inputPath,
      '-t',
      String(clip.durationMs / 1000),
      '-vn',
      '-acodec',
      'libmp3lame',
      '-b:a',
      '192k',
      outputPath,
    ]);

    const saved = await saveGeneratedFile({
      body: await readFile(outputPath),
      key: `processed-audio/${params.project.id}-${clipId}.mp3`,
      contentType: 'audio/mpeg',
      localDir: 'processed-audio',
    });
    console.info('[lyric-video] processed audio saved', {
      projectId: params.project.id,
      processedAudioUrl: saved.url,
      processedAudioStorageKey: saved.storageKey,
    });

    const [updated] = await db()
      .update(lyricVideoProject)
      .set({
        audioUrl: saved.url,
        audioStorageKey: saved.storageKey,
        originalAudioUrl,
        originalAudioStorageKey: params.project.originalAudioStorageKey || params.project.audioStorageKey,
        audioDurationMs: clip.durationMs,
        trimStartMs: clip.startMs,
        trimEndMs: clip.endMs,
        processedAudioUrl: saved.url,
        processedAudioStorageKey: saved.storageKey,
        lyricsStatus: 'processing',
        pipelineStage: 'transcription_processing',
        pipelineError: null,
      })
      .where(and(eq(lyricVideoProject.id, params.project.id), eq(lyricVideoProject.userId, params.userId)))
      .returning();

    return updated || {
      ...params.project,
      audioUrl: saved.url,
      audioStorageKey: saved.storageKey,
      originalAudioUrl,
      audioDurationMs: clip.durationMs,
      trimStartMs: clip.startMs,
      trimEndMs: clip.endMs,
      processedAudioUrl: saved.url,
      processedAudioStorageKey: saved.storageKey,
    };
  } catch (error: any) {
    console.error('[lyric-video] audio trim failed', {
      projectId: params.project.id,
      error: error?.message || error,
    });
    throw new Error(error?.message ? `Audio trim failed: ${error.message}` : 'Audio trim failed');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
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

  return { raw: result.raw, lines: lines.filter((line: LyricLineInput) => line.text), words: [] };
}

async function transcribeWithGroqWhisper(params: {
  audioUrl: string;
  configs: Record<string, string>;
  language?: string;
  prompt?: string;
}) {
  const provider = new GroqProvider({
    apiKey: params.configs.groq_api_key,
    baseUrl: params.configs.groq_base_url,
    transcribeModel: params.configs.groq_transcribe_model,
  });
  const result = await provider.transcribe({
    audioUrl: params.audioUrl,
    language: params.language && params.language !== 'auto' ? params.language : undefined,
    prompt: params.prompt,
  });

  return {
    raw: result.raw,
    words: result.words,
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

async function generateStoryPromptWithKieGemini(params: {
  lines: any[];
  project: any;
}) {
  const lyrics = params.lines
    .map((line, index) => `${index + 1}. ${line.text}`)
    .join('\n');
  const prompt = `Write an English visual story prompt for a lyric video.
Use the lyrics, title, style, palette, and format to create a cinematic concept that an image/storyboard generator can follow.
Return only the story text, no markdown, no headings, no bullet points.
Length: 120-180 English words.
Requirements: consistent characters and setting, clear visual arc from beginning to ending, recurring motifs, emotionally matched to the lyrics, no text, no typography, no subtitles in the images.

Project title: ${params.project.title}
Lyrics language: ${params.project.language || 'auto'}
Art style: ${params.project.artStyle}
Palette: ${params.project.palette}
Aspect ratio: ${params.project.aspectRatio}

Lyrics:
${lyrics}`;

  const result = await callKieGeminiChat({ text: prompt });
  return result.content.replace(/^["']|["']$/g, '').trim();
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
    artStyle: params.artStyle || 'cinematic illustration',
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

  const [lines, scenes, exports, words, cast, runs] = await Promise.all([
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
  ]);

  const generationRun = runs[0] || null;
  const generationSteps = generationRun
    ? await db()
        .select()
        .from(lyricVideoGenerationStep)
        .where(and(eq(lyricVideoGenerationStep.runId, generationRun.id), eq(lyricVideoGenerationStep.userId, params.userId)))
        .orderBy(lyricVideoGenerationStep.sort)
    : [];

  const normalizedProject = {
    ...project,
    previewConfig: parseJsonField(project.previewConfig, LYRIC_VIDEO_DEFAULT_STYLE),
  };

  const normalizedLines = lines.map((line: any) => ({
    ...line,
    words: words.filter((word: any) => word.lineId === line.id),
  }));

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
    };
  });

  return {
    project: normalizedProject,
    generationRun,
    generationSteps,
    words,
    lines: normalizedLines,
    scenes: normalizedScenes,
    cast,
    exports,
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

export async function startGenerationRun(params: {
  userId: string;
  projectId: string;
  idempotencyKey?: string;
  input?: unknown;
}) {
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
      return { run: activeRun, steps, reused: true };
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
        requestHash: requestHash(inputSnapshot),
        inputSnapshot: safeJson(inputSnapshot),
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
          maxAttempts: stage === 'image_generation' ? 2 : 3,
          inputJson: index === 0 ? safeJson(inputSnapshot) : undefined,
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

    return { run, steps, reused: false };
  });
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
  words?: LyricWordInput[];
  runId?: string;
  source?: string;
}) {
  const project = await getProject({ userId: params.userId, id: params.projectId });
  if (!project) throw new Error('Project not found');

  const cleanLines = params.lines
    .map((line) => ({
      text: line.text.trim(),
      startMs: Math.max(0, line.startMs || 0),
      endMs: Math.max(line.startMs || 0, line.endMs || 0),
      source: line.source || params.source || 'manual',
      wordStartIndex: line.wordStartIndex,
      wordEndIndex: line.wordEndIndex,
      confidence: line.confidence,
    }))
    .filter((line) => line.text);

  const cleanWords = (params.words || [])
    .map((word) => ({
      word: word.word.trim(),
      startMs: Math.max(0, word.startMs || 0),
      endMs: Math.max(word.startMs || 0, word.endMs || 0),
      confidence: word.confidence,
    }))
    .filter((word) => word.word);

  return db().transaction(async (tx: any) => {
    await tx
      .delete(lyricVideoWord)
      .where(and(eq(lyricVideoWord.projectId, params.projectId), eq(lyricVideoWord.userId, params.userId)));

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
      runId: params.runId,
      source: line.source,
      wordStartIndex: line.wordStartIndex,
      wordEndIndex: line.wordEndIndex,
      confidence: line.confidence,
    }));

    const inserted = values.length > 0 ? await tx.insert(lyricVideoLine).values(values).returning() : [];

    if (cleanWords.length > 0) {
      const wordValues = cleanWords.map((word, index) => {
        const line = inserted.find((item: any) => word.startMs >= item.startMs && word.endMs <= item.endMs);
        return {
          id: getUuid(),
          projectId: params.projectId,
          userId: params.userId,
          runId: params.runId,
          lineId: line?.id,
          sort: index,
          word: word.word,
          startMs: word.startMs,
          endMs: word.endMs || word.startMs + 1,
          confidence: word.confidence,
        };
      });
      await tx.insert(lyricVideoWord).values(wordValues);
    }

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
  const configs = await getAllConfigs();
  const transcriptionProvider = params.rawLyrics ? 'manual' : configs.groq_api_key ? 'groq' : 'kie';
  const transcriptionModel = params.rawLyrics
    ? 'manual-lyrics'
    : configs.groq_api_key
      ? configs.groq_transcribe_model
      : configs.kie_chat_model;

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
    console.info('[lyric-video] transcription draft started', {
      projectId: params.projectId,
      provider: transcriptionProvider,
      model: transcriptionModel,
      hasRawLyrics: Boolean(params.rawLyrics),
      originalAudioUrl: project.originalAudioUrl,
      audioUrl: project.audioUrl,
      processedAudioUrl: project.processedAudioUrl,
      trimStartMs: project.trimStartMs,
      trimEndMs: project.trimEndMs,
    });
    if (!params.rawLyrics && !(project.originalAudioUrl || project.audioUrl)) {
      throw new Error('Upload audio before transcription');
    }
    const transcriptionProject = params.rawLyrics
      ? project
      : await prepareAudioClipForTranscription({
          userId: params.userId,
          project,
        });
    const transcriptionAudioUrl = transcriptionProject.processedAudioUrl || transcriptionProject.audioUrl;
    console.info('[lyric-video] transcription audio selected', {
      projectId: params.projectId,
      transcriptionAudioUrl,
      audioDurationMs: transcriptionProject.audioDurationMs,
      trimStartMs: transcriptionProject.trimStartMs,
      trimEndMs: transcriptionProject.trimEndMs,
    });

    const result = params.rawLyrics
      ? { raw: { text: params.rawLyrics, source: 'manual' }, lines: parseLinesFromText(params.rawLyrics), words: [] }
      : configs.groq_api_key
        ? await transcribeWithGroqWhisper({
            audioUrl: transcriptionAudioUrl || '',
            configs,
            language: project.language || 'auto',
            prompt: project.title,
          })
        : await transcribeWithKieGemini(transcriptionAudioUrl || '');

    const lines = await replaceLyrics({
      userId: params.userId,
      projectId: params.projectId,
      lines: result.lines,
      words: result.words,
      source: params.rawLyrics ? 'manual' : 'asr',
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

    console.info('[lyric-video] transcription draft succeeded', {
      projectId: params.projectId,
      lineCount: lines.length,
      wordCount: result.words?.length || 0,
      firstLine: lines[0],
    });
    return lines;
  } catch (error: any) {
    console.error('[lyric-video] transcription draft failed', {
      projectId: params.projectId,
      error: error?.message || error,
    });
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

export async function generateStoryPrompt(params: {
  userId: string;
  projectId: string;
}) {
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');
  if (details.lines.length === 0) throw new Error('Generate lyrics before creating a story');

  const task = await createTask({
    userId: params.userId,
    mediaType: 'text',
    provider: 'kie',
    model: envConfigs.kie_chat_model,
    prompt: [
      `title: ${details.project.title}`,
      `style: ${details.project.artStyle}`,
      `palette: ${details.project.palette}`,
      `lyrics: ${details.lines.map((line: any) => line.text).join('\n')}`,
    ].join('\n\n'),
    costCredits: 0,
    options: { projectId: params.projectId, stage: 'story_prompt' },
  });

  try {
    const storyPrompt = await generateStoryPromptWithKieGemini({
      lines: details.lines,
      project: details.project,
    });

    if (!storyPrompt) {
      throw new Error('Story generation returned empty content');
    }

    const [project] = await db()
      .update(lyricVideoProject)
      .set({
        storyPrompt,
        pipelineError: null,
      })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)))
      .returning();

    await updateTask({
      taskId: task.id,
      status: AITaskStatus.SUCCESS,
      taskResult: { storyPrompt },
    });

    return { storyPrompt, project, taskId: task.id };
  } catch (error: any) {
    await updateTask({
      taskId: task.id,
      status: AITaskStatus.FAILED,
      taskResult: { error: error?.message || 'Generate story failed' },
    });
    throw error;
  }
}

export async function replaceScenes(params: {
  userId: string;
  projectId: string;
  scenes: SceneInput[];
  runId?: string;
}) {
  const project = await getProject({ userId: params.userId, id: params.projectId });
  if (!project) throw new Error('Project not found');
  const existingLines = await db()
    .select()
    .from(lyricVideoLine)
    .where(and(eq(lyricVideoLine.projectId, params.projectId), eq(lyricVideoLine.userId, params.userId)))
    .orderBy(lyricVideoLine.sort);

  const cleanScenes = params.scenes
    .map((scene) => ({
      text: scene.text?.trim() || sceneTextFromLineIds(scene.linkedLineIds || [], existingLines),
      prompt: scene.prompt.trim(),
      negativePrompt: scene.negativePrompt?.trim() || '',
      linkedLineIds: scene.linkedLineIds || [],
      castIds: scene.castIds || [],
      styleOverrides: scene.styleOverrides || {},
      timelineConfig: scene.timelineConfig || {},
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
      runId: params.runId,
      text: scene.text,
      prompt: scene.prompt,
      negativePrompt: scene.negativePrompt,
      linkedLineIds: safeJson(scene.linkedLineIds),
      castIds: safeJson(scene.castIds),
      styleOverrides: safeJson(scene.styleOverrides),
      timelineConfig: safeJson(scene.timelineConfig),
      motionPrompt: scene.motionPrompt,
      imageUrl: scene.imageUrl,
      imagePromptSnapshot: scene.prompt,
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
  text?: string;
  prompt?: string;
  negativePrompt?: string;
  motionPrompt?: string;
  castIds?: string[];
  styleOverrides?: unknown;
  timelineConfig?: unknown;
}) {
  const updateData: any = {};
  if (typeof params.text === 'string') updateData.text = params.text.trim();
  if (typeof params.prompt === 'string') updateData.prompt = params.prompt.trim();
  if (typeof params.negativePrompt === 'string') updateData.negativePrompt = params.negativePrompt.trim();
  if (typeof params.motionPrompt === 'string') updateData.motionPrompt = params.motionPrompt.trim();
  if (params.castIds) updateData.castIds = safeJson(params.castIds);
  if (params.styleOverrides) updateData.styleOverrides = safeJson(params.styleOverrides);
  if (params.timelineConfig) updateData.timelineConfig = safeJson(params.timelineConfig);
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
          attemptCount: (scene.attemptCount || 0) + 1,
          lastAttemptAt: new Date(),
          failureCode: null,
          imageModel: params.model || 'flux-kontext-pro',
          imagePromptSnapshot: scene.prompt,
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
        .set({
          imageTaskId: task.id,
          status: 'failed',
          attemptCount: (scene.attemptCount || 0) + 1,
          lastAttemptAt: new Date(),
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
      }
    } catch (error: any) {
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

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

type AsrDraftResult = {
  raw: any;
  rawText: string;
  rawSegments: LyricLineInput[];
  words: LyricWordInput[];
};

type AudioAnalysisSegment = {
  startMs: number;
  endMs: number;
  durationMs: number;
  avgEnergy: number;
};

type AudioAnalysisRmsPoint = {
  startMs: number;
  endMs: number;
  rms: number;
};

type AudioAnalysisResult = {
  durationSec: number;
  sampleRate: number;
  bpm: number;
  key: string;
  beatTimesMs: number[];
  segmentBoundariesMs: number[];
  rmsBySecond?: AudioAnalysisRmsPoint[];
  segments: AudioAnalysisSegment[];
};

type PreprocessLyricLine = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  wordStartIndex?: number;
  wordEndIndex?: number;
};

type PreprocessEnergySegment = AudioAnalysisSegment & {
  energyLevel: 'low' | 'medium' | 'high';
};

type PreprocessScene = {
  sceneId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  linkedLineIds: string[];
  lyricsText: string;
  avgEnergy: number;
  energyLevel: 'low' | 'medium' | 'high';
  beatCount: number;
  cutReason: 'vocal_gap' | 'target_duration' | 'max_duration' | 'final';
};

type LyricVideoPreprocessResult = {
  track: {
    durationMs: number;
    bpm?: number;
    key?: string;
  };
  lyrics: PreprocessLyricLine[];
  vocalGaps: Array<{
    startMs: number;
    endMs: number;
    durationMs: number;
    fromLineId: string;
    toLineId: string;
  }>;
  energySegments: PreprocessEnergySegment[];
  scenes: PreprocessScene[];
};

type LyricVideoLlmPreprocessResult = {
  song: string;
  duration_s: number;
  bpm?: number;
  key?: string;
  lines: Array<{
    start_s: number;
    end_s: number;
    text: string;
  }>;
  energy_per_second: number[];
};

type LyricVideoSongAnalysisResult = {
  theme: string;
  characters: Array<{
    id: string;
    description: string;
  }>;
  emotion_arc: Array<{
    time_range: string;
    emotion: string;
    intensity: number;
  }>;
  visual_style: string;
  color_palette: string[];
  notes: string;
};

type LyricVideoPromptSceneResult = {
  scene_id: number;
  start_s: number;
  end_s: number;
  lyrics_summary: string;
  image_prompt: string;
  video_prompt: string;
};

type DebugSongAnalysisProvider = 'kie_claude' | 'kie_codex' | 'kie_gemini';

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

function chatContentToText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) return String((part as any).text || '');
        if (part && typeof part === 'object' && 'content' in part) return chatContentToText((part as any).content);
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (value && typeof value === 'object') return JSON.stringify(value);
  return '';
}

function parseJsonLoose<T>(value: unknown, fallback: T): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as T;
  if (Array.isArray(value)) return value as T;

  const text = chatContentToText(value).trim();
  if (!text) return fallback;

  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(text.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(text.slice(arrayStart, arrayEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next likely JSON shape.
    }
  }

  return fallback;
}

function previewText(value: unknown, maxLength = 1200) {
  return chatContentToText(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
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

function asrSnapshot(params: {
  provider: string;
  model: string;
  result: AsrDraftResult;
  audioAnalysis?: AudioAnalysisResult;
  audioAnalysisError?: string;
}) {
  return {
    provider: params.provider,
    model: params.model,
    rawText: params.result.rawText,
    rawSegments: params.result.rawSegments,
    words: params.result.words,
    raw: params.result.raw,
    audioAnalysis: params.audioAnalysis,
    audioAnalysisError: params.audioAnalysisError,
    createdAt: new Date().toISOString(),
  };
}

function readAsrSnapshot(project: any) {
  const parsed = parseJson<any>(project.transcriptionRaw, {});
  const rawText = String(parsed.rawText || parsed.text || parsed.raw?.text || '').trim();
  const rawSegments = Array.isArray(parsed.rawSegments)
    ? parsed.rawSegments
    : Array.isArray(parsed.segments)
      ? parsed.segments
      : Array.isArray(parsed.raw?.segments)
        ? parsed.raw.segments
        : [];

  return {
    rawText,
    audioAnalysis: parsed.audioAnalysis as AudioAnalysisResult | undefined,
    audioAnalysisError: typeof parsed.audioAnalysisError === 'string' ? parsed.audioAnalysisError : undefined,
    rawSegments: rawSegments
      .map((segment: any, index: number) => ({
        startMs: Math.max(0, Number(segment.startMs) || Number(segment.start) * 1000 || index * 4000),
        endMs: Math.max(
          Number(segment.startMs) || Number(segment.start) * 1000 || index * 4000,
          Number(segment.endMs) || Number(segment.end) * 1000 || index * 4000 + 3500
        ),
        text: String(segment.text || '').trim(),
      }))
      .filter((segment: LyricLineInput) => segment.text),
  };
}

function readAudioAnalysis(project: any): AudioAnalysisResult | undefined {
  const parsed = parseJson<any>(project?.transcriptionRaw, {});
  if (!parsed.audioAnalysis || typeof parsed.audioAnalysis !== 'object') return undefined;
  return parsed.audioAnalysis as AudioAnalysisResult;
}

function audioAnalysisPromptSummary(project: any) {
  const analysis = readAudioAnalysis(project);
  if (!analysis) return '';

  const segments = (analysis.segments || [])
    .slice(0, 8)
    .map(
      (segment, index) =>
        `${index + 1}. ${segment.startMs}-${segment.endMs}ms energy=${Number(segment.avgEnergy || 0).toFixed(5)}`
    )
    .join('\n');

  const beats = (analysis.beatTimesMs || [])
    .slice(0, 16)
    .map((time) => `${time}ms`)
    .join(', ');

  return [
    `Audio analysis: BPM ${analysis.bpm || 'unknown'}, key ${analysis.key || 'unknown'}, duration ${analysis.durationSec || 0}s.`,
    beats ? `Early beat times: ${beats}.` : '',
    segments ? `Energy segments:\n${segments}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function energyLevelForValue(value: number, min: number, max: number): 'low' | 'medium' | 'high' {
  if (!Number.isFinite(value) || max <= min) return 'medium';
  const normalized = (value - min) / (max - min);
  if (normalized < 0.34) return 'low';
  if (normalized < 0.67) return 'medium';
  return 'high';
}

function normalizePreprocessLyrics(params: {
  rawText?: string;
  rawSegments?: any[];
  words?: any[];
}): PreprocessLyricLine[] {
  const candidateSegments = Array.isArray(params.rawSegments) ? params.rawSegments : [];
  const lines =
    candidateSegments.length > 0
      ? candidateSegments
          .map((segment, index) => {
            const startMs =
              segment.startMs !== undefined
                ? Math.max(0, Math.round(Number(segment.startMs) || 0))
                : secondsToMs(segment.start ?? index * 4);
            const endMs =
              segment.endMs !== undefined
                ? Math.max(startMs + 500, Math.round(Number(segment.endMs) || 0))
                : Math.max(startMs + 500, secondsToMs(segment.end ?? index * 4 + 3.5));
            return {
              id: segment.id || `line_${index + 1}`,
              startMs,
              endMs,
              text: String(segment.text || '').trim(),
              wordStartIndex: Number.isFinite(Number(segment.wordStartIndex)) ? Number(segment.wordStartIndex) : undefined,
              wordEndIndex: Number.isFinite(Number(segment.wordEndIndex)) ? Number(segment.wordEndIndex) : undefined,
            };
          })
          .filter((line) => line.text)
      : parseLinesFromText(params.rawText || '').map((line, index) => ({
          id: `line_${index + 1}`,
          startMs: line.startMs || index * 4000,
          endMs: line.endMs || index * 4000 + 3500,
          text: line.text,
        }));

  return lines
    .sort((a, b) => a.startMs - b.startMs)
    .map((line, index) => ({
      ...line,
      id: line.id || `line_${index + 1}`,
      endMs: Math.max(line.startMs + 500, line.endMs),
    }));
}

function buildEnergySegments(audioAnalysis?: AudioAnalysisResult): PreprocessEnergySegment[] {
  const segments = (audioAnalysis?.segments || []).filter((segment) => segment.endMs > segment.startMs);
  if (segments.length === 0) return [];

  const values = segments.map((segment) => Number(segment.avgEnergy) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return segments.map((segment) => ({
    ...segment,
    energyLevel: energyLevelForValue(Number(segment.avgEnergy) || 0, min, max),
  }));
}

function findEnergyForRange(
  startMs: number,
  endMs: number,
  energySegments: PreprocessEnergySegment[]
): { avgEnergy: number; energyLevel: 'low' | 'medium' | 'high' } {
  const overlaps = energySegments
    .map((segment) => {
      const overlapMs = Math.max(0, Math.min(endMs, segment.endMs) - Math.max(startMs, segment.startMs));
      return { segment, overlapMs };
    })
    .filter((item) => item.overlapMs > 0);

  if (overlaps.length === 0) return { avgEnergy: 0, energyLevel: 'medium' };

  const totalMs = overlaps.reduce((sum, item) => sum + item.overlapMs, 0);
  const avgEnergy = overlaps.reduce((sum, item) => sum + item.overlapMs * item.segment.avgEnergy, 0) / Math.max(1, totalMs);
  const strongest = overlaps.sort((a, b) => b.overlapMs - a.overlapMs)[0]?.segment;
  return {
    avgEnergy: Number(avgEnergy.toFixed(6)),
    energyLevel: strongest?.energyLevel || 'medium',
  };
}

function countBeatsInRange(startMs: number, endMs: number, beatTimesMs?: number[]) {
  return (beatTimesMs || []).filter((time) => time >= startMs && time < endMs).length;
}

function mergeShortScenes(scenes: PreprocessScene[], minSceneMs: number, maxScenes: number) {
  const merged: PreprocessScene[] = [];
  for (const scene of scenes) {
    const previous = merged[merged.length - 1];
    if (previous && (scene.durationMs < minSceneMs || merged.length >= maxScenes)) {
      previous.endMs = scene.endMs;
      previous.durationMs = previous.endMs - previous.startMs;
      previous.linkedLineIds = [...previous.linkedLineIds, ...scene.linkedLineIds];
      previous.lyricsText = [previous.lyricsText, scene.lyricsText].filter(Boolean).join(' ');
      previous.beatCount += scene.beatCount;
      previous.cutReason = scene.cutReason;
    } else {
      merged.push({ ...scene });
    }
  }
  return merged.map((scene, index) => ({ ...scene, sceneId: `scene_${index + 1}` }));
}

export function preprocessLyricVideoAnalysis(params: {
  transcription?: {
    rawText?: string;
    rawSegments?: any[];
    words?: any[];
  };
  audioAnalysis?: AudioAnalysisResult;
}): LyricVideoPreprocessResult {
  const lyrics = normalizePreprocessLyrics({
    rawText: params.transcription?.rawText,
    rawSegments: params.transcription?.rawSegments,
    words: params.transcription?.words,
  });
  if (lyrics.length === 0) throw new Error('No lyric lines available for preprocessing');

  const energySegments = buildEnergySegments(params.audioAnalysis);
  const durationMs = Math.max(
    Math.round((params.audioAnalysis?.durationSec || 0) * 1000),
    ...lyrics.map((line) => line.endMs)
  );
  const vocalGaps = lyrics
    .slice(0, -1)
    .map((line, index) => {
      const nextLine = lyrics[index + 1];
      return {
        startMs: line.endMs,
        endMs: nextLine.startMs,
        durationMs: Math.max(0, nextLine.startMs - line.endMs),
        fromLineId: line.id,
        toLineId: nextLine.id,
      };
    })
    .filter((gap) => gap.durationMs > 0);

  const targetSceneCount = Math.max(3, Math.min(8, Math.ceil(durationMs / 8000)));
  const minSceneMs = 2000;
  const targetSceneMs = Math.max(4000, Math.min(10000, Math.ceil(durationMs / targetSceneCount)));
  const maxSceneMs = Math.max(10000, targetSceneMs + 3000);
  const scenes: PreprocessScene[] = [];
  let currentLines: PreprocessLyricLine[] = [];
  let currentStartMs = lyrics[0].startMs;

  const flushScene = (endMs: number, cutReason: PreprocessScene['cutReason']) => {
    if (currentLines.length === 0) return;
    const safeEndMs = Math.max(currentStartMs + 500, endMs);
    const energy = findEnergyForRange(currentStartMs, safeEndMs, energySegments);
    scenes.push({
      sceneId: `scene_${scenes.length + 1}`,
      startMs: currentStartMs,
      endMs: safeEndMs,
      durationMs: safeEndMs - currentStartMs,
      linkedLineIds: currentLines.map((line) => line.id),
      lyricsText: currentLines.map((line) => line.text).join(' '),
      avgEnergy: energy.avgEnergy,
      energyLevel: energy.energyLevel,
      beatCount: countBeatsInRange(currentStartMs, safeEndMs, params.audioAnalysis?.beatTimesMs),
      cutReason,
    });
    currentLines = [];
  };

  for (let index = 0; index < lyrics.length; index += 1) {
    const line = lyrics[index];
    if (currentLines.length === 0) currentStartMs = line.startMs;
    currentLines.push(line);

    const nextLine = lyrics[index + 1];
    const sceneDurationMs = line.endMs - currentStartMs;
    const gapToNextMs = nextLine ? Math.max(0, nextLine.startMs - line.endMs) : 0;
    const hasEnoughScenesLeft = scenes.length + 1 < targetSceneCount;
    const shouldCutOnVocalGap = hasEnoughScenesLeft && gapToNextMs >= 1000 && sceneDurationMs >= 4000;
    const shouldCutOnTarget = hasEnoughScenesLeft && sceneDurationMs >= targetSceneMs;
    const shouldCutOnMax = sceneDurationMs >= maxSceneMs;

    if (!nextLine) {
      flushScene(line.endMs, 'final');
    } else if (shouldCutOnVocalGap) {
      flushScene(line.endMs, 'vocal_gap');
    } else if (shouldCutOnMax) {
      flushScene(line.endMs, 'max_duration');
    } else if (shouldCutOnTarget) {
      flushScene(line.endMs, 'target_duration');
    }
  }

  const mergedScenes = mergeShortScenes(scenes, minSceneMs, 8);
  return {
    track: {
      durationMs,
      bpm: params.audioAnalysis?.bpm,
      key: params.audioAnalysis?.key,
    },
    lyrics,
    vocalGaps,
    energySegments,
    scenes: mergedScenes,
  };
}

function secondsFromMs(ms: number) {
  return Number((Math.max(0, ms) / 1000).toFixed(3));
}

function titleFromFilename(filename?: string) {
  return (filename || 'Untitled song').replace(/\.[^/.]+$/, '').trim() || 'Untitled song';
}

export function preprocessLyricVideoForLlm(params: {
  song?: string;
  transcription?: {
    rawText?: string;
    rawSegments?: any[];
    words?: any[];
  };
  audioAnalysis?: AudioAnalysisResult;
}): LyricVideoLlmPreprocessResult {
  const lyrics = normalizePreprocessLyrics({
    rawText: params.transcription?.rawText,
    rawSegments: params.transcription?.rawSegments,
    words: params.transcription?.words,
  });
  if (lyrics.length === 0) throw new Error('No lyric lines available for preprocessing');

  const durationMs = Math.max(
    Math.round((params.audioAnalysis?.durationSec || 0) * 1000),
    ...lyrics.map((line) => line.endMs)
  );

  return {
    song: params.song || 'Untitled song',
    duration_s: Number((durationMs / 1000).toFixed(3)),
    bpm: params.audioAnalysis?.bpm,
    key: params.audioAnalysis?.key,
    lines: lyrics.map((line) => ({
      start_s: secondsFromMs(line.startMs),
      end_s: secondsFromMs(line.endMs),
      text: line.text,
    })),
    energy_per_second: (params.audioAnalysis?.rmsBySecond || []).map((point) => Number(point.rms || 0)),
  };
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
        lyricsStatus: 'asr_processing',
        pipelineStage: 'asr_processing',
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
      lyricsStatus: 'asr_processing',
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
        lyricsStatus: 'asr_processing',
        pipelineStage: 'asr_processing',
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

async function analyzeAudioWithLibrosa(params: {
  projectId: string;
  audioUrl?: string | null;
}): Promise<{ audioAnalysis?: AudioAnalysisResult; audioAnalysisError?: string }> {
  if (!params.audioUrl) return { audioAnalysisError: 'No audio URL available for analysis' };

  const analysisId = getUuid();
  const tmpDir = path.join(process.cwd(), '.next', 'lyric-video-audio-analysis', `${params.projectId}-${analysisId}`);
  const inputPath = path.join(tmpDir, 'audio');

  try {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(inputPath, await fetchBytes(params.audioUrl));
    return { audioAnalysis: await runLibrosaAnalysisForLocalFile(inputPath) };
  } catch (error: any) {
    const message = [error?.message, error?.stderr || error?.stdout]
      .filter(Boolean)
      .join('\n')
      .trim();
    console.warn('[lyric-video] audio analysis failed', {
      projectId: params.projectId,
      error: message || error,
    });
    return { audioAnalysisError: message || 'Audio analysis failed' };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function runLibrosaAnalysisForLocalFile(inputPath: string): Promise<AudioAnalysisResult> {
  const scriptPath = path.join(process.cwd(), 'scripts', 'analyze_audio.py');
  const pythonPath = process.env.LYRIC_VIDEO_PYTHON_PATH || 'python3';
  const { stdout } = (await execFileAsync(pythonPath, [scriptPath, '--input', inputPath], {
    cwd: process.cwd(),
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  })) as { stdout: string; stderr: string };

  return JSON.parse(stdout) as AudioAnalysisResult;
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
  model?: string;
}) {
  const configs = await getAllConfigs();
  const apiKey = configs.kie_api_key;
  const model = params.model || configs.kie_chat_model || 'gemini-2.5-flash';
  const endpoint =
    params.model && /^gemini-[a-z0-9.-]+$/i.test(params.model)
      ? `https://api.kie.ai/${params.model}/v1/chat/completions`
      : configs.kie_chat_endpoint || 'https://api.kie.ai/gemini-2.5-flash/v1/chat/completions';

  if (!apiKey) {
    throw new Error('Kie API key is required. Add it in Admin Settings > AI.');
  }

  const content: any[] = [{ type: 'text', text: params.text }];
  if (params.mediaUrl) {
    content.push({ type: 'image_url', image_url: { url: params.mediaUrl } });
  }

  const requestBody: Record<string, unknown> = {
    model,
    stream: false,
    messages: [{ role: 'user', content }],
    response_format: params.responseFormat,
  };
  if (model === 'gemini-3.1-pro') {
    requestBody.include_thoughts = false;
    requestBody.reasoning_effort = 'high';
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kie Gemini chat failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const contentText = chatContentToText(data.choices?.[0]?.message?.content || '');
  return { model: data.model || model, raw: data, content: contentText };
}

async function callKieClaudeMessages(params: {
  text: string;
  model?: string;
  maxTokens?: number;
  thinkingFlag?: boolean;
}) {
  const configs = await getAllConfigs();
  const apiKey = configs.kie_api_key;
  const endpoint = configs.kie_claude_endpoint || 'https://api.kie.ai/claude/v1/messages';
  const model = params.model || configs.kie_claude_model || 'claude-sonnet-4-5';

  if (!apiKey) {
    throw new Error('Kie API key is required. Add it in Admin Settings > AI.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: params.text }],
      stream: false,
      thinkingFlag: params.thinkingFlag ?? true,
      max_tokens: params.maxTokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kie Claude messages failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return {
    model: data.model || model,
    raw: data,
    content: chatContentToText(data.content || ''),
  };
}

async function callKieCodexResponses(params: {
  text: string;
  model?: string;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
}) {
  const configs = await getAllConfigs();
  const apiKey = configs.kie_api_key;
  const endpoint = configs.kie_codex_endpoint || 'https://api.kie.ai/codex/v1/responses';
  const model = params.model || configs.kie_codex_model || 'gpt-5-4';

  if (!apiKey) {
    throw new Error('Kie API key is required. Add it in Admin Settings > AI.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: false,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: params.text }],
        },
      ],
      reasoning: { effort: params.reasoningEffort || 'medium' },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kie Codex responses failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return {
    model: data.model || model,
    raw: data,
    content: chatContentToText(data.output_text || data.output || data.content || ''),
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeIntensity(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.5;
  return Math.max(0, Math.min(1, Number(num.toFixed(2))));
}

function normalizeSongAnalysis(
  parsed: any
): LyricVideoSongAnalysisResult {
  const characters = Array.isArray(parsed?.characters) ? parsed.characters : [];
  const emotionArc = Array.isArray(parsed?.emotion_arc) ? parsed.emotion_arc : [];
  return {
    theme: String(parsed?.theme || '').trim(),
    characters: characters
      .map((item: any, index: number) => ({
        id: String(item?.id || `char_${index + 1}`).trim(),
        description: String(item?.description || '').trim(),
      }))
      .filter((item: LyricVideoSongAnalysisResult['characters'][number]) => item.description),
    emotion_arc: emotionArc
      .map((item: any) => ({
        time_range: String(item?.time_range || '').trim(),
        emotion: String(item?.emotion || '').trim(),
        intensity: normalizeIntensity(item?.intensity),
      }))
      .filter((item: LyricVideoSongAnalysisResult['emotion_arc'][number]) => item.time_range && item.emotion),
    visual_style: String(parsed?.visual_style || '').trim(),
    color_palette: stringArray(parsed?.color_palette).slice(0, 5),
    notes: String(parsed?.notes || '').trim(),
  };
}

function buildSongAnalysisPrompt(preprocess: LyricVideoLlmPreprocessResult) {
  return `你是一位音乐视觉化导演。根据以下歌曲数据，分析这首歌并输出创意方向。

## 歌曲数据
${JSON.stringify(preprocess)}

## 你的任务
分析歌词含义、情绪走向和能量变化，输出以下 JSON（不要输出其他内容）：

{
  "theme": "一句话概括这首歌的核心主题",
  "characters": [
    {
      "id": "char_1",
      "description": "主角的外貌、穿着、气质（用于后续生图保持一致）"
    }
  ],
  "emotion_arc": [
    {
      "time_range": "0s-29s",
      "emotion": "当前段落的情绪关键词",
      "intensity": 0.4
    }
  ],
  "visual_style": "整体画面风格（如：电影感写实 / 日系动画 / 赛博朋克等）",
  "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "notes": "任何影响视觉的补充说明（如季节、光线、年代感）"
}

## 要求
- emotion_arc 要覆盖整首歌，按歌词内容和 energy_per_second 的变化来划分段落
- intensity 范围 0-1，要参考 energy_per_second 数据
- characters 描述要具体到可以直接用于 AI 生图
- color_palette 要与歌曲情绪和 visual_style 匹配
- 只输出 JSON，不要解释`;
}

export async function analyzeSongWithKieForDebug(params: {
  preprocess: LyricVideoLlmPreprocessResult;
  provider?: DebugSongAnalysisProvider;
  model?: string;
}) {
  const provider = params.provider || 'kie_claude';
  if (!['kie_claude', 'kie_codex', 'kie_gemini'].includes(provider)) {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
  if (!params.preprocess || !Array.isArray(params.preprocess.lines) || params.preprocess.lines.length === 0) {
    throw new Error('preprocess.lines is required for song analysis');
  }

  const prompt = buildSongAnalysisPrompt(params.preprocess);
  const result =
    provider === 'kie_codex'
      ? await callKieCodexResponses({ text: prompt, model: params.model })
      : provider === 'kie_gemini'
        ? await callKieGeminiChat({ text: prompt, model: params.model })
        : await callKieClaudeMessages({ text: prompt, model: params.model, thinkingFlag: true, maxTokens: 4096 });

  const parsed = parseJsonLoose<any>(result.content, {});
  return {
    provider,
    model: params.model || result.model,
    actualModel: result.model,
    songAnalysis: normalizeSongAnalysis(parsed),
    rawText: result.content,
    raw: result.raw,
  };
}

export async function analyzeSongWithKieClaudeForDebug(preprocess: LyricVideoLlmPreprocessResult) {
  return analyzeSongWithKieForDebug({ preprocess, provider: 'kie_claude' });
}

function normalizePromptScenes(parsed: any): LyricVideoPromptSceneResult[] {
  const scenes = Array.isArray(parsed?.scenes) ? parsed.scenes : Array.isArray(parsed) ? parsed : [];
  return scenes
    .map((scene: any, index: number) => {
      const start = Number(scene?.start_s ?? scene?.start ?? 0);
      const end = Number(scene?.end_s ?? scene?.end ?? start + 10);
      return {
        scene_id: Number(scene?.scene_id || scene?.id || index + 1),
        start_s: Number.isFinite(start) ? Math.max(0, Number(start.toFixed(3))) : 0,
        end_s: Number.isFinite(end) ? Math.max(0, Number(end.toFixed(3))) : 0,
        lyrics_summary: String(scene?.lyrics_summary || '').trim(),
        image_prompt: String(scene?.image_prompt || '').trim(),
        video_prompt: String(scene?.video_prompt || '').trim(),
      };
    })
    .filter((scene: LyricVideoPromptSceneResult) => scene.end_s > scene.start_s && scene.image_prompt && scene.video_prompt)
    .slice(0, 8)
    .map((scene: LyricVideoPromptSceneResult, index: number) => ({
      ...scene,
      scene_id: index + 1,
    }));
}

function buildStoryboardScenesPrompt(params: {
  songAnalysis: LyricVideoSongAnalysisResult;
  preprocess: LyricVideoLlmPreprocessResult;
}) {
  const bpm = Number(params.preprocess.bpm || 0);
  const beatSeconds = bpm > 0 ? Number((60 / bpm).toFixed(2)) : undefined;
  const bpmText = bpm > 0 ? `${bpm}${beatSeconds ? ` (约每拍 ${beatSeconds}s)` : ''}` : 'unknown';

  return `你是一位音乐 MV 分镜师。根据以下歌曲理解和歌词时间线，为这首歌设计 4-8 个视觉分镜。

## 歌曲理解
${JSON.stringify(params.songAnalysis)}

## 歌词时间线
${JSON.stringify(params.preprocess.lines || [])}

## 你的任务
将歌词按叙事节奏合并为 4-8 个 scene，每个 scene 输出以下 JSON：

{
  "scenes": [
    {
      "scene_id": 1,
      "start_s": 0,
      "end_s": 29,
      "lyrics_summary": "这个场景涵盖的歌词概要",
      "image_prompt": "用英文写的静态画面描述，包含人物外貌、动作、环境、光线、色调、构图，风格与 visual_style 一致，适用于 Midjourney/Flux 出图",
      "video_prompt": "用英文写的运动描述，包含镜头运动（推/拉/摇/跟）、主体运动、特效（风/尘/光粒子），节奏需匹配 BPM=${bpm || 'unknown'}"
    }
  ]
}

## 要求
- 合并相邻歌词行为一个 scene，每个 scene 时长建议 10-30s
- image_prompt 必须包含 characters 中定义的人物外貌描述，保持一致性
- image_prompt 用英文，适合直接喂给 Midjourney/Flux
- video_prompt 用英文，适合喂给 Kling 首尾帧模式
- video_prompt 中的运动节奏要匹配 BPM ${bpmText}
- color_palette 中的颜色要体现在画面描述中
- emotion_arc 的 intensity 越高，画面运动幅度越大
- 只输出 JSON，不要解释`;
}

export async function generateStoryboardScenesWithKieForDebug(params: {
  songAnalysis: LyricVideoSongAnalysisResult;
  preprocess: LyricVideoLlmPreprocessResult;
  model?: string;
}) {
  if (!params.songAnalysis || typeof params.songAnalysis !== 'object') {
    throw new Error('songAnalysis is required for Prompt 2');
  }
  if (!params.preprocess || !Array.isArray(params.preprocess.lines) || params.preprocess.lines.length === 0) {
    throw new Error('preprocess.lines is required for Prompt 2');
  }

  const model = params.model || 'claude-opus-4-5';
  const prompt = buildStoryboardScenesPrompt({
    songAnalysis: params.songAnalysis,
    preprocess: params.preprocess,
  });
  const result = await callKieClaudeMessages({
    text: prompt,
    model,
    thinkingFlag: true,
    maxTokens: 4096,
  });
  const parsed = parseJsonLoose<any>(result.content, {});

  return {
    provider: 'kie_claude',
    model,
    actualModel: result.model,
    scenes: normalizePromptScenes(parsed),
    rawText: result.content,
    raw: result.raw,
  };
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

  const parsed = parseJsonLoose<any>(result.content, {});
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
  const configs = await getAllConfigs();
  if (!configs.kie_api_key) return fallback;

  const lyrics = params.lines
    .map((line, index) => `${index + 1}. [${line.startMs}-${line.endMs}ms] ${line.text}`)
    .join('\n');
  const audioAnalysis = audioAnalysisPromptSummary(params.project);
  const prompt = `Create a JSON array of static lyric-video visual scenes. Use 1 scene for every 1-3 lyric lines. Return only JSON.
Each item must have: startMs, endMs, prompt, linkedLineIds.
Style: ${params.project.artStyle}. Palette: ${params.project.palette}. Story: ${params.storyPrompt || params.project.storyPrompt || 'emotional cinematic lyric video'}.
${audioAnalysis ? `${audioAnalysis}\nUse BPM, beat timing, and energy changes to decide scene pacing and mood intensity.` : ''}
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
  const parsed = parseJsonLoose<any>(content, {});
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

async function normalizeLyricsWithKieGemini(params: {
  words: any[];
  rawText: string;
  rawSegments: LyricLineInput[];
  project: any;
}): Promise<{
  lines: LyricLineInput[];
  fallbackUsed: boolean;
  fallbackSource?: string;
  llmContentPreview?: string;
}> {
  const timedWords = params.words
    .map((word, index) => `${index}. [${word.startMs}-${word.endMs}ms] ${word.word}`)
    .join('\n');
  const timedSegments = params.rawSegments
    .map((segment, index) => `${index + 1}. [${segment.startMs}-${segment.endMs}ms] ${segment.text}`)
    .join('\n');

  const prompt = `Clean and organize an ASR transcript into lyric lines for a lyric video.
Return only JSON matching the schema. Preserve the original lyric language and repeated chorus lines.
Use the timed words as the source of truth for timestamps. If words are missing, use ASR segments/raw transcript.
Make each line readable as a lyric phrase, not too long. Keep punctuation natural.

Project title: ${params.project.title}
Language hint: ${params.project.language || 'auto'}

Timed words:
${timedWords || '(none)'}

ASR segments:
${timedSegments || '(none)'}

Raw transcript:
${params.rawText || '(none)'}`;

  const result = await callKieGeminiChat({
    text: prompt,
    responseFormat: {
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
              wordStartIndex: { type: 'integer' },
              wordEndIndex: { type: 'integer' },
            },
            required: ['startMs', 'endMs', 'text'],
          },
        },
      },
    },
  });

  const parsed = parseJsonLoose<any>(result.content, {});
  const candidateLines = pickLyricLineArray(parsed);
  const llmContentPreview = previewText(result.content);

  const llmLines = normalizeLyricLineCandidates(candidateLines, 'llm_normalized');
  if (llmLines.length > 0) {
    return { lines: llmLines, fallbackUsed: false, llmContentPreview };
  }

  const fallback = buildLyricsNormalizeFallback(params);
  return {
    lines: fallback.lines,
    fallbackUsed: fallback.lines.length > 0,
    fallbackSource: fallback.source,
    llmContentPreview,
  };
}

function pickLyricLineArray(parsed: any): any[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  if (Array.isArray(parsed.lines)) return parsed.lines;
  if (Array.isArray(parsed.lyrics)) return parsed.lyrics;
  if (Array.isArray(parsed.items)) return parsed.items;
  return [];
}

function normalizeLyricLineCandidates(candidateLines: any[], source: string): LyricLineInput[] {
  if (!Array.isArray(candidateLines)) return [];

  return candidateLines
    .map((line: any, index: number) => {
      const startMs =
        line?.startMs !== undefined
          ? coerceTimestampMs(line.startMs, index * 4000, 'ms')
          : coerceTimestampMs(line?.start, index * 4000, 'auto');
      const endMs = Math.max(
        startMs + 500,
        line?.endMs !== undefined
          ? coerceTimestampMs(line.endMs, startMs + 3500, 'ms')
          : coerceTimestampMs(line?.end, startMs + 3500, 'auto')
      );
      return {
        startMs,
        endMs,
        text: String(line?.text || line?.lyric || line?.line || '').trim(),
        wordStartIndex: Number.isFinite(Number(line?.wordStartIndex)) ? Number(line.wordStartIndex) : undefined,
        wordEndIndex: Number.isFinite(Number(line?.wordEndIndex)) ? Number(line.wordEndIndex) : undefined,
        source,
      };
    })
    .filter((line: LyricLineInput) => line.text);
}

function coerceTimestampMs(value: unknown, fallbackMs: number, unit: 'ms' | 'auto') {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return Math.max(0, Math.round(fallbackMs));
  if (unit === 'ms') return Math.round(num);
  return Math.round(num < 1000 ? num * 1000 : num);
}

function buildLyricsNormalizeFallback(params: {
  words: any[];
  rawText: string;
  rawSegments: LyricLineInput[];
}) {
  const segmentLines = normalizeLyricLineCandidates(params.rawSegments, 'asr_segment_fallback');
  if (segmentLines.length > 0) return { lines: segmentLines, source: 'asr_segments' };

  const wordLines = groupWordsIntoLyricLines(params.words);
  if (wordLines.length > 0) return { lines: wordLines, source: 'asr_words' };

  const textLines = parseLinesFromText(params.rawText).map((line) => ({ ...line, source: 'raw_text_fallback' }));
  return { lines: textLines, source: textLines.length > 0 ? 'raw_text' : undefined };
}

function groupWordsIntoLyricLines(words: any[]): LyricLineInput[] {
  const cleanWords = words
    .map((word, index) => ({
      index,
      text: String(word.word || word.text || '').trim(),
      startMs: Math.max(0, Number(word.startMs) || index * 500),
      endMs: Math.max(Number(word.startMs) || index * 500, Number(word.endMs) || index * 500 + 450),
    }))
    .filter((word) => word.text);

  const lines: LyricLineInput[] = [];
  let group: typeof cleanWords = [];

  const flush = () => {
    if (group.length === 0) return;
    const first = group[0];
    const last = group[group.length - 1];
    lines.push({
      startMs: first.startMs,
      endMs: Math.max(first.startMs + 500, last.endMs),
      text: group.map((word) => word.text).join(' '),
      wordStartIndex: first.index,
      wordEndIndex: last.index,
      source: 'asr_words_fallback',
    });
    group = [];
  };

  for (const word of cleanWords) {
    group.push(word);
    const first = group[0];
    const duration = word.endMs - first.startMs;
    const sentenceBreak = /[.!?。！？]$/.test(word.text);
    if (sentenceBreak || group.length >= 8 || duration >= 4500) flush();
  }
  flush();

  return lines;
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

async function createKieProvider() {
  const configs = await getAllConfigs();
  if (!configs.kie_api_key) {
    throw new Error('Kie API key is required. Add it in Admin Settings > AI.');
  }
  return new KieProvider({
    apiKey: configs.kie_api_key,
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

export async function runAsr(params: {
  userId: string;
  projectId: string;
}) {
  const project = await getProject({ userId: params.userId, id: params.projectId });
  if (!project) throw new Error('Project not found');
  if (!(project.originalAudioUrl || project.audioUrl)) throw new Error('Upload audio before ASR');

  const configs = await getAllConfigs();
  const provider = configs.groq_api_key ? 'groq' : 'kie';
  const model = configs.groq_api_key ? configs.groq_transcribe_model : configs.kie_chat_model || 'gemini-2.5-flash';
  const task = await createTask({
    userId: params.userId,
    mediaType: 'text',
    provider,
    model,
    prompt: project.audioUrl || project.title,
    costCredits: 10,
    options: { projectId: params.projectId, stage: 'asr' },
  });

  try {
    await db()
      .update(lyricVideoProject)
      .set({ lyricsStatus: 'asr_processing', pipelineStage: 'asr_processing', pipelineError: null })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));

    const transcriptionProject = await prepareAudioClipForTranscription({
      userId: params.userId,
      project,
    });
    const transcriptionAudioUrl = transcriptionProject.processedAudioUrl || transcriptionProject.audioUrl;
    const transcriptionPromise = configs.groq_api_key
      ? transcribeWithGroqWhisper({
          audioUrl: transcriptionAudioUrl || '',
          configs,
          language: project.language || 'auto',
          prompt: project.title,
        })
      : transcribeWithKieGemini(transcriptionAudioUrl || '');
    const [result, analysisResult] = await Promise.all([
      transcriptionPromise,
      analyzeAudioWithLibrosa({
        projectId: params.projectId,
        audioUrl: transcriptionAudioUrl,
      }),
    ]);
    const asrResult: AsrDraftResult = {
      raw: result.raw,
      rawText: String((result as any).text || result.lines.map((line: LyricLineInput) => line.text).join('\n')).trim(),
      rawSegments: result.lines,
      words: result.words || [],
    };

    const snapshot = asrSnapshot({
      provider,
      model,
      result: asrResult,
      audioAnalysis: analysisResult.audioAnalysis,
      audioAnalysisError: analysisResult.audioAnalysisError,
    });
    const wordValues = asrResult.words
      .map((word, index) => ({
        id: getUuid(),
        projectId: params.projectId,
        userId: params.userId,
        sort: index,
        word: word.word.trim(),
        startMs: Math.max(0, word.startMs || 0),
        endMs: Math.max(word.startMs || 0, word.endMs || 0),
        confidence: word.confidence,
      }))
      .filter((word) => word.word);

    await db().transaction(async (tx: any) => {
      await tx
        .delete(lyricVideoWord)
        .where(and(eq(lyricVideoWord.projectId, params.projectId), eq(lyricVideoWord.userId, params.userId)));
      await tx
        .delete(lyricVideoLine)
        .where(and(eq(lyricVideoLine.projectId, params.projectId), eq(lyricVideoLine.userId, params.userId)));
      if (wordValues.length > 0) {
        await tx.insert(lyricVideoWord).values(wordValues);
      }
      await tx
        .update(lyricVideoProject)
        .set({
          transcriptionRaw: safeJson(snapshot),
          lyricsStatus: 'asr_ready',
          scenesStatus: 'empty',
          pipelineStage: 'asr_ready',
          pipelineError: null,
        })
        .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));
    });

    await updateTask({ taskId: task.id, status: AITaskStatus.SUCCESS, taskResult: snapshot });
    const updated = await getProject({ userId: params.userId, id: params.projectId });
    return {
      words: wordValues,
      rawText: asrResult.rawText,
      rawSegments: asrResult.rawSegments,
      audioAnalysis: analysisResult.audioAnalysis,
      audioAnalysisError: analysisResult.audioAnalysisError,
      project: updated,
      taskId: task.id,
    };
  } catch (error: any) {
    await Promise.all([
      updateTask({ taskId: task.id, status: AITaskStatus.FAILED, taskResult: { error: error?.message } }),
      db()
        .update(lyricVideoProject)
        .set({ lyricsStatus: 'failed', pipelineStage: 'asr_failed', pipelineError: error?.message || 'ASR failed' })
        .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
    ]);
    throw error;
  }
}

export async function analyzeUploadedAudioForDebug(params: {
  body: Buffer | Uint8Array;
  filename?: string;
  contentType?: string;
  language?: string;
  prompt?: string;
}) {
  const configs = await getAllConfigs();
  const body = Buffer.from(params.body);
  const filename = params.filename || 'audio.mp3';
  const tmpDir = path.join(process.cwd(), '.next', 'lyric-video-debug', getUuid());
  const inputPath = path.join(tmpDir, filename.replace(/[^\w.-]+/g, '_') || 'audio.mp3');

  await mkdir(tmpDir, { recursive: true });
  await writeFile(inputPath, body);

  try {
    const [transcriptionResult, analysisResult] = await Promise.allSettled([
      configs.groq_api_key
        ? new GroqProvider({
            apiKey: configs.groq_api_key,
            baseUrl: configs.groq_base_url,
            transcribeModel: configs.groq_transcribe_model,
          }).transcribeFile({
            body,
            filename,
            contentType: params.contentType,
            language: params.language && params.language !== 'auto' ? params.language : undefined,
            prompt: params.prompt,
          })
        : Promise.reject(new Error('Groq API key is required for debug Whisper transcription')),
      runLibrosaAnalysisForLocalFile(inputPath),
    ]);

    const transcription =
      transcriptionResult.status === 'fulfilled'
        ? {
            provider: 'groq',
            rawText: transcriptionResult.value.text,
            rawSegments: transcriptionResult.value.lines,
            words: transcriptionResult.value.words,
            raw: transcriptionResult.value.raw,
          }
        : undefined;
    const audioAnalysis = analysisResult.status === 'fulfilled' ? analysisResult.value : undefined;

    let preprocess: LyricVideoLlmPreprocessResult | undefined;
    let preprocessError: string | undefined;
    try {
      if (!transcription) {
        throw new Error('Whisper transcription is required before preprocessing');
      }
      preprocess = preprocessLyricVideoForLlm({
        song: titleFromFilename(filename),
        transcription,
        audioAnalysis,
      });
    } catch (error: any) {
      preprocessError = error?.message || 'Preprocess failed';
    }

    return {
      transcription,
      transcriptionError:
        transcriptionResult.status === 'rejected'
          ? transcriptionResult.reason?.message || 'Whisper transcription failed'
          : undefined,
      audioAnalysis,
      audioAnalysisError:
        analysisResult.status === 'rejected' ? analysisResult.reason?.message || 'Audio analysis failed' : undefined,
      preprocess,
      preprocessError,
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
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

export async function normalizeLyrics(params: {
  userId: string;
  projectId: string;
}) {
  const project = await getProject({ userId: params.userId, id: params.projectId });
  if (!project) throw new Error('Project not found');
  const configs = await getAllConfigs();

  const [words, asr] = await Promise.all([
    db()
      .select()
      .from(lyricVideoWord)
      .where(and(eq(lyricVideoWord.projectId, params.projectId), eq(lyricVideoWord.userId, params.userId)))
      .orderBy(lyricVideoWord.sort),
    Promise.resolve(readAsrSnapshot(project)),
  ]);

  if (words.length === 0 && !asr.rawText && asr.rawSegments.length === 0) {
    throw new Error('Run ASR before organizing lyrics');
  }

  const task = await createTask({
    userId: params.userId,
    mediaType: 'text',
    provider: 'kie',
    model: configs.kie_chat_model || 'gemini-2.5-flash',
    prompt: [
      `title: ${project.title}`,
      `rawText: ${asr.rawText}`,
      `words: ${words.map((word: any) => word.word).join(' ')}`,
    ].join('\n\n'),
    costCredits: 0,
    options: { projectId: params.projectId, stage: 'lyrics_normalize' },
  });

  try {
    await db()
      .update(lyricVideoProject)
      .set({ lyricsStatus: 'normalizing', pipelineStage: 'lyrics_normalizing', pipelineError: null })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));

    const normalization = await normalizeLyricsWithKieGemini({
      words,
      rawText: asr.rawText,
      rawSegments: asr.rawSegments,
      project,
    });

    if (normalization.lines.length === 0) {
      throw new Error('Lyrics normalization returned no lines');
    }

    const lines = await replaceLyrics({
      userId: params.userId,
      projectId: params.projectId,
      lines: normalization.lines,
      words,
      source: normalization.fallbackUsed ? normalization.fallbackSource || 'asr_fallback' : 'llm_normalized',
    });
    const updated = await getProject({ userId: params.userId, id: params.projectId });

    await updateTask({
      taskId: task.id,
      status: AITaskStatus.SUCCESS,
      taskResult: {
        lines,
        fallbackUsed: normalization.fallbackUsed,
        fallbackSource: normalization.fallbackSource,
        llmContentPreview: normalization.llmContentPreview,
      },
    });

    return { lines, project: updated, taskId: task.id };
  } catch (error: any) {
    await Promise.all([
      updateTask({ taskId: task.id, status: AITaskStatus.FAILED, taskResult: { error: error?.message } }),
      db()
        .update(lyricVideoProject)
        .set({
          lyricsStatus: 'failed',
          pipelineStage: 'lyrics_normalize_failed',
          pipelineError: error?.message || 'Organize lyrics failed',
        })
        .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
    ]);
    throw error;
  }
}

export async function createTranscriptionDraft(params: {
  userId: string;
  projectId: string;
  rawLyrics?: string;
}) {
  const project = await getProject({ userId: params.userId, id: params.projectId });
  if (!project) throw new Error('Project not found');
  if (params.rawLyrics) {
    const lines = await replaceLyrics({
      userId: params.userId,
      projectId: params.projectId,
      lines: parseLinesFromText(params.rawLyrics),
      words: [],
      source: 'manual',
    });
    return lines;
  }

  await runAsr({ userId: params.userId, projectId: params.projectId });
  const normalized = await normalizeLyrics({ userId: params.userId, projectId: params.projectId });
  return normalized.lines;
}

export async function generateStoryboard(params: {
  userId: string;
  projectId: string;
  storyPrompt?: string;
}) {
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');
  if (details.lines.length === 0) throw new Error('Add lyrics before generating scenes');
  const configs = await getAllConfigs();

  const task = await createTask({
    userId: params.userId,
    mediaType: 'text',
    provider: configs.kie_api_key ? 'kie' : 'heuristic',
    model: configs.kie_api_key ? configs.kie_chat_model || 'gemini-2.5-flash' : 'local-storyboard',
    prompt: params.storyPrompt || details.project.storyPrompt || details.project.title,
    costCredits: configs.kie_api_key ? 15 : 0,
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
  const configs = await getAllConfigs();

  const task = await createTask({
    userId: params.userId,
    mediaType: 'text',
    provider: 'kie',
    model: configs.kie_chat_model || 'gemini-2.5-flash',
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

  if (scenes.length === 0) throw new Error('No scenes to generate');

  const provider = await createKieProvider();
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
          imageUrl: params.clearExistingImages ? null : scene.imageUrl,
          imageTaskId: task.id,
          providerTaskId: result.taskId,
          status: 'processing',
          attemptCount: (scene.attemptCount || 0) + 1,
          lastAttemptAt: new Date(),
          completedAt: null,
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

  const shouldGenerateStoryboard = params.regenerateStoryboard || details.scenes.length === 0;
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

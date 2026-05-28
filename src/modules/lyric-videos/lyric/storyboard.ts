import { and, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { lyricVideoLine, lyricVideoProject, lyricVideoScene } from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { createTask, updateTask, AITaskStatus } from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { energyLevelForValue, normalizePreprocessLyrics, readAudioAnalysis } from './asr';
import { safeJson, sceneTextFromLineIds } from './json';
import { getProject, getProjectDetails } from './project';
import { generateStoryboardWithKieGemini, generateStoryPromptWithKieGemini } from './llm';
import {
  DEFAULT_MAX_STORYBOARD_SCENES,
  INSTRUMENTAL_GAP_MS,
  LYRIC_VIDEO_DEFAULT_STYLE,
  type AudioAnalysisResult,
  type FixedStoryboardSceneDraft,
  type LyricLineInput,
  type LyricVideoLlmPreprocessResult,
  type LyricVideoPreprocessResult,
  type PreprocessEnergySegment,
  type PreprocessLyricLine,
  type PreprocessScene,
  type SceneInput,
  type StoryboardShotType,
} from './types';

export function buildEnergySegments(audioAnalysis?: AudioAnalysisResult): PreprocessEnergySegment[] {
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

export function findEnergyForRange(
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

export function countBeatsInRange(startMs: number, endMs: number, beatTimesMs?: number[]) {
  return (beatTimesMs || []).filter((time) => time >= startMs && time < endMs).length;
}

export function normalizeStoryboardLine(line: any, index: number) {
  const rawStartMs = line.startMs ?? (line.start_s != null ? Number(line.start_s) * 1000 : undefined);
  const startMs = Math.max(0, Math.round(Number(rawStartMs) || index * 4000));
  const rawEndMs = line.endMs ?? (line.end_s != null ? Number(line.end_s) * 1000 : undefined);
  const endMs = Math.max(
    startMs + 500,
    Math.round(Number(rawEndMs) || startMs + 3500)
  );
  return {
    id: String(line.id || `line_${index + 1}`),
    startMs,
    endMs,
    text: String(line.text || '').trim(),
  };
}

export function buildSceneTimelineConfig(scene: FixedStoryboardSceneDraft) {
  return {
    kind: scene.kind,
    shotType: scene.shotType,
    energyLevel: scene.energyLevel,
    avgEnergy: scene.avgEnergy,
    bpm: scene.bpm,
    key: scene.key,
    beatCount: scene.beatCount,
    prevLyric: scene.prevLyric,
    nextLyric: scene.nextLyric,
  };
}

export function countKeywordMatches(text: string, keywords: string[]) {
  const normalized = ` ${text.toLowerCase()} `;
  return keywords.reduce((count, keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const allowSimplePlural = !keyword.includes(' ') && /^[a-z]{3,}$/.test(keyword);
    const pattern = new RegExp(`\\b${escaped}${allowSimplePlural ? 's?' : ''}\\b`, 'i');
    return count + (pattern.test(normalized) ? 1 : 0);
  }, 0);
}

export const CHARACTER_SHOT_KEYWORDS = [
  'i',
  "i'm",
  "i've",
  'me',
  'my',
  'face',
  'eyes',
  'heart',
  'fear',
  'feel',
  'alive',
  'free',
  'running',
  'run',
  'rise',
  'watch me',
  'made it',
  'found',
];

export const INSERT_SHOT_KEYWORDS = [
  'dust',
  'shoe',
  'spark',
  'fire',
  'pocket',
  'road',
  'mirror',
  'hand',
  'foot',
  'feet',
  'boot',
  'match',
  'light',
  'break',
  'loss',
  'sign',
];

export const LANDSCAPE_SHOT_KEYWORDS = [
  'sky',
  'open',
  'tonight',
  'bend',
  'long way',
  'way out',
  'dream',
  'horizon',
  'road',
  'dawn',
  'morning',
  'far',
  'beyond',
];

export function scoreLyricShotTypes(text: string) {
  return {
    character: countKeywordMatches(text, CHARACTER_SHOT_KEYWORDS),
    insert: countKeywordMatches(text, INSERT_SHOT_KEYWORDS),
    landscape: countKeywordMatches(text, LANDSCAPE_SHOT_KEYWORDS),
  };
}

export function pickLyricShotType(text: string, index: number): StoryboardShotType {
  const scores = scoreLyricShotTypes(text);

  if (scores.landscape > 0 && scores.landscape >= scores.character && scores.landscape >= scores.insert) {
    return 'landscape_shot';
  }

  if (scores.insert > 0 && scores.insert >= scores.character) {
    return 'insert_shot';
  }

  if (scores.character > 0) return 'character_shot';
  return index % 5 === 0 ? 'landscape_shot' : 'character_shot';
}

export function pickInstrumentalShotType(startMs: number, endMs: number, index: number): StoryboardShotType {
  const durationMs = Math.max(0, endMs - startMs);
  if (durationMs >= 2500 || index % 3 === 2) return 'landscape_shot';
  return 'insert_shot';
}

export function alternateBreathingShotType(scene: FixedStoryboardSceneDraft): StoryboardShotType {
  const scores = scoreLyricShotTypes(scene.text);
  if (scores.landscape >= scores.insert) return 'landscape_shot';
  return 'insert_shot';
}

export function balanceStoryboardShotTypes(scenes: FixedStoryboardSceneDraft[]) {
  let consecutiveCharacters = 0;

  for (const scene of scenes) {
    if (scene.shotType === 'character_shot') {
      consecutiveCharacters += 1;
      if (consecutiveCharacters > 3) {
        scene.shotType = scene.kind === 'instrumental' ? 'insert_shot' : alternateBreathingShotType(scene);
        consecutiveCharacters = 0;
      }
    } else {
      consecutiveCharacters = 0;
    }
  }
}

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

export function mergedEnergyLevel(a: FixedStoryboardSceneDraft, b: FixedStoryboardSceneDraft): FixedStoryboardSceneDraft['energyLevel'] {
  if (a.energyLevel === 'high' || b.energyLevel === 'high') return 'high';
  if (a.energyLevel === 'medium' || b.energyLevel === 'medium') return 'medium';
  return 'low';
}

export function mergedShotType(a: FixedStoryboardSceneDraft, b: FixedStoryboardSceneDraft): StoryboardShotType {
  if (a.shotType === 'character_shot' || b.shotType === 'character_shot') return 'character_shot';
  if (a.shotType === 'landscape_shot' || b.shotType === 'landscape_shot') return 'landscape_shot';
  return 'insert_shot';
}

export function mergeFixedStoryboardScenes(
  a: FixedStoryboardSceneDraft,
  b: FixedStoryboardSceneDraft
): FixedStoryboardSceneDraft {
  const aDuration = Math.max(1, a.endMs - a.startMs);
  const bDuration = Math.max(1, b.endMs - b.startMs);
  const duration = aDuration + bDuration;
  const linkedLineIds = uniqueStrings([...a.linkedLineIds, ...b.linkedLineIds]);
  const textParts = [a.text, b.text].filter((text) => text && text !== 'Instrumental');

  return {
    sceneId: a.sceneId,
    kind: linkedLineIds.length > 0 ? 'lyric' : 'instrumental',
    shotType: mergedShotType(a, b),
    startMs: Math.min(a.startMs, b.startMs),
    endMs: Math.max(a.endMs, b.endMs),
    text: textParts.length > 0 ? textParts.join(' ') : 'Instrumental',
    linkedLineIds,
    energyLevel: mergedEnergyLevel(a, b),
    avgEnergy: (a.avgEnergy * aDuration + b.avgEnergy * bDuration) / duration,
    beatCount: (a.beatCount || 0) + (b.beatCount || 0),
    bpm: a.bpm || b.bpm,
    key: a.key || b.key,
    prevLyric: a.prevLyric,
    nextLyric: b.nextLyric,
  };
}

export function renumberFixedStoryboardScenes(scenes: FixedStoryboardSceneDraft[]) {
  return scenes.map((scene, index) => ({
    ...scene,
    sceneId: scene.kind === 'instrumental' ? `instrumental_${index + 1}` : `lyric_${index + 1}`,
  }));
}

export function limitFixedStoryboardScenes(
  scenes: FixedStoryboardSceneDraft[],
  maxScenes: number
): FixedStoryboardSceneDraft[] {
  const safeMax = Math.max(1, Math.min(DEFAULT_MAX_STORYBOARD_SCENES, Math.floor(maxScenes || DEFAULT_MAX_STORYBOARD_SCENES)));
  const limited = scenes.map((scene) => ({ ...scene, linkedLineIds: [...scene.linkedLineIds] }));

  while (limited.length > safeMax) {
    let mergeIndex = 0;
    let bestDuration = Number.POSITIVE_INFINITY;
    for (let index = 0; index < limited.length - 1; index += 1) {
      const combinedDuration = Math.max(0, limited[index + 1].endMs - limited[index].startMs);
      const touchesInstrumental = limited[index].kind === 'instrumental' || limited[index + 1].kind === 'instrumental';
      const score = combinedDuration - (touchesInstrumental ? 1000 : 0);
      if (score < bestDuration) {
        bestDuration = score;
        mergeIndex = index;
      }
    }

    limited.splice(
      mergeIndex,
      2,
      mergeFixedStoryboardScenes(limited[mergeIndex], limited[mergeIndex + 1])
    );
  }

  balanceStoryboardShotTypes(limited);
  return renumberFixedStoryboardScenes(limited);
}

export function buildFixedStoryboardSceneDrafts(params: {
  lines: any[];
  audioAnalysis?: AudioAnalysisResult;
}): FixedStoryboardSceneDraft[] {
  const lines = params.lines
    .map(normalizeStoryboardLine)
    .filter((line) => line.text)
    .sort((a, b) => a.startMs - b.startMs);
  const energySegments = buildEnergySegments(params.audioAnalysis);
  const scenes: FixedStoryboardSceneDraft[] = [];

  const makeEnergy = (startMs: number, endMs: number) => findEnergyForRange(startMs, endMs, energySegments);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const previous = lines[index - 1];
    const next = lines[index + 1];
    const energy = makeEnergy(line.startMs, line.endMs);

    scenes.push({
      sceneId: `lyric_${index + 1}`,
      kind: 'lyric',
      shotType: pickLyricShotType(line.text, index),
      startMs: line.startMs,
      endMs: line.endMs,
      text: line.text,
      linkedLineIds: [line.id],
      energyLevel: energy.energyLevel,
      avgEnergy: energy.avgEnergy,
      beatCount: countBeatsInRange(line.startMs, line.endMs, params.audioAnalysis?.beatTimesMs),
      bpm: params.audioAnalysis?.bpm,
      key: params.audioAnalysis?.key,
      prevLyric: previous?.text,
      nextLyric: next?.text,
    });

    const gapMs = next ? next.startMs - line.endMs : 0;
    if (next && gapMs >= INSTRUMENTAL_GAP_MS) {
      const instrumentalEnergy = makeEnergy(line.endMs, next.startMs);
      scenes.push({
        sceneId: `instrumental_${index + 1}`,
        kind: 'instrumental',
        shotType: pickInstrumentalShotType(line.endMs, next.startMs, index),
        startMs: line.endMs,
        endMs: next.startMs,
        text: 'Instrumental',
        linkedLineIds: [],
        energyLevel: instrumentalEnergy.energyLevel,
        avgEnergy: instrumentalEnergy.avgEnergy,
        beatCount: countBeatsInRange(line.endMs, next.startMs, params.audioAnalysis?.beatTimesMs),
        bpm: params.audioAnalysis?.bpm,
        key: params.audioAnalysis?.key,
        prevLyric: line.text,
        nextLyric: next.text,
      });
    }
  }

  balanceStoryboardShotTypes(scenes);
  return scenes;
}

export function audioAnalysisFromLlmPreprocess(preprocess: LyricVideoLlmPreprocessResult): AudioAnalysisResult | undefined {
  const rms = Array.isArray(preprocess.energy_per_second) ? preprocess.energy_per_second : [];
  if (!preprocess.bpm && !preprocess.key && rms.length === 0) return undefined;

  const rmsBySecond = rms.map((value, index) => ({
    startMs: index * 1000,
    endMs: (index + 1) * 1000,
    rms: Number(value) || 0,
  }));

  return {
    durationSec: preprocess.duration_s,
    sampleRate: 0,
    bpm: Number(preprocess.bpm || 0),
    key: preprocess.key || '',
    beatTimesMs: [],
    segmentBoundariesMs: [],
    rmsBySecond,
    segments: rmsBySecond.map((point) => ({
      startMs: point.startMs,
      endMs: point.endMs,
      durationMs: point.endMs - point.startMs,
      avgEnergy: point.rms,
    })),
  };
}

export function motionIntensityForEnergy(energyLevel: FixedStoryboardSceneDraft['energyLevel']) {
  if (energyLevel === 'high') return 'fast, handheld, energetic, with stronger physical and environmental motion';
  if (energyLevel === 'low') return 'slow, smooth, subtle, with restrained physical and environmental motion';
  return 'steady, controlled, rhythmic, with moderate motion';
}

export function fallbackPromptForFixedScene(params: {
  scene: FixedStoryboardSceneDraft;
  project: any;
  storyPrompt?: string;
}) {
  const style = [
    params.project.artStyle,
    params.project.palette ? `${params.project.palette} color palette` : '',
    params.storyPrompt || params.project.storyPrompt,
  ]
    .filter(Boolean)
    .join(', ');
  const motion = motionIntensityForEnergy(params.scene.energyLevel);
  const sceneContext = params.scene.kind === 'instrumental'
    ? `transition between the previous lyric "${params.scene.prevLyric || ''}" and the next lyric "${params.scene.nextLyric || ''}"`
    : `visualize this lyric: ${params.scene.text}`;

  if (params.scene.shotType === 'insert_shot') {
    return {
      imagePrompt: [
        style,
        `cinematic insert shot, ${sceneContext}`,
        'focus on objects, body details, fabric, dust, light, fire, road texture, or atmospheric details',
        'no full character, no visible face, no new characters, no new location, no text, no typography',
      ].join(', '),
      videoPrompt: `Camera moves in a ${motion} way. Focus on object or detail motion such as dust, fabric, light, fire, road texture, or particles; avoid full-body character action and preserve the same location.`,
    };
  }

  if (params.scene.shotType === 'landscape_shot') {
    return {
      imagePrompt: [
        style,
        `cinematic landscape shot, ${sceneContext}`,
        'wide environmental view with road, sky, horizon, weather, light, or atmosphere as the main subject',
        'no centered main character; an extremely small silhouette is allowed, no new characters, no text, no typography',
      ].join(', '),
      videoPrompt: `Camera moves in a ${motion} way. Let the environment carry the motion through drifting light, clouds, road heat shimmer, wind, dust, or weather; keep any character distant and non-dominant.`,
    };
  }

  return {
    imagePrompt: [
      style,
      `cinematic character shot, ${sceneContext}`,
      'show the established main character with consistent appearance, clear emotion or action, matching environment, no text, no typography',
    ].join(', '),
    videoPrompt: `Camera moves in a ${motion} way. The established main character performs a concrete action matching the lyric; physical details and ambient light move naturally while preserving the image composition.`,
  };
}

export function mergeShortScenes(scenes: PreprocessScene[], minSceneMs: number, maxScenes: number) {
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

export function secondsFromMs(ms: number) {
  return Number((Math.max(0, ms) / 1000).toFixed(3));
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

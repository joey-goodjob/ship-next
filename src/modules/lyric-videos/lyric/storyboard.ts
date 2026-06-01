import { and, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { lyricVideoLine, lyricVideoProject, lyricVideoScene } from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { createTask, updateTask, AITaskStatus } from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { energyLevelForValue, normalizePreprocessLyrics, readAudioAnalysis } from './asr';
import { safeJson, sceneTextFromLineIds } from './json';
import { getProject, getProjectDetails } from './project';
import { generateStoryboardWithKieClaude, generateStoryPromptWithKieClaude } from './llm';
import {
  DEFAULT_MAX_STORYBOARD_SCENES,
  DEFAULT_STORYBOARD_MODEL,
  INSTRUMENTAL_GAP_MS,
  LYRIC_VIDEO_DEFAULT_STYLE,
  type AudioAnalysisResult,
  type FixedStoryboardPlanning,
  type FixedStoryboardSceneDraft,
  type LyricLineInput,
  type LyricWordInput,
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
    wordStartIndex: Number.isFinite(Number(line.wordStartIndex)) ? Number(line.wordStartIndex) : undefined,
    wordEndIndex: Number.isFinite(Number(line.wordEndIndex)) ? Number(line.wordEndIndex) : undefined,
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
    planning: scene.planning,
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

export const MV_LONG_SCENE_MS = 6500;
export const MV_MOTION_SCENE_MS = 5000;
export const MV_MIN_SCENE_MS = 1500;
export const MV_INSTRUMENTAL_GAP_MS = 2000;

type StoryboardWord = {
  index: number;
  word: string;
  startMs: number;
  endMs: number;
};

type StoryboardPlanningContext = {
  audioAnalysis?: AudioAnalysisResult;
  energySegments: PreprocessEnergySegment[];
  words: StoryboardWord[];
  medianNormalSceneMs: number;
};

export function sceneDurationMs(scene: Pick<FixedStoryboardSceneDraft, 'startMs' | 'endMs'>) {
  return Math.max(0, scene.endMs - scene.startMs);
}

export function normalizeStoryboardWords(words?: LyricWordInput[]): StoryboardWord[] {
  return (Array.isArray(words) ? words : [])
    .map((word, index) => {
      const startMs = Math.max(0, Math.round(Number(word.startMs) || 0));
      const endMs = Math.max(startMs + 1, Math.round(Number(word.endMs) || startMs + 1));
      return {
        index,
        word: String(word.word || '').trim(),
        startMs,
        endMs,
      };
    })
    .filter((word) => word.word && word.endMs > word.startMs)
    .sort((a, b) => a.startMs - b.startMs);
}

export function normalizeLyricFingerprint(text: string) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function repeatGroupIdForFingerprint(fingerprint: string) {
  const slug = fingerprint.replace(/\s+/g, '_').replace(/[^a-z0-9_\u4e00-\u9fff]+/gi, '').slice(0, 72);
  return slug ? `repeat_${slug}` : undefined;
}

export function sentenceBreakCount(text: string) {
  return (String(text || '').match(/[.!?。！？]/g) || []).length;
}

const VOCAL_MONTAGE_WORDS = new Set(['oh', 'ooh', 'oooh', 'ah', 'aah', 'la', 'na', 'hey', 'yeah', 'yea', 'whoa', 'woah', 'hmm', 'mm', 'mmm', 'uh', 'ha']);

export function isVocalMontageText(text: string) {
  const tokens = String(text || '')
    .split(/\s+/)
    .map((token) => token.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => VOCAL_MONTAGE_WORDS.has(token));
}

function wordsForScene(scene: FixedStoryboardSceneDraft, words: StoryboardWord[]) {
  if (scene.kind !== 'lyric' || words.length === 0) return [];
  const startMs = scene.startMs;
  const endMs = scene.endMs;
  return words.filter((word) => word.endMs > startMs && word.startMs < endMs);
}

function cleanSceneTextFromWords(words: StoryboardWord[]) {
  return words
    .map((word) => word.word)
    .join(' ')
    .replace(/\s+([,.!?;:。！？])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceWordGroups(words: StoryboardWord[]) {
  const groups: StoryboardWord[][] = [];
  let group: StoryboardWord[] = [];
  for (const word of words) {
    group.push(word);
    if (/[.!?。！？]$/.test(word.word.trim())) {
      groups.push(group);
      group = [];
    }
  }
  if (group.length > 0) groups.push(group);
  return groups.filter((item) => item.length > 0);
}

function wordGroupDuration(group: StoryboardWord[]) {
  if (group.length === 0) return 0;
  return group[group.length - 1].endMs - group[0].startMs;
}

function splitWordGroupByDuration(group: StoryboardWord[], targetCount: number) {
  if (group.length <= 1 || targetCount <= 1) return [group];
  const startMs = group[0].startMs;
  const endMs = group[group.length - 1].endMs;
  const cuts: number[] = [];

  for (let cut = 1; cut < targetCount; cut += 1) {
    const targetMs = startMs + ((endMs - startMs) * cut) / targetCount;
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < group.length - 1; index += 1) {
      if (cuts.includes(index)) continue;
      const currentStart = cuts.length === 0 ? 0 : cuts[cuts.length - 1] + 1;
      const leftDuration = group[index].endMs - group[currentStart].startMs;
      const rightDuration = group[group.length - 1].endMs - group[index + 1].startMs;
      if (leftDuration < MV_MIN_SCENE_MS || rightDuration < MV_MIN_SCENE_MS) continue;
      const nextGap = group[index + 1].startMs - group[index].endMs;
      const punctuationBonus = /[,;:，；：]$/.test(group[index].word) ? 500 : 0;
      const gapBonus = nextGap >= 500 ? 400 : 0;
      const score = Math.abs(group[index].endMs - targetMs) - punctuationBonus - gapBonus;
      if (score < bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }
    if (bestIndex >= 0) cuts.push(bestIndex);
  }

  if (cuts.length === 0) return [group];
  cuts.sort((a, b) => a - b);
  const groups: StoryboardWord[][] = [];
  let startIndex = 0;
  for (const cutIndex of cuts) {
    groups.push(group.slice(startIndex, cutIndex + 1));
    startIndex = cutIndex + 1;
  }
  groups.push(group.slice(startIndex));
  return groups.filter((item) => item.length > 0);
}

function energyForSceneRange(startMs: number, endMs: number, context: StoryboardPlanningContext) {
  return findEnergyForRange(startMs, endMs, context.energySegments);
}

function createSceneFromRange(params: {
  scene: FixedStoryboardSceneDraft;
  startMs: number;
  endMs: number;
  text: string;
  context: StoryboardPlanningContext;
  shotType?: StoryboardShotType;
  planning?: Partial<FixedStoryboardPlanning>;
}) {
  const energy = energyForSceneRange(params.startMs, params.endMs, params.context);
  return {
    ...params.scene,
    shotType: params.shotType || params.scene.shotType,
    startMs: params.startMs,
    endMs: Math.max(params.startMs + 500, params.endMs),
    text: params.text || params.scene.text,
    energyLevel: energy.energyLevel,
    avgEnergy: energy.avgEnergy,
    beatCount: countBeatsInRange(params.startMs, params.endMs, params.context.audioAnalysis?.beatTimesMs),
    planning: {
      ...params.scene.planning,
      ...params.planning,
    } as FixedStoryboardPlanning,
  } satisfies FixedStoryboardSceneDraft;
}

function splitLyricScene(scene: FixedStoryboardSceneDraft, context: StoryboardPlanningContext) {
  const durationMs = sceneDurationMs(scene);
  const sceneWords = wordsForScene(scene, context.words);
  if (sceneWords.length === 0) return [scene];

  const sentenceGroups = sentenceWordGroups(sceneWords);
  const groups = sentenceBreakCount(scene.text) > 1 && sentenceGroups.length > 1 ? sentenceGroups : [sceneWords];
  const targetMs = Math.max(3000, Math.min(MV_LONG_SCENE_MS, context.medianNormalSceneMs));
  const finalGroups = groups.flatMap((group) => {
    if (wordGroupDuration(group) <= MV_LONG_SCENE_MS) return [group];
    return splitWordGroupByDuration(group, Math.max(2, Math.ceil(wordGroupDuration(group) / targetMs)));
  });

  if (finalGroups.length <= 1 && durationMs <= MV_LONG_SCENE_MS) return [scene];
  const splitCount = finalGroups.length;
  return finalGroups.map((group, index) => {
    const text = cleanSceneTextFromWords(group);
    return createSceneFromRange({
      scene,
      startMs: group[0].startMs,
      endMs: group[group.length - 1].endMs,
      text,
      context,
      shotType: pickLyricShotType(text, index),
      planning: {
        sourceLineId: scene.linkedLineIds[0],
        splitIndex: index + 1,
        splitCount,
        focusText: text,
        isVocalMontage: false,
      },
    });
  });
}

function pickBeatCuts(startMs: number, endMs: number, splitCount: number, beatTimesMs?: number[]) {
  const beats = (beatTimesMs || []).filter((time) => time > startMs + 300 && time < endMs - 300);
  const cuts: number[] = [];
  for (let cut = 1; cut < splitCount; cut += 1) {
    const targetMs = startMs + ((endMs - startMs) * cut) / splitCount;
    const beat = beats
      .filter((time) => !cuts.includes(time))
      .sort((a, b) => Math.abs(a - targetMs) - Math.abs(b - targetMs))[0];
    cuts.push(beat || Math.round(targetMs));
  }
  return cuts.sort((a, b) => a - b);
}

function splitBeatScene(scene: FixedStoryboardSceneDraft, context: StoryboardPlanningContext, isVocalMontage: boolean) {
  const durationMs = sceneDurationMs(scene);
  if (durationMs <= MV_LONG_SCENE_MS) return [scene];
  const targetMs = Math.max(2500, Math.min(3500, context.medianNormalSceneMs));
  const splitCount = Math.max(2, Math.ceil(durationMs / targetMs));
  const cuts = pickBeatCuts(scene.startMs, scene.endMs, splitCount, context.audioAnalysis?.beatTimesMs);
  const ranges = [scene.startMs, ...cuts, scene.endMs];

  return ranges.slice(0, -1).map((startMs, index) => createSceneFromRange({
    scene,
    startMs,
    endMs: ranges[index + 1],
    text: scene.text,
    context,
    shotType: scene.kind === 'instrumental' ? pickInstrumentalShotType(startMs, ranges[index + 1], index) : scene.shotType,
    planning: {
      sourceLineId: scene.linkedLineIds[0],
      splitIndex: index + 1,
      splitCount,
      focusText: scene.text,
      isVocalMontage,
    },
  }));
}

function medianNormalSceneMs(scenes: FixedStoryboardSceneDraft[]) {
  const durations = scenes
    .filter((scene) => scene.kind === 'lyric')
    .map(sceneDurationMs)
    .filter((duration) => duration >= MV_MIN_SCENE_MS && duration <= MV_LONG_SCENE_MS)
    .sort((a, b) => a - b);
  if (durations.length === 0) return 3500;
  return durations[Math.floor(durations.length / 2)] || 3500;
}

function mergeAdjacentRepeatedScenes(scenes: FixedStoryboardSceneDraft[], context: StoryboardPlanningContext) {
  const merged: FixedStoryboardSceneDraft[] = [];
  for (const scene of scenes) {
    const previous = merged[merged.length - 1];
    const sameText = previous && scene.kind === 'lyric' && previous.kind === 'lyric'
      && !previous.planning?.isVocalMontage
      && !scene.planning?.isVocalMontage
      && normalizeLyricFingerprint(previous.text) === normalizeLyricFingerprint(scene.text);
    const shortRepeat = sameText && sceneDurationMs(previous) <= 3000 && sceneDurationMs(scene) <= 3000;
    if (previous && shortRepeat) {
      merged[merged.length - 1] = createSceneFromRange({
        scene: mergeFixedStoryboardScenes(previous, scene),
        startMs: previous.startMs,
        endMs: scene.endMs,
        text: [previous.text, scene.text].filter(Boolean).join(' '),
        context,
        planning: {
          sourceLineId: previous.linkedLineIds[0] || scene.linkedLineIds[0],
          focusText: [previous.text, scene.text].filter(Boolean).join(' '),
          isVocalMontage: false,
        },
      });
    } else {
      merged.push(scene);
    }
  }
  return merged;
}

function mergeTinyScenes(scenes: FixedStoryboardSceneDraft[], context: StoryboardPlanningContext) {
  const merged = [...scenes];
  let index = 0;
  while (index < merged.length) {
    const scene = merged[index];
    if (sceneDurationMs(scene) >= MV_MIN_SCENE_MS || merged.length <= 1) {
      index += 1;
      continue;
    }

    const previous = merged[index - 1];
    const next = merged[index + 1];
    if (!previous && !next) {
      index += 1;
      continue;
    }

    const gapToPrevious = previous ? Math.max(0, scene.startMs - previous.endMs) : Number.POSITIVE_INFINITY;
    const gapToNext = next ? Math.max(0, next.startMs - scene.endMs) : Number.POSITIVE_INFINITY;
    const shouldPreferNextSplitFragment = next
      && scene.planning?.sourceLineId
      && scene.planning.sourceLineId === next.planning?.sourceLineId
      && sceneDurationMs(next) < MV_MIN_SCENE_MS;
    if (next && shouldPreferNextSplitFragment) {
      merged[index] = createSceneFromRange({
        scene: mergeFixedStoryboardScenes(scene, next),
        startMs: scene.startMs,
        endMs: next.endMs,
        text: [scene.text, next.text].filter((text) => text && text !== '[intro]' && text !== '[interlude]' && text !== '[outro]').join(' ') || next.text,
        context,
        planning: {
          sourceLineId: scene.planning?.sourceLineId || next.planning?.sourceLineId,
          focusText: [scene.text, next.text].filter(Boolean).join(' '),
          isVocalMontage: Boolean(scene.planning?.isVocalMontage || next.planning?.isVocalMontage),
        },
      });
      merged.splice(index + 1, 1);
    } else if (previous && (!next || gapToPrevious <= gapToNext)) {
      merged[index - 1] = createSceneFromRange({
        scene: mergeFixedStoryboardScenes(previous, scene),
        startMs: previous.startMs,
        endMs: scene.endMs,
        text: [previous.text, scene.text].filter((text) => text && text !== '[intro]' && text !== '[interlude]' && text !== '[outro]').join(' ') || previous.text,
        context,
      });
      merged.splice(index, 1);
      index = Math.max(0, index - 1);
    } else if (next) {
      merged[index] = createSceneFromRange({
        scene: mergeFixedStoryboardScenes(scene, next),
        startMs: scene.startMs,
        endMs: next.endMs,
        text: [scene.text, next.text].filter((text) => text && text !== '[intro]' && text !== '[interlude]' && text !== '[outro]').join(' ') || next.text,
        context,
      });
      merged.splice(index + 1, 1);
    } else {
      index += 1;
    }
  }
  return merged;
}

function applyPlanningTags(scenes: FixedStoryboardSceneDraft[], context: StoryboardPlanningContext) {
  const fingerprints = scenes.map((scene) => scene.kind === 'lyric' ? normalizeLyricFingerprint(scene.text) : '');
  const repeatCounts = new Map<string, number>();
  for (const fingerprint of fingerprints) {
    if (!fingerprint) continue;
    repeatCounts.set(fingerprint, (repeatCounts.get(fingerprint) || 0) + 1);
  }
  const repeatSeen = new Map<string, number>();
  const shortCutoff = Math.min(MV_MIN_SCENE_MS, Math.max(1000, context.medianNormalSceneMs * 0.4));
  const longCutoff = Math.min(MV_LONG_SCENE_MS, Math.max(MV_MOTION_SCENE_MS, context.medianNormalSceneMs * 1.4));

  return scenes.map((scene, index) => {
    const duration = sceneDurationMs(scene);
    const energy = energyForSceneRange(scene.startMs, scene.endMs, context);
    const fingerprint = fingerprints[index];
    const repeatTotal = fingerprint ? repeatCounts.get(fingerprint) || 0 : 0;
    const repeatIndex = repeatTotal > 1 ? (repeatSeen.get(fingerprint) || 0) + 1 : undefined;
    if (repeatIndex) repeatSeen.set(fingerprint, repeatIndex);
    const repeatGroupId = repeatTotal > 1 ? repeatGroupIdForFingerprint(fingerprint) : undefined;
    const durationClass: FixedStoryboardPlanning['durationClass'] =
      duration < shortCutoff ? 'short' : duration > longCutoff ? 'long' : 'normal';

    return {
      ...scene,
      energyLevel: energy.energyLevel,
      avgEnergy: energy.avgEnergy,
      beatCount: countBeatsInRange(scene.startMs, scene.endMs, context.audioAnalysis?.beatTimesMs),
      prevLyric: scenes.slice(0, index).reverse().find((item) => item.kind === 'lyric')?.text,
      nextLyric: scenes.slice(index + 1).find((item) => item.kind === 'lyric')?.text,
      planning: {
        durationClass,
        needsMotion: duration >= MV_MOTION_SCENE_MS && duration <= MV_LONG_SCENE_MS,
        isVocalMontage: Boolean(scene.planning?.isVocalMontage),
        energy: energy.avgEnergy,
        sourceLineId: scene.planning?.sourceLineId || scene.linkedLineIds[0],
        splitIndex: scene.planning?.splitIndex,
        splitCount: scene.planning?.splitCount,
        repeatGroupId,
        repeatIndex,
        repeatTotal: repeatTotal > 1 ? repeatTotal : undefined,
        focusText: scene.planning?.focusText || (scene.kind === 'lyric' ? scene.text : undefined),
      },
    } satisfies FixedStoryboardSceneDraft;
  });
}

export function planFixedStoryboardScenes(
  scenes: FixedStoryboardSceneDraft[],
  params: {
    audioAnalysis?: AudioAnalysisResult;
    words?: LyricWordInput[];
  } = {}
) {
  const energySegments = buildEnergySegments(params.audioAnalysis);
  const context: StoryboardPlanningContext = {
    audioAnalysis: params.audioAnalysis,
    energySegments,
    words: normalizeStoryboardWords(params.words),
    medianNormalSceneMs: medianNormalSceneMs(scenes),
  };

  const splitScenes = scenes.flatMap((scene) => {
    const duration = sceneDurationMs(scene);
    const vocalMontage = scene.kind === 'lyric' && isVocalMontageText(scene.text);
    if ((scene.kind === 'instrumental' || vocalMontage) && duration > MV_LONG_SCENE_MS) {
      return splitBeatScene(scene, context, vocalMontage);
    }
    if (scene.kind === 'lyric' && (duration > MV_LONG_SCENE_MS || sentenceBreakCount(scene.text) > 1)) {
      return splitLyricScene(scene, context);
    }
    return [scene];
  });
  const repeatedMerged = mergeAdjacentRepeatedScenes(splitScenes, context);
  const tinyMerged = mergeTinyScenes(repeatedMerged, context);
  const planned = applyPlanningTags(tinyMerged, context);
  balanceStoryboardShotTypes(planned);
  return renumberFixedStoryboardScenes(planned);
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
  words?: LyricWordInput[];
}): FixedStoryboardSceneDraft[] {
  const lines = params.lines
    .map(normalizeStoryboardLine)
    .filter((line) => line.text)
    .sort((a, b) => a.startMs - b.startMs);
  const energySegments = buildEnergySegments(params.audioAnalysis);
  const scenes: FixedStoryboardSceneDraft[] = [];
  const trackEndMs = Math.max(
    Math.round((params.audioAnalysis?.durationSec || 0) * 1000),
    ...lines.map((line) => line.endMs),
    0
  );

  const makeEnergy = (startMs: number, endMs: number) => findEnergyForRange(startMs, endMs, energySegments);

  const firstLine = lines[0];
  if (firstLine && firstLine.startMs >= MV_INSTRUMENTAL_GAP_MS) {
    const introEnergy = makeEnergy(0, firstLine.startMs);
    scenes.push({
      sceneId: 'instrumental_0',
      kind: 'instrumental',
      shotType: pickInstrumentalShotType(0, firstLine.startMs, 0),
      startMs: 0,
      endMs: firstLine.startMs,
      text: '[intro]',
      linkedLineIds: [],
      energyLevel: introEnergy.energyLevel,
      avgEnergy: introEnergy.avgEnergy,
      beatCount: countBeatsInRange(0, firstLine.startMs, params.audioAnalysis?.beatTimesMs),
      bpm: params.audioAnalysis?.bpm,
      key: params.audioAnalysis?.key,
      nextLyric: firstLine.text,
    });
  }

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
    if (next && gapMs >= MV_INSTRUMENTAL_GAP_MS) {
      const instrumentalEnergy = makeEnergy(line.endMs, next.startMs);
      scenes.push({
        sceneId: `instrumental_${index + 1}`,
        kind: 'instrumental',
        shotType: pickInstrumentalShotType(line.endMs, next.startMs, index),
        startMs: line.endMs,
        endMs: next.startMs,
        text: '[interlude]',
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

  const lastLine = lines[lines.length - 1];
  if (lastLine && trackEndMs - lastLine.endMs >= MV_INSTRUMENTAL_GAP_MS) {
    const outroEnergy = makeEnergy(lastLine.endMs, trackEndMs);
    scenes.push({
      sceneId: `instrumental_${lines.length}`,
      kind: 'instrumental',
      shotType: pickInstrumentalShotType(lastLine.endMs, trackEndMs, lines.length),
      startMs: lastLine.endMs,
      endMs: trackEndMs,
      text: '[outro]',
      linkedLineIds: [],
      energyLevel: outroEnergy.energyLevel,
      avgEnergy: outroEnergy.avgEnergy,
      beatCount: countBeatsInRange(lastLine.endMs, trackEndMs, params.audioAnalysis?.beatTimesMs),
      bpm: params.audioAnalysis?.bpm,
      key: params.audioAnalysis?.key,
      prevLyric: lastLine.text,
    });
  }

  balanceStoryboardShotTypes(scenes);
  return planFixedStoryboardScenes(scenes, {
    audioAnalysis: params.audioAnalysis,
    words: params.words,
  });
}

function isStoryboardShotType(value: unknown): value is StoryboardShotType {
  return value === 'character_shot' || value === 'insert_shot' || value === 'landscape_shot';
}

export function buildFixedStoryboardSceneDraftsFromPersistedScenes(params: {
  scenes: any[];
  lines: any[];
  audioAnalysis?: AudioAnalysisResult;
}): FixedStoryboardSceneDraft[] {
  if (!params.scenes.length) {
    return buildFixedStoryboardSceneDrafts({ lines: params.lines, audioAnalysis: params.audioAnalysis });
  }

  const energySegments = buildEnergySegments(params.audioAnalysis);
  const makeEnergy = (startMs: number, endMs: number) => findEnergyForRange(startMs, endMs, energySegments);
  const sortedLines = [...params.lines].sort((a, b) => (a.startMs || 0) - (b.startMs || 0));

  const drafts = params.scenes
    .map((scene, index) => {
      const linkedLineIds = Array.isArray(scene.linkedLineIds) ? scene.linkedLineIds : [];
      const linkedLineSet = new Set(linkedLineIds);
      const startMs = Math.max(0, Number(scene.startMs) || 0);
      const endMs = Math.max(startMs + 1, Number(scene.endMs) || startMs + 1);
      const linkedLines = sortedLines.filter(
        (line: any) =>
          linkedLineSet.has(line.id) ||
          ((line.endMs || line.startMs) > startMs && (line.startMs || 0) < endMs)
      );
      const timelineConfig = scene.timelineConfig && typeof scene.timelineConfig === 'object' ? scene.timelineConfig : {};
      const kind = timelineConfig.kind === 'instrumental' || linkedLineIds.length === 0 ? 'instrumental' : 'lyric';
      const shotType = isStoryboardShotType(timelineConfig.shotType)
        ? timelineConfig.shotType
        : kind === 'instrumental'
          ? pickInstrumentalShotType(startMs, endMs, index)
          : pickLyricShotType(scene.text || linkedLines[0]?.text || '', index);
      const energy = makeEnergy(startMs, endMs);
      const previousLine = sortedLines.filter((line: any) => (line.endMs || 0) <= startMs).at(-1);
      const nextLine = sortedLines.find((line: any) => (line.startMs || 0) >= endMs);

      return {
        dbId: scene.id,
        sceneId: scene.id || `${kind}_${index + 1}`,
        kind,
        shotType,
        startMs,
        endMs,
        text: scene.text || sceneTextFromLineIds(linkedLineIds, sortedLines) || linkedLines.map((line: any) => line.text).join(' '),
        linkedLineIds,
        energyLevel: energy.energyLevel,
        avgEnergy: energy.avgEnergy,
        beatCount: countBeatsInRange(startMs, endMs, params.audioAnalysis?.beatTimesMs),
        bpm: params.audioAnalysis?.bpm,
        key: params.audioAnalysis?.key,
        prevLyric: previousLine?.text,
        nextLyric: nextLine?.text,
        planning: timelineConfig.planning && typeof timelineConfig.planning === 'object'
          ? timelineConfig.planning as FixedStoryboardPlanning
          : undefined,
      } satisfies FixedStoryboardSceneDraft;
    })
    .filter((scene) => scene.endMs > scene.startMs);

  const planned = applyPlanningTags(drafts, {
    audioAnalysis: params.audioAnalysis,
    energySegments,
    words: [],
    medianNormalSceneMs: medianNormalSceneMs(drafts),
  });
  balanceStoryboardShotTypes(planned);
  return planned;
}

export async function replaceLyricsSceneSkeleton(params: {
  userId: string;
  projectId: string;
  runId?: string;
}) {
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');

  const audioAnalysis = readAudioAnalysis(details.project);
  const fixedScenes = buildFixedStoryboardSceneDrafts({
    lines: details.lines,
    audioAnalysis,
    words: details.words,
  });
  const scenes: SceneInput[] = fixedScenes.map((scene) => ({
    startMs: scene.startMs,
    endMs: scene.endMs,
    text: scene.text,
    prompt: '',
    motionPrompt: '',
    linkedLineIds: scene.linkedLineIds,
    timelineConfig: buildSceneTimelineConfig(scene),
    negativePrompt: 'text, captions, subtitles, lyrics, watermark, logo, blurry, low quality',
    status: 'lyrics_draft',
  }));
  const inserted = await replaceScenes({
    userId: params.userId,
    projectId: params.projectId,
    runId: params.runId,
    scenes,
  });

  await db()
    .update(lyricVideoProject)
    .set({
      lyricsStatus: details.lines.length > 0 ? 'ready' : 'empty',
      scenesStatus: inserted.length > 0 ? 'lyrics_draft' : 'empty',
      pipelineStage: details.lines.length > 0 ? 'lyrics_ready' : 'uploaded',
      pipelineError: null,
    })
    .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));

  logLyricStage('lyrics-scenes', 'db-written', {
    projectId: params.projectId,
    userId: params.userId,
    runId: params.runId,
    sceneCount: inserted.length,
    status: inserted.length > 0 ? 'lyrics_draft' : 'empty',
    scenes: inserted.map((scene: any) => ({
      id: scene.id,
      status: scene.status,
      startMs: scene.startMs,
      endMs: scene.endMs,
      linkedLineIds: scene.linkedLineIds,
      promptLength: scene.prompt?.length || 0,
    })),
  });

  return inserted;
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
    provider: configs.kie_api_key ? 'kie_claude' : 'heuristic',
    model: configs.kie_api_key ? configs.kie_claude_model || DEFAULT_STORYBOARD_MODEL : 'local-storyboard',
    prompt: params.storyPrompt || details.project.storyPrompt || details.project.title,
    costCredits: configs.kie_api_key ? 15 : 0,
    options: { projectId: params.projectId, stage: 'storyboard' },
  });

  try {
    logLyricStage('storyboard', 'service-start', {
      projectId: params.projectId,
      userId: params.userId,
      taskId: task.id,
      provider: configs.kie_api_key ? 'kie_claude' : 'heuristic',
      model: configs.kie_api_key ? configs.kie_claude_model || DEFAULT_STORYBOARD_MODEL : 'local-storyboard',
      lineCount: details.lines.length,
      existingSceneCount: details.scenes.length,
      hasStoryPrompt: Boolean(params.storyPrompt || details.project.storyPrompt),
    });
    const fixedScenes = buildFixedStoryboardSceneDraftsFromPersistedScenes({
      scenes: details.scenes,
      lines: details.lines,
      audioAnalysis: readAudioAnalysis(details.project),
    });
    const scenes = await generateStoryboardWithKieClaude({
      lines: details.lines,
      project: details.project,
      storyPrompt: params.storyPrompt,
      fixedScenes,
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
    logLyricStage('storyboard', 'service-success', {
      projectId: params.projectId,
      userId: params.userId,
      taskId: task.id,
      sceneCount: inserted.length,
      scenes: inserted.map((scene: any) => ({
        id: scene.id,
        status: scene.status,
        promptLength: scene.prompt?.length || 0,
      })),
      pipelineStage: 'storyboard_ready',
      scenesStatus: 'ready',
    });
    return inserted;
  } catch (error: any) {
    logLyricStageError('storyboard', 'service-fail', error, {
      projectId: params.projectId,
      userId: params.userId,
      taskId: task.id,
    });
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
    provider: 'kie_claude',
    model: configs.kie_claude_model || DEFAULT_STORYBOARD_MODEL,
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
    logLyricStage('story-prompt', 'service-start', {
      projectId: params.projectId,
      userId: params.userId,
      taskId: task.id,
      provider: 'kie_claude',
      model: configs.kie_claude_model || DEFAULT_STORYBOARD_MODEL,
      lineCount: details.lines.length,
    });
    const storyPrompt = await generateStoryPromptWithKieClaude({
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

    logLyricStage('story-prompt', 'service-success', {
      projectId: params.projectId,
      userId: params.userId,
      taskId: task.id,
      storyPromptLength: storyPrompt.length,
      storyPromptPreview: storyPrompt,
      storyPromptPersisted: Boolean(project?.storyPrompt),
    });

    return { storyPrompt, project, taskId: task.id };
  } catch (error: any) {
    logLyricStageError('story-prompt', 'service-fail', error, {
      projectId: params.projectId,
      userId: params.userId,
      taskId: task.id,
    });
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
      id: scene.id,
      text: scene.text?.trim() || sceneTextFromLineIds(scene.linkedLineIds || [], existingLines),
      prompt: scene.prompt?.trim() || '',
      negativePrompt: scene.negativePrompt?.trim() || '',
      linkedLineIds: scene.linkedLineIds || [],
      castIds: scene.castIds || [],
      styleOverrides: scene.styleOverrides || {},
      timelineConfig: scene.timelineConfig || {},
      motionPrompt: scene.motionPrompt?.trim() || '',
      imageUrl: scene.imageUrl,
      status: scene.status,
      startMs: Math.max(0, scene.startMs || 0),
      endMs: Math.max(scene.startMs || 0, scene.endMs || 0),
    }))
    .filter((scene) => scene.endMs > scene.startMs && (scene.text || scene.linkedLineIds.length > 0));

  return db().transaction(async (tx: any) => {
    await tx
      .delete(lyricVideoScene)
      .where(and(eq(lyricVideoScene.projectId, params.projectId), eq(lyricVideoScene.userId, params.userId)));

    const values = cleanScenes.map((scene, index) => ({
      id: scene.id || getUuid(),
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
      status: scene.status || (scene.imageUrl ? 'success' : scene.prompt ? 'draft' : 'lyrics_draft'),
    }));

    const inserted = values.length > 0 ? await tx.insert(lyricVideoScene).values(values).returning() : [];
    const scenesStatus =
      inserted.length === 0
        ? 'empty'
        : inserted.some((scene: any) => scene.prompt?.trim())
          ? 'ready'
          : 'lyrics_draft';

    await tx
      .update(lyricVideoProject)
      .set({ scenesStatus })
      .where(eq(lyricVideoProject.id, params.projectId));

    logLyricStage('replace-scenes', 'db-written', {
      projectId: params.projectId,
      userId: params.userId,
      runId: params.runId,
      sceneCount: inserted.length,
      scenes: inserted.map((scene: any) => ({
        id: scene.id,
        status: scene.status,
        promptLength: scene.prompt?.length || 0,
        motionPromptLength: scene.motionPrompt?.length || 0,
        hasImageUrl: Boolean(scene.imageUrl),
      })),
      scenesStatus,
    });

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

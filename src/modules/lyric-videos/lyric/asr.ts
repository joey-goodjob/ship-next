import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { ElevenLabsProvider, GroqProvider } from '@/core/ai';
import { lyricVideoLine, lyricVideoProject, lyricVideoWord } from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { createTask, updateTask, AITaskStatus } from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { analyzeAudioWithLibrosa, prepareAudioClipForTranscription, runLibrosaAnalysisForLocalFile } from './audio';
import { parseJson, parseJsonLoose, safeJson } from './json';
import { getProject } from './project';
import { callKieGeminiChat } from './llm';
import {
  ASR_LONG_SEGMENT_MS,
  ASR_MAX_WORDS_PER_LINE,
  ASR_TARGET_LINE_MS,
  ASR_WORD_GAP_CUT_MS,
  DEFAULT_TRANSCRIBE_MODEL,
  type AsrDraftResult,
  type AudioAnalysisResult,
  type LyricLineInput,
  type LyricVideoLlmPreprocessResult,
  type PreprocessLyricLine,
  type LyricWordInput,
} from './types';

/**
 * ASR 模块总览：
 * 这个文件负责“音频 -> 原始转写 -> 清洗后的逐词/逐句歌词 -> 可编辑歌词行”的主流程。
 *
 * 核心数据流：
 * 1. runAsr 读取项目音频，使用 ElevenLabs Scribe v2 生成逐词时间轴。
 * 2. 转写结果会被 normalize/clean/refine 这一组函数清洗，去掉广告、网址、纯数字等脏词，并把过长句子切成更适合歌词视频展示的短句。
 * 3. asrSnapshot 把原始转写、清洗后的行、逐词时间轴、音频节奏分析一起保存到 project.transcriptionRaw。
 * 4. replaceLyrics 直接把 ASR 行和逐词结果写成可编辑歌词，并更新项目状态。
 */

// ---------------------------------------------------------------------------
// Snapshot / read helpers
// 这一组函数只负责把 ASR 结果存起来、读出来、压缩成后续 prompt 能用的摘要。
// ---------------------------------------------------------------------------

/**
 * 把一次 ASR 运行的所有关键信息整理成可序列化快照。
 * 快照会写入 lyricVideoProject.transcriptionRaw，后续 storyboard、
 * debug 工具都可以从这里拿到原始转写、分句、逐词时间轴和音频分析结果。
 */
export function asrSnapshot(params: {
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

/**
 * 从项目的 transcriptionRaw 中恢复 ASR 快照。
 * 这里会兼容几种历史字段名：rawSegments / segments / raw.segments，
 * 这样即使之前保存结构变化过，后续歌词归整仍然能读取到可用的分句。
 */
export function readAsrSnapshot(project: any) {
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

/**
 * 只读取音频分析部分，例如 BPM、key、beatTimesMs、energy segments。
 * storyboard 生成会用这些音乐信息判断画面切点和能量强弱。
 */
export function readAudioAnalysis(project: any): AudioAnalysisResult | undefined {
  const parsed = parseJson<any>(project?.transcriptionRaw, {});
  if (!parsed.audioAnalysis || typeof parsed.audioAnalysis !== 'object') return undefined;
  return parsed.audioAnalysis as AudioAnalysisResult;
}

/**
 * 把较大的音频分析对象压缩成适合放进 LLM prompt 的短文本。
 * 只取前几个 beat 和 energy segment，避免 prompt 太长，同时保留节奏、调性、
 * 能量变化这些对歌词视频分镜很重要的信息。
 */
export function audioAnalysisPromptSummary(project: any) {
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

// ---------------------------------------------------------------------------
// ASR normalization / cleaning
// 这一组函数把不同供应商返回的时间单位、字段名和脏数据统一成内部格式。
// ---------------------------------------------------------------------------

/**
 * 把连续数值能量映射成低/中/高三档。
 * 下游分镜不需要精确 RMS 数值，只需要知道这一段音乐应该安静、正常还是更强烈。
 */
export function energyLevelForValue(value: number, min: number, max: number): 'low' | 'medium' | 'high' {
  if (!Number.isFinite(value) || max <= min) return 'medium';
  const normalized = (value - min) / (max - min);
  if (normalized < 0.34) return 'low';
  if (normalized < 0.67) return 'medium';
  return 'high';
}

/**
 * 统一一条 ASR segment 的结构。
 * 不同模型可能返回 start/end 秒，也可能返回 startMs/endMs 毫秒；
 * 这里会统一成毫秒，补默认 id，清理括号和多余空格，并保底保证每行至少 500ms。
 */
export function normalizeAsrSegment(segment: any, index: number): LyricLineInput {
  const startMs =
    segment?.startMs !== undefined
      ? Math.max(0, Math.round(Number(segment.startMs) || 0))
      : secondsToMs(segment?.start ?? index * 4);
  const endMs =
    segment?.endMs !== undefined
      ? Math.max(startMs + 500, Math.round(Number(segment.endMs) || 0))
      : Math.max(startMs + 500, secondsToMs(segment?.end ?? index * 4 + 3.5));
  return {
    id: segment?.id || `line_${index + 1}`,
    startMs,
    endMs,
    text: cleanLineText(String(segment?.text || '').replace(/[（）]/g, ' ')),
    wordStartIndex: Number.isFinite(Number(segment?.wordStartIndex)) ? Number(segment.wordStartIndex) : undefined,
    wordEndIndex: Number.isFinite(Number(segment?.wordEndIndex)) ? Number(segment.wordEndIndex) : undefined,
    source: segment?.source,
  };
}

/**
 * 统一一个 ASR word 的结构。
 * Whisper 常见字段是 word/start/end，内部使用 word/startMs/endMs。
 * 这里保留供应商原始 endMs，不在单词级别硬截断；异常长词会在
 * repairAsrWordTimings 里结合相邻词修复，避免把首词变成 0-1.5s 的假歌词 scene。
 */
export function normalizeAsrWord(word: any, index: number) {
  const text = String(word?.word || word?.text || '').trim();
  const rawStart =
    word?.startMs !== undefined && word?.startMs !== null
      ? Number(word.startMs)
      : word?.start !== undefined && word?.start !== null
        ? Number(word.start) * 1000
        : word?.start_time !== undefined && word?.start_time !== null
          ? Number(word.start_time) * 1000
          : index * 500;
  const startMs = Math.max(0, Math.round(Number.isFinite(rawStart) ? rawStart : index * 500));
  const rawEnd =
    word?.endMs !== undefined && word?.endMs !== null
      ? Number(word.endMs)
      : word?.end !== undefined && word?.end !== null
        ? Number(word.end) * 1000
        : word?.end_time !== undefined && word?.end_time !== null
          ? Number(word.end_time) * 1000
          : startMs + 450;
  const rawEndMs = Math.max(startMs + 1, Math.round(Number.isFinite(rawEnd) ? rawEnd : startMs + 450));
  return { index, word: text, startMs, endMs: rawEndMs, confidence: word?.confidence };
}

export function compactAsrText(text: string) {
  return String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export function likelyWordDurationMs(text: string) {
  const length = Math.max(1, compactAsrText(text).length);
  return Math.max(240, Math.min(900, length * 90));
}

export function isSuspiciousLongAsrWord(word: { word: string; startMs: number; endMs: number }) {
  const compact = compactAsrText(word.word);
  const durationMs = word.endMs - word.startMs;
  return durationMs > 4000 && compact.length > 0 && compact.length <= 12 && !/\s/.test(word.word.trim());
}

export function normalizeAndRepairAsrWords(words: any[]) {
  return repairAsrWordTimings((Array.isArray(words) ? words : []).map(normalizeAsrWord).sort((a, b) => a.startMs - b.startMs));
}

/**
 * 修复 Whisper 偶发的“首词覆盖整段前奏”问题。
 * 典型坏数据是第一个词 start=0、end=下一词 start，导致后续分镜变成
 * 0-1.5s 单词歌词 + 1.5-9s Instrumental。这里用相邻词边界把异常长短词
 * 收缩到真实发声边缘，保留该词，不把它丢掉。
 */
export function repairAsrWordTimings(words: Array<ReturnType<typeof normalizeAsrWord>>) {
  return words.map((word, index) => {
    if (!isSuspiciousLongAsrWord(word)) return word;

    const previous = words[index - 1];
    const next = words[index + 1];
    const inferredMs = likelyWordDurationMs(word.word);
    const nextTouchesEnd = next && Math.abs(next.startMs - word.endMs) <= 250;
    const previousTouchesStart = previous && Math.abs(previous.endMs - word.startMs) <= 250;

    if (nextTouchesEnd) {
      const startMs = Math.max(previous?.endMs || 0, word.endMs - inferredMs);
      return {
        ...word,
        startMs,
        endMs: Math.max(startMs + 1, word.endMs),
        timingRepaired: true,
      };
    }

    if (previousTouchesStart) {
      const endLimit = next?.startMs || word.startMs + inferredMs;
      const endMs = Math.min(endLimit, word.startMs + inferredMs);
      return {
        ...word,
        endMs: Math.max(word.startMs + 1, endMs),
        timingRepaired: true,
      };
    }

    return word;
  });
}

/**
 * 判断 token 是否只是括号、方括号这类分隔符。
 * 这种 token 没有歌词含义，但经常被 ASR 当成单词吐出来，用它作为断句点更合适。
 */
export function isAsrSeparatorToken(text: string) {
  return /^[()[\]{}（）【】]+$/.test(text);
}

export function isAsrEventToken(text: string) {
  const clean = text.trim();
  return /^\[[^\]]+\]$/.test(clean) || /^\([^)]+\)$/.test(clean);
}

/**
 * 判断一个 ASR word 是否应该丢弃。
 * 典型脏数据包括：空词、网址、纯括号、纯数字、类似 A.B. 的频道/署名残留，
 * 以及“文本很短但持续时间特别长”的异常 token。
 */
export function isDirtyAsrWord(word: { word: string; startMs: number; endMs: number }) {
  const text = word.word.trim();
  const durationMs = word.endMs - word.startMs;
  if (!text) return true;
  if (isAsrEventToken(text)) return true;
  if (/https?:\/\/|www\.|\.com\b|\.tv\b/i.test(text)) return true;
  if (isAsrSeparatorToken(text)) return true;
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return true;
  if (/^[A-Za-z]\.[A-Za-z]\.?$/.test(text)) return true;
  return durationMs > 4000 && text.replace(/[^\p{L}\p{N}]/gu, '').length <= 12;
}

/**
 * 清洗逐词时间轴，输出真正可以存入 lyricVideoWord 的词列表。
 * 这里会先统一字段，再过滤脏 token，最后去掉 normalizeAsrWord 里的内部 index 字段。
 */
export function cleanAsrWordsForLyrics(words: any[]): LyricWordInput[] {
  return normalizeAndRepairAsrWords(words)
    .filter((word) => !isDirtyAsrWord(word))
    .map((word) => ({
      word: word.word,
      startMs: word.startMs,
      endMs: word.endMs,
      confidence: word.confidence,
      timingRepaired: (word as any).timingRepaired,
    }));
}

/**
 * 清理歌词行文本。
 * 主要处理中文/英文括号、标点前多余空格、连续空格，避免字幕行出现奇怪间距。
 */
export function cleanLineText(text: string) {
  return text
    .replace(/[（）]/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 判断整行 ASR 文本是否是脏行。
 * 行级过滤和 word 级过滤分开做，因为有些供应商只给 segment 不给 words。
 */
export function isDirtyAsrLineText(text: string) {
  const clean = text.trim();
  if (!clean) return true;
  if (/https?:\/\/|www\.|\.com\b|\.tv\b/i.test(clean)) return true;
  if (/^\d+(?:[.,]\d+)?$/.test(clean)) return true;
  if (/^[A-Za-z]\.[A-Za-z]\.?$/.test(clean)) return true;
  return false;
}

export const MIN_LYRIC_LINE_DURATION_MS = 1500;
const VOCALIZATION_WORDS = new Set(['oh', 'ooh', 'oooh', 'ah', 'aah', 'la', 'na', 'hey', 'yeah', 'yea', 'whoa', 'woah', 'hmm', 'mm', 'mmm', 'uh', 'ha']);

export function isSentenceBreakWord(text: string) {
  return /[.!?。！？]$/.test(text.trim());
}

export function isVocalizationLine(text: string) {
  const tokens = String(text || '')
    .split(/\s+/)
    .map((token) => compactAsrText(token))
    .filter(Boolean);
  return tokens.length > 0 && tokens.length <= 10 && tokens.every((token) => VOCALIZATION_WORDS.has(token));
}

export function mergeLyricLines(a: LyricLineInput, b: LyricLineInput, source = 'asr_words_merged'): LyricLineInput {
  const startMs = Math.min(a.startMs || 0, b.startMs || 0);
  const endMs = Math.max(a.endMs || startMs, b.endMs || startMs);
  const wordStartIndex = [a.wordStartIndex, b.wordStartIndex]
    .filter((value): value is number => Number.isFinite(Number(value)))
    .sort((x, y) => x - y)[0];
  const wordEndIndex = [a.wordEndIndex, b.wordEndIndex]
    .filter((value): value is number => Number.isFinite(Number(value)))
    .sort((x, y) => y - x)[0];

  return {
    startMs,
    endMs: Math.max(startMs + 500, endMs),
    text: cleanLineText([a.text, b.text].filter(Boolean).join(' ')),
    wordStartIndex,
    wordEndIndex,
    source,
  };
}

export function mergeShortAndVocalizationLines(lines: LyricLineInput[], minDurationMs = MIN_LYRIC_LINE_DURATION_MS) {
  const sorted = [...lines]
    .filter((line) => line.text && !isDirtyAsrLineText(line.text))
    .sort((a, b) => (a.startMs || 0) - (b.startMs || 0));

  const vocalMerged: LyricLineInput[] = [];
  for (const line of sorted) {
    const previous = vocalMerged[vocalMerged.length - 1];
    if (previous && isVocalizationLine(previous.text) && isVocalizationLine(line.text)) {
      vocalMerged[vocalMerged.length - 1] = mergeLyricLines(previous, line, 'asr_vocalization_merged');
    } else {
      vocalMerged.push(line);
    }
  }

  const merged = [...vocalMerged];
  let index = 0;
  while (index < merged.length) {
    const line = merged[index];
    const durationMs = Math.max(0, Number(line.endMs || 0) - Number(line.startMs || 0));
    if (durationMs >= minDurationMs || merged.length <= 1) {
      index += 1;
      continue;
    }

    const previous = merged[index - 1];
    const next = merged[index + 1];
    if (!previous && !next) {
      index += 1;
      continue;
    }

    const gapToPrevious = previous ? Math.max(0, Number(line.startMs || 0) - Number(previous.endMs || 0)) : Number.POSITIVE_INFINITY;
    const gapToNext = next ? Math.max(0, Number(next.startMs || 0) - Number(line.endMs || 0)) : Number.POSITIVE_INFINITY;
    if (previous && (!next || gapToPrevious <= gapToNext)) {
      merged[index - 1] = mergeLyricLines(previous, line);
      merged.splice(index, 1);
      index = Math.max(0, index - 1);
    } else if (next) {
      merged[index] = mergeLyricLines(line, next);
      merged.splice(index + 1, 1);
    } else {
      index += 1;
    }
  }

  return merged.map((line, lineIndex) => {
    const next = merged[lineIndex + 1];
    const startMs = Math.max(0, Number(line.startMs || 0));
    const nextStartMs = next ? Math.max(0, Number(next.startMs || 0)) : Number.POSITIVE_INFINITY;
    const naturalEndMs = Math.max(startMs + 500, Number(line.endMs || startMs + 500));
    const endMs = nextStartMs > startMs ? Math.min(naturalEndMs, nextStartMs) : naturalEndMs;
    return {
      ...line,
      id: `line_${lineIndex + 1}`,
      startMs,
      endMs,
    };
  });
}

// ---------------------------------------------------------------------------
// Line splitting / fallback grouping
// 这一组函数决定“哪些词应该放在同一行歌词里”。
// ---------------------------------------------------------------------------

/**
 * 判断当前 word 前面是否应该断开成新歌词行。
 * 除了明显的静音间隔，还加入了一些英文歌词常见起句词判断；
 * 这是为了避免 ASR 把副歌或新短句粘在上一句尾巴后面。
 */
export function shouldCutBeforeWord(params: {
  group: ReturnType<typeof normalizeAsrWord>[];
  word: ReturnType<typeof normalizeAsrWord>;
  previous?: ReturnType<typeof normalizeAsrWord>;
}) {
  if (params.group.length === 0) return false;
  const first = params.group[0];
  const previous = params.previous || params.group[params.group.length - 1];
  const gapMs = params.word.startMs - previous.endMs;
  const durationMs = previous.endMs - first.startMs;
  const startsHook = /^open$/i.test(params.word.word) && durationMs >= 2500;
  const startsLikelyPhrase = /^(i|every|found|underneath|took|but|now|with|if|hands|no|watch)$/i.test(params.word.word)
    && durationMs >= 2500;
  return (gapMs >= ASR_WORD_GAP_CUT_MS && durationMs >= 1000) || startsHook || startsLikelyPhrase;
}

/**
 * 用逐词时间轴把过长的 ASR segment 切短。
 * ASR segment 有时会把 10 秒甚至更长的歌词合成一行，这对视频字幕不可读；
 * 这里按脏词、分隔符、静音间隔、标点、最大词数和目标时长综合切句。
 */
export function splitLongAsrSegmentWithWords(params: {
  segment: LyricLineInput;
  words: Array<ReturnType<typeof normalizeAsrWord>>;
}) {
  const rawWords = params.words
    .filter((word) => word.endMs > (params.segment.startMs || 0) && word.startMs < (params.segment.endMs || 0))
    .sort((a, b) => a.startMs - b.startMs);
  const lines: LyricLineInput[] = [];
  let group: Array<ReturnType<typeof normalizeAsrWord>> = [];

  const flush = () => {
    const cleanGroup = group.filter((word) => !isDirtyAsrWord(word));
    group = [];
    if (cleanGroup.length === 0) return;
    const first = cleanGroup[0];
    const last = cleanGroup[cleanGroup.length - 1];
    const text = cleanLineText(cleanGroup.map((word) => word.word).join(' '));
    if (!text) return;
    lines.push({
      startMs: first.startMs,
      endMs: Math.max(first.startMs + 500, last.endMs),
      text,
      wordStartIndex: first.index,
      wordEndIndex: last.index,
      source: 'asr_words_refined',
    });
  };

  for (const word of rawWords) {
    if (isAsrSeparatorToken(word.word)) {
      flush();
      continue;
    }
    if (isDirtyAsrWord(word)) continue;

    const previous = group[group.length - 1];
    if (previous && shouldCutBeforeWord({ group, word, previous })) flush();

    group.push(word);
    const first = group[0];
    const durationMs = word.endMs - first.startMs;
    const sentenceBreak = /[.!?。！？]$/.test(word.word);
    if (
      sentenceBreak ||
      group.length >= ASR_MAX_WORDS_PER_LINE ||
      durationMs >= ASR_TARGET_LINE_MS ||
      durationMs >= ASR_LONG_SEGMENT_MS
    ) {
      flush();
    }
  }
  flush();

  return lines.length > 0 ? lines : [params.segment];
}

/**
 * 把供应商返回的 segments 和 words 归整成内部歌词行。
 * 如果没有 segments，就完全基于 words 重新分组；如果 segment 太长，
 * 就调用 splitLongAsrSegmentWithWords 做二次切分。
 */
export function refineAsrSegmentsWithWords(params: {
  segments: any[];
  words?: any[];
}): LyricLineInput[] {
  const segments = (Array.isArray(params.segments) ? params.segments : [])
    .map(normalizeAsrSegment)
    .filter((line) => line.text && !isDirtyAsrLineText(line.text));
  const words = normalizeAndRepairAsrWords(params.words || []);
  const usableWords = words.filter((word) => !isDirtyAsrWord(word));
  const hasWordSentenceBreaks = usableWords.some((word) => isSentenceBreakWord(word.word));
  if (usableWords.length > 0 && (segments.length === 0 || hasWordSentenceBreaks)) {
    return groupWordsIntoLyricLines(usableWords);
  }
  if (segments.length === 0) return groupWordsIntoLyricLines(cleanAsrWordsForLyrics(words));

  const refined = segments
    .flatMap((segment) => {
      const durationMs = (segment.endMs || 0) - (segment.startMs || 0);
      if (durationMs <= ASR_LONG_SEGMENT_MS || words.length === 0) return [segment];
      return splitLongAsrSegmentWithWords({ segment, words });
    })
    .sort((a, b) => (a.startMs || 0) - (b.startMs || 0))
    .map((line, index) => ({
      ...line,
      id: `line_${index + 1}`,
      endMs: Math.max((line.startMs || 0) + 500, line.endMs || 0),
    }));

  return repairSuspiciousLeadingAsrLine({
    lines: refined,
    segments,
    words,
  });
}

export function repairSuspiciousLeadingAsrLine(params: {
  lines: LyricLineInput[];
  segments: LyricLineInput[];
  words: Array<ReturnType<typeof normalizeAsrWord>>;
}) {
  const [first, second] = params.lines;
  if (!first || !second) return params.lines;

  const firstText = compactAsrText(first.text);
  const firstTokenCount = first.text.trim().split(/\s+/).filter(Boolean).length;
  const firstDurationMs = (first.endMs || 0) - (first.startMs || 0);
  const gapToSecondMs = (second.startMs || 0) - (first.endMs || 0);
  const looksLikeSingleWordLead = firstTokenCount <= 1 && firstDurationMs <= 1800 && gapToSecondMs >= 3000;
  if (!looksLikeSingleWordLead || firstText.length === 0) return params.lines;

  const coveringSegment = params.segments.find((segment) => {
    const segmentText = compactAsrText(segment.text);
    const firstSegmentWord = compactAsrText(String(segment.text || '').trim().split(/\s+/)[0] || '');
    return segmentText.length > firstText.length * 2 && looseAsrWordMatch(firstText, firstSegmentWord);
  });
  if (!coveringSegment) return params.lines;

  const segmentWords = params.words.filter(
    (word) => word.endMs > (coveringSegment.startMs || 0) && word.startMs < (coveringSegment.endMs || 0)
  );
  const repairedFromWords = splitLongAsrSegmentWithWords({
    segment: coveringSegment,
    words: segmentWords.length > 0 ? segmentWords : params.words,
  });
  const repairedFirst = repairedFromWords[0];
  if (!repairedFirst || compactAsrText(repairedFirst.text) === firstText) return params.lines;

  const segmentStartMs = coveringSegment.startMs || 0;
  const segmentEndMs = coveringSegment.endMs || segmentStartMs;
  const segmentText = compactAsrText(coveringSegment.text);
  const remaining = params.lines.filter((line) => {
    const lineStartMs = line.startMs || 0;
    const lineEndMs = line.endMs || lineStartMs;
    const overlapsSegment = lineEndMs > segmentStartMs && lineStartMs < segmentEndMs;
    return !overlapsSegment || !segmentText.includes(compactAsrText(line.text));
  });
  const merged = [...repairedFromWords, ...remaining]
    .sort((a, b) => (a.startMs || 0) - (b.startMs || 0))
    .map((line, index) => ({ ...line, id: `line_${index + 1}`, source: line.source || 'asr_timing_repaired' }));

  return merged;
}

export function looseAsrWordMatch(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const rows = Array.from({ length: a.length + 1 }, (_, index) => [index]);
  for (let column = 1; column <= b.length; column += 1) rows[0][column] = column;
  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
      );
    }
  }
  return rows[a.length][b.length] <= 2;
}

export function asrTimingDebugSummary(params: {
  raw?: any;
  cleanedWords: LyricWordInput[];
  finalLines: LyricLineInput[];
  fixedScenes?: Array<{ kind?: string; startMs?: number; endMs?: number; text?: string; linkedLineIds?: unknown }>;
}) {
  const rawSegments = Array.isArray(params.raw?.segments) ? params.raw.segments : [];
  const rawWords = Array.isArray(params.raw?.words) ? params.raw.words : [];
  const repairedWords = params.cleanedWords.filter((word: any) => word.timingRepaired);
  const suspiciousShortScenes = (params.fixedScenes || []).filter(
    (scene) =>
      scene.kind === 'lyric' &&
      String(scene.text || '').trim().split(/\s+/).filter(Boolean).length <= 1 &&
      Math.max(0, Number(scene.endMs || 0) - Number(scene.startMs || 0)) <= 1800
  );

  return {
    rawSegments: rawSegments.slice(0, 5).map((segment: any) => ({
      start: segment.start,
      end: segment.end,
      text: segment.text,
    })),
    rawWords: rawWords.slice(0, 30),
    cleanedWords: params.cleanedWords.slice(0, 30),
    finalLines: params.finalLines.slice(0, 10).map((line) => ({
      id: line.id,
      startMs: line.startMs,
      endMs: line.endMs,
      text: line.text,
      source: line.source,
    })),
    fixedScenes: (params.fixedScenes || []).slice(0, 10).map((scene) => ({
      kind: scene.kind,
      startMs: scene.startMs,
      endMs: scene.endMs,
      text: scene.text,
      linkedLineIds: scene.linkedLineIds,
    })),
    timingRepairApplied: repairedWords.length > 0 || params.finalLines.some((line) => line.source === 'asr_timing_repaired'),
    repairedWordCount: repairedWords.length,
    suspiciousShortSceneCount: suspiciousShortScenes.length,
  };
}

/**
 * 为 LLM 预处理阶段准备歌词行。
 * 优先使用 ASR segment + words 的精细结果；如果没有 segment，
 * 就退回到 rawText 按换行拆分，并给每行补一个粗略时间。
 */
export function normalizePreprocessLyrics(params: {
  rawText?: string;
  rawSegments?: any[];
  words?: any[];
}): PreprocessLyricLine[] {
  const candidateSegments = Array.isArray(params.rawSegments) ? params.rawSegments : [];
  const lines =
    candidateSegments.length > 0
      ? refineAsrSegmentsWithWords({
          segments: candidateSegments,
          words: params.words,
        })
      : parseLinesFromText(params.rawText || '').map((line, index) => ({
          id: `line_${index + 1}`,
          startMs: line.startMs || index * 4000,
          endMs: line.endMs || index * 4000 + 3500,
          text: line.text,
        }));

  return lines
    .sort((a, b) => (a.startMs || 0) - (b.startMs || 0))
    .map((line: any, index) => ({
      id: line.id || `line_${index + 1}`,
      startMs: Math.max(0, Math.round(line.startMs || index * 4000)),
      endMs: Math.max((line.startMs || index * 4000) + 500, line.endMs || index * 4000 + 3500),
      text: line.text,
      wordStartIndex: line.wordStartIndex,
      wordEndIndex: line.wordEndIndex,
    }));
}

/**
 * 从上传文件名推导歌曲标题。
 * 去掉扩展名，如果文件名为空就给默认标题，避免后续 prompt 里 title 缺失。
 */
export function titleFromFilename(filename?: string) {
  return (filename || 'Untitled song').replace(/\.[^/.]+$/, '').trim() || 'Untitled song';
}

/**
 * 把纯文本歌词按换行拆成歌词行。
 * 这是没有 ASR 时间轴时的兜底方案，每行按 4 秒估算，保证后续流程还有时间信息可用。
 */
export function parseLinesFromText(text: string): LyricLineInput[] {
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

/**
 * 把秒转换成毫秒。
 * ASR 供应商常用秒，数据库和内部渲染统一使用毫秒。
 */
export function secondsToMs(value: unknown) {
  const num = Number(value || 0);
  return Math.max(0, Math.round(num * 1000));
}

// ---------------------------------------------------------------------------
// Provider calls
// 这一组函数只负责调用外部模型，并把返回值转成 raw / lines / words。
// ---------------------------------------------------------------------------

/**
 * 使用 Kie Gemini 直接听音频并生成歌词行。
 * 这是没有配置 Groq API key 时的转写兜底路径；它主要返回 line 级时间轴，
 * 通常不会返回 word 级时间轴，所以 words 固定为空数组。
 */
export async function transcribeWithKieGemini(audioUrl: string) {
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

/**
 * 使用 Groq Whisper 做 ASR。
 * Groq 路径通常能拿到更细的 words 时间轴，因此后面可以更准确地切歌词行、
 * 关联每个单词到对应歌词行，并给前端做逐词高亮。
 */
export async function transcribeWithGroqWhisper(params: {
  audioUrl: string;
  configs: Record<string, string>;
  language?: string;
  prompt?: string;
  transcribeModel?: string;
}) {
  const provider = new GroqProvider({
    apiKey: params.configs.groq_api_key,
    baseUrl: params.configs.groq_base_url,
    transcribeModel: params.transcribeModel || DEFAULT_TRANSCRIBE_MODEL,
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

/**
 * 使用 ElevenLabs Scribe v2 做 ASR。
 * 这个路径是歌词视频主流程的默认转写入口，依赖 words 时间轴来生成歌词行和分镜草稿。
 */
export async function transcribeWithElevenLabs(params: {
  audioUrl: string;
  configs: Record<string, string>;
  language?: string;
  prompt?: string;
  transcribeModel?: string;
}) {
  const provider = new ElevenLabsProvider({
    apiKey: params.configs.elevenlabs_api_key,
    sttModel: params.transcribeModel || params.configs.elevenlabs_stt_model || 'scribe_v2',
  });
  const result = await provider.transcribe({
    audioUrl: params.audioUrl,
    language: params.language && params.language !== 'auto' ? params.language : undefined,
    prompt: params.prompt,
  });

  return {
    raw: result.raw,
    text: result.text,
    words: result.words,
    lines: result.lines.map((line) => ({
      startMs: line.startMs,
      endMs: line.endMs,
      text: line.text,
    })),
  };
}

// ---------------------------------------------------------------------------
// Lyrics persistence helpers
// 这一组函数把 ASR 结果稳定落成可编辑歌词，不再调用 LLM 改写时间轴。
// ---------------------------------------------------------------------------
/**
 * 给一个 word 找到最匹配的歌词行。
 * 优先用 word 中点落在哪一行；如果中点不在任何行，就按 word 与每行的重叠时长排序。
 * replaceLyrics 写入逐词表时会用它把 lyricVideoWord.lineId 关联回 lyricVideoLine。
 */
function findLineForWordByTime(word: { startMs: number; endMs: number }, lines: any[]) {
  const wordStartMs = Math.max(0, Number(word.startMs) || 0);
  const wordEndMs = Math.max(wordStartMs + 1, Number(word.endMs) || wordStartMs + 1);
  const midpointMs = wordStartMs + (wordEndMs - wordStartMs) / 2;
  const midpointLine = lines.find((line: any) => midpointMs >= line.startMs && midpointMs < line.endMs);
  if (midpointLine) return midpointLine;

  const best = lines
    .map((line: any) => ({
      line,
      overlapMs: Math.max(0, Math.min(wordEndMs, line.endMs) - Math.max(wordStartMs, line.startMs)),
    }))
    .sort((a, b) => b.overlapMs - a.overlapMs)[0];
  return best && best.overlapMs > 0 ? best.line : undefined;
}

/**
 * 只靠 word 时间轴重新组织歌词行。
 * ElevenLabs 的 segment 边界经常落在半句话中间，所以这里主要信任逐词标点；
 * 只有一句话本身过长时才用时长兜底切开。
 */
export function groupWordsIntoLyricLines(words: any[]): LyricLineInput[] {
  const cleanWords = words
    .map((word, index) => {
      const start = Number(word.startMs);
      const startMs = Math.max(0, Number.isFinite(start) ? start : index * 500);
      const end = Number(word.endMs);
      return {
        index: Number.isFinite(Number(word.index)) ? Number(word.index) : index,
        text: String(word.word || word.text || '').trim(),
        startMs,
        endMs: Math.max(startMs + 1, Number.isFinite(end) ? end : startMs + 450),
      };
    })
    .filter((word) => word.text && !isDirtyAsrWord({ word: word.text, startMs: word.startMs, endMs: word.endMs }));

  const lines: LyricLineInput[] = [];
  let group: typeof cleanWords = [];

  const flush = () => {
    if (group.length === 0) return;
    const first = group[0];
    const last = group[group.length - 1];
    lines.push({
      startMs: first.startMs,
      endMs: Math.max(first.startMs + 500, last.endMs),
      text: cleanLineText(group.map((word) => word.text).join(' ')),
      wordStartIndex: first.index,
      wordEndIndex: last.index,
      source: 'asr_words_sentence',
    });
    group = [];
  };

  for (const word of cleanWords) {
    group.push(word);
    const first = group[0];
    const duration = word.endMs - first.startMs;
    if (isSentenceBreakWord(word.text) || duration >= ASR_LONG_SEGMENT_MS) flush();
  }
  flush();

  return mergeShortAndVocalizationLines(lines);
}

// ---------------------------------------------------------------------------
// Main service operations
// 这一组是外部 API/runner 真正调用的服务入口，会读写数据库和任务状态。
// ---------------------------------------------------------------------------

/**
 * 执行完整 ASR 流程。
 * 主要步骤：
 * 1. 校验项目和音频是否存在。
 * 2. 创建 aiTask，记录本次 ASR 成本、供应商、模型和项目 id。
 * 3. 标记项目进入 asr_processing。
 * 4. 准备可转写音频，并并行执行“语音转写”和“librosa 音频分析”。
 * 5. 清洗 ASR words，精修 ASR segments，生成 transcriptionRaw 快照。
 * 6. 在事务中清空旧 words/lines，写入新 words，并把项目状态改为 asr_ready。
 * 7. 成功则更新 aiTask；失败则把任务和项目都标记为失败。
 */
export async function runAsr(params: {
  userId: string;
  projectId: string;
}) {
  const project = await getProject({ userId: params.userId, id: params.projectId });
  if (!project) throw new Error('Project not found');
  if (!(project.originalAudioUrl || project.audioUrl)) throw new Error('Upload audio before ASR');

  const configs = await getAllConfigs();
  const provider = 'elevenlabs';
  const model = configs.elevenlabs_stt_model || 'scribe_v2';
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
    logLyricStage('asr', 'service-start', {
      projectId: params.projectId,
      userId: params.userId,
      provider,
      model,
      taskId: task.id,
      audioUrl: project.audioUrl,
      originalAudioUrl: project.originalAudioUrl,
    });
    await db()
      .update(lyricVideoProject)
      .set({ lyricsStatus: 'asr_processing', pipelineStage: 'asr_processing', pipelineError: null })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));

    const transcriptionProject = await prepareAudioClipForTranscription({
      userId: params.userId,
      project,
    });
    const transcriptionAudioUrl = transcriptionProject.processedAudioUrl || transcriptionProject.audioUrl;
    if (!configs.elevenlabs_api_key) {
      throw new Error('ELEVENLABS_API_KEY is required for ElevenLabs transcription');
    }
    const transcriptionPromise = transcribeWithElevenLabs({
      audioUrl: transcriptionAudioUrl || '',
      configs,
      language: project.language || 'auto',
      prompt: project.title,
      transcribeModel: model,
    });
    const [result, analysisResult] = await Promise.all([
      transcriptionPromise,
      analyzeAudioWithLibrosa({
        projectId: params.projectId,
        audioUrl: transcriptionAudioUrl,
      }),
    ]);
    const refinedLines = refineAsrSegmentsWithWords({
      segments: result.lines,
      words: result.words || [],
    });
    const cleanedWords = cleanAsrWordsForLyrics(result.words || []);
    const lyricLines = refinedLines.length > 0 ? refinedLines : groupWordsIntoLyricLines(cleanedWords);
    if (lyricLines.length === 0) {
      throw new Error('ASR returned no lyric lines');
    }
    const asrResult: AsrDraftResult = {
      raw: result.raw,
      rawText: String((result as any).text || lyricLines.map((line: LyricLineInput) => line.text).join('\n')).trim(),
      rawSegments: lyricLines,
      words: cleanedWords,
    };

    const snapshot = asrSnapshot({
      provider,
      model,
      result: asrResult,
      audioAnalysis: analysisResult.audioAnalysis,
      audioAnalysisError: analysisResult.audioAnalysisError,
    });
    const lines = await replaceLyrics({
      userId: params.userId,
      projectId: params.projectId,
      lines: asrResult.rawSegments,
      words: asrResult.words,
      source: refinedLines.length > 0 ? 'asr_words_refined' : 'asr_words',
    });
    logLyricStage('asr', 'timing-summary', {
      projectId: params.projectId,
      userId: params.userId,
      taskId: task.id,
      ...asrTimingDebugSummary({
        raw: result.raw,
        cleanedWords,
        finalLines: asrResult.rawSegments,
      }),
    });
    await db()
      .update(lyricVideoProject)
      .set({
        transcriptionRaw: safeJson(snapshot),
        lyricsStatus: 'ready',
        pipelineStage: 'lyrics_ready',
        pipelineError: null,
      })
      .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));
    logLyricStage('asr', 'db-written', {
      projectId: params.projectId,
      userId: params.userId,
      provider,
      model,
      taskId: task.id,
      rawTextLength: asrResult.rawText.length,
      rawSegmentsCount: asrResult.rawSegments.length,
      lineCount: lines.length,
      wordCount: asrResult.words.length,
      audioAnalysisPresent: Boolean(analysisResult.audioAnalysis),
      audioAnalysisError: analysisResult.audioAnalysisError,
      pipelineStage: 'lyrics_ready',
      lyricsStatus: 'ready',
    });

    await updateTask({ taskId: task.id, status: AITaskStatus.SUCCESS, taskResult: snapshot });
    const updated = await getProject({ userId: params.userId, id: params.projectId });
    return {
      words: asrResult.words,
      lines,
      rawText: asrResult.rawText,
      rawSegments: asrResult.rawSegments,
      audioAnalysis: analysisResult.audioAnalysis,
      audioAnalysisError: analysisResult.audioAnalysisError,
      project: updated,
      taskId: task.id,
      provider,
      model,
    };
  } catch (error: any) {
    logLyricStageError('asr', 'service-fail', error, {
      projectId: params.projectId,
      userId: params.userId,
      provider,
      model,
      taskId: task.id,
    });
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

/**
 * 用一批新的歌词行/逐词数据替换项目当前歌词。
 * 这是 ASR 后归整、用户手动提交歌词、debug 工具重写歌词都会用到的统一入库入口。
 * 它会先删除旧 lyricVideoWord 和 lyricVideoLine，再写入新行，并根据 word 时间把词挂到对应行上。
 */
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
        const line = findLineForWordByTime(word, inserted);
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

    logLyricStage('replace-lyrics', 'db-written', {
      projectId: params.projectId,
      userId: params.userId,
      runId: params.runId,
      lineCount: inserted.length,
      wordCount: cleanWords.length,
      source: params.source,
      pipelineStage: inserted.length > 0 ? 'lyrics_ready' : 'uploaded',
      lyricsStatus: inserted.length > 0 ? 'ready' : 'empty',
    });

    return inserted;
  });
}

/**
 * 创建歌词草稿。
 * 如果用户提供 rawLyrics，就直接按换行切成手动歌词并入库；
 * 如果没有提供 rawLyrics，就跑 ASR 并直接返回 ElevenLabs 生成的歌词行。
 */
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

  const asr = await runAsr({ userId: params.userId, projectId: params.projectId });
  return asr.lines;
}

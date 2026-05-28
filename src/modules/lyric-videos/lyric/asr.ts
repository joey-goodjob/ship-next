import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { GroqProvider } from '@/core/ai';
import { lyricVideoLine, lyricVideoProject, lyricVideoWord } from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { createTask, updateTask, AITaskStatus } from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { analyzeAudioWithLibrosa, prepareAudioClipForTranscription, runLibrosaAnalysisForLocalFile } from './audio';
import { parseJson, parseJsonLoose, previewText, safeJson } from './json';
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

export function readAudioAnalysis(project: any): AudioAnalysisResult | undefined {
  const parsed = parseJson<any>(project?.transcriptionRaw, {});
  if (!parsed.audioAnalysis || typeof parsed.audioAnalysis !== 'object') return undefined;
  return parsed.audioAnalysis as AudioAnalysisResult;
}

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

export function energyLevelForValue(value: number, min: number, max: number): 'low' | 'medium' | 'high' {
  if (!Number.isFinite(value) || max <= min) return 'medium';
  const normalized = (value - min) / (max - min);
  if (normalized < 0.34) return 'low';
  if (normalized < 0.67) return 'medium';
  return 'high';
}

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

export function normalizeAsrWord(word: any, index: number) {
  const text = String(word?.word || word?.text || '').trim();
  const startMs = Math.max(0, Math.round(Number(word?.startMs) || Number(word?.start) * 1000 || index * 500));
  const rawEndMs = Math.max(startMs + 1, Math.round(Number(word?.endMs) || Number(word?.end) * 1000 || startMs + 450));
  const endMs = rawEndMs - startMs > 4000 ? startMs + 1500 : rawEndMs;
  return { index, word: text, startMs, endMs, confidence: word?.confidence };
}

export function isAsrSeparatorToken(text: string) {
  return /^[()[\]{}（）【】]+$/.test(text);
}

export function isDirtyAsrWord(word: { word: string; startMs: number; endMs: number }) {
  const text = word.word.trim();
  const durationMs = word.endMs - word.startMs;
  if (!text) return true;
  if (/https?:\/\/|www\.|\.com\b|\.tv\b/i.test(text)) return true;
  if (isAsrSeparatorToken(text)) return true;
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return true;
  if (/^[A-Za-z]\.[A-Za-z]\.?$/.test(text)) return true;
  return durationMs > 4000 && text.replace(/[^\p{L}\p{N}]/gu, '').length <= 5;
}

export function cleanAsrWordsForLyrics(words: any[]): LyricWordInput[] {
  return (Array.isArray(words) ? words : [])
    .map(normalizeAsrWord)
    .filter((word) => !isDirtyAsrWord(word))
    .map((word) => ({
      word: word.word,
      startMs: word.startMs,
      endMs: word.endMs,
      confidence: word.confidence,
    }));
}

export function cleanLineText(text: string) {
  return text
    .replace(/[（）]/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDirtyAsrLineText(text: string) {
  const clean = text.trim();
  if (!clean) return true;
  if (/https?:\/\/|www\.|\.com\b|\.tv\b/i.test(clean)) return true;
  if (/^\d+(?:[.,]\d+)?$/.test(clean)) return true;
  if (/^[A-Za-z]\.[A-Za-z]\.?$/.test(clean)) return true;
  return false;
}

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

export function refineAsrSegmentsWithWords(params: {
  segments: any[];
  words?: any[];
}): LyricLineInput[] {
  const segments = (Array.isArray(params.segments) ? params.segments : [])
    .map(normalizeAsrSegment)
    .filter((line) => line.text && !isDirtyAsrLineText(line.text));
  const words = (Array.isArray(params.words) ? params.words : []).map(normalizeAsrWord);
  if (segments.length === 0) return groupWordsIntoLyricLines(cleanAsrWordsForLyrics(words));

  return segments
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
}

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

export function titleFromFilename(filename?: string) {
  return (filename || 'Untitled song').replace(/\.[^/.]+$/, '').trim() || 'Untitled song';
}

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

export function secondsToMs(value: unknown) {
  const num = Number(value || 0);
  return Math.max(0, Math.round(num * 1000));
}

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
    transcribeModel: params.transcribeModel || params.configs.groq_transcribe_model || DEFAULT_TRANSCRIBE_MODEL,
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

export async function normalizeLyricsWithKieGemini(params: {
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

export function pickLyricLineArray(parsed: any): any[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  if (Array.isArray(parsed.lines)) return parsed.lines;
  if (Array.isArray(parsed.lyrics)) return parsed.lyrics;
  if (Array.isArray(parsed.items)) return parsed.items;
  return [];
}

export function normalizeLyricLineCandidates(candidateLines: any[], source: string): LyricLineInput[] {
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

export function coerceTimestampMs(value: unknown, fallbackMs: number, unit: 'ms' | 'auto') {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return Math.max(0, Math.round(fallbackMs));
  if (unit === 'ms') return Math.round(num);
  return Math.round(num < 1000 ? num * 1000 : num);
}

export function buildLyricsNormalizeFallback(params: {
  words: any[];
  rawText: string;
  rawSegments: LyricLineInput[];
}) {
  const segmentLines = refineAsrSegmentsWithWords({
    segments: params.rawSegments,
    words: params.words,
  }).map((line) => ({ ...line, source: line.source || 'asr_segment_fallback' }));
  if (segmentLines.length > 0) return { lines: segmentLines, source: 'asr_segments' };

  const wordLines = groupWordsIntoLyricLines(params.words);
  if (wordLines.length > 0) return { lines: wordLines, source: 'asr_words' };

  const textLines = parseLinesFromText(params.rawText).map((line) => ({ ...line, source: 'raw_text_fallback' }));
  return { lines: textLines, source: textLines.length > 0 ? 'raw_text' : undefined };
}

export function groupWordsIntoLyricLines(words: any[]): LyricLineInput[] {
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
    const refinedLines = refineAsrSegmentsWithWords({
      segments: result.lines,
      words: result.words || [],
    });
    const cleanedWords = cleanAsrWordsForLyrics(result.words || []);
    const asrResult: AsrDraftResult = {
      raw: result.raw,
      rawText: String((result as any).text || refinedLines.map((line: LyricLineInput) => line.text).join('\n')).trim(),
      rawSegments: refinedLines,
      words: cleanedWords,
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

export type CaptionWord = {
  id?: string;
  lineId?: string | null;
  word: string;
  startMs?: number | null;
  endMs?: number | null;
  sort?: number | null;
};

export type CaptionChunk = {
  text: string;
  startMs: number;
  endMs: number;
  words: CaptionWord[];
};

type CaptionChunkOptions = {
  gapMs?: number;
  minDurationMs?: number;
  rangeStartMs?: number;
  rangeEndMs?: number;
};

const DEFAULT_CAPTION_GAP_MS = 650;
const DEFAULT_CAPTION_MIN_DURATION_MS = 900;

function numberOrUndefined(value: number | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeWords(words: CaptionWord[], options: CaptionChunkOptions) {
  const rangeStartMs = numberOrUndefined(options.rangeStartMs);
  const rangeEndMs = numberOrUndefined(options.rangeEndMs);

  return words
    .map((word) => {
      const startMs = numberOrUndefined(word.startMs);
      const endMs = numberOrUndefined(word.endMs);
      const text = word.word.trim();
      if (!text || startMs === undefined) return null;
      let normalizedEndMs = endMs === undefined || endMs <= startMs ? startMs + 1 : endMs;
      if (rangeStartMs !== undefined && startMs < rangeStartMs) return null;
      if (rangeEndMs !== undefined && startMs >= rangeEndMs) return null;
      if (rangeEndMs !== undefined && normalizedEndMs > rangeEndMs) normalizedEndMs = rangeEndMs;
      return { ...word, word: text, startMs, endMs: normalizedEndMs };
    })
    .filter((word): word is CaptionWord & { startMs: number; endMs: number } => Boolean(word))
    .sort((a, b) => a.startMs - b.startMs || Number(a.sort || 0) - Number(b.sort || 0));
}

function shouldBreakAfterWord(word: string) {
  return /[.,!?;:。，！？；：]$/.test(word.trim());
}

function crossesLineBoundary(
  previous: CaptionWord & { startMs: number; endMs: number },
  word: CaptionWord & { startMs: number; endMs: number },
) {
  return Boolean(previous.lineId && word.lineId && previous.lineId !== word.lineId);
}

function chunkText(words: CaptionWord[]) {
  return words
    .map((word) => word.word.trim())
    .filter(Boolean)
    .join(" ");
}

function finalizeChunks(
  rawChunks: Array<Array<CaptionWord & { startMs: number; endMs: number }>>,
  minDurationMs: number,
  maxEndMs?: number,
) {
  return rawChunks
    .map((words, index): CaptionChunk | null => {
      const text = chunkText(words);
      if (!text) return null;
      const startMs = words[0].startMs;
      const naturalEndMs = words[words.length - 1].endMs;
      const nextStartMs = rawChunks[index + 1]?.[0]?.startMs;
      let endMs = Math.max(naturalEndMs, startMs + minDurationMs);
      if (nextStartMs !== undefined && endMs >= nextStartMs) {
        endMs = Math.max(naturalEndMs, nextStartMs - 20);
      }
      if (maxEndMs !== undefined && endMs > maxEndMs) endMs = Math.max(naturalEndMs, maxEndMs);
      return { text, startMs, endMs, words };
    })
    .filter((chunk): chunk is CaptionChunk => Boolean(chunk));
}

export function buildCaptionChunks(words: CaptionWord[], options: CaptionChunkOptions = {}) {
  const gapMs = Math.max(0, options.gapMs ?? DEFAULT_CAPTION_GAP_MS);
  const minDurationMs = Math.max(1, options.minDurationMs ?? DEFAULT_CAPTION_MIN_DURATION_MS);
  const maxEndMs = numberOrUndefined(options.rangeEndMs);
  const normalizedWords = normalizeWords(words, options);
  const rawChunks: Array<Array<CaptionWord & { startMs: number; endMs: number }>> = [];
  let current: Array<CaptionWord & { startMs: number; endMs: number }> = [];

  for (const word of normalizedWords) {
    const previous = current[current.length - 1];
    const shouldStartNext =
      previous &&
      (shouldBreakAfterWord(previous.word) ||
        crossesLineBoundary(previous, word) ||
        word.startMs - previous.endMs > gapMs);

    if (shouldStartNext && current.length > 0) {
      rawChunks.push(current);
      current = [];
    }

    current.push(word);
  }

  if (current.length > 0) rawChunks.push(current);
  return finalizeChunks(rawChunks, minDurationMs, maxEndMs);
}

export function findActiveCaptionChunk(words: CaptionWord[], currentMs: number, options: CaptionChunkOptions = {}) {
  const chunks = buildCaptionChunks(words, options);
  if (chunks.length === 0) return undefined;

  const activeByWindow = chunks.find((chunk) => currentMs >= chunk.startMs && currentMs < chunk.endMs);
  if (activeByWindow) return activeByWindow;

  const activeWord = normalizeWords(words, options).find((word) => currentMs >= word.startMs && currentMs < word.endMs);
  if (!activeWord) return undefined;
  return chunks.find((chunk) => chunk.words.some((word) => word.startMs === activeWord.startMs && word.word === activeWord.word));
}

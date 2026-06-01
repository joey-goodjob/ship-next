type LogData = Record<string, unknown>;

const DEFAULT_PREVIEW_LENGTH = 500;

function shouldLogFullResult() {
  return typeof process !== 'undefined' && process.env.LYRIC_VIDEO_DEBUG_FULL_RESULT === 'true';
}

function summarizeUrl(value: string) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    return {
      present: true,
      host: url.host,
      tail: parts.slice(-2).join('/'),
    };
  } catch {
    const parts = value.split('/').filter(Boolean);
    return {
      present: Boolean(value),
      tail: parts.slice(-2).join('/'),
    };
  }
}

export function lyricLogPreview(value: unknown, maxLength = DEFAULT_PREVIEW_LENGTH) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function sanitizeLogValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'string') {
    if (/url$/i.test(key)) return summarizeUrl(value);
    if (shouldLogFullResult()) return value;
    if (key.toLowerCase().includes('preview')) return lyricLogPreview(value);
    if (value.length > DEFAULT_PREVIEW_LENGTH) {
      return {
        length: value.length,
        preview: lyricLogPreview(value),
      };
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(key, item));
  }

  if (typeof value === 'object') {
    return sanitizeLogData(value as LogData);
  }

  return value;
}

export function sanitizeLogData(data: LogData = {}) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, sanitizeLogValue(key, value)])
  );
}

export function logLyricStage(stage: string, event: string, data: LogData = {}) {
  console.info('[lyric-video]', stage, event, sanitizeLogData(data));
}

export function logLyricStageError(stage: string, event: string, error: unknown, data: LogData = {}) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  console.error('[lyric-video]', stage, event, sanitizeLogData({ ...data, error: message }));
}

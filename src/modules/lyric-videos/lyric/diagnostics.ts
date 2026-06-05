import { chatContentToText, previewText } from './json';

export type LyricVideoErrorKind =
  | 'input_missing'
  | 'provider_request_failed'
  | 'provider_invalid_response'
  | 'persist_failed'
  | 'async_pending'
  | 'generation_failed';

type DiagnosticOptions = {
  errorKind?: LyricVideoErrorKind;
  stage?: string;
  provider?: string;
  model?: string;
  attempt?: number;
  diagnostics?: Record<string, unknown>;
};

const MAX_STRING = 1600;
const MAX_ARRAY = 20;
const MAX_OBJECT_KEYS = 40;

function sanitizeDiagnosticValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      diagnostics: sanitizeDiagnosticValue((value as any).lyricVideoDiagnostics, depth + 1),
    };
  }
  if (typeof value === 'string') {
    const text = value.replace(/\s+/g, ' ').trim();
    return text.length > MAX_STRING ? { length: text.length, preview: text.slice(0, MAX_STRING) } : text;
  }
  if (typeof value !== 'object') return value;
  if (depth >= 4) {
    const text = chatContentToText(value);
    return text ? previewText(text, MAX_STRING) : '[object]';
  }
  if (Array.isArray(value)) {
    return {
      count: value.length,
      items: value.slice(0, MAX_ARRAY).map((item) => sanitizeDiagnosticValue(item, depth + 1)),
      truncated: value.length > MAX_ARRAY,
    };
  }

  const entries = Object.entries(value as Record<string, unknown>);
  return Object.fromEntries(
    entries
      .slice(0, MAX_OBJECT_KEYS)
      .map(([key, item]) => [key, sanitizeDiagnosticValue(item, depth + 1)])
      .concat(entries.length > MAX_OBJECT_KEYS ? [['truncatedKeys', entries.length - MAX_OBJECT_KEYS]] : [])
  );
}

export function attachLyricVideoDiagnostics<T extends Error>(error: T, options: DiagnosticOptions): T {
  const existing = ((error as any).lyricVideoDiagnostics || {}) as Record<string, unknown>;
  (error as any).lyricVideoErrorKind = options.errorKind || (error as any).lyricVideoErrorKind;
  (error as any).lyricVideoDiagnostics = sanitizeDiagnosticValue({
    ...existing,
    stage: options.stage || existing.stage,
    provider: options.provider || existing.provider,
    model: options.model || existing.model,
    attempt: options.attempt || existing.attempt,
    ...(options.diagnostics || {}),
  });
  return error;
}

export function createLyricVideoError(message: string, options: DiagnosticOptions = {}) {
  return attachLyricVideoDiagnostics(new Error(message), options);
}

export function classifyLyricVideoError(error: unknown, stage?: string): LyricVideoErrorKind {
  const explicit = (error as any)?.lyricVideoErrorKind;
  if (explicit) return explicit as LyricVideoErrorKind;

  const message = error instanceof Error ? error.message : String(error || '');
  if (/not persisted|persist|落库/i.test(message)) return 'persist_failed';
  if (/pending|processing|waiting_provider/i.test(message)) return 'async_pending';
  if (/returned no|no usable|no valid|invalid|missing image|missing_image_url|No grid image URL|Could not read generated grid|incomplete/i.test(message)) {
    return 'provider_invalid_response';
  }
  if (/Kie|ElevenLabs|provider|API key|failed:\s*\d|Download failed|fetch|network|Insufficient credits|timeout/i.test(message)) {
    return 'provider_request_failed';
  }
  if (/required|Upload audio|No fixed scenes|No scenes|preprocess\.lines|before generation|before transcription|missing/i.test(message)) {
    return 'input_missing';
  }
  if (stage === 'image_generation' && /queue|task|image/i.test(message)) return 'provider_request_failed';
  return 'generation_failed';
}

export function buildFailureSnapshot(params: {
  stage?: string;
  step?: any;
  error: unknown;
  input?: unknown;
  extra?: Record<string, unknown>;
}) {
  const message = params.error instanceof Error ? params.error.message : String(params.error || 'Generation failed');
  const diagnostics = (params.error as any)?.lyricVideoDiagnostics;
  return sanitizeDiagnosticValue({
    failure: true,
    errorKind: classifyLyricVideoError(params.error, params.stage || params.step?.stage),
    stage: params.stage || params.step?.stage || 'generation_failed',
    message,
    step: params.step
      ? {
          id: params.step.id,
          stage: params.step.stage,
          status: params.step.status,
          attemptCount: params.step.attemptCount,
          maxAttempts: params.step.maxAttempts,
          progressPercent: params.step.progressPercent,
        }
      : null,
    inputSummary: params.input,
    diagnostics,
    ...(params.extra || {}),
  });
}


import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AIConfigs } from './types';

export type ElevenLabsTranscriptionLine = {
  startMs: number;
  endMs: number;
  text: string;
};

export type ElevenLabsTranscriptionWord = {
  word: string;
  startMs: number;
  endMs: number;
};

export type ElevenLabsTranscriptionResult = {
  raw: any;
  text: string;
  lines: ElevenLabsTranscriptionLine[];
  words: ElevenLabsTranscriptionWord[];
};

export type ElevenLabsTranscribeParams = {
  audioUrl: string;
  language?: string;
  prompt?: string;
};

export type ElevenLabsTranscribeFileParams = {
  body: Buffer | Uint8Array;
  filename?: string;
  contentType?: string;
  language?: string;
  prompt?: string;
};

export interface ElevenLabsConfigs extends AIConfigs {
  apiKey: string;
  sttModel?: string;
}

function secondsToMs(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.round(num * 1000)) : 0;
}

function isNonLyricToken(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/^\[[^\]]+\]$/.test(trimmed)) return true;
  if (/^\([^)]+\)$/.test(trimmed)) return true;
  return false;
}

function rawTextFromResponse(raw: any) {
  const text = String(raw?.text || '').trim();
  if (text) return text;
  const segments = Array.isArray(raw?.segments) ? raw.segments : [];
  return segments.map((segment: any) => String(segment?.text || '')).join('').trim();
}

function rawWordsFromResponse(raw: any) {
  if (Array.isArray(raw?.words)) return raw.words;
  const segments = Array.isArray(raw?.segments) ? raw.segments : [];
  return segments.flatMap((segment: any) => Array.isArray(segment?.words) ? segment.words : []);
}

function contentTypeFromFilename(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.mp4') return 'audio/mp4';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.flac') return 'audio/flac';
  if (ext === '.webm') return 'audio/webm';
  return 'audio/mpeg';
}

function filenameFromUrl(audioUrl: string) {
  try {
    const url = new URL(audioUrl);
    const name = path.basename(url.pathname);
    return name || 'audio.mp3';
  } catch {
    const name = path.basename(audioUrl.split('?')[0] || '');
    return name || 'audio.mp3';
  }
}

async function fetchBytes(audioUrl: string) {
  if (audioUrl.startsWith('/')) {
    return readFile(path.join(process.cwd(), 'public', audioUrl));
  }
  if (audioUrl.startsWith('data:')) {
    const [, data] = audioUrl.split(',');
    return Buffer.from(data || '', 'base64');
  }

  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Download audio failed: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function shanghaiTimestampForFilename(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});
  return `${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}-${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function sanitizeOutputPart(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'audio';
}

async function writeElevenLabsRawOutput(params: {
  raw: any;
  model: string;
  filename: string;
  contentType?: string;
  language?: string;
  prompt?: string;
}) {
  const outputDir = path.join(process.cwd(), 'output');
  const outputFilename = `${shanghaiTimestampForFilename()}-elevenlabs-scribe-${sanitizeOutputPart(params.filename)}.json`;
  const outputPath = path.join(outputDir, outputFilename);
  const payload = {
    capturedAt: new Date().toISOString(),
    provider: 'elevenlabs',
    model: params.model,
    filename: params.filename,
    contentType: params.contentType,
    language: params.language,
    prompt: params.prompt,
    response: params.raw,
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

export class ElevenLabsProvider {
  readonly name = 'elevenlabs';
  configs: ElevenLabsConfigs;

  constructor(configs: ElevenLabsConfigs) {
    this.configs = configs;
  }

  async transcribe(params: ElevenLabsTranscribeParams): Promise<ElevenLabsTranscriptionResult> {
    const filename = filenameFromUrl(params.audioUrl);
    const body = await fetchBytes(params.audioUrl);
    return this.transcribeFile({
      body,
      filename,
      contentType: contentTypeFromFilename(filename),
      language: params.language,
      prompt: params.prompt,
    });
  }

  async transcribeFile(params: ElevenLabsTranscribeFileParams): Promise<ElevenLabsTranscriptionResult> {
    if (!this.configs.apiKey) {
      throw new Error('ELEVENLABS_API_KEY is required for ElevenLabs transcription');
    }

    const filename = params.filename || 'audio.mp3';
    const model = this.configs.sttModel || 'scribe_v2';
    const bytes = new Uint8Array(params.body);
    const contentType = params.contentType || contentTypeFromFilename(filename);
    const formData = new FormData();
    formData.append('file', new Blob([bytes], { type: contentType }), filename);
    formData.append('model_id', model);
    formData.append('timestamps_granularity', 'word');
    formData.append('diarize', 'false');
    formData.append('tag_audio_events', 'false');
    if (params.language) formData.append('language_code', params.language);

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': this.configs.apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ElevenLabs transcription failed: ${response.status} ${text}`);
    }

    const raw = await response.json();
    await writeElevenLabsRawOutput({
      raw,
      model,
      filename,
      contentType,
      language: params.language,
      prompt: params.prompt,
    });

    const parsed = parseElevenLabsTranscriptionResponse(raw);

    return {
      raw,
      text: parsed.text,
      lines: [],
      words: parsed.words,
    };
  }
}

export function parseElevenLabsTranscriptionResponse(raw: any): Omit<ElevenLabsTranscriptionResult, 'raw' | 'lines'> {
  const text = rawTextFromResponse(raw);
  const rawWords = rawWordsFromResponse(raw);
  const words = rawWords
      .map((word: any) => {
        if (word?.type && word.type !== 'word') return null;
        const hasStart =
          (word?.start !== undefined && word?.start !== null) ||
          (word?.start_time !== undefined && word?.start_time !== null);
        const hasEnd =
          (word?.end !== undefined && word?.end !== null) ||
          (word?.end_time !== undefined && word?.end_time !== null);
        if (!hasStart || !hasEnd) return null;
        const text = String(word.text || word.word || '').trim();
        if (isNonLyricToken(text)) return null;
        const startMs = secondsToMs(word.start ?? word.start_time);
        const endMs = Math.max(startMs + 1, secondsToMs(word.end ?? word.end_time));
        return {
          word: text,
          startMs,
          endMs,
        };
      })
      .filter((word: ElevenLabsTranscriptionWord | null): word is ElevenLabsTranscriptionWord => Boolean(word?.word));

  return { text, words };
}

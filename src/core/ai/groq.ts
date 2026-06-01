import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AIConfigs } from './types';

export type GroqTranscriptionLine = {
  startMs: number;
  endMs: number;
  text: string;
};

export type GroqTranscriptionWord = {
  word: string;
  startMs: number;
  endMs: number;
};

export type GroqTranscriptionResult = {
  raw: any;
  text: string;
  lines: GroqTranscriptionLine[];
  words: GroqTranscriptionWord[];
};

export type GroqTranscribeParams = {
  audioUrl: string;
  language?: string;
  prompt?: string;
};

export type GroqTranscribeFileParams = {
  body: Buffer | Uint8Array;
  filename?: string;
  contentType?: string;
  language?: string;
  prompt?: string;
};

export interface GroqConfigs extends AIConfigs {
  apiKey: string;
  baseUrl?: string;
  transcribeModel?: string;
}

const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024;

function secondsToMs(value: unknown) {
  const num = Number(value || 0);
  return Math.max(0, Math.round(num * 1000));
}

function parseLinesFromText(text: string): GroqTranscriptionLine[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({
      startMs: index * 4000,
      endMs: (index + 1) * 4000,
      text: line,
    }));
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

async function writeWhisperRawOutput(params: {
  raw: any;
  model: string;
  filename: string;
  contentType?: string;
  language?: string;
  prompt?: string;
}) {
  const outputDir = path.join(process.cwd(), 'output');
  const outputFilename = `${shanghaiTimestampForFilename()}-groq-whisper-${sanitizeOutputPart(params.filename)}.json`;
  const outputPath = path.join(outputDir, outputFilename);
  const payload = {
    capturedAt: new Date().toISOString(),
    provider: 'groq',
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

/**
 * Groq OpenAI-compatible audio transcription provider.
 * @docs https://console.groq.com/docs/api-reference
 */
export class GroqProvider {
  readonly name = 'groq';
  configs: GroqConfigs;

  constructor(configs: GroqConfigs) {
    this.configs = configs;
  }

  async transcribe(params: GroqTranscribeParams): Promise<GroqTranscriptionResult> {
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

  async transcribeFile(params: GroqTranscribeFileParams): Promise<GroqTranscriptionResult> {
    if (!this.configs.apiKey) {
      throw new Error('GROQ_API_KEY is required for Groq transcription');
    }

    const filename = params.filename || 'audio.mp3';
    const model = this.configs.transcribeModel || 'whisper-large-v3';
    const baseUrl = (this.configs.baseUrl || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    const bytes = new Uint8Array(params.body);
    if (bytes.byteLength > MAX_TRANSCRIBE_BYTES) {
      throw new Error('Audio file exceeds the 25MB transcription limit. Please trim or compress it before generating lyrics.');
    }

    const formData = new FormData();
    formData.append('file', new Blob([bytes], { type: params.contentType || contentTypeFromFilename(filename) }), filename);
    formData.append('model', model);
    if (params.language) formData.append('language', params.language);
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');
    formData.append('timestamp_granularities[]', 'segment');
    formData.append('temperature', '0');
    if (params.prompt) formData.append('prompt', params.prompt);

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.configs.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Groq transcription failed: ${response.status} ${text}`);
    }

    const raw = await response.json();
    await writeWhisperRawOutput({
      raw,
      model,
      filename,
      contentType: params.contentType || contentTypeFromFilename(filename),
      language: params.language,
      prompt: params.prompt,
    });
    const text = String(raw.text || '').trim();
    const rawWords = Array.isArray(raw.words) ? raw.words : [];
    const words = rawWords
      .map((word: any) => {
        const startMs = secondsToMs(word.start);
        const endMs = Math.max(startMs + 1, secondsToMs(word.end));
        return {
          word: String(word.word || '').trim(),
          startMs,
          endMs,
        };
      })
      .filter((word: GroqTranscriptionWord) => word.word);

    const segments = Array.isArray(raw.segments) ? raw.segments : [];
    const lines = segments
      .map((segment: any, index: number) => {
        const startMs = secondsToMs(segment.start ?? index * 4);
        const endMs = Math.max(startMs + 1, secondsToMs(segment.end ?? index * 4 + 3.5));
        return {
          startMs,
          endMs,
          text: String(segment.text || '').trim(),
        };
      })
      .filter((line: GroqTranscriptionLine) => line.text);

    return {
      raw,
      text,
      lines: lines.length > 0 ? lines : parseLinesFromText(text),
      words,
    };
  }
}

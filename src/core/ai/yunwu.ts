import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AIConfigs } from './types';

export type YunwuTranscriptionLine = {
  startMs: number;
  endMs: number;
  text: string;
};

export type YunwuTranscriptionResult = {
  raw: any;
  text: string;
  lines: YunwuTranscriptionLine[];
};

export type YunwuTranscribeParams = {
  audioUrl: string;
  language?: string;
  prompt?: string;
};

export type YunwuTranscribeFileParams = {
  body: Buffer | Uint8Array;
  filename?: string;
  contentType?: string;
  language?: string;
  prompt?: string;
};

export interface YunwuConfigs extends AIConfigs {
  apiKey: string;
  baseUrl?: string;
  transcribeModel?: string;
}

function secondsToMs(value: unknown) {
  const num = Number(value || 0);
  return Math.max(0, Math.round(num * 1000));
}

function parseLinesFromText(text: string): YunwuTranscriptionLine[] {
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

/**
 * Yunwu OpenAI-compatible audio transcription provider.
 * @docs https://yunwu.apifox.cn/api-311993207
 */
export class YunwuProvider {
  readonly name = 'yunwu';
  configs: YunwuConfigs;

  constructor(configs: YunwuConfigs) {
    this.configs = configs;
  }

  async transcribe(params: YunwuTranscribeParams): Promise<YunwuTranscriptionResult> {
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

  async transcribeFile(params: YunwuTranscribeFileParams): Promise<YunwuTranscriptionResult> {
    if (!this.configs.apiKey) {
      throw new Error('YUNWU_API_KEY is required for Yunwu transcription');
    }

    const filename = params.filename || 'audio.mp3';
    const model = this.configs.transcribeModel || 'whisper-1';
    const baseUrl = (this.configs.baseUrl || 'https://yunwu.ai/v1').replace(/\/$/, '');
    const formData = new FormData();
    const bytes = new Uint8Array(params.body);

    formData.append('file', new Blob([bytes], { type: params.contentType || contentTypeFromFilename(filename) }), filename);
    formData.append('model', model);
    formData.append('language', params.language || 'zh');
    formData.append('response_format', 'verbose_json');
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
      throw new Error(`Yunwu transcription failed: ${response.status} ${text}`);
    }

    const raw = await response.json();
    const text = String(raw.text || '').trim();
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
      .filter((line: YunwuTranscriptionLine) => line.text);

    return {
      raw,
      text,
      lines: lines.length > 0 ? lines : parseLinesFromText(text),
    };
  }
}

import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { envConfigs } from '@/config';
import { getAllConfigs } from '@/modules/config/service';
import { getStorage, isStorageConfigured } from '@/modules/storage/service';
import { getUuid } from '@/lib/hash';
import { storageKeyFromUrl } from './worker-render';

const execFileAsync = promisify(execFile);
const FFMPEG_MAX_BUFFER_BYTES = 20 * 1024 * 1024;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function pickSourceAudioStorageKey(input: Record<string, unknown>, project?: any, configs: Record<string, string> = {}) {
  const sourceUrl = trimString(input.sourceAudioUrl) || trimString(input.originalAudioUrl) || trimString(project?.originalAudioUrl) || trimString(project?.audioUrl);
  const key =
    trimString(input.sourceAudioStorageKey)
    || trimString(input.originalAudioStorageKey)
    || trimString(project?.originalAudioStorageKey)
    || trimString(project?.audioStorageKey)
    || storageKeyFromUrl(sourceUrl, configs);

  if (!key) throw new Error('Audio storage key is required for audio_trim job');
  return key;
}

function positiveNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

async function writeStorageObjectToFile(params: {
  key: string;
  targetPath: string;
  configs: Record<string, string>;
}) {
  if (!isStorageConfigured(params.configs)) throw new Error('Storage is required for media-worker');
  const result = await getStorage(params.configs).downloadFile({ key: params.key });
  if (!result.success || !result.body) {
    throw new Error(result.error || 'Download audio for trim failed');
  }
  await writeFile(params.targetPath, result.body);
}

export async function trimAudioForWorker(params: {
  jobId: string;
  input: Record<string, unknown>;
  project?: any;
}) {
  const configs = await getAllConfigs();
  if (!isStorageConfigured(configs)) throw new Error('Storage is required for media-worker');

  const tmpDir = path.join(os.tmpdir(), 'lyric-video-audio-trim', params.jobId);
  await mkdir(tmpDir, { recursive: true });

  try {
    const inputPath = path.join(tmpDir, 'source-audio');
    const outputPath = path.join(tmpDir, 'processed.mp3');
    const sourceAudioStorageKey = pickSourceAudioStorageKey(params.input, params.project, configs);
    const trimStartMs = Math.max(0, Math.round(Number(params.input.trimStartMs) || 0));
    const clipDurationMs = positiveNumber(params.input.clipDurationMs, positiveNumber(params.input.audioDurationMs, 1000));
    const trimEndMs = Math.max(trimStartMs + 1000, Math.round(Number(params.input.trimEndMs) || trimStartMs + clipDurationMs));

    await writeStorageObjectToFile({ key: sourceAudioStorageKey, targetPath: inputPath, configs });

    await execFileAsync(envConfigs.ffmpeg_path || 'ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel',
      'warning',
      '-ss',
      String(trimStartMs / 1000),
      '-i',
      inputPath,
      '-t',
      String(clipDurationMs / 1000),
      '-vn',
      '-acodec',
      'libmp3lame',
      '-b:a',
      '192k',
      outputPath,
    ], { maxBuffer: FFMPEG_MAX_BUFFER_BYTES });

    const processedAudioStorageKey = `processed-audio/${params.project?.id || 'audio'}-${params.jobId}-${getUuid()}.mp3`;
    const upload = await getStorage(configs).uploadFile({
      body: await readFile(outputPath),
      key: processedAudioStorageKey,
      contentType: 'audio/mpeg',
    });
    if (!upload.success || !upload.url) throw new Error(upload.error || 'Upload processed audio failed');

    return {
      processedAudioUrl: upload.url,
      processedAudioStorageKey: upload.key || processedAudioStorageKey,
      originalAudioUrl: trimString(params.input.originalAudioUrl) || trimString(params.project?.originalAudioUrl) || trimString(params.project?.audioUrl),
      originalAudioStorageKey: sourceAudioStorageKey,
      sourceAudioStorageKey,
      audioDurationMs: clipDurationMs,
      trimStartMs,
      trimEndMs,
      source: 'ffmpeg',
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

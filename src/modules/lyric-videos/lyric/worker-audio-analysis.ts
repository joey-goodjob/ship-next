import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getAllConfigs } from '@/modules/config/service';
import { getStorage, isStorageConfigured } from '@/modules/storage/service';
import { runLibrosaAnalysisForLocalFile } from './audio';
import { storageKeyFromUrl } from './worker-render';

function trimInput(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function pickAudioStorageKey(input: Record<string, unknown>, project?: any, configs: Record<string, string> = {}) {
  const key =
    trimInput(input.audioStorageKey)
    || trimInput(input.processedAudioStorageKey)
    || trimInput(input.originalAudioStorageKey)
    || trimInput(project?.processedAudioStorageKey)
    || trimInput(project?.audioStorageKey)
    || trimInput(project?.originalAudioStorageKey)
    || storageKeyFromUrl(trimInput(input.audioUrl) || trimInput(project?.processedAudioUrl) || trimInput(project?.audioUrl) || trimInput(project?.originalAudioUrl), configs);

  if (!key) throw new Error('Audio storage key is required for audio_analysis job');
  return key;
}

async function writeStorageObjectToFile(params: {
  key: string;
  targetPath: string;
  configs: Record<string, string>;
}) {
  if (!isStorageConfigured(params.configs)) throw new Error('Storage is required for media-worker');
  const result = await getStorage(params.configs).downloadFile({ key: params.key });
  if (!result.success || !result.body) {
    throw new Error(result.error || 'Download audio for analysis failed');
  }
  await writeFile(params.targetPath, result.body);
}

export async function analyzeAudioForWorker(params: {
  jobId: string;
  input: Record<string, unknown>;
  project?: any;
}) {
  const configs = await getAllConfigs();
  const tmpDir = path.join(os.tmpdir(), 'lyric-video-audio-analysis', params.jobId);
  await mkdir(tmpDir, { recursive: true });

  try {
    const inputPath = path.join(tmpDir, 'audio');
    const audioStorageKey = pickAudioStorageKey(params.input, params.project, configs);
    await writeStorageObjectToFile({ key: audioStorageKey, targetPath: inputPath, configs });
    const audioAnalysis = await runLibrosaAnalysisForLocalFile(inputPath);
    return {
      audioAnalysis,
      audioStorageKey,
      source: 'librosa',
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

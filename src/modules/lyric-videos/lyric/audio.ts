import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AIFile } from '@/core/ai';
import { getUuid } from '@/lib/hash';
import { getAllConfigs } from '@/modules/config/service';
import { getStorage, isStorageConfigured } from '@/modules/storage/service';
import type { AudioAnalysisResult } from './types';
import { prepareAudioClipWithMediaWorker } from './audio-trim-jobs';

const execFileAsync = promisify(execFile);

function canRunInlineAudioAnalysis() {
  if (process.env.MEDIA_WORKER === 'true' || process.env.MEDIA_WORKER_ID) return true;
  if (process.env.LYRIC_VIDEO_ALLOW_INLINE_AUDIO_ANALYSIS === 'true') return true;
  return process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
}

/**
 * 音频辅助模块：负责下载、保存、裁剪和分析音频。
 *
 * 注意：用户最开始上传文件走的是 `/api/storage/upload-audio`，不经过这里。
 * 这里是在歌词视频生成阶段被 `generation-runner.ts` / `asr.ts` 调用，用来把
 * `lyric_video_project` 里的原始音频裁成转写用片段，并回写 processed audio 字段。
 */

export async function fetchBytes(url: string) {
  if (url.startsWith('/')) {
    return readFile(path.join(process.cwd(), 'public', url));
  }
  if (url.startsWith('data:')) {
    const [, data] = url.split(',');
    return Buffer.from(data || '', 'base64');
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function saveLocalPublicFile(params: { body: Buffer | Uint8Array; dir: string; filename: string }) {
  const targetDir = path.join(process.cwd(), 'public', params.dir);
  await mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, params.filename);
  await writeFile(targetPath, params.body);
  return `/${params.dir}/${params.filename}`;
}

export async function saveGeneratedFile(params: {
  body: Buffer | Uint8Array;
  key: string;
  contentType: string;
  localDir: string;
  configs?: Record<string, string>;
}) {
  const configs = params.configs || await getAllConfigs();

  if (isStorageConfigured(configs)) {
    const result = await getStorage(configs).uploadFile({
      body: params.body,
      key: params.key,
      contentType: params.contentType,
    });
    if (!result.success || !result.url) throw new Error(result.error || 'Upload failed');
    return { url: result.url, storageKey: result.key || params.key };
  }

  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    throw new Error('Storage is required for generated media in production');
  }

  const url = await saveLocalPublicFile({
    body: params.body,
    dir: params.localDir,
    filename: path.basename(params.key),
  });
  return { url, storageKey: params.key };
}

export function hasAudioInputPatch(data: Record<string, unknown>) {
  return [
    'audioUrl',
    'audioStorageKey',
    'originalAudioUrl',
    'originalAudioStorageKey',
    'audioDurationMs',
    'trimStartMs',
    'trimEndMs',
  ].some((key) => Object.prototype.hasOwnProperty.call(data, key));
}

export function normalizeClipMs(params: { startMs?: unknown; endMs?: unknown; durationMs?: unknown }) {
  const sourceDurationMs = Math.max(0, Math.round(Number(params.durationMs) || 0));
  const maxStartMs = sourceDurationMs > 1000 ? sourceDurationMs - 1000 : Number.POSITIVE_INFINITY;
  const startMs = Math.max(0, Math.min(Math.round(Number(params.startMs) || 0), maxStartMs));
  const requestedEndMs = Math.max(startMs + 1000, Math.round(Number(params.endMs) || sourceDurationMs || startMs + 1000));
  const endMs = sourceDurationMs > 0 ? Math.min(requestedEndMs, sourceDurationMs) : requestedEndMs;
  return {
    startMs,
    endMs: Math.max(startMs + 1000, endMs),
    durationMs: Math.max(1000, Math.max(startMs + 1000, endMs) - startMs),
  };
}

/**
 * 准备 ASR 转写用音频。
 *
 * 调用方：
 * - `runAsr`：单独转写按钮
 * - `executeGenerationRun`：一键生成主链路
 *
 * 写入：必要时更新 `lyric_video_project.audioUrl`、`processedAudioUrl`、
 * `processedAudioStorageKey` 和 pipeline 状态。返回的 project 会继续交给
 * ElevenLabs 转写。
 */
export async function prepareAudioClipForTranscription(params: { userId: string; project: any; runId?: string | null; stepId?: string | null }) {
  return prepareAudioClipWithMediaWorker(params);
}

export async function analyzeAudioWithLibrosa(params: {
  projectId: string;
  audioUrl?: string | null;
}): Promise<{ audioAnalysis?: AudioAnalysisResult; audioAnalysisError?: string }> {
  if (!params.audioUrl) return { audioAnalysisError: 'No audio URL available for analysis' };
  if (!canRunInlineAudioAnalysis()) {
    return { audioAnalysisError: 'Inline audio analysis is disabled in production' };
  }

  const analysisId = getUuid();
  const tmpDir = path.join(process.cwd(), '.next', 'lyric-video-audio-analysis', `${params.projectId}-${analysisId}`);
  const inputPath = path.join(tmpDir, 'audio');

  try {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(inputPath, await fetchBytes(params.audioUrl));
    return { audioAnalysis: await runLibrosaAnalysisForLocalFile(inputPath) };
  } catch (error: any) {
    const message = [error?.message, error?.stderr || error?.stdout]
      .filter(Boolean)
      .join('\n')
      .trim();
    console.warn('[lyric-video] audio analysis failed', {
      projectId: params.projectId,
      error: message || error,
    });
    return { audioAnalysisError: message || 'Audio analysis failed' };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export async function runLibrosaAnalysisForLocalFile(inputPath: string): Promise<AudioAnalysisResult> {
  if (!canRunInlineAudioAnalysis()) {
    throw new Error('Inline audio analysis is disabled in production');
  }

  const scriptPath = path.join(process.cwd(), 'scripts', 'analyze_audio.py');
  const pythonPath = process.env.LYRIC_VIDEO_PYTHON_PATH || 'python3';
  const { stdout } = (await execFileAsync(pythonPath, [scriptPath, '--input', inputPath], {
    cwd: process.cwd(),
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  })) as { stdout: string; stderr: string };

  return JSON.parse(stdout) as AudioAnalysisResult;
}

export async function saveAIProviderFiles(files: AIFile[], configs?: Record<string, string>) {
  const storageConfigs = configs || await getAllConfigs();
  if (!isStorageConfigured(storageConfigs)) return undefined;

  const storage = getStorage(storageConfigs);
  const saved: AIFile[] = [];
  for (const file of files) {
    const result = await storage.downloadAndUpload({
      url: file.url,
      key: file.key,
      contentType: file.contentType,
    });
    if (result.success && result.url) {
      saved.push({ ...file, url: result.url });
    }
  }
  return saved;
}

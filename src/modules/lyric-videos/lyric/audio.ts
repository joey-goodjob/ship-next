import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { and, eq } from 'drizzle-orm';
import { envConfigs } from '@/config';
import { db } from '@/core/db';
import type { AIFile } from '@/core/ai';
import { lyricVideoProject } from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { getStorage, isStorageConfigured } from '@/modules/storage/service';
import type { AudioAnalysisResult } from './types';

const execFileAsync = promisify(execFile);

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
}) {
  if (isStorageConfigured()) {
    const result = await getStorage().uploadFile({
      body: params.body,
      key: params.key,
      contentType: params.contentType,
    });
    if (!result.success || !result.url) throw new Error(result.error || 'Upload failed');
    return { url: result.url, storageKey: result.key || params.key };
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

export async function prepareAudioClipForTranscription(params: { userId: string; project: any }) {
  const existingProcessedUrl = params.project.processedAudioUrl || '';
  if (existingProcessedUrl && params.project.audioUrl === existingProcessedUrl) {
    console.info('[lyric-video] reusing existing processed audio', {
      projectId: params.project.id,
      processedAudioUrl: existingProcessedUrl,
    });
    await db()
      .update(lyricVideoProject)
      .set({
        lyricsStatus: 'asr_processing',
        pipelineStage: 'asr_processing',
        pipelineError: null,
      })
      .where(and(eq(lyricVideoProject.id, params.project.id), eq(lyricVideoProject.userId, params.userId)));
    return params.project;
  }

  const originalAudioUrl = params.project.originalAudioUrl || params.project.audioUrl;
  if (!originalAudioUrl) throw new Error('Upload audio before transcription');

  const clip = normalizeClipMs({
    startMs: params.project.trimStartMs,
    endMs: params.project.trimEndMs,
    durationMs: params.project.audioDurationMs,
  });
  const clipId = getUuid();
  const tmpDir = path.join(process.cwd(), '.next', 'lyric-video-audio', `${params.project.id}-${clipId}`);
  const inputPath = path.join(tmpDir, 'source-audio');
  const outputPath = path.join(tmpDir, 'processed.mp3');
  console.info('[lyric-video] preparing audio clip', {
    projectId: params.project.id,
    originalAudioUrl,
    sourceDurationMs: params.project.audioDurationMs,
    trimStartMs: clip.startMs,
    trimEndMs: clip.endMs,
    clipDurationMs: clip.durationMs,
    ffmpegPath: envConfigs.ffmpeg_path || 'ffmpeg',
    tmpDir,
  });

  await db()
    .update(lyricVideoProject)
    .set({
      lyricsStatus: 'asr_processing',
      pipelineStage: 'audio_processing',
      pipelineError: null,
    })
    .where(and(eq(lyricVideoProject.id, params.project.id), eq(lyricVideoProject.userId, params.userId)));

  try {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(inputPath, await fetchBytes(originalAudioUrl));
    console.info('[lyric-video] running ffmpeg trim', {
      projectId: params.project.id,
      args: ['-ss', String(clip.startMs / 1000), '-i', inputPath, '-t', String(clip.durationMs / 1000), outputPath],
    });
    await execFileAsync(envConfigs.ffmpeg_path || 'ffmpeg', [
      '-y',
      '-ss',
      String(clip.startMs / 1000),
      '-i',
      inputPath,
      '-t',
      String(clip.durationMs / 1000),
      '-vn',
      '-acodec',
      'libmp3lame',
      '-b:a',
      '192k',
      outputPath,
    ]);

    const saved = await saveGeneratedFile({
      body: await readFile(outputPath),
      key: `processed-audio/${params.project.id}-${clipId}.mp3`,
      contentType: 'audio/mpeg',
      localDir: 'processed-audio',
    });
    console.info('[lyric-video] processed audio saved', {
      projectId: params.project.id,
      processedAudioUrl: saved.url,
      processedAudioStorageKey: saved.storageKey,
    });

    const [updated] = await db()
      .update(lyricVideoProject)
      .set({
        audioUrl: saved.url,
        audioStorageKey: saved.storageKey,
        originalAudioUrl,
        originalAudioStorageKey: params.project.originalAudioStorageKey || params.project.audioStorageKey,
        audioDurationMs: clip.durationMs,
        trimStartMs: clip.startMs,
        trimEndMs: clip.endMs,
        processedAudioUrl: saved.url,
        processedAudioStorageKey: saved.storageKey,
        lyricsStatus: 'asr_processing',
        pipelineStage: 'asr_processing',
        pipelineError: null,
      })
      .where(and(eq(lyricVideoProject.id, params.project.id), eq(lyricVideoProject.userId, params.userId)))
      .returning();

    return updated || {
      ...params.project,
      audioUrl: saved.url,
      audioStorageKey: saved.storageKey,
      originalAudioUrl,
      audioDurationMs: clip.durationMs,
      trimStartMs: clip.startMs,
      trimEndMs: clip.endMs,
      processedAudioUrl: saved.url,
      processedAudioStorageKey: saved.storageKey,
    };
  } catch (error: any) {
    console.error('[lyric-video] audio trim failed', {
      projectId: params.project.id,
      error: error?.message || error,
    });
    throw new Error(error?.message ? `Audio trim failed: ${error.message}` : 'Audio trim failed');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export async function analyzeAudioWithLibrosa(params: {
  projectId: string;
  audioUrl?: string | null;
}): Promise<{ audioAnalysis?: AudioAnalysisResult; audioAnalysisError?: string }> {
  if (!params.audioUrl) return { audioAnalysisError: 'No audio URL available for analysis' };

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
  const scriptPath = path.join(process.cwd(), 'scripts', 'analyze_audio.py');
  const pythonPath = process.env.LYRIC_VIDEO_PYTHON_PATH || 'python3';
  const { stdout } = (await execFileAsync(pythonPath, [scriptPath, '--input', inputPath], {
    cwd: process.cwd(),
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  })) as { stdout: string; stderr: string };

  return JSON.parse(stdout) as AudioAnalysisResult;
}

export async function saveAIProviderFiles(files: AIFile[]) {
  if (!isStorageConfigured()) return undefined;

  const storage = getStorage();
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

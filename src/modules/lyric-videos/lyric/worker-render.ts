import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { getAllConfigs } from '@/modules/config/service';
import { getStorage, isStorageConfigured } from '@/modules/storage/service';
import {
  buildAss,
  buildWatermarkDrawtextFilter,
  captionsAreEnabled,
  getDimensions,
  normalizeCaptionStyle,
  type ExportWatermark,
} from './render';

const execFileAsync = promisify(execFile);
const FFMPEG_MAX_BUFFER_BYTES = 50 * 1024 * 1024;

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

export function storageKeyFromUrl(url?: string | null, configs: Record<string, string> = {}) {
  if (!url) return '';
  const value = String(url).trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value) && !value.startsWith('/')) return trimSlashes(value);

  try {
    const parsed = new URL(value);
    const publicDomain = String(configs.storage_public_domain || '').trim();
    if (publicDomain) {
      const publicParsed = new URL(publicDomain);
      if (parsed.host === publicParsed.host) {
        return trimSlashes(parsed.pathname);
      }
    }

    const endpoint = String(configs.storage_endpoint || '').trim();
    const bucket = String(configs.storage_bucket || '').trim();
    if (endpoint && bucket) {
      const endpointParsed = new URL(endpoint);
      if (parsed.host === endpointParsed.host) {
        const prefix = `/${bucket}/`;
        if (parsed.pathname.startsWith(prefix)) return trimSlashes(parsed.pathname.slice(prefix.length));
      }
    }
  } catch {
    return '';
  }

  return '';
}

function resolveStorageKey(params: { key?: string | null; url?: string | null; label: string; configs: Record<string, string> }) {
  const key = String(params.key || '').trim() || storageKeyFromUrl(params.url, params.configs);
  if (!key) throw new Error(`${params.label} storage key is required for media-worker`);
  return key;
}

async function writeStorageObjectToFile(params: { key: string; targetPath: string; label: string; configs: Record<string, string> }) {
  if (!isStorageConfigured(params.configs)) throw new Error('Storage is required for media-worker');
  const result = await getStorage(params.configs).downloadFile({ key: params.key });
  if (!result.success || !result.body) {
    throw new Error(result.error || `Download ${params.label} failed`);
  }
  await writeFile(params.targetPath, result.body);
}

async function writeMediaUrlToFile(params: { url: string; targetPath: string; label: string; configs: Record<string, string> }) {
  const key = storageKeyFromUrl(params.url, params.configs);
  if (key) {
    await writeStorageObjectToFile({ key, targetPath: params.targetPath, label: params.label, configs: params.configs });
    return;
  }

  const response = await fetch(params.url);
  if (!response.ok) throw new Error(`Download ${params.label} failed: ${response.statusText || response.status}`);
  await writeFile(params.targetPath, Buffer.from(await response.arrayBuffer()));
}

async function uploadRenderedVideo(params: { body: Buffer; exportId: string; configs: Record<string, string> }) {
  if (!isStorageConfigured(params.configs)) throw new Error('Storage is required for media-worker');
  const key = `renders/${params.exportId}.mp4`;
  const result = await getStorage(params.configs).uploadFile({
    body: params.body,
    key,
    contentType: 'video/mp4',
  });
  if (!result.success || !result.url) throw new Error(result.error || 'Upload rendered video failed');
  return { url: result.url, storageKey: result.key || key };
}

export type RenderableSceneMedia = {
  durationSeconds: number;
  kind: 'image' | 'video';
  posterUrl?: string;
  sceneId?: string;
  url: string;
};

function sceneDurationSeconds(scene: any) {
  const startMs = Number(scene.startMs || 0);
  const fallbackEndMs = startMs + 4000;
  const endMs = Number(scene.endMs || fallbackEndMs);
  return Math.max(1, (endMs - startMs) / 1000);
}

export function resolveRenderableSceneMedia(scenes: any[]): RenderableSceneMedia[] {
  const processingScene = scenes.find((scene) => scene.videoStatus === 'processing');
  if (processingScene) {
    throw new Error('Scene video generation is still processing. Please wait before exporting.');
  }

  const media = scenes
    .map((scene) => {
      const videoUrl = String(scene.videoUrl || '').trim();
      const imageUrl = String(scene.imageUrl || '').trim();
      if (videoUrl) {
        return {
          durationSeconds: sceneDurationSeconds(scene),
          kind: 'video' as const,
          posterUrl: imageUrl || undefined,
          sceneId: scene.id,
          url: videoUrl,
        };
      }
      if (imageUrl) {
        return {
          durationSeconds: sceneDurationSeconds(scene),
          kind: 'image' as const,
          sceneId: scene.id,
          url: imageUrl,
        };
      }
      return null;
    })
    .filter(Boolean) as RenderableSceneMedia[];

  if (media.length === 0) throw new Error('Generate at least one scene image or video before export');
  return media;
}

function escapeConcatPath(value: string) {
  return value.replace(/'/g, "'\\''");
}

export function buildSceneMediaConcatFile(segmentPaths: string[]) {
  return segmentPaths.map((segmentPath) => `file '${escapeConcatPath(segmentPath)}'`).join('\n');
}

function normalizedSceneVideoFilter(width: number, height: number) {
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    'setsar=1',
    'fps=30',
    'format=yuv420p',
  ].join(',');
}

export function buildSceneMediaSegmentArgs(params: {
  ffmpegPath?: string;
  inputPath: string;
  outputPath: string;
  media: RenderableSceneMedia;
  width: number;
  height: number;
}) {
  const duration = Math.max(1, params.media.durationSeconds).toFixed(3);
  const commonOutputArgs = [
    '-vf',
    normalizedSceneVideoFilter(params.width, params.height),
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    params.outputPath,
  ];

  if (params.media.kind === 'video') {
    return [
      '-y',
      '-hide_banner',
      '-loglevel',
      'warning',
      '-stream_loop',
      '-1',
      '-i',
      params.inputPath,
      '-t',
      duration,
      ...commonOutputArgs,
    ];
  }

  return [
    '-y',
    '-hide_banner',
    '-loglevel',
    'warning',
    '-loop',
    '1',
    '-t',
    duration,
    '-i',
    params.inputPath,
    ...commonOutputArgs,
  ];
}

export async function renderStaticVideoForWorker(params: {
  project: any;
  lines: any[];
  words?: any[];
  scenes: any[];
  settings?: unknown;
  watermark?: ExportWatermark | null;
  exportId: string;
}) {
  const configs = await getAllConfigs();
  const { width, height } = getDimensions(params.project.aspectRatio);
  const tmpDir = path.join(os.tmpdir(), 'lyric-video-renders', params.exportId);
  await mkdir(tmpDir, { recursive: true });

  try {
    const audioPath = path.join(tmpDir, 'audio');
    const audioKey = resolveStorageKey({
      key: params.project.audioStorageKey || params.project.processedAudioStorageKey || params.project.originalAudioStorageKey,
      url: params.project.audioUrl || params.project.processedAudioUrl || params.project.originalAudioUrl,
      label: 'Audio',
      configs,
    });
    await writeStorageObjectToFile({ key: audioKey, targetPath: audioPath, label: 'audio', configs });

    const sceneMedia = resolveRenderableSceneMedia(params.scenes);
    const segmentPaths: string[] = [];
    const ffmpegPath = configs.ffmpeg_path || 'ffmpeg';
    for (let index = 0; index < sceneMedia.length; index += 1) {
      const media = sceneMedia[index];
      const inputPath = path.join(tmpDir, `scene-${index}.${media.kind === 'video' ? 'mp4' : 'image'}`);
      const segmentPath = path.join(tmpDir, `segment-${index}.mp4`);
      await writeMediaUrlToFile({ url: media.url, targetPath: inputPath, label: `scene ${index + 1} ${media.kind}`, configs });
      await execFileAsync(
        ffmpegPath,
        buildSceneMediaSegmentArgs({
          inputPath,
          outputPath: segmentPath,
          media,
          width,
          height,
        }),
        { maxBuffer: FFMPEG_MAX_BUFFER_BYTES }
      );
      segmentPaths.push(segmentPath);
    }

    const concatPath = path.join(tmpDir, 'segments.txt');
    const assPath = path.join(tmpDir, 'subtitles.ass');
    const outputPath = path.join(tmpDir, 'output.mp4');
    const captionStyle = normalizeCaptionStyle(params.settings);
    const subtitlesEnabled = captionsAreEnabled(captionStyle);
    await writeFile(concatPath, buildSceneMediaConcatFile(segmentPaths));
    if (subtitlesEnabled) {
      await writeFile(
        assPath,
        buildAss({
          lines: params.lines,
          words: params.words,
          scenes: params.scenes,
          width,
          height,
          style: captionStyle,
        })
      );
    }

    const watermarkFilter = buildWatermarkDrawtextFilter({
      watermark: params.watermark,
      width,
      height,
    });
    const videoFilter = [
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`,
      subtitlesEnabled ? `subtitles=${assPath}` : null,
      watermarkFilter,
    ]
      .filter(Boolean)
      .join(',');

    await execFileAsync(ffmpegPath, [
      '-y',
      '-hide_banner',
      '-loglevel',
      'warning',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatPath,
      '-i',
      audioPath,
      '-vf',
      videoFilter,
      '-shortest',
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      outputPath,
    ], { maxBuffer: FFMPEG_MAX_BUFFER_BYTES });

    return uploadRenderedVideo({
      body: await readFile(outputPath),
      exportId: params.exportId,
      configs,
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

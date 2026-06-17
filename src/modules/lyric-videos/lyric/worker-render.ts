import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { envConfigs } from '@/config';
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

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

export function storageKeyFromUrl(url?: string | null) {
  if (!url) return '';
  const value = String(url).trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value) && !value.startsWith('/')) return trimSlashes(value);

  try {
    const parsed = new URL(value);
    const publicDomain = String(envConfigs.storage_public_domain || '').trim();
    if (publicDomain) {
      const publicParsed = new URL(publicDomain);
      if (parsed.host === publicParsed.host) {
        return trimSlashes(parsed.pathname);
      }
    }

    const endpoint = String(envConfigs.storage_endpoint || '').trim();
    const bucket = String(envConfigs.storage_bucket || '').trim();
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

function resolveStorageKey(params: { key?: string | null; url?: string | null; label: string }) {
  const key = String(params.key || '').trim() || storageKeyFromUrl(params.url);
  if (!key) throw new Error(`${params.label} storage key is required for media-worker`);
  return key;
}

async function writeStorageObjectToFile(params: { key: string; targetPath: string; label: string }) {
  if (!isStorageConfigured()) throw new Error('Storage is required for media-worker');
  const result = await getStorage().downloadFile({ key: params.key });
  if (!result.success || !result.body) {
    throw new Error(result.error || `Download ${params.label} failed`);
  }
  await writeFile(params.targetPath, result.body);
}

async function uploadRenderedVideo(params: { body: Buffer; exportId: string }) {
  if (!isStorageConfigured()) throw new Error('Storage is required for media-worker');
  const key = `renders/${params.exportId}.mp4`;
  const result = await getStorage().uploadFile({
    body: params.body,
    key,
    contentType: 'video/mp4',
  });
  if (!result.success || !result.url) throw new Error(result.error || 'Upload rendered video failed');
  return { url: result.url, storageKey: result.key || key };
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
  const { width, height } = getDimensions(params.project.aspectRatio);
  const tmpDir = path.join(os.tmpdir(), 'lyric-video-renders', params.exportId);
  await mkdir(tmpDir, { recursive: true });

  try {
    const audioPath = path.join(tmpDir, 'audio');
    const audioKey = resolveStorageKey({
      key: params.project.audioStorageKey || params.project.processedAudioStorageKey || params.project.originalAudioStorageKey,
      url: params.project.audioUrl || params.project.processedAudioUrl || params.project.originalAudioUrl,
      label: 'Audio',
    });
    await writeStorageObjectToFile({ key: audioKey, targetPath: audioPath, label: 'audio' });

    const scenesWithImages = params.scenes.filter((scene) => scene.imageUrl);
    if (scenesWithImages.length === 0) throw new Error('Generate at least one scene image before export');

    const concatLines: string[] = [];
    for (let index = 0; index < scenesWithImages.length; index += 1) {
      const scene = scenesWithImages[index];
      const imagePath = path.join(tmpDir, `scene-${index}.image`);
      const imageKey = resolveStorageKey({
        url: scene.imageUrl,
        label: `Scene ${index + 1} image`,
      });
      await writeStorageObjectToFile({ key: imageKey, targetPath: imagePath, label: `scene ${index + 1} image` });
      concatLines.push(`file '${imagePath.replace(/'/g, "'\\''")}'`);
      concatLines.push(`duration ${Math.max(1, ((scene.endMs || scene.startMs + 4000) - (scene.startMs || 0)) / 1000)}`);
    }
    const lastImage = path.join(tmpDir, `scene-${scenesWithImages.length - 1}.image`);
    concatLines.push(`file '${lastImage.replace(/'/g, "'\\''")}'`);

    const concatPath = path.join(tmpDir, 'images.txt');
    const assPath = path.join(tmpDir, 'subtitles.ass');
    const outputPath = path.join(tmpDir, 'output.mp4');
    const captionStyle = normalizeCaptionStyle(params.settings);
    const subtitlesEnabled = captionsAreEnabled(captionStyle);
    await writeFile(concatPath, concatLines.join('\n'));
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

    await execFileAsync(envConfigs.ffmpeg_path || 'ffmpeg', [
      '-y',
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
    ]);

    return uploadRenderedVideo({
      body: await readFile(outputPath),
      exportId: params.exportId,
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

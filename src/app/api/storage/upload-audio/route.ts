import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { headers } from 'next/headers';
import { envConfigs } from '@/config';
import { getAuth } from '@/core/auth';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { respData, respErr } from '@/lib/resp';
import { getAllConfigs } from '@/modules/config/service';
import { getStorage, isStorageConfigured } from '@/modules/storage/service';
import { buildAudioUploadKey } from '@/modules/storage/audio-upload';

/**
 * 音频上传入口。
 *
 * 这一步只负责把用户文件保存到对象存储或本地 public 目录，返回 url/key/filename。
 * 它不走 `src/modules/lyric-videos/service.ts`，也不写 `lyric_video_project`。
 * 前端拿到这里返回的 audioUrl 后，才会调用 `POST /api/lyric-videos` 创建项目。
 */

const AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/x-m4a',
]);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a']);

const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return respErr('Unauthorized');

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return respErr('No audio file provided');
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!AUDIO_TYPES.has(file.type) && !AUDIO_EXTENSIONS.has(extension)) {
      return respErr(`Unsupported audio type: ${file.type || extension || 'unknown'}`);
    }
    const contentType =
      file.type ||
      (extension === 'mp3'
        ? 'audio/mpeg'
        : extension === 'm4a'
          ? 'audio/mp4'
          : `audio/${extension || 'mpeg'}`);
    if (file.size > MAX_BYTES) return respErr('Audio file exceeds the 100MB limit');

    const arrayBuffer = await file.arrayBuffer();
    const body = Buffer.from(arrayBuffer);
    const digest = createHash('sha256').update(body).digest('hex');
    const key = buildAudioUploadKey({
      userId,
      digest,
      mimeType: contentType,
      filename: file.name,
    });

    const configs = await getAllConfigs();
    if (isStorageConfigured(configs)) {
      const storage = getStorage(configs);
      const exists = await storage.exists({ key });
      const url = exists ? storage.getPublicUrl({ key }) : undefined;
      if (url) {
        const data = { url, key, filename: file.name, deduped: true, size: file.size, contentType, checksum: digest };
        logLyricStage('upload-audio', 'route-success', {
          durationMs: Date.now() - startedAt,
          userId,
          ...data,
        });
        return respData(data);
      }

      const result = await storage.uploadFile({
        body,
        key,
        contentType,
      });
      if (!result.success || !result.url) return respErr(result.error || 'Audio upload failed');
      const data = { url: result.url, key: result.key || key, filename: file.name, deduped: false, size: file.size, contentType, checksum: digest };
      logLyricStage('upload-audio', 'route-success', {
        durationMs: Date.now() - startedAt,
        userId,
        ...data,
      });
      return respData(data);
    }

    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      return respErr('Storage is required for audio uploads in production');
    }

    const target = path.join(process.cwd(), 'public', key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    const url = `${envConfigs.app_url.replace(/\/$/, '')}/${key}`;
    const data = { url, key, filename: file.name, deduped: false, size: file.size, contentType, checksum: digest };
    logLyricStage('upload-audio', 'route-success', {
      durationMs: Date.now() - startedAt,
      userId,
      ...data,
    });
    return respData(data);
  } catch (error: any) {
    logLyricStageError('upload-audio', 'route-fail', error, { durationMs: Date.now() - startedAt });
    return respErr(error?.message || 'upload audio failed');
  }
}

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { headers } from 'next/headers';
import { envConfigs } from '@/config';
import { getAuth } from '@/core/auth';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { respData, respErr } from '@/lib/resp';
import { recordBugProblemEvent } from '@/modules/bug-radar/service';
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

function getClientIp(req: Request) {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    ''
  );
}

async function recordUploadApiProblem(req: Request, params: {
  userId?: string;
  eventType?: string;
  message: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
}) {
  await recordBugProblemEvent({
    eventType: params.eventType || 'upload_failed',
    severity: 'error',
    source: 'api',
    flow: 'mp3_upload',
    action: 'upload_audio_api',
    pathname: '/api/storage/upload-audio',
    apiPath: '/api/storage/upload-audio',
    method: 'POST',
    statusCode: params.statusCode,
    message: params.message,
    userId: params.userId,
    userAgent: req.headers.get('user-agent') || '',
    ip: getClientIp(req),
    metadata: params.metadata,
  }).catch(() => undefined);
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return respErr('Unauthorized');

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      await recordUploadApiProblem(req, { userId, eventType: 'upload_failed', message: 'No audio file provided', statusCode: 400 });
      return respErr('No audio file provided');
    }
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!AUDIO_TYPES.has(file.type) && !AUDIO_EXTENSIONS.has(extension)) {
      await recordUploadApiProblem(req, {
        userId,
        eventType: 'file_type_invalid',
        message: `Unsupported audio type: ${file.type || extension || 'unknown'}`,
        statusCode: 400,
        metadata: { filename: file.name, size: file.size, type: file.type, extension },
      });
      return respErr(`Unsupported audio type: ${file.type || extension || 'unknown'}`);
    }
    const contentType =
      file.type ||
      (extension === 'mp3'
        ? 'audio/mpeg'
        : extension === 'm4a'
          ? 'audio/mp4'
          : `audio/${extension || 'mpeg'}`);
    if (file.size > MAX_BYTES) {
      await recordUploadApiProblem(req, {
        userId,
        eventType: 'file_size_invalid',
        message: 'Audio file exceeds the 100MB limit',
        statusCode: 400,
        metadata: { filename: file.name, size: file.size, maxBytes: MAX_BYTES },
      });
      return respErr('Audio file exceeds the 100MB limit');
    }

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
      if (!result.success || !result.url) {
        await recordUploadApiProblem(req, {
          userId,
          eventType: 'upload_failed',
          message: result.error || 'Audio upload failed',
          statusCode: 500,
          metadata: { filename: file.name, size: file.size, key },
        });
        return respErr(result.error || 'Audio upload failed');
      }
      const data = { url: result.url, key: result.key || key, filename: file.name, deduped: false, size: file.size, contentType, checksum: digest };
      logLyricStage('upload-audio', 'route-success', {
        durationMs: Date.now() - startedAt,
        userId,
        ...data,
      });
      return respData(data);
    }

    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      await recordUploadApiProblem(req, {
        userId,
        eventType: 'upload_failed',
        message: 'Storage is required for audio uploads in production',
        statusCode: 500,
        metadata: { filename: file.name, size: file.size },
      });
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
    await recordUploadApiProblem(req, {
      eventType: 'api_error',
      message: error?.message || 'upload audio failed',
      statusCode: 500,
      metadata: { durationMs: Date.now() - startedAt },
    });
    return respErr(error?.message || 'upload audio failed');
  }
}

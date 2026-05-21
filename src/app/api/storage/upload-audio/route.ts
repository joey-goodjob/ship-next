import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { envConfigs } from '@/config';
import { respData, respErr } from '@/lib/resp';
import { getStorage, isStorageConfigured } from '@/modules/storage/service';

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

const MAX_BYTES = 100 * 1024 * 1024;

function extFromMime(mime: string) {
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('aac')) return 'aac';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('flac')) return 'flac';
  return 'mp3';
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return respErr('No audio file provided');
    if (!AUDIO_TYPES.has(file.type)) return respErr(`Unsupported audio type: ${file.type || 'unknown'}`);
    if (file.size > MAX_BYTES) return respErr('Audio file exceeds the 100MB limit');

    const arrayBuffer = await file.arrayBuffer();
    const body = Buffer.from(arrayBuffer);
    const digest = createHash('sha256').update(body).digest('hex');
    const ext = extFromMime(file.type || file.name);
    const key = `uploads/audio/${digest}.${ext}`;

    if (isStorageConfigured()) {
      const storage = getStorage();
      const exists = await storage.exists({ key });
      const url = exists ? storage.getPublicUrl({ key }) : undefined;
      if (url) {
        return respData({ url, key, filename: file.name, deduped: true, size: file.size });
      }

      const result = await storage.uploadFile({
        body,
        key,
        contentType: file.type || 'audio/mpeg',
      });
      if (!result.success || !result.url) return respErr(result.error || 'Audio upload failed');
      return respData({ url: result.url, key: result.key || key, filename: file.name, deduped: false, size: file.size });
    }

    const localDir = path.join(process.cwd(), 'public', 'uploads', 'audio');
    await mkdir(localDir, { recursive: true });
    const target = path.join(localDir, `${digest}.${ext}`);
    await writeFile(target, body);
    const url = `${envConfigs.app_url.replace(/\/$/, '')}/uploads/audio/${digest}.${ext}`;
    return respData({ url, key, filename: file.name, deduped: false, size: file.size });
  } catch (error: any) {
    console.error('upload audio failed:', error);
    return respErr(error?.message || 'upload audio failed');
  }
}

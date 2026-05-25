import { respData, respErr } from '@/lib/resp';
import * as service from '@/modules/lyric-videos/service';

export const runtime = 'nodejs';

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

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return respErr('Debug API is disabled in production');
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return respErr('No audio file provided');
    if (!AUDIO_TYPES.has(file.type)) return respErr(`Unsupported audio type: ${file.type || 'unknown'}`);
    if (file.size > MAX_BYTES) return respErr('Audio file exceeds the 100MB limit');

    const data = await service.analyzeUploadedAudioForDebug({
      body: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      contentType: file.type || 'audio/mpeg',
      language: String(formData.get('language') || 'auto'),
      prompt: String(formData.get('prompt') || ''),
    });

    return respData({
      filename: file.name,
      contentType: file.type,
      size: file.size,
      ...data,
    });
  } catch (error: any) {
    return respErr(error?.message || 'Debug lyric video analysis failed');
  }
}

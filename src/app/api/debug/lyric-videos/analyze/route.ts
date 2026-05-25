import { respData, respErr } from '@/lib/resp';
import * as service from '@/modules/lyric-videos/service';
import { debugBoolean, withDebugFixture } from '../_lib/fixtures';

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
    const fixtureKey = String(formData.get('fixtureKey') || '').trim();
    const cache = formData.get('cache');
    const refreshCache = formData.get('refreshCache');
    if (!file && !(debugBoolean(cache) && fixtureKey)) return respErr('No audio file provided');
    if (file && !AUDIO_TYPES.has(file.type)) return respErr(`Unsupported audio type: ${file.type || 'unknown'}`);
    if (file && file.size > MAX_BYTES) return respErr('Audio file exceeds the 100MB limit');

    const data = await withDebugFixture({
      fixtureKey,
      cache,
      refreshCache,
      stage: 'analyze',
      filename: 'analyze.json',
    }, async () => {
      if (!file) throw new Error('No audio file provided');
      const analysis = await service.analyzeUploadedAudioForDebug({
        body: Buffer.from(await file.arrayBuffer()),
        filename: file.name,
        contentType: file.type || 'audio/mpeg',
        language: String(formData.get('language') || 'auto'),
        prompt: String(formData.get('prompt') || ''),
      });
      return {
        filename: file.name,
        contentType: file.type,
        size: file.size,
        ...analysis,
      };
    });

    return respData(data);
  } catch (error: any) {
    return respErr(error?.message || 'Debug lyric video analysis failed');
  }
}

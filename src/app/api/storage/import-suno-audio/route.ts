import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { respData, respErr } from '@/lib/resp';
import { getAllConfigs } from '@/modules/config/service';
import { importSunoAudioToStorage } from '@/modules/storage/suno-import';

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return respErr('Unauthorized');

    const body = (await req.json().catch(() => ({}))) as { url?: string };
    const inputUrl = body.url?.trim();
    if (!inputUrl) return respErr('Paste a public Suno song link.');

    const configs = await getAllConfigs();
    const imported = await importSunoAudioToStorage({
      inputUrl,
      userId,
      configs,
    });

    logLyricStage('import-suno-audio', 'route-success', {
      durationMs: Date.now() - startedAt,
      userId,
      sourceUrl: inputUrl,
      ...imported,
    });

    return respData(imported);
  } catch (error: any) {
    logLyricStageError('import-suno-audio', 'route-fail', error, { durationMs: Date.now() - startedAt });
    return respErr(error?.message || 'Suno audio import failed');
  }
}

import { and, eq } from 'drizzle-orm';
import { lyricVideoExport } from '@/config/db/schema';
import { db } from '@/core/db';
import { getAllConfigs } from '@/modules/config/service';
import { getStorage, isStorageConfigured } from '@/modules/storage/service';

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

function storageKeyFromUrl(url?: string | null, configs: Record<string, string | undefined> = {}) {
  if (!url) return '';
  const value = String(url).trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) return trimSlashes(value);

  try {
    const parsed = new URL(value, 'https://local.invalid');
    const publicDomain = String(configs.storage_public_domain || '').trim();
    if (publicDomain) {
      const publicParsed = new URL(publicDomain);
      if (parsed.host === publicParsed.host) return trimSlashes(parsed.pathname);
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

export async function getExportDownloadFile(params: {
  userId: string;
  projectId: string;
  exportId: string;
}) {
  const [exportJob] = await db()
    .select()
    .from(lyricVideoExport)
    .where(
      and(
        eq(lyricVideoExport.id, params.exportId),
        eq(lyricVideoExport.projectId, params.projectId),
        eq(lyricVideoExport.userId, params.userId),
      ),
    )
    .limit(1);

  if (!exportJob) throw new Error('Export not found');
  if (exportJob.status !== 'ready' && exportJob.status !== 'success') {
    throw new Error('Export is not ready');
  }

  const configs = await getAllConfigs();
  if (!isStorageConfigured(configs)) throw new Error('Storage is not configured');

  const storageKey = String(exportJob.storageKey || '').trim() || storageKeyFromUrl(exportJob.videoUrl, configs);
  if (!storageKey) throw new Error('Export storage key is missing');

  const result = await getStorage(configs).downloadFile({ key: storageKey });
  if (!result.success || !result.body) {
    throw new Error(result.error || 'Export file is not available');
  }

  return {
    body: result.body,
    contentType: result.contentType || 'video/mp4',
    filename: `lyric-video-${exportJob.id.slice(0, 8)}.mp4`,
  };
}

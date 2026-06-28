import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { envConfigs } from '@/config';
import { buildAudioUploadKey } from '@/modules/storage/audio-upload';
import { getStorage, isStorageConfigured } from '@/modules/storage/service';

const SUNO_HOSTS = new Set(['suno.com', 'www.suno.com']);
const SUNO_SONG_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUNO_SHARE_ID_RE = /^[a-zA-Z0-9_-]{6,80}$/;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

type StorageConfigMap = Record<string, string | undefined>;

export type SunoAudioImportUrl =
  | {
      kind: 'song';
      canonicalUrl: string;
      songId: string;
    }
  | {
      kind: 'share';
      canonicalUrl: string;
      shareId: string;
    };

export type SunoAudioSource = {
  songId: string;
  audioUrl: string;
  filename: string;
  contentType: string;
  size: number;
};

export type ImportedSunoAudio = {
  url: string;
  key: string;
  filename: string;
  deduped: boolean;
  size: number;
  contentType: string;
  checksum: string;
};

function publicSunoLinkError() {
  return new Error('Paste a public Suno song link.');
}

function normalizeContentType(value: string | null) {
  return value?.split(';')[0]?.trim().toLowerCase() || 'audio/mpeg';
}

function parseContentLength(value: string | null) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function assertAudioSize(size: number, maxBytes: number) {
  if (size > maxBytes) {
    throw new Error(`Suno audio exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`);
  }
}

export function parseSunoAudioImportUrl(input: string): SunoAudioImportUrl {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw publicSunoLinkError();
  }

  if (url.protocol !== 'https:' || !SUNO_HOSTS.has(url.hostname.toLowerCase())) {
    throw publicSunoLinkError();
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'song' && segments[1] && SUNO_SONG_ID_RE.test(segments[1])) {
    return {
      kind: 'song',
      canonicalUrl: `https://suno.com/song/${segments[1]}`,
      songId: segments[1],
    };
  }

  if (segments[0] === 's' && segments[1] && SUNO_SHARE_ID_RE.test(segments[1])) {
    return {
      kind: 'share',
      canonicalUrl: `https://suno.com/s/${segments[1]}`,
      shareId: segments[1],
    };
  }

  throw publicSunoLinkError();
}

export function extractSunoSongIdFromHtml(html: string) {
  const songUrlMatch = html.match(/suno\.com\/song\/([0-9a-f-]{36})/i);
  if (songUrlMatch?.[1] && SUNO_SONG_ID_RE.test(songUrlMatch[1])) return songUrlMatch[1];

  const cdnMatch = html.match(/cdn\d*\.suno\.ai\/([0-9a-f-]{36})\.(?:mp3|mp4)/i);
  if (cdnMatch?.[1] && SUNO_SONG_ID_RE.test(cdnMatch[1])) return cdnMatch[1];

  return null;
}

export async function resolveSunoAudioSource(
  inputUrl: string,
  opts: {
    fetcher?: typeof fetch;
    maxBytes?: number;
  } = {},
): Promise<SunoAudioSource> {
  const fetcher = opts.fetcher || fetch;
  const maxBytes = opts.maxBytes || DEFAULT_MAX_BYTES;
  const parsed = parseSunoAudioImportUrl(inputUrl);
  let songId = parsed.kind === 'song' ? parsed.songId : '';

  if (!songId) {
    const pageResponse = await fetcher(parsed.canonicalUrl, { method: 'GET', redirect: 'follow' });
    if (!pageResponse.ok) {
      throw new Error('This Suno link is not publicly accessible. Download the MP3 from Suno and upload it instead.');
    }

    try {
      if (pageResponse.url) {
        const redirected = parseSunoAudioImportUrl(pageResponse.url);
        if (redirected.kind === 'song') songId = redirected.songId;
      }
    } catch {
      // Some fetch implementations do not expose the final URL. Fall back to HTML.
    }

    if (!songId) {
      songId = extractSunoSongIdFromHtml(await pageResponse.text()) || '';
    }
  }

  if (!songId) {
    throw new Error('This Suno link does not expose a public song. Download the MP3 from Suno and upload it instead.');
  }

  const audioUrl = `https://cdn1.suno.ai/${songId}.mp3`;
  const audioHead = await fetcher(audioUrl, { method: 'HEAD', redirect: 'follow' });
  const contentType = normalizeContentType(audioHead.headers.get('content-type'));
  const size = parseContentLength(audioHead.headers.get('content-length'));

  if (!audioHead.ok || !contentType.startsWith('audio/')) {
    throw new Error('We could not import audio from this Suno link. Download the MP3 from Suno and upload it instead.');
  }

  assertAudioSize(size, maxBytes);

  return {
    songId,
    audioUrl,
    filename: `suno-${songId}.mp3`,
    contentType,
    size,
  };
}

export async function importSunoAudioToStorage(params: {
  inputUrl: string;
  userId: string;
  configs?: StorageConfigMap;
  fetcher?: typeof fetch;
  maxBytes?: number;
}): Promise<ImportedSunoAudio> {
  const maxBytes = params.maxBytes || DEFAULT_MAX_BYTES;
  const fetcher = params.fetcher || fetch;
  const source = await resolveSunoAudioSource(params.inputUrl, { fetcher, maxBytes });
  const response = await fetcher(source.audioUrl, { method: 'GET', redirect: 'follow' });
  if (!response.ok) {
    throw new Error('We could not download audio from this Suno link. Download the MP3 from Suno and upload it instead.');
  }

  const contentType = normalizeContentType(response.headers.get('content-type') || source.contentType);
  if (!contentType.startsWith('audio/')) {
    throw new Error('We could not import audio from this Suno link. Download the MP3 from Suno and upload it instead.');
  }

  const body = Buffer.from(await response.arrayBuffer());
  assertAudioSize(body.length, maxBytes);

  const digest = createHash('sha256').update(body).digest('hex');
  const key = buildAudioUploadKey({
    userId: params.userId,
    digest,
    mimeType: contentType,
    filename: source.filename,
  });
  const configs = params.configs || envConfigs;

  if (isStorageConfigured(configs)) {
    const storage = getStorage(configs);
    const exists = await storage.exists({ key });
    const existingUrl = exists ? storage.getPublicUrl({ key }) : undefined;
    if (existingUrl) {
      return {
        url: existingUrl,
        key,
        filename: source.filename,
        deduped: true,
        size: body.length,
        contentType,
        checksum: digest,
      };
    }

    const result = await storage.uploadFile({ body, key, contentType });
    if (!result.success || !result.url) throw new Error(result.error || 'Suno audio import failed');
    return {
      url: result.url,
      key: result.key || key,
      filename: source.filename,
      deduped: false,
      size: body.length,
      contentType,
      checksum: digest,
    };
  }

  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    throw new Error('Storage is required for audio imports in production');
  }

  const target = path.join(process.cwd(), 'public', key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);

  return {
    url: `${envConfigs.app_url.replace(/\/$/, '')}/${key}`,
    key,
    filename: source.filename,
    deduped: false,
    size: body.length,
    contentType,
    checksum: digest,
  };
}

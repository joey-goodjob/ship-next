import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Provider } from '../src/core/storage/s3';
import { getAllConfigs } from '../src/modules/config/service';

type SourceCharacter = {
  slug: string;
  name: string;
  direction: string;
  assets: {
    showcase: { path: string; prompt?: string };
    turnaround: { path: string; prompt?: string };
  };
};

type SourceManifest = {
  id: string;
  characters: SourceCharacter[];
};

type UploadedCharacterPreset = {
  slug: string;
  name: string;
  role: string;
  description: string;
  promptFragment: string;
  thumbnailUrl: string;
  referenceImageUrl: string;
  referenceImageUrls: string[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const SOURCE_MANIFEST_PATH = path.join(
  repoRoot,
  'public/debug/lyric-videos/character-library/openart-seed/manifest.json',
);
const LOCAL_OUTPUT_PATH = path.join(repoRoot, 'data/character-presets.openart-seed.v1.json');
const LIBRARY_ID = 'openart-seed';
const LIBRARY_VERSION = 'v1';
const KEY_PREFIX = `character-library/${LIBRARY_ID}/${LIBRARY_VERSION}`;
const PREFERRED_ORDER = ['vera', 'kai', 'luna', 'rosa', 'ace', 'tex', 'ty', 'jayden', 'jay'];

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function trimTrailingSlash(value?: string) {
  return String(value || '').replace(/\/+$/, '');
}

function publicPathToLocalPath(publicPath: string) {
  const normalized = publicPath.startsWith('/') ? publicPath.slice(1) : publicPath;
  return path.join(repoRoot, 'public', normalized.replace(/^public\//, ''));
}

function contentTypeForPath(filePath: string) {
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function sortCharacters(characters: SourceCharacter[]) {
  const rank = new Map(PREFERRED_ORDER.map((slug, index) => [slug, index]));
  return [...characters].sort((a, b) => {
    const aRank = rank.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
    const bRank = rank.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.slug.localeCompare(b.slug);
  });
}

function buildPromptFragment(character: SourceCharacter) {
  return `fictional music video main character, ${character.direction}`;
}

async function readSourceManifest() {
  const raw = await readFile(SOURCE_MANIFEST_PATH, 'utf-8');
  const manifest = JSON.parse(raw) as SourceManifest;
  if (!Array.isArray(manifest.characters) || manifest.characters.length === 0) {
    throw new Error(`No characters found in ${SOURCE_MANIFEST_PATH}`);
  }
  return manifest;
}

async function createProvider() {
  const configs = await getAllConfigs();
  const required = ['storage_endpoint', 'storage_access_key', 'storage_secret_key', 'storage_bucket'];
  const missing = required.filter((key) => !configs[key]);
  if (missing.length > 0) {
    throw new Error(`Missing storage config: ${missing.join(', ')}`);
  }
  const publicDomain = trimTrailingSlash(configs.storage_public_domain);
  if (!publicDomain && !hasFlag('--allow-s3-api-url')) {
    throw new Error(
      [
        'Missing storage_public_domain.',
        'R2 S3 API URLs are not public image URLs and cannot be used as Kie image_input.',
        'Configure an R2 public/custom domain in storage_public_domain, then rerun this script.',
        'Use --allow-s3-api-url only for private upload testing.',
      ].join(' '),
    );
  }

  return new S3Provider({
    endpoint: trimTrailingSlash(configs.storage_endpoint),
    region: configs.storage_region || 'auto',
    accessKeyId: configs.storage_access_key,
    secretAccessKey: configs.storage_secret_key,
    bucket: configs.storage_bucket,
    publicDomain: publicDomain || undefined,
  });
}

async function uploadOrResolveUrl(params: {
  provider: S3Provider;
  key: string;
  filePath: string;
  force: boolean;
  dryRun: boolean;
}) {
  const publicUrl = params.provider.getPublicUrl({ key: params.key });
  if (params.dryRun) {
    return { url: publicUrl, action: 'dry-run' };
  }

  const exists = params.force ? false : await params.provider.exists({ key: params.key });
  if (exists) {
    return { url: publicUrl, action: 'exists' };
  }

  const body = await readFile(params.filePath);
  const result = await params.provider.uploadFile({
    body,
    key: params.key,
    contentType: contentTypeForPath(params.filePath),
    disposition: 'inline',
  });
  if (!result.success || !result.url) {
    throw new Error(result.error || `Upload failed for ${params.key}`);
  }
  return { url: result.url, action: 'uploaded' };
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const force = hasFlag('--force');
  const sourceManifest = await readSourceManifest();
  const provider = await createProvider();
  const uploadedCharacters: UploadedCharacterPreset[] = [];
  const uploadLog: Array<{ key: string; source: string; action: string; url: string }> = [];

  for (const character of sortCharacters(sourceManifest.characters)) {
    const showcaseKey = `${KEY_PREFIX}/${character.slug}/showcase.png`;
    const referenceKey = `${KEY_PREFIX}/${character.slug}/ai-reference.png`;
    const showcasePath = publicPathToLocalPath(character.assets.showcase.path);
    const referencePath = publicPathToLocalPath(character.assets.turnaround.path);
    const showcase = await uploadOrResolveUrl({ provider, key: showcaseKey, filePath: showcasePath, force, dryRun });
    const reference = await uploadOrResolveUrl({ provider, key: referenceKey, filePath: referencePath, force, dryRun });

    uploadLog.push({ key: showcaseKey, source: showcasePath, action: showcase.action, url: showcase.url });
    uploadLog.push({ key: referenceKey, source: referencePath, action: reference.action, url: reference.url });
    uploadedCharacters.push({
      slug: character.slug,
      name: character.name,
      role: 'main',
      description: character.direction,
      promptFragment: buildPromptFragment(character),
      thumbnailUrl: showcase.url,
      referenceImageUrl: reference.url,
      referenceImageUrls: [reference.url],
    });
  }

  const uploadedManifest = {
    id: sourceManifest.id,
    version: LIBRARY_VERSION,
    keyPrefix: KEY_PREFIX,
    uploadedAt: dryRun ? null : new Date().toISOString(),
    characters: uploadedCharacters,
  };

  const manifestKey = `${KEY_PREFIX}/manifest.json`;
  const manifestUrl = provider.getPublicUrl({ key: manifestKey });
  uploadLog.push({ key: manifestKey, source: LOCAL_OUTPUT_PATH, action: dryRun ? 'dry-run' : 'uploaded', url: manifestUrl });

  console.table(uploadLog.map(({ key, action, url }) => ({ action, key, url })));

  if (dryRun) {
    console.log(`Dry run complete: ${uploadLog.length} objects planned.`);
    return;
  }

  const manifestBody = `${JSON.stringify(uploadedManifest, null, 2)}\n`;
  await writeFile(LOCAL_OUTPUT_PATH, manifestBody, 'utf-8');
  const result = await provider.uploadFile({
    body: Buffer.from(manifestBody, 'utf-8'),
    key: manifestKey,
    contentType: 'application/json',
    disposition: 'inline',
  });
  if (!result.success || !result.url) {
    throw new Error(result.error || `Upload failed for ${manifestKey}`);
  }

  console.log(`Wrote ${LOCAL_OUTPUT_PATH}`);
  console.log(`Uploaded manifest: ${result.url}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { S3Provider } from '../src/core/storage/s3';

const repoRoot = path.resolve(__dirname, '..');
const previewRoot = path.join(repoRoot, 'public', 'style-previews', 'lyric-video-styles');
const previewFiles = [
  'realistic.webp',
  'realistic-3d-render.webp',
  'anime.webp',
  'cartoon.webp',
  'digital.webp',
  'oil-painting.webp',
  'pencil-sketch.webp',
  'pixel-art.webp',
] as const;

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function loadDotEnvLocal() {
  const envPath = path.join(repoRoot, '.env.local');
  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

function trimTrailingSlash(value?: string) {
  return String(value || '').replace(/\/+$/, '');
}

async function createProvider() {
  loadDotEnvLocal();
  const { getAllConfigs } = await import('../src/modules/config/service');
  const configs = await getAllConfigs({ forceRefresh: true });
  const required = [
    'storage_endpoint',
    'storage_access_key',
    'storage_secret_key',
    'storage_bucket',
    'storage_public_domain',
  ];
  const missing = required.filter((key) => !configs[key]);
  if (missing.length > 0) {
    throw new Error(`Missing R2 storage config: ${missing.join(', ')}`);
  }

  return new S3Provider({
    endpoint: trimTrailingSlash(configs.storage_endpoint),
    region: configs.storage_region || 'auto',
    accessKeyId: configs.storage_access_key,
    secretAccessKey: configs.storage_secret_key,
    bucket: configs.storage_bucket,
    publicDomain: trimTrailingSlash(configs.storage_public_domain),
  });
}

async function assertPublicUrl(url: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) return;
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Public URL check failed after 3 attempts: ${url} (${message})`);
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const force = hasFlag('--force');
  const checkPublic = hasFlag('--check-public');

  const provider = await createProvider();
  const results: Array<{ action: 'dry-run' | 'exists' | 'uploaded'; key: string; publicUrl: string }> = [];

  for (const filename of previewFiles) {
    const filePath = path.join(previewRoot, filename);
    if (!existsSync(filePath)) throw new Error(`Missing style preview file: ${filePath}`);

    const key = `style-previews/lyric-video-styles/${filename}`;
    const publicUrl = provider.getPublicUrl({ key });

    if (dryRun) {
      results.push({ action: 'dry-run', key, publicUrl });
      console.log(`dry-run  ${key} -> ${publicUrl}`);
      continue;
    }

    const exists = force ? false : await provider.exists({ key });
    if (exists) {
      results.push({ action: 'exists', key, publicUrl });
      console.log(`exists   ${key} -> ${publicUrl}`);
      continue;
    }

    const body = await readFile(filePath);
    const result = await provider.uploadFile({
      body,
      key,
      contentType: 'image/webp',
      disposition: 'inline',
    });
    if (!result.success || !result.url) {
      throw new Error(result.error || `Upload failed for ${key}`);
    }

    results.push({ action: 'uploaded', key, publicUrl: result.url });
    console.log(`uploaded ${key} -> ${result.url}`);
  }

  if (checkPublic && !dryRun) {
    for (const result of results) {
      await assertPublicUrl(result.publicUrl);
    }
  }

  const uploaded = results.filter((item) => item.action === 'uploaded').length;
  const existing = results.filter((item) => item.action === 'exists').length;
  console.log(`Style preview uploads: ${uploaded} uploaded, ${existing} existing.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

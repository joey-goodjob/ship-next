import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { S3Provider } from '../src/core/storage/s3';

type UploadAction = 'dry-run' | 'exists' | 'uploaded';

type UploadResult = {
  action: UploadAction;
  key: string;
  publicUrl: string;
};

const repoRoot = path.resolve(__dirname, '..');
const seoImageRoot = path.join(repoRoot, 'public', 'imgs', 'seo');
const seoPageRoot = path.join(repoRoot, 'public', 'seo-pages');

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

function contentTypeForPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function listFilesRecursive(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const entryPath = path.join(dir, entry);
      const stat = statSync(entryPath);
      if (stat.isDirectory()) return listFilesRecursive(entryPath);
      if (!stat.isFile()) return [];
      return [entryPath];
    })
    .sort();
}

function toPublicImagePath(filePath: string) {
  const relative = path.relative(path.join(repoRoot, 'public'), filePath);
  return `/${relative.split(path.sep).join('/')}`;
}

function toObjectKey(publicPath: string) {
  return publicPath.replace(/^\/+/, '');
}

function listSeoPageFiles() {
  return ['en', 'zh']
    .flatMap((locale) => {
      const localeDir = path.join(seoPageRoot, locale);
      return readdirSync(localeDir)
        .filter((filename) => filename.endsWith('.json'))
        .map((filename) => path.join(localeDir, filename));
    })
    .sort();
}

function collectReferencedSeoImages() {
  const referenced = new Set<string>();
  for (const filePath of listSeoPageFiles()) {
    const page = JSON.parse(readFileSync(filePath, 'utf8')) as { useCases?: Array<{ image?: string }> };
    for (const item of page.useCases || []) {
      if (item.image?.startsWith('/imgs/seo/')) {
        referenced.add(item.image);
      }
    }
  }
  return referenced;
}

async function createProvider() {
  loadDotEnvLocal();
  const { getAllConfigs } = await import('../src/modules/config/service');
  const configs = await getAllConfigs();
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

async function uploadOrResolveUrl(params: {
  provider: S3Provider;
  key: string;
  filePath: string;
  force: boolean;
  dryRun: boolean;
}): Promise<UploadResult> {
  const publicUrl = params.provider.getPublicUrl({ key: params.key });
  if (params.dryRun) return { action: 'dry-run', key: params.key, publicUrl };

  const exists = params.force ? false : await params.provider.exists({ key: params.key });
  if (exists) return { action: 'exists', key: params.key, publicUrl };

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
  return { action: 'uploaded', key: params.key, publicUrl: result.url };
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

function rewriteSeoJson(params: { publicDomain: string; dryRun: boolean }) {
  const publicDomain = trimTrailingSlash(params.publicDomain);
  let changedFiles = 0;
  let changedImages = 0;

  for (const filePath of listSeoPageFiles()) {
    const page = JSON.parse(readFileSync(filePath, 'utf8')) as { useCases?: Array<{ image?: string }> };
    let changed = false;

    for (const item of page.useCases || []) {
      if (!item.image?.startsWith('/imgs/seo/')) continue;
      item.image = `${publicDomain}${item.image}`;
      changed = true;
      changedImages += 1;
    }

    if (!changed) continue;
    changedFiles += 1;
    if (!params.dryRun) {
      writeFileSync(filePath, `${JSON.stringify(page, null, 2)}\n`, 'utf8');
    }
  }

  return { changedFiles, changedImages };
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const force = hasFlag('--force');
  const checkPublic = hasFlag('--check-public');

  if (!existsSync(seoImageRoot)) {
    throw new Error(`Missing SEO image directory: ${seoImageRoot}`);
  }

  const provider = await createProvider();
  const publicDomain = trimTrailingSlash(provider.configs.publicDomain);
  const referenced = collectReferencedSeoImages();
  const localFiles = listFilesRecursive(seoImageRoot);
  const available = new Map(localFiles.map((filePath) => [toPublicImagePath(filePath), filePath]));
  const missing = [...referenced].filter((publicPath) => !available.has(publicPath));
  if (missing.length > 0) {
    throw new Error(`Missing local SEO image files:\n${missing.join('\n')}`);
  }

  const results: UploadResult[] = [];
  for (const [publicPath, filePath] of [...available.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const key = toObjectKey(publicPath);
    const result = await uploadOrResolveUrl({ provider, key, filePath, force, dryRun });
    results.push(result);
    console.log(`${result.action.padEnd(8)} ${key}`);
  }

  if (checkPublic && !dryRun) {
    for (const result of results) {
      await assertPublicUrl(result.publicUrl);
    }
  }

  const rewrite = rewriteSeoJson({ publicDomain, dryRun });
  console.log(
    `${dryRun ? 'Would update' : 'Updated'} ${rewrite.changedImages} SEO image URLs in ${rewrite.changedFiles} JSON files.`,
  );
  console.log(`SEO image uploads: ${results.filter((item) => item.action === 'uploaded').length} uploaded, ${results.filter((item) => item.action === 'exists').length} existing.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

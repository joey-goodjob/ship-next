import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';

const DEFAULT_PROJECT_ID = '00eab242-6c55-44c7-bd8a-ef5afa553385';
const repoRoot = path.resolve(__dirname, '..');

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

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function getArgValue(name: string) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function isR2PublicUrl(value?: string | null, publicDomain?: string) {
  return Boolean(value && publicDomain && value.startsWith(`${trimTrailingSlash(publicDomain)}/`));
}

function publicUrlForKey(publicDomain: string, key: string) {
  return `${trimTrailingSlash(publicDomain)}/${key}`;
}

function publicPathToLocalPath(value: string) {
  const urlPath = value.startsWith('http://localhost:3000/')
    ? new URL(value).pathname
    : value;
  const normalized = trimSlashes(urlPath).replace(/^public\//, '');
  return path.join(repoRoot, 'public', normalized);
}

function keyFromLocalPublicUrl(value: string) {
  const urlPath = value.startsWith('http://localhost:3000/')
    ? new URL(value).pathname
    : value;
  return trimSlashes(urlPath).replace(/^public\//, '');
}

function contentTypeForPath(filePath: string, fallback = 'application/octet-stream') {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.m4a') return 'audio/mp4';
  return fallback;
}

async function uploadOrReuse(params: {
  client: AwsClient;
  endpoint: string;
  bucket: string;
  publicDomain: string;
  key: string;
  localPath: string;
  contentType: string;
  dryRun: boolean;
  force: boolean;
}) {
  if (!existsSync(params.localPath)) {
    throw new Error(`Local file not found for ${params.key}: ${params.localPath}`);
  }

  const objectUrl = `${trimTrailingSlash(params.endpoint)}/${params.bucket}/${params.key}`;
  const publicUrl = publicUrlForKey(params.publicDomain, params.key);

  if (params.dryRun) {
    return { action: 'dry-run', url: publicUrl };
  }

  const exists = params.force
    ? false
    : await params.client
        .fetch(new Request(objectUrl, { method: 'HEAD' }))
        .then((response) => response.ok)
        .catch(() => false);
  if (exists) {
    return { action: 'exists', url: publicUrl };
  }

  const body = await readFile(params.localPath);
  let response: Response;
  try {
    response = await params.client.fetch(
      new Request(objectUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': params.contentType,
          'Content-Disposition': 'inline',
          'Content-Length': body.length.toString(),
        },
        body,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Upload request failed for ${params.key}: ${message}`);
  }
  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    throw new Error(
      `Upload failed for ${params.key}: ${response.status} ${response.statusText} ${responseBody}`,
    );
  }

  return { action: 'uploaded', url: publicUrl };
}

async function main() {
  loadDotEnvLocal();

  const dryRun = hasFlag('--dry-run');
  const force = hasFlag('--force');
  const projectId = getArgValue('--project') || DEFAULT_PROJECT_ID;

  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/core/db');
  const { config, lyricVideoProject, lyricVideoScene } = await import('../src/config/db/schema');
  const { getAllConfigs } = await import('../src/modules/config/service');
  const { isStorageConfigured } = await import('../src/modules/storage/service');

  const configs = await getAllConfigs();
  const required = [
    'storage_endpoint',
    'storage_region',
    'storage_access_key',
    'storage_secret_key',
    'storage_bucket',
    'storage_public_domain',
  ];
  const missing = required.filter((key) => !configs[key]);
  if (missing.length > 0 || !isStorageConfigured(configs)) {
    throw new Error(`Missing R2 storage config: ${missing.join(', ')}`);
  }

  const [inlineConfig] = await db()
    .select({ name: config.name })
    .from(config)
    .where(eq(config.name, 'inline_image_max_kb'))
    .limit(1);
  if (!inlineConfig && !dryRun) {
    await db().insert(config).values({
      name: 'inline_image_max_kb',
      value: configs.inline_image_max_kb || '2048',
    });
  }

  const publicDomain = configs.storage_public_domain;
  const client = new AwsClient({
    accessKeyId: configs.storage_access_key,
    secretAccessKey: configs.storage_secret_key,
    region: configs.storage_region || 'auto',
  });
  const [project] = await db()
    .select()
    .from(lyricVideoProject)
    .where(eq(lyricVideoProject.id, projectId))
    .limit(1);

  if (!project) throw new Error(`Project not found: ${projectId}`);

  const scenes = await db()
    .select()
    .from(lyricVideoScene)
    .where(eq(lyricVideoScene.projectId, projectId))
    .orderBy(lyricVideoScene.sort);

  const imageLog: Array<{ sort: number; action: string; key: string; url: string }> = [];
  for (const scene of scenes) {
    if (!scene.imageUrl || isR2PublicUrl(scene.imageUrl, publicDomain)) continue;
    if (!scene.imageUrl.startsWith('/lyric-videos/')) continue;

    const key = keyFromLocalPublicUrl(scene.imageUrl);
    const localPath = publicPathToLocalPath(scene.imageUrl);
    const uploaded = await uploadOrReuse({
      client,
      endpoint: configs.storage_endpoint,
      bucket: configs.storage_bucket,
      publicDomain,
      key,
      localPath,
      contentType: contentTypeForPath(localPath, 'image/jpeg'),
      dryRun,
      force,
    });

    imageLog.push({ sort: scene.sort, action: uploaded.action, key, url: uploaded.url });
    if (!dryRun) {
      await db()
        .update(lyricVideoScene)
        .set({ imageUrl: uploaded.url })
        .where(eq(lyricVideoScene.id, scene.id));
    }
  }

  const audioFields = [
    {
      urlField: 'audioUrl',
      keyField: 'audioStorageKey',
    },
    {
      urlField: 'originalAudioUrl',
      keyField: 'originalAudioStorageKey',
    },
    {
      urlField: 'processedAudioUrl',
      keyField: 'processedAudioStorageKey',
    },
  ] as const;

  const audioUpdates: Record<string, string> = {};
  const audioLog: Array<{ field: string; action: string; key: string; url: string }> = [];
  for (const field of audioFields) {
    const currentUrl = project[field.urlField];
    if (!currentUrl || isR2PublicUrl(currentUrl, publicDomain)) continue;
    if (!currentUrl.startsWith('/uploads/') && !currentUrl.startsWith('http://localhost:3000/uploads/')) continue;

    const key = project[field.keyField] || keyFromLocalPublicUrl(currentUrl);
    const normalizedKey = trimSlashes(key);
    const localPath = publicPathToLocalPath(currentUrl);
    const uploaded = await uploadOrReuse({
      client,
      endpoint: configs.storage_endpoint,
      bucket: configs.storage_bucket,
      publicDomain,
      key: normalizedKey,
      localPath,
      contentType: project.audioMimeType || contentTypeForPath(localPath, 'audio/mpeg'),
      dryRun,
      force,
    });

    audioLog.push({ field: field.urlField, action: uploaded.action, key: normalizedKey, url: uploaded.url });
    audioUpdates[field.urlField] = uploaded.url;
    audioUpdates[field.keyField] = normalizedKey;
  }

  if (Object.keys(audioUpdates).length > 0 && !dryRun) {
    await db()
      .update(lyricVideoProject)
      .set(audioUpdates)
      .where(eq(lyricVideoProject.id, projectId));
  }

  console.log(`Project: ${projectId}`);
  console.log(`inline_image_max_kb: ${inlineConfig ? 'already in config table' : dryRun ? 'would insert' : 'inserted'}`);
  console.log(`scene images: ${imageLog.length}`);
  console.table(imageLog.map(({ sort, action, key, url }) => ({ sort, action, key, url })));
  console.log(`audio fields: ${audioLog.length}`);
  console.table(audioLog.map(({ field, action, key, url }) => ({ field, action, key, url })));
  console.log(dryRun ? 'Dry run complete. No DB rows updated.' : 'Migration complete.');
  console.log(`Example public URL: ${imageLog[0]?.url || publicUrlForKey(publicDomain, `lyric-videos/${projectId}/scene-images`)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

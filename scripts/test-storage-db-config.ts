import assert from 'node:assert/strict';

import { getStorage, isStorageConfigured } from '@/modules/storage/service';
import { saveGeneratedFile } from '@/modules/lyric-videos/lyric/audio';

const dbStorageConfig = {
  storage_endpoint: 'https://example.r2.cloudflarestorage.com',
  storage_region: 'auto',
  storage_access_key: 'access-key',
  storage_secret_key: 'secret-key',
  storage_bucket: 'media-bucket',
  storage_public_domain: 'https://cdn.example.com',
};

async function testDbStorageConfigIsUsable() {
  assert.equal(isStorageConfigured(dbStorageConfig), true);
  assert.equal(
    getStorage(dbStorageConfig).getPublicUrl({ key: 'lyric-videos/project/scene.jpg' }),
    'https://cdn.example.com/lyric-videos/project/scene.jpg',
  );
}

async function testGeneratedFileFailsFastInProductionWithoutStorage() {
  const writableEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousStorageEndpoint = process.env.STORAGE_ENDPOINT;
  const previousStorageAccessKey = process.env.STORAGE_ACCESS_KEY;
  const previousStorageSecretKey = process.env.STORAGE_SECRET_KEY;
  const previousStorageBucket = process.env.STORAGE_BUCKET;

  writableEnv.NODE_ENV = 'production';
  delete writableEnv.STORAGE_ENDPOINT;
  delete writableEnv.STORAGE_ACCESS_KEY;
  delete writableEnv.STORAGE_SECRET_KEY;
  delete writableEnv.STORAGE_BUCKET;

  await assert.rejects(
    () =>
      saveGeneratedFile({
        body: Buffer.from('image'),
        key: 'lyric-videos/project/scene.jpg',
        contentType: 'image/jpeg',
        localDir: 'lyric-videos/project',
        configs: {},
      }),
    /Storage is required/,
  );

  if (previousNodeEnv === undefined) delete writableEnv.NODE_ENV;
  else writableEnv.NODE_ENV = previousNodeEnv;
  if (previousStorageEndpoint === undefined) delete writableEnv.STORAGE_ENDPOINT;
  else writableEnv.STORAGE_ENDPOINT = previousStorageEndpoint;
  if (previousStorageAccessKey === undefined) delete writableEnv.STORAGE_ACCESS_KEY;
  else writableEnv.STORAGE_ACCESS_KEY = previousStorageAccessKey;
  if (previousStorageSecretKey === undefined) delete writableEnv.STORAGE_SECRET_KEY;
  else writableEnv.STORAGE_SECRET_KEY = previousStorageSecretKey;
  if (previousStorageBucket === undefined) delete writableEnv.STORAGE_BUCKET;
  else writableEnv.STORAGE_BUCKET = previousStorageBucket;
}

async function main() {
  await testDbStorageConfigIsUsable();
  await testGeneratedFileFailsFastInProductionWithoutStorage();
  console.log('storage db config tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

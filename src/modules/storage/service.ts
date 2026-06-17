import { envConfigs } from '@/config';
import { storageManager, S3Provider } from '@/core/storage';

type StorageConfigMap = Record<string, string | undefined>;

let initializedSignature = '';

function getStorageConfig(configs: StorageConfigMap = envConfigs) {
  return {
    endpoint: configs.storage_endpoint || '',
    region: configs.storage_region || 'auto',
    accessKeyId: configs.storage_access_key || '',
    secretAccessKey: configs.storage_secret_key || '',
    bucket: configs.storage_bucket || '',
    publicDomain: configs.storage_public_domain || '',
  };
}

export function isStorageConfigured(configs: StorageConfigMap = envConfigs) {
  const storageConfig = getStorageConfig(configs);
  return Boolean(
    storageConfig.endpoint &&
      storageConfig.accessKeyId &&
      storageConfig.secretAccessKey &&
      storageConfig.bucket,
  );
}

export function getStorage(configs: StorageConfigMap = envConfigs) {
  const storageConfig = getStorageConfig(configs);

  if (isStorageConfigured(configs)) {
    const signature = JSON.stringify(storageConfig);
    if (signature !== initializedSignature) {
      storageManager.addProvider(
        new S3Provider(storageConfig),
        true,
      );
      initializedSignature = signature;
    }
  }

  return storageManager;
}

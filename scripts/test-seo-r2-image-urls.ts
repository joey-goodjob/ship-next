import { existsSync, readFileSync } from 'node:fs';
import { getAllSeoPages } from '../src/lib/seo-pages';

function loadDotEnvLocal() {
  if (!existsSync('.env.local')) return;

  const raw = readFileSync('.env.local', 'utf8');
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

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function collectUseCaseImages() {
  return getAllSeoPages().flatMap(({ locale, slug, page }) =>
    (page.useCases || [])
      .map((item, index) => ({
        page: `${locale}/${slug}`,
        index,
        image: item.image || '',
      }))
      .filter((item) => item.image),
  );
}

async function main() {
  loadDotEnvLocal();

  const { getAllConfigs } = await import('../src/modules/config/service');
  const configs = await getAllConfigs();
  const publicDomain = trimTrailingSlash(String(configs.storage_public_domain || ''));
  if (!publicDomain) {
    throw new Error('Missing storage_public_domain in DB config.');
  }

  const seoImagePrefix = `${publicDomain}/imgs/seo/`;
  const localImages = collectUseCaseImages().filter((item) => item.image.startsWith('/imgs/seo/'));
  if (localImages.length > 0) {
    const sample = localImages
      .slice(0, 8)
      .map((item) => `${item.page} useCases[${item.index}] ${item.image}`)
      .join('\n');
    throw new Error(`SEO use-case images still reference local /imgs/seo paths:\n${sample}`);
  }

  const invalidImages = collectUseCaseImages().filter(
    (item) => item.image.includes('/imgs/seo/') && !item.image.startsWith(seoImagePrefix),
  );
  if (invalidImages.length > 0) {
    const sample = invalidImages
      .slice(0, 8)
      .map((item) => `${item.page} useCases[${item.index}] ${item.image}`)
      .join('\n');
    throw new Error(`SEO use-case images must use ${seoImagePrefix}:\n${sample}`);
  }

  console.log(`Validated ${collectUseCaseImages().length} SEO use-case image URLs against ${publicDomain}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

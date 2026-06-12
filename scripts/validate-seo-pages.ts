import { assertSeoPagePairs, getAllSeoPages } from "../src/lib/seo-pages";

assertSeoPagePairs();

const pages = getAllSeoPages();
const seen = new Set<string>();

for (const { locale, slug, page } of pages) {
  const key = `${locale}/${slug}`;
  if (seen.has(key)) {
    throw new Error(`Duplicate SEO page: ${key}`);
  }
  seen.add(key);

  if (page.slug !== slug) {
    throw new Error(`${key} slug mismatch`);
  }
}

console.log(`Validated ${pages.length} localized SEO page JSON files.`);

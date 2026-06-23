import fs from "node:fs";
import path from "node:path";

function read(filePath: string) {
  return fs.readFileSync(path.join(process.cwd(), filePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(read(filePath)) as T;
}

type SeoJson = {
  seo: {
    title: string;
    description: string;
  };
  hero?: {
    h1: string;
  };
};

const rootLayout = read("src/app/layout.tsx");
assert(
  !rootLayout.includes('rel="alternate"') && !rootLayout.includes("rel=\"alternate\""),
  "Root layout must not hardcode homepage alternate links.",
);
assert(
  !rootLayout.includes("index: false") && !rootLayout.includes("follow: false"),
  "Root layout must not globally noindex public pages.",
);
assert(
  rootLayout.includes("buildPublicMetadata"),
  "Root layout must use shared public metadata defaults.",
);

const config = read("src/config/index.ts");
assert(config.includes("https://lyricvideomaker.app"), "Production app URL default must stay on the live domain.");

const siteMetadata = read("src/lib/site-metadata.ts");
assert(siteMetadata.includes("/og-image.png"), "Shared metadata must define the default OG image.");
assert(siteMetadata.includes('"x-default"'), "Shared metadata must include x-default alternates.");
assert(siteMetadata.includes("metadataBase"), "Shared metadata must set metadataBase.");
assert(siteMetadata.includes("openGraph"), "Shared metadata must set Open Graph data.");
assert(siteMetadata.includes("twitter"), "Shared metadata must set Twitter metadata.");
assert(siteMetadata.includes("robots"), "Shared metadata must set public robots metadata.");
assert(siteMetadata.includes("summary_large_image"), "Shared metadata must define a large Twitter card.");

const robotsRoute = read("src/app/robots.ts");
assert(!robotsRoute.includes("disallow: '/'"), "robots.ts must not disallow the entire site.");
assert(robotsRoute.includes("sitemap"), "robots.ts must expose the sitemap URL.");
assert(robotsRoute.includes("host"), "robots.ts must expose the host URL.");
assert(robotsRoute.includes("/admin"), "robots.ts must disallow private app/admin surfaces.");

const seoRoute = read("src/app/[locale]/[slug]/page.tsx");
assert(
  !seoRoute.includes("canonical: `${path}/`"),
  "SEO page canonical must match the actual non-trailing-slash route.",
);
assert(
  !seoRoute.includes("`/${slug}/`") && !seoRoute.includes("`/zh/${slug}/`"),
  "SEO page hreflang URLs must match the actual non-trailing-slash routes.",
);
assert(seoRoute.includes("buildPublicMetadata"), "SEO page metadata must use the shared public metadata helper.");
assert(seoRoute.includes("how-to-make-a-lyric-video"), "How-to SEO page must receive article Open Graph type.");
assert(seoRoute.includes('"article"'), "How-to SEO page must use article Open Graph type.");

for (const filePath of [
  "src/app/[locale]/(auth)/layout.tsx",
  "src/app/[locale]/(workspace)/layout.tsx",
  "src/app/[locale]/settings/layout.tsx",
  "src/app/[locale]/dashboard/layout.tsx",
  "src/app/[locale]/admin/layout.tsx",
]) {
  const source = read(filePath);
  assert(
    source.includes("robots") && source.includes("index: false") && source.includes("follow: false"),
    `${filePath} must export noindex,nofollow metadata.`,
  );
}

const pricingPage = read("src/app/[locale]/pricing/page.tsx");
assert(pricingPage.includes("buildPublicMetadata"), "Pricing metadata must use the shared helper.");
assert(pricingPage.includes("alternates"), "Pricing metadata must set canonical and language alternates.");

const homePage = read("src/app/[locale]/page.tsx");
assert(homePage.includes("buildPublicMetadata"), "Homepage metadata must use the shared helper.");
assert(homePage.includes("xDefaultPath"), "Homepage metadata must set x-default to the English homepage.");

const sitemapRoute = read("src/app/sitemap.ts");
assert(sitemapRoute.includes("alternates"), "Sitemap entries must include alternates.");
assert(sitemapRoute.includes("languages"), "Sitemap alternates must include localized languages.");
assert(sitemapRoute.includes('"x-default"'), "Sitemap alternates must include x-default.");

const enLanding = readJson<{ pricing: { seoTitle: string; seoDescription: string } }>(
  "src/config/locale/messages/en/landing.json",
);
const zhLanding = readJson<{ pricing: { seoTitle: string; seoDescription: string } }>(
  "src/config/locale/messages/zh/landing.json",
);
assert(
  enLanding.pricing.seoTitle === "Lyric Video Maker Pricing — Free Credits, Creator & Pro Plans",
  "English pricing SEO title is missing or changed.",
);
assert(
  zhLanding.pricing.seoTitle === "歌词视频制作价格 — 免费积分、创作者与 Pro 方案",
  "Chinese pricing SEO title is missing or changed.",
);
assert(enLanding.pricing.seoDescription.length >= 100, "English pricing SEO description is too thin.");
assert(zhLanding.pricing.seoDescription.length >= 45, "Chinese pricing SEO description is too thin.");

for (const route of ["privacy-policy", "terms-of-service"]) {
  const source = read(`src/app/[locale]/(pages)/${route}/page.tsx`);
  assert(source.includes("generateMetadata"), `${route} must export localized metadata.`);
  assert(source.includes("alternates"), `${route} must set canonical and language alternates.`);
  assert(source.includes("buildPublicMetadata"), `${route} must use the shared metadata helper.`);
  assert(source.includes("zh:"), `${route} must include Chinese localized copy.`);
}

assert(
  fs.existsSync(path.join(process.cwd(), "public", "og-image.png")),
  "Default OG image must exist at public/og-image.png.",
);

for (const filePath of [
  "public/seo-pages/en/lyric-video-generator.json",
  "public/seo-pages/en/ai-music-video-generator.json",
  "public/seo-pages/en/audio-to-lyric-video.json",
  "public/seo-pages/en/lyric-video-templates.json",
  "public/seo-pages/en/veed-alternative.json",
]) {
  const page = readJson<SeoJson>(filePath);
  assert(
    page.seo.description.length <= 155,
    `${filePath} description should be concise enough for search snippets.`,
  );
}

for (const filePath of [
  "public/seo-pages/zh/free-lyric-video-maker.json",
  "public/seo-pages/zh/song-to-lyric-video.json",
  "public/seo-pages/zh/tiktok-lyric-video-generator.json",
]) {
  const page = readJson<SeoJson>(filePath);
  assert(page.hero?.h1, `${filePath} must have a hero H1.`);
  assert(
    !/^(Free Lyric Video Maker|Song to Lyric Video|TikTok Lyric Video Generator)\b/.test(page.hero.h1),
    `${filePath} H1 should be Chinese-first, not an English keyword phrase.`,
  );
}

console.log("SEO metadata checks passed.");

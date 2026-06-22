import { readFileSync } from "node:fs";

const filesToCheck = [
  "src/blocks/how-it-works.tsx",
  "src/blocks/cta.tsx",
  "src/blocks/featured-creators.tsx",
] as const;

const requiredWebpPaths = [
  "/seo-pages/ai-lyric-video-generator/how-to-1.webp",
  "/seo-pages/ai-lyric-video-generator/how-to-2.webp",
  "/seo-pages/ai-lyric-video-generator/how-to-3.webp",
  "/imgs/beatviz-m-cta.webp",
  "/imgs/beatviz-featured-on-taaft.webp",
  "/beatviz-community/community-01.webp",
  "/beatviz-community/community-02.webp",
  "/beatviz-community/community-03.webp",
  "/beatviz-community/community-04.webp",
  "/beatviz-community/community-05.webp",
  "/beatviz-community/community-06.webp",
  "/beatviz-community/community-07.webp",
  "/beatviz-community/community-08.webp",
  "/beatviz-community/community-09.webp",
  "/beatviz-community/community-10.webp",
  "/beatviz-community/community-11.webp",
] as const;

const blockedLegacyPaths = [
  "/seo-pages/ai-lyric-video-generator/how-to-1.png",
  "/seo-pages/ai-lyric-video-generator/how-to-2.png",
  "/seo-pages/ai-lyric-video-generator/how-to-3.png",
  "/imgs/beatviz-m-cta.jpg",
  "/imgs/beatviz-featured-on-taaft.png",
  "/beatviz-community/community-01.jpg",
  "/beatviz-community/community-02.jpg",
  "/beatviz-community/community-03.jpg",
  "/beatviz-community/community-04.jpg",
  "/beatviz-community/community-05.jpg",
  "/beatviz-community/community-06.jpg",
  "/beatviz-community/community-07.jpg",
  "/beatviz-community/community-08.jpg",
  "/beatviz-community/community-09.jpg",
  "/beatviz-community/community-10.jpg",
  "/beatviz-community/community-11.jpg",
] as const;

const combinedSource = filesToCheck
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

for (const expectedPath of requiredWebpPaths) {
  if (!combinedSource.includes(expectedPath)) {
    throw new Error(`Homepage blocks must reference ${expectedPath}`);
  }
}

for (const legacyPath of blockedLegacyPaths) {
  if (combinedSource.includes(legacyPath)) {
    throw new Error(`Homepage blocks must not reference legacy image ${legacyPath}`);
  }
}

console.log("Homepage WebP asset guard passed");

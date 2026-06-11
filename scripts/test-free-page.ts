import { existsSync, readFileSync } from "node:fs";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path: string) {
  assert(existsSync(path), `${path} should exist`);
  return readFileSync(path, "utf8");
}

const page = read("src/app/[locale]/free/page.tsx");
const freeBlock = read("src/blocks/free-page.tsx");
const sitemap = read("src/app/sitemap.ts");
const footer = read("src/blocks/footer.tsx");
const enLanding = JSON.parse(read("src/config/locale/messages/en/landing.json"));
const zhLanding = JSON.parse(read("src/config/locale/messages/zh/landing.json"));

assert(page.includes("SoftwareApplication"), "free page should include SoftwareApplication JSON-LD");
assert(page.includes("FAQPage"), "free page should include FAQPage JSON-LD");
assert(page.includes("alternates"), "free page should define metadata alternates");
assert(page.includes("canonical"), "free page should define canonical metadata");
assert(freeBlock.includes("LyricVideoHomeTool"), "free page block should reuse LyricVideoHomeTool");
assert(sitemap.includes("/free"), "sitemap should include /free");
assert(sitemap.includes("/zh/free"), "sitemap should include /zh/free");
assert(footer.includes("footer.free"), "footer should render the Free footer link");
assert(enLanding.free_page?.hero?.h1 === "Free Lyric Video Maker", "English H1 should match the construction card");
assert(
  enLanding.free_page?.comparison?.rows?.some((row: { feature?: string; free?: string; pro?: string; unlimited?: string }) =>
    row.feature === "Watermark" && row.free === "None" && row.pro === "None" && row.unlimited === "None"
  ),
  "comparison table should include Watermark row with None in every plan",
);
assert(
  enLanding.free_page?.comparison?.rows?.some((row: { feature?: string; free?: string; pro?: string; unlimited?: string }) =>
    row.feature === "Commercial use" && row.free === "✓" && row.pro === "✓" && row.unlimited === "✓"
  ),
  "comparison table should include Commercial use row with every plan allowed",
);
assert(
  enLanding.free_page?.styles?.items?.some((item: { name?: string; badge?: string }) => item.name === "Tape Rewind" && item.badge === "PRO"),
  "style preview should include the pro comparison card",
);
assert(zhLanding.free_page?.hero?.h1, "Chinese free page copy should exist");

console.log("Free page checks passed");

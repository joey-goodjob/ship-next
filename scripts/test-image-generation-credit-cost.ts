import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const imageCostConstant = "LYRIC_VIDEO_IMAGE_SUCCESS_COST_CREDITS";

function read(relativePath: string) {
  const fullPath = path.join(root, relativePath);
  assert(fs.existsSync(fullPath), `${relativePath} must exist.`);
  return fs.readFileSync(fullPath, "utf8");
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath)) as Record<string, any>;
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const costsSource = read("src/modules/lyric-videos/lyric/costs.ts");
assert(
  costsSource.includes(`export const ${imageCostConstant} = 5`),
  "Image generation success credit cost must default to 5 credits."
);

const mediaGenerationSource = read("src/modules/lyric-videos/lyric/media-generation.ts");
assert(
  mediaGenerationSource.includes(imageCostConstant),
  "Scene image generation must use the shared image success credit cost."
);
assert(
  mediaGenerationSource.includes(`costCredits: ${imageCostConstant}`),
  "Single scene image tasks must charge 5 credits."
);
assert(
  mediaGenerationSource.includes(`descriptor.scenes.length * ${imageCostConstant}`),
  "Grid scene image tasks must charge 5 credits per successful generated image."
);

const castSource = read("src/modules/lyric-videos/lyric/cast.ts");
assert(
  castSource.includes(imageCostConstant) && castSource.includes(`costCredits: ${imageCostConstant}`),
  "Character image generation must charge the shared 5-credit image cost."
);

for (const locale of ["en", "zh"] as const) {
  const landing = readJson(`src/config/locale/messages/${locale}/landing.json`);
  const imageGroup = landing.pricing_credit_info?.find((group: any) => {
    const title = String(group?.title || "").toLowerCase();
    return title.includes("image") || title.includes("图片");
  });

  assert(imageGroup, `${locale}: pricing credit info must include an image generation group.`);
  assert(Array.isArray(imageGroup.items), `${locale}: image generation group must include items.`);

  for (const item of imageGroup.items) {
    const costText = Array.isArray(item.cost) ? item.cost.join(" ") : String(item.cost || "");
    assert(costText.includes("5"), `${locale}: ${item.name} must disclose a 5-credit image cost.`);
    assert(!costText.includes("3"), `${locale}: ${item.name} must not disclose a discounted 3-credit image cost.`);
    assert(!costText.includes("20"), `${locale}: ${item.name} must not disclose a 20-credit image cost.`);
    assert(!item.discount, `${locale}: ${item.name} must not disclose image credit discounts.`);
  }
}

console.log("image generation credit cost checks passed");

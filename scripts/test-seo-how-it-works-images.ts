import { getAllSeoPages } from "../src/lib/seo-pages";

const expectedImages = [
  "/seo-pages/ai-lyric-video-generator/how-to-1.webp",
  "/seo-pages/ai-lyric-video-generator/how-to-2.webp",
  "/seo-pages/ai-lyric-video-generator/how-to-3.webp",
] as const;

for (const { locale, slug, page } of getAllSeoPages()) {
  const steps = page.howItWorks?.steps;

  if (!steps) {
    throw new Error(`${locale}/${slug} is missing howItWorks steps`);
  }

  if (steps.length !== expectedImages.length) {
    throw new Error(`${locale}/${slug} must have ${expectedImages.length} howItWorks steps`);
  }

  steps.forEach((step, index) => {
    if (step.image !== expectedImages[index]) {
      throw new Error(
        `${locale}/${slug} howItWorks.steps[${index}].image must be ${expectedImages[index]}`,
      );
    }
  });
}

console.log("SEO howItWorks image guard passed");

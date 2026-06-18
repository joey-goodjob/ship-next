import { getTranslations } from "next-intl/server";
import { HowItWorksSection } from "@/components/how-it-works-section";

type HowItWorksStep = {
  title: string;
  description: string;
  image?: string;
};

const STEP_IMAGES = [
  "/seo-pages/ai-lyric-video-generator/how-to-1.png",
  "/seo-pages/ai-lyric-video-generator/how-to-2.png",
  "/seo-pages/ai-lyric-video-generator/how-to-3.png",
] as const;

export async function HowItWorks() {
  const t = await getTranslations("landing");
  const steps = (t.raw("how_it_works.steps") as HowItWorksStep[]).map((step, index) => ({
    ...step,
    image: STEP_IMAGES[index],
  }));

  return (
    <HowItWorksSection id="how-it-works" title={t("how_it_works.title")} steps={steps} />
  );
}

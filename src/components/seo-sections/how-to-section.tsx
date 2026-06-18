import { HowItWorksSection } from "@/components/how-it-works-section";
import type { SeoPageContent } from "@/lib/seo-pages";

export function HowToSection({ content }: { content: NonNullable<SeoPageContent["howItWorks"]> }) {
  return (
    <HowItWorksSection id="seo-how-it-works" title={content.title} steps={content.steps} />
  );
}

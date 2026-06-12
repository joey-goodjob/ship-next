import { Fragment, type ReactNode } from "react";
import { BottomCtaSection } from "@/components/seo-sections/bottom-cta-section";
import { FaqSection } from "@/components/seo-sections/faq-section";
import { HeroToolSection } from "@/components/seo-sections/hero-tool-section";
import { HowToSection } from "@/components/seo-sections/how-to-section";
import { ToolkitSection } from "@/components/seo-sections/toolkit-section";
import { TrustStripSection } from "@/components/seo-sections/trust-strip-section";
import { WhyChooseSection } from "@/components/seo-sections/why-choose-section";
import type { SeoPageContent, SeoSectionType } from "@/lib/seo-pages";

const SECTION_RENDERERS: Record<SeoSectionType, (page: SeoPageContent) => ReactNode> = {
  heroTool: (page) => <HeroToolSection hero={requireSectionData(page.hero, "heroTool", "hero")} />,
  trust: (page) => <TrustStripSection items={requireSectionData(page.trust, "trust", "trust")} />,
  howItWorks: (page) => (
    <HowToSection content={requireSectionData(page.howItWorks, "howItWorks", "howItWorks")} />
  ),
  whyChoose: (page) => (
    <WhyChooseSection content={requireSectionData(page.whyChoose, "whyChoose", "whyChoose")} />
  ),
  faq: (page) => <FaqSection content={requireSectionData(page.faq, "faq", "faq")} />,
  toolkit: (page) => (
    <ToolkitSection
      title={requireSectionData(page.toolkit, "toolkit", "toolkit").title}
      description={requireSectionData(page.toolkit, "toolkit", "toolkit").description}
      items={requireSectionData(page.useCases, "toolkit", "useCases")}
    />
  ),
  bottomCta: (page) => <BottomCtaSection content={requireSectionData(page.bottomCta, "bottomCta", "bottomCta")} />,
};

function requireSectionData<T>(value: T | undefined, section: SeoSectionType, field: string): T {
  if (value === undefined) {
    throw new Error(`SEO section "${section}" requires "${field}" content`);
  }

  return value;
}

export function SeoToolPage({ page }: { page: SeoPageContent }) {
  return (
    <main className="flex-1 bg-brand-page text-brand-ink">
      {page.layout.sections.map((section) => (
        <Fragment key={section}>{SECTION_RENDERERS[section](page)}</Fragment>
      ))}
    </main>
  );
}

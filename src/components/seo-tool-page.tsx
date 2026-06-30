import { Fragment, type ReactNode } from "react";
import { BottomCtaSection } from "@/components/seo-sections/bottom-cta-section";
import { ComparisonTableSection } from "@/components/seo-sections/comparison-table-section";
import { ContentSectionsSection } from "@/components/seo-sections/content-sections-section";
import { FaqSection } from "@/components/seo-sections/faq-section";
import { HeroToolSection } from "@/components/seo-sections/hero-tool-section";
import { HowToSection } from "@/components/seo-sections/how-to-section";
import { ManifestoSection } from "@/components/seo-sections/manifesto-section";
import { MethodComparisonSection } from "@/components/seo-sections/method-comparison-section";
import { RelatedToolsSection } from "@/components/seo-sections/related-tools-section";
import { StylesSection } from "@/components/seo-sections/styles-section";
import { ToolkitSection } from "@/components/seo-sections/toolkit-section";
import { TrustStripSection } from "@/components/seo-sections/trust-strip-section";
import { WhyChooseSection } from "@/components/seo-sections/why-choose-section";
import type { SeoPageContent, SeoSectionType } from "@/lib/seo-pages";

const SEO_IMAGE_PUBLIC_DOMAIN = "https://cdn.lyricvideomaker.app";

const SECTION_RENDERERS: Record<SeoSectionType, (page: SeoPageContent) => ReactNode> = {
  heroTool: (page) => <HeroToolSection hero={requireSectionData(page.hero, "heroTool", "hero")} />,
  trust: (page) => <TrustStripSection items={requireSectionData(page.trust, "trust", "trust")} />,
  manifesto: (page) => (
    <ManifestoSection content={requireSectionData(page.manifesto, "manifesto", "manifesto")} />
  ),
  howItWorks: (page) => (
    <HowToSection content={requireSectionData(page.howItWorks, "howItWorks", "howItWorks")} />
  ),
  styles: (page) => (
    <StylesSection content={requireSectionData(page.styles, "styles", "styles")} />
  ),
  methodComparison: (page) => (
    <MethodComparisonSection
      content={requireSectionData(page.methodComparison, "methodComparison", "methodComparison")}
    />
  ),
  comparisonTable: (page) => (
    <ComparisonTableSection
      content={requireSectionData(page.comparisonTable, "comparisonTable", "comparisonTable")}
    />
  ),
  whyChoose: (page) => (
    <WhyChooseSection
      content={requireSectionData(page.whyChoose, "whyChoose", "whyChoose")}
      previewImage={`${SEO_IMAGE_PUBLIC_DOMAIN}/imgs/seo/${page.slug}/why-choose-preview.webp`}
    />
  ),
  faq: (page) => <FaqSection content={requireSectionData(page.faq, "faq", "faq")} />,
  toolkit: (page) => (
    <ToolkitSection
      title={requireSectionData(page.toolkit, "toolkit", "toolkit").title}
      description={requireSectionData(page.toolkit, "toolkit", "toolkit").description}
      items={requireSectionData(page.useCases, "toolkit", "useCases")}
    />
  ),
  relatedTools: (page) => (
    <RelatedToolsSection content={requireSectionData(page.relatedTools, "relatedTools", "relatedTools")} />
  ),
  contentSections: (page) => (
    <ContentSectionsSection blocks={requireSectionData(page.contentSections, "contentSections", "contentSections")} />
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

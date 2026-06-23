import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/blocks/header";
import { Hero } from "@/blocks/hero";
import { FeaturedCreators } from "@/blocks/featured-creators";
import { Features } from "@/blocks/features";
import { HowItWorks } from "@/blocks/how-it-works";
import { Platforms } from "@/blocks/platforms";
import { Comparison } from "@/blocks/comparison";
import { Testimonials } from "@/blocks/testimonials";
import { FAQ } from "@/blocks/faq";
import { CTA } from "@/blocks/cta";
import { Footer } from "@/blocks/footer";
import { envConfigs } from "@/config";
import {
  absoluteSiteUrl,
  buildPublicMetadata,
  getSiteBaseUrl,
} from "@/lib/site-metadata";

type PageParams = {
  params: Promise<{ locale: string }>;
};

function localizedPath(locale: string) {
  return locale === "zh" ? "/zh" : "/";
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.seo" });
  const path = localizedPath(locale);
  const title = t("title");
  const description = t("description");
  const keywords = t.raw("keywords") as string[];

  return buildPublicMetadata({
    title,
    description,
    keywords,
    path,
    alternates: {
      en: "/",
      zh: "/zh",
      xDefaultPath: "/",
    },
  });
}

/**
 * Default landing page — demo content. Rewrite this file (and the blocks in
 * src/blocks/) for your project. The primitives in src/components/ stay.
 * See /quick-start or /clone-website to automate the rewrite.
 */
export default async function HomePage({ params }: PageParams) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "landing.seo" });
  const siteUrl = getSiteBaseUrl();
  const url = absoluteSiteUrl(localizedPath(locale));
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: envConfigs.app_name,
      url: siteUrl,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: envConfigs.app_name,
      url: siteUrl,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: envConfigs.app_name,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      url,
      description: t("description"),
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ];

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header variant="heroOverlay" />
      <Hero />
      <HowItWorks />
      <Features />
      <FeaturedCreators />
      <Platforms />
      <Comparison />
      <Testimonials />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
}

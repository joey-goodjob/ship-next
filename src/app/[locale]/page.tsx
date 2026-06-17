import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/blocks/header";
import { Hero } from "@/blocks/hero";
import { FeaturedCreators } from "@/blocks/featured-creators";
import { Features } from "@/blocks/features";
import { HowItWorks } from "@/blocks/how-it-works";
import { StylesGallery } from "@/blocks/styles-gallery";
import { Platforms } from "@/blocks/platforms";
import { Comparison } from "@/blocks/comparison";
import { Testimonials } from "@/blocks/testimonials";
import { FAQ } from "@/blocks/faq";
import { CTA } from "@/blocks/cta";
import { Footer } from "@/blocks/footer";
import { envConfigs } from "@/config";

type PageParams = {
  params: Promise<{ locale: string }>;
};

function baseUrl() {
  return (envConfigs.app_url || "http://localhost:3000").replace(/\/$/, "");
}

function localizedPath(locale: string) {
  return locale === "zh" ? "/zh/" : "/";
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.seo" });
  const path = localizedPath(locale);
  const title = t("title");
  const description = t("description");
  const keywords = t.raw("keywords") as string[];
  const url = `${baseUrl()}${path}`;

  return {
    metadataBase: new URL(baseUrl()),
    title,
    description,
    keywords,
    alternates: {
      canonical: path,
      languages: {
        en: "/",
        zh: "/zh/",
      },
    },
    openGraph: {
      title,
      description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/**
 * Default landing page — demo content. Rewrite this file (and the blocks in
 * src/blocks/) for your project. The primitives in src/components/ stay.
 * See /quick-start or /clone-website to automate the rewrite.
 */
export default async function HomePage({ params }: PageParams) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-background text-foreground">
      <Header variant="heroOverlay" />
      <Hero />
      <HowItWorks />
      <Features />
      <StylesGallery />
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

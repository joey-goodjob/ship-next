import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Footer } from "@/blocks/footer";
import { Header } from "@/blocks/header";
import { SeoToolPage } from "@/components/seo-tool-page";
import {
  getSeoPage,
  getSeoPageStaticParams,
  type SeoPageContent,
} from "@/lib/seo-pages";
import {
  absoluteSiteUrl,
  buildPublicMetadata,
} from "@/lib/site-metadata";

type PageParams = {
  params: Promise<{ locale: string; slug: string }>;
};

export const dynamicParams = false;

function localizedPath(locale: string, slug: string) {
  const path = `/${slug}`;
  return locale === "en" ? path : `/${locale}${path}`;
}

function buildJsonLd(page: SeoPageContent, locale: string, slug: string) {
  const url = absoluteSiteUrl(localizedPath(locale, slug));
  const hasHeroTool = page.layout.sections.includes("heroTool");
  const hasFaq = page.layout.sections.includes("faq");

  const jsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: hasHeroTool && page.hero ? page.hero.h1 : page.seo.title,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      url,
      description: page.seo.description,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
  ];

  if (hasFaq && page.faq) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faq.items.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    });
  }

  return jsonLd;
}

export function generateStaticParams() {
  return getSeoPageStaticParams();
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = getSeoPage(locale, slug);
  if (!page) notFound();

  const path = localizedPath(locale, slug);
  const openGraphType = slug === "how-to-make-a-lyric-video" ? "article" : "website";

  return buildPublicMetadata({
    title: page.seo.title,
    description: page.seo.description,
    keywords: page.seo.keywords,
    path,
    alternates: {
      en: `/${slug}`,
      zh: `/zh/${slug}`,
      xDefaultPath: `/${slug}`,
    },
    openGraphType,
  });
}

export default async function SeoToolRoutePage({ params }: PageParams) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const page = getSeoPage(locale, slug);
  if (!page) notFound();

  const jsonLd = buildJsonLd(page, locale, slug);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
      <Header />
      <SeoToolPage page={page} />
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

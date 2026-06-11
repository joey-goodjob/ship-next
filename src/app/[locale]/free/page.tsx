import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Footer } from "@/blocks/footer";
import { FreePage } from "@/blocks/free-page";
import { Header } from "@/blocks/header";
import { envConfigs } from "@/config";

type PageParams = {
  params: Promise<{ locale: string }>;
};

type FaqItem = {
  question: string;
  answer: string;
};

function baseUrl() {
  return (envConfigs.app_url || "http://localhost:3000").replace(/\/$/, "");
}

function localizedPath(locale: string, path: string) {
  return locale === "en" ? path : `/${locale}${path}`;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.free_page.seo" });
  const path = localizedPath(locale, "/free");

  return {
    metadataBase: new URL(baseUrl()),
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `${path}/`,
      languages: {
        en: "/free/",
        zh: "/zh/free/",
      },
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      url: `${baseUrl()}${path}/`,
      type: "website",
    },
  };
}

export default async function FreeRoutePage({ params }: PageParams) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "landing.free_page" });
  const faqs = t.raw("faq.items") as FaqItem[];
  const url = `${baseUrl()}${localizedPath(locale, "/free")}/`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: t("hero.h1"),
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      url,
      description: t("seo.description"),
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
      <Header />
      <FreePage />
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

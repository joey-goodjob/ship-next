import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/blocks/header";
import { Footer } from "@/blocks/footer";
import { Pricing } from "@/blocks/pricing";
import { buildPublicMetadata } from "@/lib/site-metadata";

type PageParams = {
  params: Promise<{ locale: string }>;
};

function localizedPath(locale: string) {
  return locale === "en" ? "/pricing" : `/${locale}/pricing`;
}

export async function generateMetadata({
  params,
}: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.pricing" });
  const path = localizedPath(locale);
  const title = t("seoTitle");
  const description = t("seoDescription");

  return buildPublicMetadata({
    title,
    description,
    path,
    alternates: {
      en: "/pricing",
      zh: "/zh/pricing",
      xDefaultPath: "/pricing",
    },
  });
}

export default async function PricingPage({
  params,
}: PageParams) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1">
        <Pricing />
      </main>
      <Footer />
    </div>
  );
}

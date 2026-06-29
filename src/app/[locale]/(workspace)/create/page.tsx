import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPublicMetadata } from "@/lib/site-metadata";
import { CreatePageClient } from "./create-page-client";

type PageParams = {
  params: Promise<{ locale: string }>;
};

function localizedPath(locale: string) {
  return locale === "zh" ? "/zh/create" : "/create";
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard.create" });

  return {
    ...buildPublicMetadata({
      title: t("title"),
      description: t("description"),
      path: localizedPath(locale),
      alternates: {
        en: "/create",
        zh: "/zh/create",
        xDefaultPath: "/create",
      },
    }),
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    },
  };
}

export default async function DashboardCreatePage({ params }: PageParams) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CreatePageClient />;
}

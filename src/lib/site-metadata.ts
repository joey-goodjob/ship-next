import type { Metadata } from "next";
import { envConfigs } from "@/config";

const DEFAULT_OG_IMAGE_PATH = "/og-image.png";

type PublicMetadataOptions = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  alternates: {
    en: string;
    zh: string;
    xDefaultPath?: string;
  };
  openGraphType?: "website" | "article";
};

export function getSiteBaseUrl() {
  return (envConfigs.app_url || "http://localhost:3000").replace(/\/$/, "");
}

export function absoluteSiteUrl(path: string) {
  return `${getSiteBaseUrl()}${path}`;
}

export function buildLanguageAlternates({
  en,
  zh,
  xDefaultPath = en,
}: PublicMetadataOptions["alternates"]) {
  return {
    en,
    zh,
    "x-default": xDefaultPath,
  };
}

export function buildPublicMetadata({
  title,
  description,
  path,
  keywords,
  alternates,
  openGraphType = "website",
}: PublicMetadataOptions): Metadata {
  const baseUrl = getSiteBaseUrl();
  const images = [
    {
      url: DEFAULT_OG_IMAGE_PATH,
      width: 1200,
      height: 630,
      alt: `${envConfigs.app_name} lyric video maker`,
    },
  ];

  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    keywords,
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
      },
    },
    alternates: {
      canonical: path,
      languages: buildLanguageAlternates(alternates),
    },
    openGraph: {
      title,
      description,
      url: absoluteSiteUrl(path),
      type: openGraphType,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_OG_IMAGE_PATH],
    },
  };
}

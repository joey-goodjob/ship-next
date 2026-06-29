import type { MetadataRoute } from "next";
import { getSeoPageSlugs } from "@/lib/seo-pages";
import { getSiteBaseUrl } from "@/lib/site-metadata";

const PUBLIC_ROUTE_GROUPS = [
  { paths: { en: "/", zh: "/zh" }, priority: 1 },
  { paths: { en: "/pricing", zh: "/zh/pricing" }, priority: 0.8 },
  { paths: { en: "/resources", zh: "/zh/resources" }, priority: 0.5 },
  { paths: { en: "/privacy-policy", zh: "/zh/privacy-policy" }, priority: 0.3 },
  { paths: { en: "/terms-of-service", zh: "/zh/terms-of-service" }, priority: 0.3 },
] as const;

type LocalizedRouteGroup = {
  paths: {
    en: string;
    zh: string;
  };
  priority: number;
};

function buildLanguageUrls(base: string, paths: LocalizedRouteGroup["paths"]) {
  return {
    en: `${base}${paths.en}`,
    zh: `${base}${paths.zh}`,
    "x-default": `${base}${paths.en}`,
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base = getSiteBaseUrl();
  const seoRouteGroups = getSeoPageSlugs("en").map((slug) => ({
    paths: {
      en: `/${slug}`,
      zh: `/zh/${slug}`,
    },
    priority: 0.9,
  }));
  const routeGroups: LocalizedRouteGroup[] = [
    ...PUBLIC_ROUTE_GROUPS,
    ...seoRouteGroups,
  ];

  return routeGroups.flatMap(({ paths, priority }) =>
    (["en", "zh"] as const).map((locale) => ({
      url: `${base}${paths[locale]}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority,
      alternates: {
        languages: buildLanguageUrls(base, paths),
      },
    })),
  );
}

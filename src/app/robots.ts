import type { MetadataRoute } from "next";
import { getSiteBaseUrl } from "@/lib/site-metadata";

const PRIVATE_PATH_PREFIXES = [
  "/admin",
  "/api",
  "/create",
  "/creations",
  "/dashboard",
  "/lyric-videos",
  "/settings",
  "/zh/admin",
  "/zh/create",
  "/zh/creations",
  "/zh/dashboard",
  "/zh/lyric-videos",
  "/zh/settings",
];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteBaseUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: PRIVATE_PATH_PREFIXES,
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

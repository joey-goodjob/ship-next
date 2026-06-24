import type { MetadataRoute } from "next";
import { getSiteBaseUrl } from "@/lib/site-metadata";

const PRIVATE_PATH_PREFIXES = [
  "/admin",
  "/api",
  "/create",
  "/creations",
  "/dashboard",
  "/forgot-password",
  "/lyric-videos",
  "/reset-password",
  "/settings",
  "/sign-in",
  "/sign-up",
  "/verify-email",
  "/zh/admin",
  "/zh/create",
  "/zh/creations",
  "/zh/dashboard",
  "/zh/forgot-password",
  "/zh/lyric-videos",
  "/zh/reset-password",
  "/zh/settings",
  "/zh/sign-in",
  "/zh/sign-up",
  "/zh/verify-email",
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

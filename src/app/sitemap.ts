import type { MetadataRoute } from "next";
import { envConfigs } from "@/config";

const PUBLIC_PATHS = [
  { path: "/", priority: 1 },
  { path: "/zh", priority: 1 },
  { path: "/free", priority: 0.95 },
  { path: "/zh/free", priority: 0.95 },
  { path: "/pricing", priority: 0.8 },
  { path: "/zh/pricing", priority: 0.8 },
  { path: "/privacy-policy", priority: 0.3 },
  { path: "/zh/privacy-policy", priority: 0.3 },
  { path: "/terms-of-service", priority: 0.3 },
  { path: "/zh/terms-of-service", priority: 0.3 },
] as const;

function baseUrl() {
  return (envConfigs.app_url || "http://localhost:3000").replace(/\/$/, "");
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base = baseUrl();

  return PUBLIC_PATHS.map(({ path, priority }) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority,
  }));
}

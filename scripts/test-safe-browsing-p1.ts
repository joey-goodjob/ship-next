import { existsSync, readFileSync } from "node:fs";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path: string) {
  return readFileSync(path, "utf8");
}

const authPaths = [
  "/forgot-password",
  "/reset-password",
  "/sign-in",
  "/sign-up",
  "/verify-email",
  "/zh/forgot-password",
  "/zh/reset-password",
  "/zh/sign-in",
  "/zh/sign-up",
  "/zh/verify-email",
];

const robots = read("src/app/robots.ts");
for (const authPath of authPaths) {
  assert(
    !robots.includes(`"${authPath}"`),
    `robots.ts should not disallow auth page ${authPath}; Google must be able to see noindex`,
  );
}

const nextConfig = read("next.config.ts");
for (const authPath of authPaths) {
  assert(
    nextConfig.includes(`'${authPath}'`) ||
      nextConfig.includes(`"${authPath}"`),
    `next.config.ts should add X-Robots-Tag for auth page ${authPath}`,
  );
}
assert(
  nextConfig.includes("X-Robots-Tag") &&
    nextConfig.includes("noindex, nofollow"),
  "next.config.ts should define X-Robots-Tag noindex headers",
);
assert(
  nextConfig.includes("/api/lyric-videos/:id/exports/:exportId/download"),
  "next.config.ts should add noindex headers to export download responses",
);
assert(
  nextConfig.includes("private, no-store"),
  "next.config.ts should keep export download responses private and uncached",
);

for (const privatePath of [
  "/admin",
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
]) {
  assert(
    nextConfig.includes(`'${privatePath}'`) ||
      nextConfig.includes(`"${privatePath}"`),
    `next.config.ts should add X-Robots-Tag for private page ${privatePath}`,
  );
}

const downloadRoute = read(
  "src/app/api/lyric-videos/[id]/exports/[exportId]/download/route.ts",
);
assert(
  downloadRoute.includes("'X-Robots-Tag': 'noindex, nofollow, noarchive'") ||
    downloadRoute.includes('"X-Robots-Tag": "noindex, nofollow, noarchive"'),
  "export download route should return X-Robots-Tag noindex, nofollow, noarchive",
);

for (const path of ["src/app/not-found.tsx", "src/app/[locale]/not-found.tsx"]) {
  assert(existsSync(path), `${path} should exist`);
  const contents = read(path);
  assert(contents.includes("robots"), `${path} should define robots metadata`);
  assert(contents.includes("index: false"), `${path} should be noindex`);
  assert(contents.includes("follow: false"), `${path} should be nofollow`);
  assert(
    !contents.includes("buildPublicMetadata"),
    `${path} should not use public metadata/canonical helpers`,
  );
}

const sitemap = read("src/app/sitemap.ts");
for (const privatePath of [
  "sign-in",
  "sign-up",
  "forgot-password",
  "reset-password",
  "verify-email",
  "dashboard",
  "settings",
  "admin",
  "create",
  "creations",
  "lyric-videos",
  "api",
]) {
  assert(
    !sitemap.includes(privatePath),
    `sitemap.ts should not include private/auth path fragment ${privatePath}`,
  );
}

console.log("Safe Browsing P1 checks passed");

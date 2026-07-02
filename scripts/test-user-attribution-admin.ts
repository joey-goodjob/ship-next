import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { buildUserAttributionFromContext } from "../src/lib/user-attribution";

const root = process.cwd();

function readWorkspaceFile(relativePath: string) {
  const fullPath = path.join(root, relativePath);
  assert.equal(existsSync(fullPath), true, `${relativePath} must exist`);
  return readFileSync(fullPath, "utf8");
}

const cookieHeader = [
  "utm_source=google",
  "utm_medium=cpc",
  "utm_campaign=spring",
  "gclid=test-gclid",
  "traffic_referrer=https%3A%2F%2Fgoogle.com%2Fsearch%3Fq%3Dlyrics",
].join("; ");

const attribution = buildUserAttributionFromContext({
  ctx: {
    headers: {
      cookie: cookieHeader,
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      referer: "https://lyricvideomaker.app/sign-up",
      "cf-connecting-ip": "203.0.113.10",
    },
  },
  appUrl: "https://lyricvideomaker.app",
  fallbackLocale: "en",
});

assert.equal(attribution.utmSource, "Google Ads Search");
assert.equal(attribution.locale, "zh");
assert.equal(attribution.ip, "203.0.113.10");

const referrerAttribution = buildUserAttributionFromContext({
  ctx: {
    headers: {
      cookie: "traffic_referrer=https%3A%2F%2Fchatgpt.com%2Fc%2Fabc",
      "accept-language": "en-US,en;q=0.9",
      "x-forwarded-for": "198.51.100.20, 10.0.0.1",
    },
  },
  appUrl: "https://lyricvideomaker.app",
  fallbackLocale: "en",
});

assert.equal(referrerAttribution.utmSource, "ChatGPT");
assert.equal(referrerAttribution.locale, "en");
assert.equal(referrerAttribution.ip, "198.51.100.20");

const directAttribution = buildUserAttributionFromContext({
  ctx: {
    headers: {
      "accept-language": "en-US,en;q=0.9",
    },
  },
  appUrl: "https://lyricvideomaker.app",
  fallbackLocale: "en",
});

assert.equal(directAttribution.utmSource, "Direct");
assert.equal(directAttribution.locale, "en");
assert.equal(directAttribution.ip, "");

const authSource = readWorkspaceFile("src/core/auth/index.ts");
assert(
  authSource.includes("before: async (user") &&
    authSource.includes("buildUserAttributionFromContext"),
  "auth create hook must persist attribution before user creation"
);

const layoutSource = readWorkspaceFile("src/app/layout.tsx");
assert(
  layoutSource.includes("UtmCapture"),
  "root layout must mount UtmCapture so signup can read attribution cookies"
);

const adminUsersRoute = readWorkspaceFile("src/app/api/admin/users/route.ts");
for (const token of [
  "utmSource",
  "user.utmSource",
  "user.locale",
  "user.ip",
  "sourceStats",
]) {
  assert(adminUsersRoute.includes(token), `admin users API must include ${token}`);
}

const adminUsersPage = readWorkspaceFile("src/app/[locale]/admin/users/page.tsx");
for (const token of [
  "sourceFilter",
  "utmSource",
  't("users.source_col")',
  't("users.locale_col")',
  't("users.ip_col")',
  't("users.source_stats_title")',
]) {
  assert(adminUsersPage.includes(token), `admin users page must include ${token}`);
}

for (const locale of ["en", "zh"]) {
  const adminMessages = JSON.parse(
    readWorkspaceFile(`src/config/locale/messages/${locale}/admin.json`)
  );
  assert(adminMessages.users.source_col, `${locale}: source_col is required`);
  assert(adminMessages.users.locale_col, `${locale}: locale_col is required`);
  assert(adminMessages.users.ip_col, `${locale}: ip_col is required`);
  assert(
    adminMessages.users.source_filter_label,
    `${locale}: source_filter_label is required`
  );
  assert(
    adminMessages.users.source_stats_title,
    `${locale}: source_stats_title is required`
  );
}

console.log("user attribution admin checks passed");

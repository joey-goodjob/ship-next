import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function readProductionSiteBaseUrl(appUrl: string) {
  return execFileSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "-e",
      "import { getSiteBaseUrl } from './src/lib/site-metadata.ts'; console.log(getSiteBaseUrl());",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: appUrl,
      },
    },
  ).trim();
}

assert.equal(
  readProductionSiteBaseUrl("http://localhost:3000"),
  "https://lyricvideomaker.app",
  "production SEO base URL should not use localhost",
);

assert.equal(
  readProductionSiteBaseUrl("http://127.0.0.1:3000/"),
  "https://lyricvideomaker.app",
  "production SEO base URL should not use 127.0.0.1",
);

assert.equal(
  readProductionSiteBaseUrl("http://0.0.0.0:3000"),
  "https://lyricvideomaker.app",
  "production SEO base URL should not use 0.0.0.0",
);

assert.equal(
  readProductionSiteBaseUrl(""),
  "https://lyricvideomaker.app",
  "production SEO base URL should not use an empty configured URL",
);

assert.equal(
  readProductionSiteBaseUrl("https://example.com/"),
  "https://example.com",
  "valid configured production base URL should be preserved without a trailing slash",
);

const robotsSource = readFileSync("src/app/robots.ts", "utf8");
assert.doesNotMatch(robotsSource, /\bhost\s*:/, "robots metadata should not emit Host");

console.log("SEO base URL guard assertions passed");

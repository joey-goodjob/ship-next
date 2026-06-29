import fs from "node:fs";
import path from "node:path";

function read(filePath: string) {
  return fs.readFileSync(path.join(process.cwd(), filePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const createPage = read("src/app/[locale]/(workspace)/create/page.tsx");

assert(
  !createPage.startsWith('"use client";'),
  "Create page must be a server component so it can export route metadata.",
);
assert(
  createPage.includes("generateMetadata"),
  "Create page must export localized metadata.",
);
assert(
  createPage.includes("buildPublicMetadata"),
  "Create page metadata must use the shared metadata helper.",
);
assert(
  createPage.includes('"/create"'),
  "Create page metadata must canonicalize the English create route.",
);
assert(
  createPage.includes('"/zh/create"'),
  "Create page metadata must include the Chinese create alternate.",
);
assert(
  createPage.includes("robots"),
  "Create page metadata must keep the workspace route noindexed.",
);

console.log("Create page canonical metadata checks passed.");

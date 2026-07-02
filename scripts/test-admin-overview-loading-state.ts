import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const adminPage = readFileSync(
  join(root, "src/app/[locale]/admin/page.tsx"),
  "utf8"
);

assert(
  adminPage.includes("stats, setStats] = useState<AdminStats | null>(null)"),
  "admin overview should not initialize stats to fake zero values"
);
assert(
  adminPage.includes("setError("),
  "admin overview should surface API errors instead of silently showing zero"
);
assert(
  adminPage.includes('t("loading")'),
  "admin overview should render a loading state while stats APIs are pending"
);

console.log("admin overview loading-state checks passed");

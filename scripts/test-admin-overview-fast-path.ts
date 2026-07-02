import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const adminPage = readFileSync(
  join(root, "src/app/[locale]/admin/page.tsx"),
  "utf8"
);
const overviewRoutePath = join(root, "src/app/api/admin/overview/route.ts");

assert(
  existsSync(overviewRoutePath),
  "admin overview should have a lightweight API route"
);
assert(
  adminPage.includes('fetch("/api/admin/overview"'),
  "admin overview should fetch the lightweight overview API"
);
assert(
  !adminPage.includes('fetch("/api/admin/users"'),
  "admin overview should not fetch the full users list API"
);
assert(
  !adminPage.includes('fetch("/api/admin/roles"'),
  "admin overview should not fetch the full roles list API"
);

const overviewRoute = readFileSync(overviewRoutePath, "utf8");
assert(
  overviewRoute.includes("count()"),
  "admin overview API should use count queries for dashboard stats"
);
assert(
  !overviewRoute.includes("getBalance(") && !overviewRoute.includes("getUserRoles("),
  "admin overview API should not load per-user credits or roles"
);

console.log("admin overview fast-path checks passed");

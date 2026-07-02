import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const usersRoute = readFileSync(
  join(root, "src/app/api/admin/users/route.ts"),
  "utf8"
);
const usersPage = readFileSync(
  join(root, "src/app/[locale]/admin/users/page.tsx"),
  "utf8"
);

assert(
  !usersRoute.includes("getBalance("),
  "admin users API should not fetch balances one user at a time"
);
assert(
  !usersRoute.includes("getUserRoles("),
  "admin users API should not fetch roles one user at a time"
);
assert(
  usersRoute.includes("inArray("),
  "admin users API should batch-load related rows for the visible users"
);
assert(
  usersRoute.includes("sourceStatsOnly"),
  "admin users API should keep source aggregation behind an explicit fast-path flag"
);
assert(
  usersRoute.includes("sourceStats: [],"),
  "admin users list response should not block on source aggregation by default"
);
assert(
  usersPage.includes("/api/admin/users?sourceStatsOnly=1"),
  "admin users page should load source stats separately from the visible user list"
);
assert(
  usersPage.includes("catch (err"),
  "admin users page should surface fetch failures instead of silently showing an empty table"
);

console.log("admin users fast-path checks passed");

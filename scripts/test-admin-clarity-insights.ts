import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath: string) {
  const fullPath = join(root, relativePath);
  assert.equal(existsSync(fullPath), true, `${relativePath} must exist`);
  return readFileSync(fullPath, "utf8");
}

const service = read("src/modules/clarity-analytics/service.ts");
assert(service.includes("CLARITY_INSIGHT_PROFILES"));
assert(service.includes("syncClarityInsights"));
assert(service.includes("getClarityInsightsDashboard"));
assert(service.includes("db().insert(claritySyncRun)"));
assert(service.includes("db().insert(clarityMetricRow)"));
assert(service.includes("Problem Pages"));
assert(service.includes("Traffic Quality"));
assert(service.includes("Device Issues"));

const route = read("src/app/api/admin/clarity-insights/route.ts");
assert(route.includes("GET()"));
assert(route.includes("POST(req: Request)"));
assert(route.includes("hasPermission(session.user.id, \"admin.*\")"));

const page = read("src/app/[locale]/admin/clarity/page.tsx");
const client = read("src/app/[locale]/admin/clarity/clarity-client.tsx");
assert(page.includes("AdminClarityClient"));
assert(client.includes("/api/admin/clarity-insights"));
assert(client.includes("problem_pages"));
assert(client.includes("traffic_quality"));
assert(client.includes("device_issues"));

const nav = read("src/app/[locale]/admin/admin-layout-client.tsx");
assert(nav.includes('href: "/admin/clarity"'));
assert(nav.includes('t("nav.clarity")'));

const analyticsClient = read("src/app/[locale]/admin/analytics/analytics-client.tsx");
assert(!analyticsClient.includes("/api/admin/clarity-analytics"));
assert(!analyticsClient.includes("ClarityInsightGroup"));

const schema = read("src/config/db/schema.postgres.ts");
assert(schema.includes("claritySyncRun"));
assert(schema.includes("clarityMetricRow"));

for (const locale of ["en", "zh"]) {
  const messages = JSON.parse(
    read(`src/config/locale/messages/${locale}/admin.json`)
  );
  assert(messages.nav.clarity, `${locale}: nav.clarity is required`);
  assert(messages.clarity_page.title, `${locale}: clarity_page.title is required`);
  assert(messages.clarity_page.profiles.problem_pages);
}

console.log("admin clarity insights checks passed");

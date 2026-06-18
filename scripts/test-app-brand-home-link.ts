import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const layoutFiles = [
  "src/app/[locale]/settings/settings-layout-client.tsx",
  "src/app/[locale]/dashboard/dashboard-layout-client.tsx",
  "src/app/[locale]/admin/admin-layout-client.tsx",
  "src/app/[locale]/(workspace)/workspace-layout-client.tsx",
];

for (const file of layoutFiles) {
  const source = readFileSync(file, "utf8");

  assert.doesNotMatch(
    source,
    /brandHref="\/(?:settings|create|admin)"/,
    `${file} should let the top-left brand link to the localized homepage`,
  );
}

const appTopbarSource = readFileSync("src/components/app-topbar.tsx", "utf8");

assert.doesNotMatch(
  appTopbarSource,
  /brandHref = "\/create"/,
  "AppTopbar should default the top-left brand link to the localized homepage",
);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(path.join(process.cwd(), "src/components/lyric-videos/preview-workbench/side-panel.tsx"), "utf8");

assert.match(
  source,
  /const SHOW_DIAGNOSTICS_TAB = process\.env\.NODE_ENV === "development";/,
  "diagnostics tab should be gated by local development mode",
);

assert.equal(
  source.includes('{ id: "diagnostics", label: "诊断", icon: Activity }'),
  false,
  "diagnostics tab should not be part of the unconditional base tabs",
);

assert.match(
  source,
  /const PANEL_TABS[\s\S]*SHOW_DIAGNOSTICS_TAB[\s\S]*DIAGNOSTICS_TAB/,
  "diagnostics tab should be appended only when the development gate is enabled",
);

assert.match(
  source,
  /const storyReviewTabIds(?:: PanelTab\[\])? = SHOW_DIAGNOSTICS_TAB[\s\S]*"diagnostics"[\s\S]*: \["customize", "cast"\]/,
  "story review mode should keep diagnostics only in development",
);

assert.match(
  source,
  /SHOW_DIAGNOSTICS_TAB && effectiveActiveTab === "diagnostics"/,
  "diagnostics panel rendering should use the same development gate",
);

console.log("preview diagnostics tab visibility checks passed");

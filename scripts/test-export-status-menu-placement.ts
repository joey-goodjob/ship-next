import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const videoPreview = readFileSync(
  join(root, "src/components/lyric-videos/preview-workbench/video-preview.tsx"),
  "utf8",
);
const topNavBar = readFileSync(
  join(root, "src/components/lyric-videos/preview-workbench/top-nav-bar.tsx"),
  "utf8",
);

assert.equal(
  videoPreview.includes("LatestExport"),
  false,
  "VideoPreview should not render the always-visible export status card",
);

assert.equal(
  topNavBar.includes("LatestExport"),
  true,
  "TopNavBar should own the export status dropdown card",
);

assert.equal(
  topNavBar.includes('aria-label="Show export status"'),
  true,
  "The export chevron should open the status menu without triggering export",
);

console.log("export status menu placement ok");

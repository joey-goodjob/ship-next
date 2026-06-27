import assert from "node:assert/strict";
import {
  deriveExportVersionRows,
  getVisiblePanelTabs,
  shouldQueueExportForCurrentPreview,
} from "../src/components/lyric-videos/preview-workbench/export-versions-model";

const readyCurrentExport = {
  id: "export-current",
  projectId: "project-1",
  status: "ready",
  videoUrl: "https://cdn.example.com/current.mp4",
  resolution: "1080p",
  aspectRatio: "16:9",
  exportFingerprint: "fingerprint-current",
  createdAt: "2026-06-27T12:00:00.000Z",
};

const staleExport = {
  id: "export-stale",
  projectId: "project-1",
  status: "ready",
  videoUrl: "https://cdn.example.com/stale.mp4",
  resolution: "1080p",
  aspectRatio: "16:9",
  exportFingerprint: "fingerprint-old",
  createdAt: "2026-06-27T11:00:00.000Z",
};

assert.deepEqual(
  getVisiblePanelTabs({ showDiagnostics: false }).map((tab) => tab.id),
  ["customize", "lyrics", "font", "cast", "scenes", "exports"],
);

assert.deepEqual(
  getVisiblePanelTabs({ showDiagnostics: true }).map((tab) => tab.id),
  ["customize", "lyrics", "font", "cast", "scenes", "exports", "diagnostics"],
);

assert.deepEqual(
  shouldQueueExportForCurrentPreview({
    currentExportFingerprint: "fingerprint-current",
    exports: [readyCurrentExport],
    exporting: false,
    scenes: [],
  }),
  { queue: false, reason: "ready" },
);

assert.deepEqual(
  shouldQueueExportForCurrentPreview({
    currentExportFingerprint: "fingerprint-current",
    exports: [{ ...readyCurrentExport, status: "queued", videoUrl: null }],
    exporting: false,
    scenes: [],
  }),
  { queue: false, reason: "in_progress" },
);

assert.deepEqual(
  shouldQueueExportForCurrentPreview({
    currentExportFingerprint: "fingerprint-current",
    exports: [staleExport],
    exporting: false,
    scenes: [],
  }),
  { queue: true, reason: "stale" },
);

assert.deepEqual(
  shouldQueueExportForCurrentPreview({
    currentExportFingerprint: "fingerprint-current",
    exports: [staleExport],
    exporting: false,
    scenes: [{ id: "scene-1", videoStatus: "processing" }],
  }),
  { queue: false, reason: "scene_video_processing" },
);

const rows = deriveExportVersionRows({
  currentExportFingerprint: "fingerprint-current",
  exports: [
    { ...readyCurrentExport, status: "processing", videoUrl: null },
    staleExport,
  ],
  projectId: "project-1",
});

assert.equal(rows[0].versionLabel, "Version 2");
assert.equal(rows[0].status, "rendering");
assert.equal(rows[0].title, "Preparing MP4...");
assert.equal(rows[0].downloadUrl, "");
assert.equal(rows[1].versionLabel, "Version 1");
assert.equal(rows[1].status, "stale");
assert.equal(rows[1].title, "Out of date");
assert.equal(rows[1].downloadUrl, "/api/lyric-videos/project-1/exports/export-stale/download");

console.log("preview export versions model ok");

import assert from "node:assert/strict";
import {
  deriveExportStatusDialogModel,
  exportIsStaleForScenes,
  exportIsStaleForFingerprint,
} from "../src/components/lyric-videos/preview-workbench/export-status-dialog-model";

assert.deepEqual(
  deriveExportStatusDialogModel({
    exportError: "",
    exporting: true,
    latestExport: undefined,
    renderStatus: "empty",
    renderUrl: null,
  }),
  {
    description: "Large videos can take a little while. Keep this page open while we prepare your MP4.",
    error: "",
    filename: "lyric-video.mp4",
    status: "processing",
    title: "Preparing your video",
    url: "",
  },
);

assert.equal(
  exportIsStaleForFingerprint(
    {
      exportFingerprint: "",
    },
    "current-fingerprint",
  ),
  true,
);

assert.equal(
  exportIsStaleForFingerprint(
    {
      exportFingerprint: "current-fingerprint",
    },
    "current-fingerprint",
  ),
  false,
);

assert.deepEqual(
  deriveExportStatusDialogModel({
    exportError: "",
    exporting: false,
    latestExport: {
      id: "d7523292-2642-414f-b5f1-9197002ebffd",
      projectId: "project_1",
      status: "ready",
      videoUrl: "/renders/d7523292-2642-414f-b5f1-9197002ebffd.mp4",
      resolution: "1080p",
      aspectRatio: "16:9",
      exportFingerprint: "current-fingerprint",
    },
    currentExportFingerprint: "current-fingerprint",
    renderStatus: "ready",
    renderUrl: null,
  }),
  {
    description: "Your MP4 is ready. Use the download button to save it to your browser's default download folder.",
    error: "",
    filename: "lyric-video-d7523292.mp4",
    status: "ready",
    title: "Your video is ready",
    url: "/api/lyric-videos/project_1/exports/d7523292-2642-414f-b5f1-9197002ebffd/download",
  },
);

assert.equal(
  exportIsStaleForScenes(
    {
      createdAt: "2026-06-26T10:00:00.000Z",
    },
    [{ id: "scene_1", videoUrl: "/scene.mp4", videoCompletedAt: "2026-06-26T10:05:00.000Z" }],
  ),
  true,
);

assert.deepEqual(
  deriveExportStatusDialogModel({
    exportError: "",
    exporting: false,
    latestExport: {
      id: "d7523292-2642-414f-b5f1-9197002ebffd",
      projectId: "project_1",
      status: "ready",
      videoUrl: "/renders/d7523292-2642-414f-b5f1-9197002ebffd.mp4",
      resolution: "1080p",
      aspectRatio: "16:9",
      createdAt: "2026-06-26T10:00:00.000Z",
    },
    renderStatus: "ready",
    renderUrl: null,
    scenes: [{ id: "scene_1", videoUrl: "/scene.mp4", videoCompletedAt: "2026-06-26T10:05:00.000Z" }],
  }),
  {
    description: "Scene videos changed after this MP4 was created. Export again to download the current preview.",
    error: "",
    filename: "lyric-video-d7523292.mp4",
    status: "stale",
    title: "Export needs refresh",
    url: "",
  },
);

assert.deepEqual(
  deriveExportStatusDialogModel({
    exportError: "",
    exporting: false,
    latestExport: {
      id: "d7523292-2642-414f-b5f1-9197002ebffd",
      projectId: "project_1",
      status: "success",
      videoUrl: "/renders/d7523292-2642-414f-b5f1-9197002ebffd.mp4",
      resolution: "1080p",
      aspectRatio: "16:9",
    },
    renderStatus: "success",
    renderUrl: null,
  }),
  {
    description: "Your MP4 is ready. Use the download button to save it to your browser's default download folder.",
    error: "",
    filename: "lyric-video-d7523292.mp4",
    status: "ready",
    title: "Your video is ready",
    url: "/api/lyric-videos/project_1/exports/d7523292-2642-414f-b5f1-9197002ebffd/download",
  },
);

assert.deepEqual(
  deriveExportStatusDialogModel({
    exportError: "Queue export failed",
    exporting: false,
    latestExport: undefined,
    renderStatus: "empty",
    renderUrl: null,
  }),
  {
    description: "The export did not finish. No credits were retried automatically.",
    error: "Queue export failed",
    filename: "lyric-video.mp4",
    status: "failed",
    title: "Export failed",
    url: "",
  },
);

console.log("preview export status dialog model ok");

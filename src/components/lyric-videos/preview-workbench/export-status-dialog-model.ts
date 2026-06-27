import { buildExportDownloadFilename, buildExportDownloadUrl } from "./export-download";
import type { LyricExport, LyricScene } from "./types";

type ExportStatusDialogInput = {
  exportError: string;
  exporting: boolean;
  latestExport?: LyricExport;
  currentExportFingerprint?: string;
  projectId?: string | null;
  renderStatus: string;
  renderUrl?: string | null;
  scenes?: Array<Pick<LyricScene, "id" | "videoUrl" | "videoCompletedAt">>;
};

export type ExportStatusDialogModel = {
  description: string;
  error: string;
  filename: string;
  status: "processing" | "ready" | "failed" | "stale";
  title: string;
  url: string;
};

function timeValue(value?: string | Date | null) {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function exportIsStaleForScenes(
  latestExport?: Pick<LyricExport, "createdAt"> | null,
  scenes: Array<Pick<LyricScene, "id" | "videoUrl" | "videoCompletedAt">> = [],
) {
  const exportCreatedAt = timeValue(latestExport?.createdAt);
  if (!exportCreatedAt) return false;
  return scenes.some((scene) => Boolean(scene.videoUrl) && timeValue(scene.videoCompletedAt) > exportCreatedAt);
}

export function exportIsStaleForFingerprint(
  latestExport?: Pick<LyricExport, "exportFingerprint"> | null,
  currentExportFingerprint?: string | null,
) {
  const current = String(currentExportFingerprint || "").trim();
  if (!current) return false;
  const exported = String(latestExport?.exportFingerprint || "").trim();
  return exported !== current;
}

export function deriveExportStatusDialogModel({
  exportError,
  exporting,
  latestExport,
  currentExportFingerprint,
  projectId,
  renderStatus,
  renderUrl,
  scenes = [],
}: ExportStatusDialogInput): ExportStatusDialogModel {
  const url = buildExportDownloadUrl({
    projectId: latestExport?.projectId || projectId,
    exportId: latestExport?.id,
  });
  const hasRenderedVideo = Boolean(latestExport?.videoUrl || renderUrl);
  const status = latestExport?.status || renderStatus;
  const error = exportError || latestExport?.error || "";
  const isStale = currentExportFingerprint
    ? exportIsStaleForFingerprint(latestExport, currentExportFingerprint)
    : exportIsStaleForScenes(latestExport, scenes);

  if (!exporting && (error || status === "failed")) {
    return {
      description: "The export did not finish. No credits were retried automatically.",
      error,
      filename: buildExportDownloadFilename(latestExport),
      status: "failed",
      title: "Export failed",
      url: "",
    };
  }

  if (!exporting && isStale) {
    return {
      description: "Scene videos changed after this MP4 was created. Export again to download the current preview.",
      error: "",
      filename: buildExportDownloadFilename(latestExport),
      status: "stale",
      title: "Export needs refresh",
      url: "",
    };
  }

  if (!exporting && hasRenderedVideo && url && (status === "ready" || status === "success")) {
    return {
      description: "Your MP4 is ready. Use the download button to save it to your browser's default download folder.",
      error: "",
      filename: buildExportDownloadFilename(latestExport),
      status: "ready",
      title: "Your video is ready",
      url,
    };
  }

  return {
    description: "Large videos can take a little while. Keep this page open while we prepare your MP4.",
    error: "",
    filename: buildExportDownloadFilename(latestExport),
    status: "processing",
    title: "Preparing your video",
    url: "",
  };
}

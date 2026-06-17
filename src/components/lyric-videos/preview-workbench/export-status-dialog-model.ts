import { buildExportDownloadFilename, buildExportDownloadUrl } from "./export-download";
import type { LyricExport } from "./types";

type ExportStatusDialogInput = {
  exportError: string;
  exporting: boolean;
  latestExport?: LyricExport;
  projectId?: string | null;
  renderStatus: string;
  renderUrl?: string | null;
};

export type ExportStatusDialogModel = {
  description: string;
  error: string;
  filename: string;
  status: "processing" | "ready" | "failed";
  title: string;
  url: string;
};

export function deriveExportStatusDialogModel({
  exportError,
  exporting,
  latestExport,
  projectId,
  renderStatus,
  renderUrl,
}: ExportStatusDialogInput): ExportStatusDialogModel {
  const url = buildExportDownloadUrl({
    projectId: latestExport?.projectId || projectId,
    exportId: latestExport?.id,
  });
  const hasRenderedVideo = Boolean(latestExport?.videoUrl || renderUrl);
  const status = latestExport?.status || renderStatus;
  const error = exportError || latestExport?.error || "";

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

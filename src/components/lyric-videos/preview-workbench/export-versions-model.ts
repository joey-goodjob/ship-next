import { buildExportDownloadFilename, buildExportDownloadUrl } from "./export-download";
import type { LyricExport, LyricScene, PanelTab } from "./types";

export type PanelTabDefinition = {
  id: PanelTab;
  label: string;
};

export type ExportQueueReason = "no_export" | "stale" | "ready" | "in_progress" | "scene_video_processing";

export type ExportVersionRow = {
  id: string;
  versionLabel: string;
  title: string;
  description: string;
  status: "ready" | "rendering" | "failed" | "stale";
  filename: string;
  downloadUrl: string;
  createdAt?: string;
};

const BASE_PANEL_TABS: PanelTabDefinition[] = [
  { id: "customize", label: "Customize" },
  { id: "lyrics", label: "Lyrics" },
  { id: "font", label: "Font" },
  { id: "cast", label: "Cast" },
  { id: "scenes", label: "Scenes" },
  { id: "exports", label: "Exports" },
];

const DIAGNOSTICS_TAB: PanelTabDefinition = {
  id: "diagnostics",
  label: "诊断",
};

function normalizedStatus(status?: string | null) {
  return String(status || "").trim().toLowerCase();
}

function exportMatchesCurrentPreview(exportJob: LyricExport, currentExportFingerprint?: string | null) {
  const current = String(currentExportFingerprint || "").trim();
  return Boolean(current && String(exportJob.exportFingerprint || "").trim() === current);
}

function exportIsReady(exportJob: LyricExport) {
  const status = normalizedStatus(exportJob.status);
  return Boolean(exportJob.videoUrl && (status === "ready" || status === "success"));
}

function exportIsRendering(exportJob: LyricExport) {
  const status = normalizedStatus(exportJob.status);
  return status === "queued" || status === "processing" || status === "pending";
}

function sceneVideoIsProcessing(scene: Pick<LyricScene, "videoStatus">) {
  return normalizedStatus(scene.videoStatus) === "processing";
}

export function getVisiblePanelTabs({ showDiagnostics }: { showDiagnostics: boolean }) {
  return showDiagnostics ? [...BASE_PANEL_TABS, DIAGNOSTICS_TAB] : BASE_PANEL_TABS;
}

export function shouldQueueExportForCurrentPreview({
  currentExportFingerprint,
  exporting,
  exports,
  scenes,
}: {
  currentExportFingerprint?: string | null;
  exporting: boolean;
  exports: LyricExport[];
  scenes: Array<Pick<LyricScene, "id" | "videoStatus">>;
}): { queue: boolean; reason: ExportQueueReason } {
  if (exporting) return { queue: false, reason: "in_progress" };
  if (scenes.some(sceneVideoIsProcessing)) return { queue: false, reason: "scene_video_processing" };

  const matchingExport = exports.find((exportJob) => exportMatchesCurrentPreview(exportJob, currentExportFingerprint));
  if (matchingExport && exportIsRendering(matchingExport)) return { queue: false, reason: "in_progress" };
  if (matchingExport && exportIsReady(matchingExport)) return { queue: false, reason: "ready" };

  return { queue: true, reason: exports.length > 0 ? "stale" : "no_export" };
}

export function deriveExportVersionRows({
  currentExportFingerprint,
  exports,
  projectId,
}: {
  currentExportFingerprint?: string | null;
  exports: LyricExport[];
  projectId?: string | null;
}): ExportVersionRow[] {
  const total = exports.length;

  return exports.map((exportJob, index) => {
    const status = normalizedStatus(exportJob.status);
    const isRendering = exportIsRendering(exportJob);
    const isFailed = status === "failed";
    const isCurrent = exportMatchesCurrentPreview(exportJob, currentExportFingerprint);
    const isReady = exportIsReady(exportJob);
    const isStale = !isRendering && !isFailed && !isCurrent;
    const downloadUrl = exportJob.videoUrl
      ? buildExportDownloadUrl({
          projectId: exportJob.projectId || projectId,
          exportId: exportJob.id,
        })
      : "";

    if (isRendering) {
      return {
        id: exportJob.id,
        versionLabel: `Version ${total - index}`,
        title: "Preparing MP4...",
        description: status === "queued" ? "Queued for Railway rendering." : "Railway is rendering this version.",
        status: "rendering",
        filename: buildExportDownloadFilename(exportJob),
        downloadUrl: "",
        createdAt: exportJob.createdAt,
      };
    }

    if (isFailed) {
      return {
        id: exportJob.id,
        versionLabel: `Version ${total - index}`,
        title: "Export failed",
        description: exportJob.error || "This export did not finish.",
        status: "failed",
        filename: buildExportDownloadFilename(exportJob),
        downloadUrl: "",
        createdAt: exportJob.createdAt,
      };
    }

    return {
      id: exportJob.id,
      versionLabel: `Version ${total - index}`,
      title: isStale ? "Out of date" : isReady ? "Ready" : "Waiting",
      description: isStale ? "This MP4 was created before the current preview changes." : "This MP4 matches the current preview.",
      status: isStale ? "stale" : "ready",
      filename: buildExportDownloadFilename(exportJob),
      downloadUrl,
      createdAt: exportJob.createdAt,
    };
  });
}

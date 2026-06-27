import { Download } from "lucide-react";
import { buildExportDownloadFilename, buildExportDownloadUrl } from "./export-download";
import { exportIsStaleForScenes } from "./export-status-dialog-model";
import type { LyricExport, LyricScene } from "./types";

export function LatestExport({
  exportJob,
  currentExportFingerprint,
  isExporting = false,
  projectId,
  renderStatus,
  renderUrl,
  scenes = [],
}: {
  exportJob?: LyricExport;
  currentExportFingerprint?: string;
  isExporting?: boolean;
  projectId?: string | null;
  renderStatus: string;
  renderUrl?: string | null;
  scenes?: Array<Pick<LyricScene, "id" | "videoUrl" | "videoCompletedAt">>;
}) {
  const url = buildExportDownloadUrl({
    projectId: exportJob?.projectId || projectId,
    exportId: exportJob?.id,
  });
  const hasRenderedVideo = Boolean(exportJob?.videoUrl || renderUrl);
  const status = isExporting ? "processing" : exportJob?.status || renderStatus;
  const isFailed = status === "failed";
  const isQueued = status === "queued";
  const isProcessing = status === "processing";
  const isStale = currentExportFingerprint
    ? String(exportJob?.exportFingerprint || "").trim() !== currentExportFingerprint
    : exportIsStaleForScenes(exportJob, scenes);
  const isReady = !isStale && hasRenderedVideo && Boolean(url) && (status === "success" || status === "ready");
  const title = isExporting || isQueued || isProcessing ? "Preparing your MP4..." : isFailed ? "Export failed" : isStale ? "Export needs refresh" : isReady ? "Your video is ready" : "Latest export";
  const statusText =
    isExporting || isQueued || isProcessing
      ? "You can keep editing while Railway prepares the MP4."
      : isStale
        ? "Scene videos changed. Export again for the current preview."
      : status || "empty";
  const filename = buildExportDownloadFilename(exportJob);

  return (
    <section className="latest-export rounded-[8px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] px-[14px] py-[13px]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-[8px]">
          <span className="flex size-[24px] shrink-0 items-center justify-center rounded-[6px] bg-[var(--editor-panel-strong)] text-[var(--editor-accent)]">
            <Download className="h-[14px] w-[14px]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-[850] text-[var(--editor-text)]">{title}</p>
            <p className="mt-[2px] truncate text-[11px] font-[650] text-[var(--editor-subtle)]">{statusText}</p>
          </div>
        </div>
        {url && isReady && !isExporting ? (
          <a
            href={url}
            download={filename}
            className="shrink-0 rounded-[6px] bg-[var(--editor-accent)] px-[10px] py-[7px] text-[12px] font-[850] text-[var(--editor-accent-ink)] hover:bg-[var(--editor-accent-hover)]"
          >
            Download MP4
          </a>
        ) : null}
      </div>
      {exportJob?.error ? <p className="mt-[10px] text-[12px] font-[600] leading-5 text-[var(--editor-danger)]">{exportJob.error}</p> : null}
    </section>
  );
}

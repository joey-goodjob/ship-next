import { Download } from "lucide-react";
import { buildExportDownloadFilename } from "./export-download";
import type { LyricExport } from "./types";

export function LatestExport({
  exportJob,
  isExporting = false,
  renderStatus,
  renderUrl,
}: {
  exportJob?: LyricExport;
  isExporting?: boolean;
  renderStatus: string;
  renderUrl?: string | null;
}) {
  const url = exportJob?.videoUrl || renderUrl;
  const status = isExporting ? "processing" : exportJob?.status || renderStatus;
  const isFailed = status === "failed";
  const isReady = Boolean(url) && (status === "success" || status === "ready");
  const title = isExporting ? "Preparing your MP4..." : isFailed ? "Export failed" : isReady ? "Your video is ready" : "Latest export";
  const statusText = isExporting ? "Keep this page open while we prepare your MP4." : status || "empty";
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
        {url && !isExporting ? (
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

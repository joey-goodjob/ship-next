import { Download } from "lucide-react";
import type { LyricExport } from "./types";

export function LatestExport({
  exportJob,
  renderStatus,
  renderUrl,
}: {
  exportJob?: LyricExport;
  renderStatus: string;
  renderUrl?: string | null;
}) {
  const url = exportJob?.videoUrl || renderUrl;
  const status = exportJob?.status || renderStatus;

  return (
    <section className="latest-export rounded-[8px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] px-[14px] py-[13px]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-[8px]">
          <span className="flex size-[24px] shrink-0 items-center justify-center rounded-[6px] bg-[var(--editor-panel-strong)] text-[var(--editor-accent)]">
            <Download className="h-[14px] w-[14px]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-[850] text-[var(--editor-text)]">Latest export</p>
            <p className="mt-[2px] truncate text-[11px] font-[650] text-[var(--editor-subtle)]">{status || "empty"}</p>
          </div>
        </div>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-[6px] bg-[var(--editor-accent)] px-[10px] py-[7px] text-[12px] font-[850] text-[var(--editor-accent-ink)] hover:bg-[var(--editor-accent-hover)]"
          >
            Download
          </a>
        ) : null}
      </div>
      {exportJob?.error ? <p className="mt-[10px] text-[12px] font-[600] leading-5 text-[var(--editor-danger)]">{exportJob.error}</p> : null}
    </section>
  );
}

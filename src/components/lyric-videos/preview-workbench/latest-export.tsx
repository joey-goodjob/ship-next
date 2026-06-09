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
    <section className="latest-export rounded-[8px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] p-[14px]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-[800] text-[var(--editor-text)]">Latest export</p>
          <p className="mt-[3px] text-[12px] font-[600] text-[var(--editor-muted)]">{status || "empty"}</p>
        </div>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-[6px] bg-[var(--editor-accent)] px-[10px] py-[7px] text-[12px] font-[800] text-[var(--editor-accent-ink)]"
          >
            Download
          </a>
        ) : null}
      </div>
      {exportJob?.error ? <p className="mt-[10px] text-[12px] font-[600] leading-5 text-[var(--editor-danger)]">{exportJob.error}</p> : null}
    </section>
  );
}

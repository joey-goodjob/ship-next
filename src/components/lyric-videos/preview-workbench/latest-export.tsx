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
    <section className="rounded-[8px] border border-[#E8E8E8] bg-[#FAFAFA] p-[14px]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-[800] text-[#1A1A2E]">Latest export</p>
          <p className="mt-[3px] text-[12px] font-[600] text-[#667085]">{status || "empty"}</p>
        </div>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-[6px] bg-[#F5A623] px-[10px] py-[7px] text-[12px] font-[800] text-white"
          >
            Download
          </a>
        ) : null}
      </div>
      {exportJob?.error ? <p className="mt-[10px] text-[12px] font-[600] leading-5 text-red-600">{exportJob.error}</p> : null}
    </section>
  );
}

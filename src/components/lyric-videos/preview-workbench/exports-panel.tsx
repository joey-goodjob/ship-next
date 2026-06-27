"use client";

import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { deriveExportVersionRows, shouldQueueExportForCurrentPreview } from "./export-versions-model";

function formatCreatedAt(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusIcon(status: string) {
  if (status === "rendering") return <Loader2 className="h-[14px] w-[14px] animate-spin" />;
  if (status === "failed") return <AlertTriangle className="h-[14px] w-[14px]" />;
  if (status === "stale") return <RefreshCcw className="h-[14px] w-[14px]" />;
  return <CheckCircle2 className="h-[14px] w-[14px]" />;
}

function decisionCopy(reason: string) {
  if (reason === "ready") {
    return {
      title: "Current preview exported",
      description: "A ready MP4 already matches what you are previewing.",
      action: "",
    };
  }
  if (reason === "in_progress") {
    return {
      title: "Export in progress",
      description: "The current preview is already queued or rendering.",
      action: "",
    };
  }
  if (reason === "scene_video_processing") {
    return {
      title: "Waiting for scene videos",
      description: "Finish scene video generation before exporting the final MP4.",
      action: "",
    };
  }
  if (reason === "stale") {
    return {
      title: "Current preview needs export",
      description: "Your edits changed the preview after the latest MP4 was created.",
      action: "Export current preview",
    };
  }
  return {
    title: "No export yet",
    description: "Create the first MP4 version for this project.",
    action: "Export current preview",
  };
}

export function ExportsPanel() {
  const { currentExportFingerprint, exporting, exports, project, queueExport, scenes } = useEditor();
  const decision = shouldQueueExportForCurrentPreview({
    currentExportFingerprint,
    exporting,
    exports,
    scenes,
  });
  const copy = decisionCopy(decision.reason);
  const rows = deriveExportVersionRows({
    currentExportFingerprint,
    exports,
    projectId: project?.id,
  });

  return (
    <div className="space-y-[14px]">
      <section className="rounded-[8px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] p-[14px]">
        <div className="flex items-start justify-between gap-[12px]">
          <div className="min-w-0">
            <p className="text-[13px] font-[900] text-[var(--editor-text)]">{copy.title}</p>
            <p className="mt-[4px] text-[12px] font-[650] leading-5 text-[var(--editor-muted)]">{copy.description}</p>
          </div>
          {decision.queue ? (
            <button
              type="button"
              onClick={queueExport}
              disabled={exporting}
              className="inline-flex h-[32px] shrink-0 items-center gap-[7px] rounded-[6px] bg-[var(--editor-accent)] px-[11px] text-[12px] font-[850] text-[var(--editor-accent-ink)] hover:bg-[var(--editor-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Download className="h-[13px] w-[13px]" />}
              {copy.action}
            </button>
          ) : null}
        </div>
      </section>

      <div className="space-y-[10px]">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-[900] text-[var(--editor-text)]">Export versions</h2>
          <span className="text-[11px] font-[750] text-[var(--editor-subtle)]">{rows.length} total</span>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-[8px] border border-dashed border-[var(--editor-line)] bg-[var(--editor-panel-soft)] px-[14px] py-[20px] text-center">
            <p className="text-[12px] font-[750] text-[var(--editor-muted)]">No MP4 versions yet.</p>
          </div>
        ) : (
          rows.map((row) => {
            const createdAt = formatCreatedAt(row.createdAt);
            return (
              <article
                key={row.id}
                className={cn(
                  "rounded-[8px] border bg-[var(--editor-panel-soft)] p-[13px]",
                  row.status === "ready" && "border-[color-mix(in_oklch,var(--editor-success)_55%,var(--editor-line))]",
                  row.status === "rendering" && "border-[color-mix(in_oklch,var(--editor-accent)_65%,var(--editor-line))]",
                  row.status === "stale" && "border-[color-mix(in_oklch,var(--editor-accent)_55%,var(--editor-line))]",
                  row.status === "failed" && "border-[color-mix(in_oklch,var(--editor-danger)_55%,var(--editor-line))]",
                )}
              >
                <div className="flex items-start justify-between gap-[12px]">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-[8px]">
                      <span
                        className={cn(
                          "inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[6px]",
                          row.status === "ready" && "bg-[color-mix(in_oklch,var(--editor-success)_18%,transparent)] text-[var(--editor-success)]",
                          row.status === "rendering" && "bg-[color-mix(in_oklch,var(--editor-accent)_20%,transparent)] text-[var(--editor-accent)]",
                          row.status === "stale" && "bg-[color-mix(in_oklch,var(--editor-accent)_18%,transparent)] text-[var(--editor-accent)]",
                          row.status === "failed" && "bg-[color-mix(in_oklch,var(--editor-danger)_18%,transparent)] text-[var(--editor-danger)]",
                        )}
                      >
                        {statusIcon(row.status)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-[900] text-[var(--editor-subtle)]">{row.versionLabel}</p>
                        <p className="truncate text-[14px] font-[900] text-[var(--editor-text)]">{row.title}</p>
                      </div>
                    </div>
                    <p className="mt-[8px] text-[12px] font-[650] leading-5 text-[var(--editor-muted)]">{row.description}</p>
                    {createdAt ? <p className="mt-[5px] text-[11px] font-[700] text-[var(--editor-subtle)]">{createdAt}</p> : null}
                  </div>

                  {row.downloadUrl ? (
                    <a
                      href={row.downloadUrl}
                      download={row.filename}
                      className="inline-flex h-[30px] shrink-0 items-center gap-[6px] rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[10px] text-[12px] font-[850] text-[var(--editor-text)] hover:border-[var(--editor-accent)]"
                    >
                      <Download className="h-[13px] w-[13px]" />
                      Download
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

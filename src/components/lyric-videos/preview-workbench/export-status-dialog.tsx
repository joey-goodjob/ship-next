"use client";

import { AlertCircle, CheckCircle2, Download, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { deriveExportStatusDialogModel } from "./export-status-dialog-model";
import type { LyricExport } from "./types";

export function ExportStatusDialog({
  exportError,
  exporting,
  latestExport,
  onOpenChange,
  open,
  renderStatus,
  renderUrl,
}: {
  exportError: string;
  exporting: boolean;
  latestExport?: LyricExport;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  renderStatus: string;
  renderUrl?: string | null;
}) {
  const model = deriveExportStatusDialogModel({
    exportError,
    exporting,
    latestExport,
    renderStatus,
    renderUrl,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[var(--editor-line)] bg-[var(--editor-panel)] p-[22px] text-[var(--editor-text)] shadow-2xl sm:max-w-[440px]">
        <DialogHeader className="gap-[12px] pr-[34px]">
          <span
            className={cn(
              "flex size-[40px] items-center justify-center rounded-[8px] border",
              model.status === "ready"
                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                : model.status === "failed"
                  ? "border-[var(--editor-danger)] bg-[var(--editor-panel-soft)] text-[var(--editor-danger)]"
                  : "border-[var(--editor-accent)] bg-[var(--editor-panel-soft)] text-[var(--editor-accent)]",
            )}
          >
            {model.status === "ready" ? (
              <CheckCircle2 className="h-[20px] w-[20px]" />
            ) : model.status === "failed" ? (
              <AlertCircle className="h-[20px] w-[20px]" />
            ) : (
              <Loader2 className="h-[20px] w-[20px] animate-spin" />
            )}
          </span>
          <div>
            <DialogTitle className="text-[17px] font-[850] leading-[1.2] text-[var(--editor-text)]">{model.title}</DialogTitle>
            <DialogDescription className="mt-[8px] text-[13px] font-[650] leading-6 text-[var(--editor-muted)]">
              {model.description}
            </DialogDescription>
          </div>
        </DialogHeader>

        {model.error ? (
          <p className="rounded-[8px] border border-[var(--editor-danger)] bg-[var(--editor-panel-soft)] px-[12px] py-[10px] text-[12px] font-[650] leading-5 text-[var(--editor-danger)]">
            {model.error}
          </p>
        ) : null}

        {model.url ? (
          <a
            href={model.url}
            download={model.filename}
            className="inline-flex h-[38px] w-fit items-center justify-center gap-[8px] rounded-[6px] bg-[var(--editor-accent)] px-[14px] text-[13px] font-[850] text-[var(--editor-accent-ink)] hover:bg-[var(--editor-accent-hover)]"
          >
            <Download className="h-[15px] w-[15px]" />
            Download MP4
          </a>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

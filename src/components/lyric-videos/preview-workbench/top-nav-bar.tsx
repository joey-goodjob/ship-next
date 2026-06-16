"use client";

import { Check, ChevronDown, Coins, Download, Edit3, Loader2, Lock, Menu, Settings } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Link } from "@/core/i18n/navigation";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";

export function TopNavBar() {
  const { exporting, generationLocked, generationLockReason, project, queueExport, saveStatus, updateProjectField } = useEditor();

  const saveLabel =
    saveStatus === "saving" ? "Saving" : saveStatus === "failed" ? "Save failed" : saveStatus === "saved" ? "Saved" : "Ready";

  return (
    <header className="top-nav-bar flex h-[56px] shrink-0 items-center border-b border-[var(--editor-line)] bg-[var(--editor-panel)] px-[20px]">
      <Link href="/" className="flex w-[260px] items-center rounded-md transition-transform active:scale-95" aria-label="Back home">
        <BrandLogo variant="topbar" showName />
      </Link>

      <label className="flex min-w-0 flex-1 items-center justify-center gap-[8px] text-[14px] font-[700] text-[var(--editor-muted)]">
        <input
          value={project?.title || ""}
          onChange={(event) => project && updateProjectField("title", event.target.value)}
          className={cn(
            "w-full max-w-[360px] truncate bg-transparent text-center text-[14px] font-[800] text-[var(--editor-text)] outline-none disabled:cursor-not-allowed disabled:text-[var(--editor-muted)]",
            generationLocked && "opacity-75",
          )}
          aria-label="Project title"
          disabled={!project || generationLocked}
        />
        {generationLocked ? (
          <span title={generationLockReason} aria-label="Locked">
            <Lock className="h-[14px] w-[14px] shrink-0 text-[var(--editor-muted)]" />
          </span>
        ) : (
          <Edit3 className="h-[14px] w-[14px] shrink-0 text-[var(--editor-subtle)]" />
        )}
      </label>

      <div className="flex w-[360px] items-center justify-end gap-[14px]">
        <span
          className={cn(
            "flex items-center gap-[4px] text-[13px] font-[700]",
            saveStatus === "failed" ? "text-[var(--editor-danger)]" : "text-[var(--editor-muted)]",
          )}
        >
          {saveStatus === "saving" ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Check className="h-[14px] w-[14px]" />}
          {saveLabel}
        </span>
        <button
          type="button"
          onClick={queueExport}
          disabled={exporting || !project || generationLocked}
          title={generationLocked ? generationLockReason : undefined}
          className="flex h-[34px] items-center gap-[8px] rounded-[6px] bg-[var(--editor-accent)] px-[16px] text-[14px] font-[800] text-[var(--editor-accent-ink)] hover:bg-[var(--editor-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Download className="h-[15px] w-[15px]" />}
          Export
          <ChevronDown className="h-[13px] w-[13px]" />
        </button>
        <span className="flex items-center gap-[5px] text-[14px] font-[800] text-[var(--editor-accent)]" title="Credits">
          <Coins className="h-[16px] w-[16px]" />
          --
        </span>
        <Settings className="h-[18px] w-[18px] text-[var(--editor-muted)]" />
        <Menu className="h-[18px] w-[18px] text-[var(--editor-muted)]" />
      </div>
    </header>
  );
}

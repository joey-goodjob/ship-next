"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Coins, Download, Edit3, Loader2, Lock, Menu, Settings } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Link, useRouter } from "@/core/i18n/navigation";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { EditorMenuDrawer } from "./editor-menu-drawer";
import { LatestExport } from "./latest-export";

type CreditsResponse = {
  code?: number;
  data?: {
    balance?: number;
  };
};

export function TopNavBar() {
  const router = useRouter();
  const {
    currentExportFingerprint,
    exporting,
    generationLocked,
    generationLockReason,
    latestExport,
    project,
    queueExport,
    saveStatus,
    scenes,
    updateProjectField,
  } = useEditor();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditBalanceLoaded, setCreditBalanceLoaded] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  const saveLabel =
    saveStatus === "saving" ? "Saving" : saveStatus === "failed" ? "Save failed" : saveStatus === "saved" ? "Saved" : "Ready";
  const creditLabel = creditBalanceLoaded ? (creditBalance === null ? "--" : creditBalance.toLocaleString()) : "...";

  useEffect(() => {
    let mounted = true;

    fetch("/api/credits")
      .then((response) => response.json())
      .then((body: CreditsResponse) => {
        if (!mounted) return;
        const balance = Number(body?.data?.balance);
        setCreditBalance(body?.code === 0 && Number.isFinite(balance) ? balance : null);
      })
      .catch(() => {
        if (mounted) setCreditBalance(null);
      })
      .finally(() => {
        if (mounted) setCreditBalanceLoaded(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setExportMenuOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [exportMenuOpen]);

  return (
    <header className="top-nav-bar flex h-[56px] shrink-0 items-center border-b border-[var(--editor-line)] bg-[var(--editor-panel)] px-[20px]">
      <div className="flex w-[360px] items-center gap-[12px]">
        <Link
          href="/creations"
          className="inline-flex h-[32px] shrink-0 items-center gap-[6px] rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] px-[10px] text-[12px] font-[800] text-[var(--editor-muted)] transition hover:bg-[var(--editor-panel-strong)] hover:text-[var(--editor-text)] active:scale-95"
          aria-label="Back to Creations"
        >
          <ArrowLeft className="h-[14px] w-[14px]" />
          Creations
        </Link>
        <Link href="/" className="flex min-w-0 items-center rounded-md transition-transform active:scale-95" aria-label="Back home">
          <BrandLogo variant="topbar" showName />
        </Link>
      </div>

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
        <div ref={exportMenuRef} className="relative flex">
          <button
            type="button"
            onClick={queueExport}
            disabled={exporting || !project || generationLocked}
            title={generationLocked ? generationLockReason : undefined}
            className="flex h-[34px] items-center gap-[8px] rounded-l-[6px] bg-[var(--editor-accent)] px-[14px] text-[14px] font-[800] text-[var(--editor-accent-ink)] hover:bg-[var(--editor-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Download className="h-[15px] w-[15px]" />}
            Export
          </button>
          <button
            type="button"
            onClick={() => setExportMenuOpen((open) => !open)}
            disabled={!project}
            aria-label="Show export status"
            aria-expanded={exportMenuOpen}
            title="Show export status"
            className="flex h-[34px] w-[34px] items-center justify-center rounded-r-[6px] border-l border-black/15 bg-[var(--editor-accent)] text-[var(--editor-accent-ink)] hover:bg-[var(--editor-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ChevronDown className={cn("h-[13px] w-[13px] transition-transform", exportMenuOpen && "rotate-180")} />
          </button>
          {exportMenuOpen ? (
            <div className="absolute right-0 top-[42px] z-[80] w-[340px] max-w-[calc(100vw-32px)] shadow-[0_18px_50px_rgba(0,0,0,0.38)]">
              <LatestExport
                exportJob={latestExport}
                currentExportFingerprint={currentExportFingerprint}
                isExporting={exporting}
                projectId={project?.id}
                renderStatus={project?.renderStatus || "empty"}
                renderUrl={project?.renderUrl}
                scenes={scenes}
              />
            </div>
          ) : null}
        </div>
        <span className="flex items-center gap-[5px] text-[14px] font-[800] text-[var(--editor-accent)]" title="Credits">
          <Coins className="h-[16px] w-[16px]" />
          {creditLabel}
        </span>
        <button
          type="button"
          aria-label="Open settings"
          title="Settings"
          onClick={() => router.push("/settings")}
          className="flex h-[32px] w-[32px] items-center justify-center rounded-[6px] text-[var(--editor-muted)] transition hover:bg-[var(--editor-panel-soft)] hover:text-[var(--editor-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
        >
          <Settings className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          aria-label="Open editor menu"
          aria-expanded={editorMenuOpen}
          title="Menu"
          onClick={() => setEditorMenuOpen(true)}
          className="flex h-[32px] w-[32px] items-center justify-center rounded-[6px] text-[var(--editor-muted)] transition hover:bg-[var(--editor-panel-soft)] hover:text-[var(--editor-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>
      </div>
      <EditorMenuDrawer
        open={editorMenuOpen}
        onOpenChange={setEditorMenuOpen}
        projectId={project?.id}
        projectTitle={project?.title}
      />
    </header>
  );
}

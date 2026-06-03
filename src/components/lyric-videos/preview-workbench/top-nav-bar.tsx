"use client";

import { Check, ChevronDown, Coins, Download, Edit3, Loader2, Menu, Settings } from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";

export function TopNavBar() {
  const { appName, exporting, project, queueExport, saveStatus, updateProjectField } = useEditor();

  const saveLabel =
    saveStatus === "saving" ? "Saving" : saveStatus === "failed" ? "Save failed" : saveStatus === "saved" ? "Saved" : "Ready";

  return (
    <header className="flex h-[56px] shrink-0 items-center border-b border-[#E8E8E8] bg-white px-[20px]">
      <Link href="/" className="flex w-[260px] items-center gap-[8px]" aria-label="Back home">
        <span className="flex size-[24px] items-center justify-center rounded-full border-[3px] border-[#F5A623] border-r-[#1A1A2E]" />
        <span className="truncate text-[20px] font-[800] leading-none text-[#1A1A2E]">{appName}</span>
      </Link>

      <label className="flex min-w-0 flex-1 items-center justify-center gap-[8px] text-[14px] font-[700] text-[#667085]">
        <input
          value={project?.title || ""}
          onChange={(event) => project && updateProjectField("title", event.target.value)}
          className="w-full max-w-[360px] truncate bg-transparent text-center text-[14px] font-[800] text-[#1A1A2E] outline-none"
          aria-label="Project title"
          disabled={!project}
        />
        <Edit3 className="h-[14px] w-[14px] shrink-0 text-[#9AA4B2]" />
      </label>

      <div className="flex w-[360px] items-center justify-end gap-[14px]">
        <span
          className={cn(
            "flex items-center gap-[4px] text-[13px] font-[700]",
            saveStatus === "failed" ? "text-red-600" : "text-[#777777]",
          )}
        >
          {saveStatus === "saving" ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Check className="h-[14px] w-[14px]" />}
          {saveLabel}
        </span>
        <button
          type="button"
          onClick={queueExport}
          disabled={exporting || !project}
          className="flex h-[34px] items-center gap-[8px] rounded-[6px] bg-[#F5A623] px-[16px] text-[14px] font-[800] text-white hover:bg-[#E6981F] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Download className="h-[15px] w-[15px]" />}
          Export
          <ChevronDown className="h-[13px] w-[13px]" />
        </button>
        <span className="flex items-center gap-[5px] text-[14px] font-[800] text-[#F5A623]" title="Credits">
          <Coins className="h-[16px] w-[16px]" />
          --
        </span>
        <Settings className="h-[18px] w-[18px] text-[#777777]" />
        <Menu className="h-[18px] w-[18px] text-[#777777]" />
      </div>
    </header>
  );
}

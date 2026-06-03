"use client";

import { AlertCircle, RefreshCcw } from "lucide-react";
import { useEditor } from "./editor-context";

export function StatusBar() {
  const { generateStoryboardPrompts, latestExport, loadError, project, refresh, saveStatus } = useEditor();
  const blockingError = loadError || project?.pipelineError || latestExport?.error;
  const ready = project?.renderStatus === "ready" || latestExport?.status === "success";
  const continuing = saveStatus === "saving";

  return (
    <footer className="flex h-[44px] shrink-0 items-center justify-center border-t border-[#E8E8E8] bg-white px-[16px]">
      {blockingError ? (
        <div className="flex items-center gap-[10px] text-[13px] font-[700] text-red-600">
          <AlertCircle className="h-[16px] w-[16px]" />
          <span className="max-w-[720px] truncate">{blockingError}</span>
          <button type="button" onClick={refresh} className="inline-flex items-center gap-1 rounded-[5px] border border-red-200 px-2 py-1">
            <RefreshCcw className="h-[13px] w-[13px]" />
            Retry
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-[12px] text-[13px] font-[700] text-[#777777]">
          <span>{ready ? "Export ready." : "Preview ready! Customize the look & feel or continue:"}</span>
          <button
            type="button"
            onClick={generateStoryboardPrompts}
            disabled={continuing}
            className="flex h-[28px] w-[180px] items-center justify-center gap-[8px] rounded-[8px] bg-[#F5A623] text-[14px] font-[800] text-white hover:bg-[#E6981F] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {continuing ? "Working..." : "Continue ->"}
          </button>
        </div>
      )}
    </footer>
  );
}

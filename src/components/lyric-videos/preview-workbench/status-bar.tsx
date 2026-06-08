"use client";

import { AlertCircle, RefreshCcw } from "lucide-react";
import { useEditor } from "./editor-context";
import { deriveGenerationProgress } from "./utils";

export function StatusBar() {
  const {
    generateStoryboardPrompts,
    generationLocked,
    generationLockReason,
    generationRun,
    generationSteps,
    latestExport,
    loadError,
    project,
    refresh,
    retryFailedImageBatches,
    runtimeState,
    saveStatus,
    scenes,
  } = useEditor();
  const blockingError = loadError || project?.pipelineError || latestExport?.error;
  const ready = project?.renderStatus === "ready" || latestExport?.status === "success";
  const continuing = saveStatus === "saving";
  const directionReady = runtimeState?.currentStage === "direction_ready" || project?.pipelineStage === "direction_ready";
  const progress = deriveGenerationProgress({ project, generationRun, generationSteps, runtimeState, scenes });
  const canRetryFailedImages = Boolean(blockingError && progress.retryable);
  const statusText = ready
    ? "Export ready."
    : directionReady
      ? "Direction ready. Review Story, then generate all scenes:"
      : "Review the direction, then generate all scenes:";

  return (
    <footer className="flex h-[44px] shrink-0 items-center justify-center border-t border-[#E8E8E8] bg-white px-[16px]">
      {blockingError ? (
        <div className="flex items-center gap-[10px] text-[13px] font-[700] text-red-600">
          <AlertCircle className="h-[16px] w-[16px]" />
          <span className="max-w-[720px] truncate">{blockingError}</span>
          <button
            type="button"
            onClick={canRetryFailedImages ? retryFailedImageBatches : refresh}
            disabled={canRetryFailedImages && (continuing || generationLocked)}
            title={canRetryFailedImages && generationLocked ? generationLockReason : undefined}
            className="inline-flex items-center gap-1 rounded-[5px] border border-red-200 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className="h-[13px] w-[13px]" />
            {canRetryFailedImages ? `Retry ${progress.failedBatches} failed batch${progress.failedBatches === 1 ? "" : "es"}` : "Refresh"}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-[12px] text-[13px] font-[700] text-[#777777]">
          <span>{statusText}</span>
          <button
            type="button"
            onClick={generateStoryboardPrompts}
            disabled={continuing || generationLocked}
            title={generationLocked ? generationLockReason : undefined}
            className="flex h-[28px] w-[180px] items-center justify-center gap-[8px] rounded-[8px] bg-[#F5A623] text-[14px] font-[800] text-white hover:bg-[#E6981F] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {continuing ? "Working..." : "Generate All Scenes"}
          </button>
        </div>
      )}
    </footer>
  );
}

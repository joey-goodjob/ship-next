"use client";

import { useMemo } from "react";
import { RefreshCcw, Wand2 } from "lucide-react";
import { findActiveCaptionChunk } from "@/lib/lyric-caption-chunks";
import { cn } from "@/lib/utils";
import { DEFAULT_CAPTION_FONT_SIZE } from "./constants";
import { useEditor } from "./editor-context";
import { clamp, deriveGenerationProgress, getAspectRatio, normalizePreviewConfig, secondsToMs } from "./utils";

export function VideoPreview() {
  const { currentLine, currentScene, currentTime, generationRun, generationSteps, loading, project, retryFailedImageBatches, scenes, totalDuration, words } = useEditor();
  const aspectRatio = getAspectRatio(project?.aspectRatio);
  const hasImage = Boolean(currentScene?.imageUrl);
  const progress = deriveGenerationProgress({ project, generationRun, generationSteps, scenes });
  const previewConfig = useMemo(() => normalizePreviewConfig(project?.previewConfig), [project?.previewConfig]);
  const captionText = useMemo(() => {
    const currentMs = secondsToMs(currentTime);
    const activeChunk = findActiveCaptionChunk(words, currentMs, {
      rangeStartMs: currentScene?.startMs,
      rangeEndMs: currentScene?.endMs,
    });
    if (activeChunk?.text) return activeChunk.text;
    return currentLine?.text || project?.title || "Lyric preview";
  }, [currentLine?.text, currentScene?.endMs, currentScene?.startMs, currentTime, project?.title, words]);

  return (
    <section className="relative flex min-h-0 flex-1 items-start justify-start overflow-hidden bg-[#F8F9FA] px-[16px] pt-[16px]">
      <GenerationProgressBanner progress={progress} onRetry={retryFailedImageBatches} />
      <div
        className="relative max-h-full overflow-hidden rounded-[4px] bg-[#E8EEF7]"
        style={{
          aspectRatio,
          width: "min(100%, 1540px)",
          maxHeight: "100%",
        }}
      >
        {loading ? (
          <PreviewPlaceholder title="Loading project..." description="Preparing the editor workspace." />
        ) : hasImage ? (
          <>
            <img src={currentScene?.imageUrl || ""} alt="" className="absolute inset-0 h-full w-full object-cover" />
            {previewConfig.captionsEnabled ? (
              <div className="absolute inset-x-[32px] bottom-[8%] flex justify-center">
                <p
                  className="max-w-[78%] rounded-[5px] bg-black/35 px-[12px] py-[7px] text-center font-[800] leading-[1.18] text-white"
                  style={{
                    fontFamily: previewConfig.fontFamily,
                    fontSize: `clamp(${Math.max(18, Math.round((previewConfig.fontSize || DEFAULT_CAPTION_FONT_SIZE) * 0.72))}px, 2.15vw, ${
                      previewConfig.fontSize || DEFAULT_CAPTION_FONT_SIZE
                    }px)`,
                    color: previewConfig.textColor,
                    textShadow: `0 1px 3px ${previewConfig.shadowColor || "rgba(0,0,0,0.75)"}`,
                  }}
                >
                  {captionText}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <PreviewPlaceholder
            title={currentScene ? "Scene image pending" : "No scene image yet"}
            description={
              currentScene
                ? currentScene.status === "failed"
                  ? currentScene.error || "Image generation failed."
                  : "Generate scene images to fill the preview."
                : totalDuration > 0
                  ? "Add lyrics and generate a storyboard to preview this video."
                  : "Create the project flow to preview your lyric video."
            }
          />
        )}
      </div>
    </section>
  );
}

function GenerationProgressBanner({
  onRetry,
  progress,
}: {
  onRetry: () => Promise<void>;
  progress: ReturnType<typeof deriveGenerationProgress>;
}) {
  const shouldShow = progress.isActive || progress.retryable || Boolean(progress.error);
  if (!shouldShow) return null;

  return (
    <div className="absolute left-[24px] top-[24px] z-20 w-[min(540px,calc(100%-48px))] rounded-[6px] border border-[#D7DEE8] bg-white/94 px-[14px] py-[12px] shadow-[0_8px_24px_rgba(15,23,42,0.10)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-[900] text-[#1A1A2E]">{progress.primary}</p>
          <p className="mt-[4px] text-[12px] font-[650] leading-5 text-[#526173]">
            {progress.imageText}. You can leave this page and come back later.
          </p>
        </div>
        {progress.retryable ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-[32px] shrink-0 items-center gap-[7px] rounded-[6px] bg-[#F5A623] px-[10px] text-[12px] font-[900] text-white hover:bg-[#E6981F]"
          >
            <RefreshCcw className="h-[13px] w-[13px]" />
            Retry {progress.failedBatches} batch{progress.failedBatches === 1 ? "" : "es"}
          </button>
        ) : null}
      </div>
      <div className="mt-[10px] h-[6px] overflow-hidden rounded-full bg-[#E8EEF7]">
        <div className="h-full rounded-full bg-[#F5A623]" style={{ width: `${clamp(progress.progressPercent || 0, 5, 100)}%` }} />
      </div>
      <div className="mt-[8px] flex flex-wrap gap-[6px]">
        <StatusPill label="Prompt1" value={progress.songAnalysisStatus} />
        <StatusPill label="Prompt2" value={progress.promptStatus} />
        <StatusPill label="Images" value={progress.imageStatus} />
        {progress.failed > 0 ? <StatusPill label="Failed" value={`${progress.failed}`} tone="danger" /> : null}
      </div>
      {progress.error ? <p className="mt-[8px] line-clamp-2 text-[12px] font-[700] text-red-600">{progress.error}</p> : null}
    </div>
  );
}

function StatusPill({ label, tone, value }: { label: string; tone?: "danger"; value: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center rounded-[5px] border px-[7px] text-[10px] font-[900] uppercase",
        tone === "danger" ? "border-red-200 bg-red-50 text-red-600" : "border-[#DDE5EF] bg-[#F8FAFC] text-[#526173]",
      )}
    >
      {label}: {value}
    </span>
  );
}

function PreviewPlaceholder({ description, title }: { description: string; title: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#DCE5F0] to-[#F6F7F8] px-8 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-white/80 text-[#F5A623] shadow-sm">
        <Wand2 className="size-7" />
      </div>
      <p className="text-[18px] font-[800] text-[#1A1A2E]">{title}</p>
      <p className="mt-2 max-w-md text-[14px] font-[600] leading-6 text-[#667085]">{description}</p>
    </div>
  );
}

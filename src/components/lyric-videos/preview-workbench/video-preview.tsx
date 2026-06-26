"use client";

import { useMemo } from "react";
import { RefreshCcw, Wand2 } from "lucide-react";
import { findActiveCaptionChunk } from "@/lib/lyric-caption-chunks";
import { DEFAULT_CAPTION_FONT_SIZE } from "./constants";
import { useEditor } from "./editor-context";
import { LatestExport } from "./latest-export";
import { usePlayback } from "./playback-context";
import { RoadmapGuide } from "./roadmap-guide";
import { clamp, deriveGenerationProgress, getPreviewStageStyle, normalizePreviewConfig, resolvePreviewCaptionText, secondsToMs } from "./utils";

export function VideoPreview() {
  const {
    generationLocked,
    generationLockReason,
    generationRun,
    generationSteps,
    exporting,
    latestExport,
    lines,
    loading,
    project,
    retryFailedImageBatches,
    runtimeState,
    scenes,
    words,
  } = useEditor();
  const { currentLine, currentScene, currentTime, totalDuration } = usePlayback();
  const stageStyle = getPreviewStageStyle(project?.aspectRatio);
  const hasImage = Boolean(currentScene?.imageUrl);
  const hasLyrics = lines.length > 0 || words.length > 0 || project?.lyricsStatus === "ready";
  const progress = deriveGenerationProgress({ project, generationRun, generationSteps, runtimeState, scenes });
  const directionReady = runtimeState?.currentStage === "direction_ready" || generationRun?.currentStage === "direction_ready" || project?.pipelineStage === "direction_ready";
  const previewConfig = useMemo(() => normalizePreviewConfig(project?.previewConfig), [project?.previewConfig]);
  const shouldShowLatestExport = Boolean(exporting || latestExport || project?.renderUrl || (project?.renderStatus && project.renderStatus !== "empty"));
  const captionText = useMemo(() => {
    const currentMs = secondsToMs(currentTime);
    const activeChunk = findActiveCaptionChunk(words, currentMs, {
      rangeStartMs: currentScene?.startMs,
      rangeEndMs: currentScene?.endMs,
    });
    return resolvePreviewCaptionText({
      activeChunkText: activeChunk?.text,
      currentLine,
      currentTimeMs: currentMs,
      hasLyrics,
      fallbackTitle: project?.title,
    });
  }, [currentLine, currentScene?.endMs, currentScene?.startMs, currentTime, hasLyrics, project?.title, words]);

  return (
    <section
      data-preview-stage
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[var(--editor-bg)] p-[16px]"
    >
      <div className="absolute left-[24px] top-[24px] z-20 flex max-w-[calc(100%-48px)] flex-col items-start gap-[10px]">
        <RoadmapGuide />
        <GenerationProgressBanner
          locked={generationLocked}
          lockReason={generationLockReason}
          progress={progress}
          onRetry={retryFailedImageBatches}
        />
      </div>
      {shouldShowLatestExport ? (
        <div className="absolute right-[24px] top-[24px] z-20 w-[min(320px,calc(100%-48px))]">
          <LatestExport
            exportJob={latestExport}
            isExporting={exporting}
            projectId={project?.id}
            renderStatus={project?.renderStatus || "empty"}
            renderUrl={project?.renderUrl}
          />
        </div>
      ) : null}
      <div
        className="relative max-h-full max-w-full overflow-hidden rounded-[4px] bg-[var(--editor-panel-strong)]"
        style={stageStyle}
      >
        {loading ? (
          <PreviewPlaceholder title="Loading project..." description="Preparing the editor workspace." />
        ) : hasImage ? (
          <>
            <img src={currentScene?.imageUrl || ""} alt="" className="absolute inset-0 h-full w-full object-cover" />
            {previewConfig.captionsEnabled && captionText ? (
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
            title={directionReady ? "Direction ready" : currentScene ? "Scene image pending" : hasLyrics ? "Scene timing pending" : "No scene image yet"}
            description={
              directionReady
                ? "Review the Story panel, then click Confirm & Generate Scenes to prepare scenes and queue visuals."
                : currentScene
                ? currentScene.status === "failed"
                  ? currentScene.error || "Image generation failed."
                  : "Scene timing is ready. Images will appear after image generation starts."
                : hasLyrics
                  ? "Lyrics are ready, but scene timing is not written yet."
                  : totalDuration > 0
                  ? "Add lyrics to create scene timing for this video."
                  : "Create the project flow to preview your lyric video."
            }
          />
        )}
      </div>
    </section>
  );
}

function GenerationProgressBanner({
  locked,
  lockReason,
  onRetry,
  progress,
}: {
  locked: boolean;
  lockReason: string;
  onRetry: () => Promise<void>;
  progress: ReturnType<typeof deriveGenerationProgress>;
}) {
  const shouldShow = progress.isActive || progress.retryable || Boolean(progress.error);
  if (!shouldShow) return null;

  return (
    <div className="w-[min(540px,100%)] rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[14px] py-[12px] shadow-[0_8px_24px_rgba(15,23,42,0.10)]">
      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-[900] text-[var(--editor-text)]">{progress.primary}</p>
          <p className="mt-[4px] text-[12px] font-[650] leading-5 text-[var(--editor-muted)]">
            {progress.imageText}. You can leave this page and come back later.
          </p>
          {progress.refundNotice ? (
            <p className="mt-[4px] text-[12px] font-[800] leading-5 text-[var(--editor-text)]">{progress.refundNotice}</p>
          ) : null}
        </div>
        {progress.retryable ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={locked}
            title={locked ? lockReason : undefined}
            className="inline-flex h-[32px] shrink-0 items-center gap-[7px] rounded-[6px] bg-[var(--editor-accent)] px-[10px] text-[12px] font-[900] text-[var(--editor-accent-ink)] hover:bg-[var(--editor-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className="h-[13px] w-[13px]" />
            Retry {progress.failedBatches} batch{progress.failedBatches === 1 ? "" : "es"}
          </button>
        ) : null}
      </div>
      <div className="mt-[10px] h-[6px] overflow-hidden rounded-full bg-[var(--editor-panel-strong)]">
        <div className="h-full rounded-full bg-[var(--editor-accent)]" style={{ width: `${clamp(progress.progressPercent || 0, 5, 100)}%` }} />
      </div>
      {progress.error ? <p className="mt-[8px] line-clamp-2 text-[12px] font-[700] text-[var(--editor-danger)]">{progress.error}</p> : null}
    </div>
  );
}

function PreviewPlaceholder({ description, title }: { description: string; title: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--editor-panel-strong)] px-8 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--editor-panel)] text-[var(--editor-accent)] shadow-sm">
        <Wand2 className="size-7" />
      </div>
      <p className="text-[18px] font-[800] text-[var(--editor-text)]">{title}</p>
      <p className="mt-2 max-w-md text-[14px] font-[600] leading-6 text-[var(--editor-muted)]">{description}</p>
    </div>
  );
}

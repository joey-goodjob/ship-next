"use client";

import { useEffect, useMemo, useRef } from "react";
import { RefreshCcw, Wand2 } from "lucide-react";
import { findActiveCaptionChunk } from "@/lib/lyric-caption-chunks";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { usePlayback } from "./playback-context";
import { RoadmapGuide } from "./roadmap-guide";
import {
  applyCaptionFontCase,
  clamp,
  deriveGenerationProgress,
  getPreviewCaptionStyle,
  getPreviewStageStyle,
  getSceneVideoPreloadUrls,
  msToSeconds,
  normalizePreviewConfig,
  resolvePreviewCaptionText,
  resolveSceneMedia,
  secondsToMs,
} from "./utils";

export function VideoPreview() {
  const {
    generationLocked,
    generationLockReason,
    generationRun,
    generationSteps,
    lines,
    loading,
    project,
    retryFailedImageBatches,
    runtimeState,
    scenes,
    words,
  } = useEditor();
  const { currentLine, currentScene, currentTime, isPlaying, totalDuration } = usePlayback();
  const sceneVideoRef = useRef<HTMLVideoElement | null>(null);
  const stageStyle = getPreviewStageStyle(project?.aspectRatio);
  const sceneMedia = resolveSceneMedia(currentScene);
  const hasSceneMedia = sceneMedia.kind !== "empty";
  const hasLyrics = lines.length > 0 || words.length > 0 || project?.lyricsStatus === "ready";
  const progress = deriveGenerationProgress({ project, generationRun, generationSteps, runtimeState, scenes });
  const directionReady = runtimeState?.currentStage === "direction_ready" || generationRun?.currentStage === "direction_ready" || project?.pipelineStage === "direction_ready";
  const previewConfig = useMemo(() => normalizePreviewConfig(project?.previewConfig), [project?.previewConfig]);
  const sceneVideoPreloadUrls = useMemo(
    () => getSceneVideoPreloadUrls({ scenes, currentSceneId: currentScene?.id }),
    [currentScene?.id, scenes],
  );
  const captionText = useMemo(() => {
    const currentMs = secondsToMs(currentTime);
    const activeChunk = findActiveCaptionChunk(words, currentMs, {
      rangeStartMs: currentScene?.startMs,
      rangeEndMs: currentScene?.endMs,
      wordsPerGroup: previewConfig.showWholeVerse ? undefined : previewConfig.wordsPerGroup,
    });
    return resolvePreviewCaptionText({
      activeChunkText: previewConfig.showWholeVerse ? undefined : activeChunk?.text,
      allowLineFallback: previewConfig.showWholeVerse || words.length === 0,
      currentLine,
      currentTimeMs: currentMs,
      hasLyrics,
      fallbackTitle: project?.title,
    });
  }, [
    currentLine,
    currentScene?.endMs,
    currentScene?.startMs,
    currentTime,
    hasLyrics,
    previewConfig.showWholeVerse,
    previewConfig.wordsPerGroup,
    project?.title,
    words,
  ]);
  const previewCaptionStyle = useMemo(() => getPreviewCaptionStyle(previewConfig), [previewConfig]);
  const displayCaptionText = useMemo(() => applyCaptionFontCase(captionText, previewConfig.fontCase), [captionText, previewConfig.fontCase]);
  const stackedCaptionLines = useMemo(
    () =>
      resolveStackedCaptionLines({
        captionText: displayCaptionText,
        currentLine,
        fontCase: previewConfig.fontCase,
        lines,
      }),
    [currentLine, displayCaptionText, lines, previewConfig.fontCase],
  );

  useEffect(() => {
    const video = sceneVideoRef.current;
    if (!video || !currentScene || sceneMedia.kind !== "video") return;

    const sceneLocalTime = Math.max(0, currentTime - msToSeconds(currentScene.startMs));
    if (Number.isFinite(sceneLocalTime) && Math.abs(video.currentTime - sceneLocalTime) > 0.12) {
      try {
        video.currentTime = sceneLocalTime;
      } catch {
        // The browser may reject seeking before metadata is ready; the next tick will retry.
      }
    }

    if (!isPlaying) {
      video.pause();
      return;
    }

    if (video.paused) {
      void video.play().catch(() => {
        // Main audio controls remain authoritative; failed inline video playback should not block preview.
      });
    }
  }, [currentScene, currentTime, isPlaying, sceneMedia.kind, sceneMedia.url]);

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
      <div
        className="relative max-h-full max-w-full overflow-hidden rounded-[4px] bg-[var(--editor-panel-strong)]"
        style={stageStyle}
      >
        {loading ? (
          <PreviewPlaceholder title="Loading project..." description="Preparing the editor workspace." />
        ) : hasSceneMedia ? (
          <>
            {sceneMedia.kind === "video" ? (
              <video
                key={sceneMedia.url}
                ref={sceneVideoRef}
                src={sceneMedia.url}
                poster={sceneMedia.posterUrl}
                className="absolute inset-0 h-full w-full object-cover"
                muted
                playsInline
                preload="auto"
                autoPlay={isPlaying}
              />
            ) : (
              <img src={sceneMedia.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            )}
            {sceneVideoPreloadUrls.map((url) => (
              <video
                key={url}
                src={url}
                className="pointer-events-none absolute h-px w-px opacity-0"
                muted
                playsInline
                preload="auto"
                aria-hidden="true"
                tabIndex={-1}
              />
            ))}
            {previewConfig.captionsEnabled && displayCaptionText ? (
              <div className={previewCaptionStyle.containerClassName}>
                {previewConfig.captionStyle === "stacked" && stackedCaptionLines.length > 1 ? (
                  <div
                    key={`${previewConfig.captionStyle}-${displayCaptionText}`}
                    className={previewCaptionStyle.textClassName}
                    style={previewCaptionStyle.textStyle}
                  >
                    {stackedCaptionLines.map((line) => (
                      <p
                        key={`${line.tone}-${line.text}`}
                        className={cn(
                          "mx-auto max-w-full truncate",
                          line.tone === "current" ? "text-[1em] opacity-100" : "text-[0.68em] opacity-55",
                        )}
                      >
                        {line.text}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p
                    key={`${previewConfig.captionStyle}-${displayCaptionText}`}
                    className={previewCaptionStyle.textClassName}
                    style={previewCaptionStyle.textStyle}
                  >
                    {displayCaptionText}
                  </p>
                )}
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

function resolveStackedCaptionLines({
  captionText,
  currentLine,
  fontCase,
  lines,
}: {
  captionText: string;
  currentLine?: { id?: string; startMs: number; endMs: number; text: string };
  fontCase?: string;
  lines: Array<{ id?: string; startMs: number; endMs: number; text: string }>;
}) {
  const currentText = captionText.trim();
  if (!currentText) return [];

  const currentIndex = lines.findIndex((line) => {
    if (currentLine?.id && line.id === currentLine.id) return true;
    return line.startMs === currentLine?.startMs && line.endMs === currentLine?.endMs && line.text === currentLine?.text;
  });

  if (currentIndex < 0) return [{ tone: "current" as const, text: currentText }];

  return [
    { tone: "previous" as const, text: applyCaptionFontCase(lines[currentIndex - 1]?.text?.trim() || "", fontCase) },
    { tone: "current" as const, text: currentText },
    { tone: "next" as const, text: applyCaptionFontCase(lines[currentIndex + 1]?.text?.trim() || "", fontCase) },
  ].filter((line) => line.text);
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

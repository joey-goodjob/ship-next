"use client";

import { Expand, Loader2, Pause, Play, Shuffle, SkipBack, SkipForward, Type, Volume2, VolumeX, Wand2, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { usePlayback } from "./playback-context";
import { formatClock, msToSeconds, normalizePreviewConfig } from "./utils";

export function PlaybackControls() {
  const { generationLocked, generationLockReason, project, scenes, setZoom, updateProjectField, zoom } = useEditor();
  const { audioAvailable, currentScene, currentTime, isAudioLoading, isMuted, isPlaying, setCurrentTime, toggleMute, togglePlayback, totalDuration } = usePlayback();
  const currentSceneIndex = currentScene ? scenes.findIndex((scene) => scene.id === currentScene.id) : -1;
  const canGoPreviousScene = currentSceneIndex > 0;
  const canGoNextScene = currentSceneIndex >= 0 && currentSceneIndex < scenes.length - 1;
  const previewConfig = normalizePreviewConfig(project?.previewConfig);

  function jumpToScene(offset: -1 | 1) {
    const targetScene = scenes[currentSceneIndex + offset];
    if (!targetScene) return;
    setCurrentTime(msToSeconds(targetScene.startMs));
  }

  function toggleCaptions() {
    if (!project) return;
    updateProjectField("previewConfig", {
      ...previewConfig,
      captionsEnabled: !previewConfig.captionsEnabled,
    });
  }

  async function togglePreviewFullscreen() {
    const stage = document.querySelector<HTMLElement>("[data-preview-stage]");
    if (!stage) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await stage.requestFullscreen();
    } catch (error) {
      console.warn("[lyric-video] preview fullscreen failed", error);
    }
  }

  return (
    <div className="playback-controls flex h-[40px] shrink-0 items-center border-t border-[var(--editor-line)] bg-[var(--editor-bg)] px-[16px]">
      <div className="flex w-[220px] items-center gap-[12px] text-[var(--editor-muted)]">
        <button
          type="button"
          onClick={togglePreviewFullscreen}
          aria-label="Fullscreen preview"
          title="Fullscreen preview"
          className="flex h-[24px] w-[24px] items-center justify-center rounded-[4px] transition-colors hover:bg-[var(--editor-panel-soft)] hover:text-[var(--editor-text)]"
        >
          <Expand className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          onClick={toggleMute}
          disabled={!audioAvailable}
          aria-label={isMuted ? "Unmute audio" : "Mute audio"}
          aria-pressed={isMuted}
          title={isMuted ? "Unmute audio" : "Mute audio"}
          className={cn(
            "flex h-[24px] w-[24px] items-center justify-center rounded-[4px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            isMuted
              ? "text-[var(--editor-text)] hover:bg-[var(--editor-panel-soft)]"
              : "text-[var(--editor-muted)] hover:bg-[var(--editor-panel-soft)] hover:text-[var(--editor-text)]",
          )}
        >
          {isMuted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
        </button>
        <button
          type="button"
          onClick={toggleCaptions}
          disabled={!project || generationLocked}
          aria-label={previewConfig.captionsEnabled ? "Hide lyrics" : "Show lyrics"}
          aria-pressed={previewConfig.captionsEnabled}
          title={generationLocked ? generationLockReason : previewConfig.captionsEnabled ? "Hide lyrics" : "Show lyrics"}
          className={cn(
            "relative flex h-[24px] w-[24px] items-center justify-center rounded-[4px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            previewConfig.captionsEnabled
              ? "text-[var(--editor-text)] hover:bg-[var(--editor-panel-soft)]"
              : "text-[var(--editor-muted)] hover:bg-[var(--editor-panel-soft)] hover:text-[var(--editor-text)]",
          )}
        >
          <Type className="h-[18px] w-[18px]" />
          {!previewConfig.captionsEnabled ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute h-[2px] w-[20px] rotate-[-35deg] rounded-full bg-current"
            />
          ) : null}
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center gap-[14px]">
        <div className="flex items-center gap-[8px] text-[var(--editor-muted)]">
          <Wand2 className="h-[16px] w-[16px]" />
          <Shuffle className="h-[16px] w-[16px]" />
        </div>

        <div className="flex items-center gap-[8px] text-[var(--editor-muted)]">
          <button
            type="button"
            onClick={() => jumpToScene(-1)}
            disabled={!canGoPreviousScene}
            aria-label="Previous scene"
            className="disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SkipBack className="h-[16px] w-[16px]" />
          </button>
          <button
            type="button"
            onClick={togglePlayback}
            disabled={!audioAvailable || isAudioLoading}
            aria-busy={isAudioLoading}
            aria-label={isAudioLoading ? "Loading audio" : isPlaying ? "Pause" : "Play"}
            className="flex h-[28px] w-[28px] items-center justify-center text-[var(--editor-text)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isAudioLoading ? (
              <Loader2 className="h-[20px] w-[20px] animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-[20px] w-[20px]" />
            ) : (
              <Play className="h-[20px] w-[20px]" />
            )}
          </button>
          <button
            type="button"
            onClick={() => jumpToScene(1)}
            disabled={!canGoNextScene}
            aria-label="Next scene"
            className="disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SkipForward className="h-[16px] w-[16px]" />
          </button>
        </div>

        <span className="ml-[8px] font-mono text-[13px] font-[800] text-[var(--editor-text)]">
          {formatClock(currentTime, true)} / {formatClock(totalDuration, true)}
        </span>
      </div>

      <label className="flex w-[220px] items-center justify-end gap-[8px] text-[var(--editor-muted)]">
        <ZoomOut className="h-[16px] w-[16px]" />
        <input
          type="range"
          min="1"
          max="3"
          step="0.25"
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="w-[80px] accent-[var(--editor-subtle)]"
          aria-label="Timeline zoom"
        />
        <ZoomIn className="h-[16px] w-[16px]" />
      </label>
    </div>
  );
}

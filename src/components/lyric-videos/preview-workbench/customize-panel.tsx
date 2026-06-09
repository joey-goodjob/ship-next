"use client";

import { Loader2, Lock, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CAPTION_FONT_SIZE,
  FORMAT_OPTIONS,
  LANGUAGE_OPTIONS,
  MAX_CAPTION_FONT_SIZE,
  MIN_CAPTION_FONT_SIZE,
  PALETTE_OPTIONS,
  STYLE_OPTIONS,
} from "./constants";
import { useEditor } from "./editor-context";
import { FieldBlock } from "./field-block";
import { LatestExport } from "./latest-export";
import { PanelEmpty } from "./panel-empty";
import type { LyricPreviewConfig } from "./types";
import { normalizePreviewConfig } from "./utils";

export function CustomizePanel() {
  const { createStory, creatingStory, generationLocked, generationLockReason, latestExport, project, scenes, updateProjectField } = useEditor();
  if (!project) return <PanelEmpty title="Project unavailable" description="Refresh the page or open a project from the library." />;
  const previewConfig = normalizePreviewConfig(project.previewConfig);
  const scenesCreated =
    !["empty", "lyrics_draft"].includes(project.scenesStatus || "empty") ||
    scenes.some((scene) => scene.status !== "lyrics_draft" && String(scene.prompt || "").trim());
  const storyLocked = generationLocked || scenesCreated;
  const storyLockReason = generationLocked
    ? generationLockReason
    : "Direction settings are locked after scenes have been created.";

  function updatePreviewConfig(patch: Partial<LyricPreviewConfig>) {
    updateProjectField("previewConfig", { ...previewConfig, ...patch });
  }

  return (
    <div className="customize-panel flex flex-col gap-[22px]">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[12px]">
        <section>
          <div className="mb-[8px] flex h-[20px] items-center justify-between gap-3">
            <label className="inline-flex items-center gap-[5px] text-[13px] font-[800] text-[var(--editor-text)]">
              Lyrics Language
              {storyLocked ? (
                <span title={storyLockReason} aria-label="Locked">
                  <Lock className="h-[12px] w-[12px] text-[var(--editor-muted)]" />
                </span>
              ) : null}
            </label>
          </div>
          <select
            value={project.language || "auto"}
            onChange={(event) => updateProjectField("language", event.target.value)}
            disabled={storyLocked}
            title={storyLocked ? storyLockReason : "Main language of the lyrics."}
            className="h-[42px] w-full rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[12px] text-[14px] font-[600] text-[var(--editor-text)] outline-none focus:border-[var(--editor-accent)] disabled:cursor-not-allowed disabled:bg-[var(--editor-panel-strong)] disabled:text-[var(--editor-muted)]"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </section>

        <section>
          <div className="mb-[8px] flex h-[20px] items-center justify-between gap-3">
            <label className="inline-flex items-center gap-[5px] text-[13px] font-[800] text-[var(--editor-text)]">
              Subtitles
              {generationLocked ? (
                <span title={generationLockReason} aria-label="Locked">
                  <Lock className="h-[12px] w-[12px] text-[var(--editor-muted)]" />
                </span>
              ) : null}
            </label>
            <button
              type="button"
              onClick={() => updatePreviewConfig({ captionsEnabled: !previewConfig.captionsEnabled })}
              disabled={generationLocked}
              title={generationLocked ? generationLockReason : undefined}
              className={cn(
                "flex h-[20px] w-[34px] shrink-0 items-center rounded-full p-[2px] transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                previewConfig.captionsEnabled ? "justify-end bg-[var(--editor-accent)]" : "justify-start bg-[var(--editor-line)]",
              )}
              aria-label={previewConfig.captionsEnabled ? "Turn subtitles off" : "Turn subtitles on"}
              aria-pressed={previewConfig.captionsEnabled}
            >
              <span className="size-[16px] rounded-full bg-[var(--editor-panel)] shadow-sm" />
            </button>
          </div>
          <div
            className={cn(
              "grid h-[42px] grid-cols-[auto_minmax(90px,1fr)_42px] items-center gap-[10px] rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[12px]",
              (!previewConfig.captionsEnabled || generationLocked) && "bg-[var(--editor-panel-soft)]",
              !previewConfig.captionsEnabled && "opacity-60",
            )}
          >
            <span className="text-[13px] font-[800] text-[var(--editor-muted)]">Size</span>
            <input
              type="range"
              min={MIN_CAPTION_FONT_SIZE}
              max={MAX_CAPTION_FONT_SIZE}
              step={1}
              value={previewConfig.fontSize || DEFAULT_CAPTION_FONT_SIZE}
              disabled={!previewConfig.captionsEnabled || generationLocked}
              title={generationLocked ? generationLockReason : undefined}
              onChange={(event) => updatePreviewConfig({ fontSize: Number(event.target.value) })}
              className="h-[20px] min-w-0 accent-[var(--editor-accent)] disabled:cursor-not-allowed"
              aria-label="Subtitle size"
            />
            <span className="text-right text-[12px] font-[800] tabular-nums text-[var(--editor-muted)]">{previewConfig.fontSize}px</span>
          </div>
        </section>
      </div>

      <FieldBlock
        label="Story"
        action={
          <button
            type="button"
            onClick={createStory}
            disabled={creatingStory || storyLocked}
            title={storyLocked ? storyLockReason : undefined}
            className="inline-flex h-[31px] items-center gap-[6px] rounded-[6px] border border-[var(--editor-line)] px-[10px] text-[13px] font-[700] text-[var(--editor-text)] hover:bg-[var(--editor-bg)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creatingStory ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Wand2 className="h-[14px] w-[14px]" />}
            {creatingStory ? "Creating..." : "Create new story"}
          </button>
        }
        helper="Describe the story of your video. Include acts, characters, locations, and visual details."
        locked={storyLocked}
        lockReason={storyLockReason}
      >
        <textarea
          value={project.storyPrompt || ""}
          onChange={(event) => updateProjectField("storyPrompt", event.target.value)}
          disabled={storyLocked}
          title={storyLocked ? storyLockReason : undefined}
          rows={10}
          placeholder={"Act 1:\nA cinematic opening that establishes the character, world, and core visual motif.\n\nAct 2:\nThe emotional conflict grows and the visuals shift into a new space."}
          className="min-h-[240px] w-full resize-y rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[12px] py-[10px] text-[14px] font-[500] leading-6 text-[var(--editor-text)] outline-none focus:border-[var(--editor-accent)] disabled:cursor-not-allowed disabled:bg-[var(--editor-panel-strong)] disabled:text-[var(--editor-muted)]"
        />
      </FieldBlock>

      <FieldBlock label="Style" locked={storyLocked} lockReason={storyLockReason}>
        <div className="grid grid-cols-2 gap-[8px]">
          {STYLE_OPTIONS.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => updateProjectField("artStyle", style)}
              disabled={storyLocked}
              title={storyLocked ? storyLockReason : undefined}
              className={cn(
                "h-[36px] truncate rounded-[6px] border px-[10px] text-left text-[13px] font-[700] disabled:cursor-not-allowed disabled:opacity-55",
                project.artStyle === style
                  ? "border-[var(--editor-accent)] bg-[var(--editor-accent-soft)] text-[var(--editor-text)]"
                  : "border-[var(--editor-line)] bg-[var(--editor-panel)] text-[var(--editor-muted)] hover:bg-[var(--editor-bg)]",
              )}
            >
              {style}
            </button>
          ))}
        </div>
      </FieldBlock>

      <FieldBlock label="Palette" locked={storyLocked} lockReason={storyLockReason}>
        <div className="grid grid-cols-2 gap-[8px]">
          {PALETTE_OPTIONS.map((palette) => (
            <button
              key={palette.value}
              type="button"
              onClick={() => updateProjectField("palette", palette.value)}
              disabled={storyLocked}
              title={storyLocked ? storyLockReason : undefined}
              className={cn(
                "flex h-[38px] items-center gap-[8px] rounded-[6px] border px-[10px] text-[13px] font-[700] disabled:cursor-not-allowed disabled:opacity-55",
                project.palette === palette.value
                  ? "border-[var(--editor-accent)] bg-[var(--editor-accent-soft)] text-[var(--editor-text)]"
                  : "border-[var(--editor-line)] bg-[var(--editor-panel)] text-[var(--editor-muted)] hover:bg-[var(--editor-bg)]",
              )}
            >
              <span className="size-[14px] rounded-full" style={{ backgroundColor: palette.color }} />
              {palette.label}
            </button>
          ))}
        </div>
      </FieldBlock>

      <FieldBlock label="Format" locked={storyLocked} lockReason={storyLockReason}>
        <div className="grid grid-cols-3 gap-[8px]">
          {FORMAT_OPTIONS.map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => updateProjectField("aspectRatio", format)}
              disabled={storyLocked}
              title={storyLocked ? storyLockReason : undefined}
              className={cn(
                "h-[38px] rounded-[6px] border text-[13px] font-[800] disabled:cursor-not-allowed disabled:opacity-55",
                project.aspectRatio === format
                  ? "border-[var(--editor-accent)] bg-[var(--editor-accent-soft)] text-[var(--editor-text)]"
                  : "border-[var(--editor-line)] bg-[var(--editor-panel)] text-[var(--editor-muted)] hover:bg-[var(--editor-bg)]",
              )}
            >
              {format}
            </button>
          ))}
        </div>
      </FieldBlock>

      <LatestExport exportJob={latestExport} renderUrl={project.renderUrl} renderStatus={project.renderStatus} />
    </div>
  );
}

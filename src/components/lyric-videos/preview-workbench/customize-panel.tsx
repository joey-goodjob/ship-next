"use client";

import { Loader2, Wand2 } from "lucide-react";
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
    <div className="flex flex-col gap-[22px]">
      <FieldBlock
        label="Lyrics Language"
        helper="Main language of the lyrics. Change it if auto-detection was not correct."
        locked={storyLocked}
        lockReason={storyLockReason}
      >
        <select
          value={project.language || "auto"}
          onChange={(event) => updateProjectField("language", event.target.value)}
          disabled={storyLocked}
          title={storyLocked ? storyLockReason : undefined}
          className="h-[42px] w-full rounded-[6px] border border-[#D9DDE3] bg-white px-[12px] text-[14px] font-[600] text-[#334155] outline-none focus:border-[#F5A623] disabled:cursor-not-allowed disabled:bg-[#EEF3F8] disabled:text-[#61708A]"
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FieldBlock>

      <FieldBlock label="Subtitles" locked={generationLocked} lockReason={generationLockReason}>
        <div className="rounded-[6px] border border-[#E8E8E8] bg-[#F8FAFC] p-[12px]">
          <button
            type="button"
            onClick={() => updatePreviewConfig({ captionsEnabled: !previewConfig.captionsEnabled })}
            disabled={generationLocked}
            title={generationLocked ? generationLockReason : undefined}
            className={cn(
              "flex h-[38px] w-full items-center justify-between rounded-[6px] border px-[11px] text-[13px] font-[800] disabled:cursor-not-allowed disabled:opacity-60",
              previewConfig.captionsEnabled
                ? "border-[#F5A623] bg-amber-50 text-[#1A1A2E]"
                : "border-[#D9DDE3] bg-white text-[#667085] hover:bg-[#F8F9FA]",
            )}
          >
            <span>{previewConfig.captionsEnabled ? "Subtitles on" : "Subtitles off"}</span>
            <span
              className={cn(
                "flex h-[20px] w-[34px] items-center rounded-full p-[2px] transition-colors",
                previewConfig.captionsEnabled ? "justify-end bg-[#F5A623]" : "justify-start bg-[#CBD5E1]",
              )}
              aria-hidden="true"
            >
              <span className="size-[16px] rounded-full bg-white shadow-sm" />
            </span>
          </button>
          <div className={cn("mt-[12px]", !previewConfig.captionsEnabled && "opacity-50")}>
            <div className="mb-[8px] flex items-center justify-between text-[12px] font-[800] text-[#526173]">
              <span>Size</span>
              <span>{previewConfig.fontSize}px</span>
            </div>
            <input
              type="range"
              min={MIN_CAPTION_FONT_SIZE}
              max={MAX_CAPTION_FONT_SIZE}
              step={1}
              value={previewConfig.fontSize || DEFAULT_CAPTION_FONT_SIZE}
              disabled={!previewConfig.captionsEnabled || generationLocked}
              title={generationLocked ? generationLockReason : undefined}
              onChange={(event) => updatePreviewConfig({ fontSize: Number(event.target.value) })}
              className="h-[20px] w-full accent-[#F5A623] disabled:cursor-not-allowed"
              aria-label="Subtitle size"
            />
          </div>
        </div>
      </FieldBlock>

      <FieldBlock
        label="Story"
        action={
          <button
            type="button"
            onClick={createStory}
            disabled={creatingStory || storyLocked}
            title={storyLocked ? storyLockReason : undefined}
            className="inline-flex h-[31px] items-center gap-[6px] rounded-[6px] border border-[#D9DDE3] px-[10px] text-[13px] font-[700] text-[#334155] hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-50"
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
          className="min-h-[240px] w-full resize-y rounded-[6px] border border-[#D9DDE3] bg-white px-[12px] py-[10px] text-[14px] font-[500] leading-6 text-[#334155] outline-none focus:border-[#F5A623] disabled:cursor-not-allowed disabled:bg-[#EEF3F8] disabled:text-[#61708A]"
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
                  ? "border-[#F5A623] bg-amber-50 text-[#1A1A2E]"
                  : "border-[#E8E8E8] bg-white text-[#667085] hover:bg-[#F8F9FA]",
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
                  ? "border-[#F5A623] bg-amber-50 text-[#1A1A2E]"
                  : "border-[#E8E8E8] bg-white text-[#667085] hover:bg-[#F8F9FA]",
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
                  ? "border-[#F5A623] bg-amber-50 text-[#1A1A2E]"
                  : "border-[#E8E8E8] bg-white text-[#667085] hover:bg-[#F8F9FA]",
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookText,
  Box,
  Brush,
  Check,
  Clapperboard,
  Film,
  Grid3X3,
  Loader2,
  Monitor,
  Pencil,
  PencilLine,
  Smartphone,
  Smile,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FORMAT_OPTIONS, STYLE_OPTIONS } from "./constants";
import { useEditor } from "./editor-context";
import { FieldBlock } from "./field-block";
import { PanelEmpty } from "./panel-empty";
import type { StoryChangeSource, StoryReviewStatus } from "./types";

const STYLE_ICON_BY_KEY: Record<(typeof STYLE_OPTIONS)[number]["icon"], LucideIcon> = {
  box: Box,
  brush: Brush,
  clapperboard: Clapperboard,
  film: Film,
  grid: Grid3X3,
  pencil: Pencil,
  smile: Smile,
};

const FORMAT_ICON_BY_KEY: Record<(typeof FORMAT_OPTIONS)[number]["icon"], LucideIcon> = {
  monitor: Monitor,
  smartphone: Smartphone,
};

function storyStatusText(status: StoryReviewStatus, source: StoryChangeSource) {
  if (status === "dirty" && source === "ai_rewrite") return "AI updated";
  if (status === "dirty" && source === "ai_new_story") return "New story";
  if (status === "dirty") return "Unsaved changes";
  if (status === "confirmed") return "Story confirmed";
  if (status === "unconfirmed") return "Needs review";
  return "";
}

export function deriveStoryDirectionLockState({
  generationLocked,
  generationLockReason,
  scenesCreated,
  storyReviewStatus,
}: {
  generationLocked: boolean;
  generationLockReason: string;
  scenesCreated: boolean;
  storyReviewStatus: StoryReviewStatus;
}) {
  if (generationLocked) {
    return { locked: true, reason: generationLockReason };
  }
  if (scenesCreated) {
    return { locked: true, reason: "Direction settings are locked after scenes have been created." };
  }
  if (storyReviewStatus === "confirmed") {
    return { locked: true, reason: "Story confirmed. Click Edit Story below to make changes." };
  }
  return { locked: false, reason: "" };
}

/* ------------------------------------------------------------------ */
/*  Feedback Modal                                                     */
/* ------------------------------------------------------------------ */

function StoryFeedbackModal({
  open,
  onSubmit,
  onClose,
}: {
  open: boolean;
  onSubmit: (feedback?: string) => void;
  onClose: () => void;
}) {
  const feedbackRef = useRef<HTMLTextAreaElement>(null);

  // focus textarea when modal opens
  useEffect(() => {
    if (open) setTimeout(() => feedbackRef.current?.focus(), 80);
  }, [open]);

  // close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={handleKeyDown}>
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />

      {/* modal card */}
      <div className="relative z-10 mx-4 flex w-full max-w-[420px] flex-col gap-[16px] rounded-[12px] border border-[var(--editor-line)] bg-[var(--editor-panel-strong)] p-[20px] shadow-2xl">
        {/* header */}
        <div className="flex flex-col gap-[4px]">
          <h3 className="text-[15px] font-[800] text-[var(--editor-text)]">Regenerate Story</h3>
          <p className="text-[13px] font-[500] leading-[1.4] text-[var(--editor-muted)]">
            Describe what you&apos;d like to change, or leave blank to generate a completely new story.
          </p>
        </div>

        {/* textarea */}
        <textarea
          ref={feedbackRef}
          rows={3}
          placeholder='e.g. "More cheerful", "cyberpunk setting", "remove the traveler theme"'
          className="w-full resize-none rounded-[8px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[12px] py-[10px] text-[13px] font-[500] leading-[1.5] text-[var(--editor-text)] outline-none placeholder:text-[var(--editor-muted)]/40 focus:border-[var(--editor-accent)]"
        />

        {/* actions */}
        <div className="flex items-center justify-end gap-[8px]">
          <button
            type="button"
            onClick={onClose}
            className="h-[32px] rounded-[8px] border border-[var(--editor-line)] px-[14px] text-[13px] font-[700] text-[var(--editor-muted)] hover:bg-[var(--editor-bg)] active:opacity-80"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(feedbackRef.current?.value.trim() || undefined)}
            className="h-[32px] rounded-[8px] border border-[var(--editor-accent)] bg-[var(--editor-accent)] px-[14px] text-[13px] font-[700] text-[var(--editor-bg)] hover:brightness-110 active:brightness-90"
          >
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Customize Panel                                                    */
/* ------------------------------------------------------------------ */

export function CustomizePanel() {
  const { createStory, creatingStory, generationLocked, generationLockReason, project, scenes, storyChangeSource, storyReviewStatus, updateProjectField } = useEditor();
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  if (!project) return <PanelEmpty title="Project unavailable" description="Refresh the page or open a project from the library." />;
  const scenesCreated =
    !["empty", "lyrics_draft"].includes(project.scenesStatus || "empty") ||
    scenes.some((scene) => scene.status !== "lyrics_draft" && String(scene.prompt || "").trim());
  const storyDirectionLock = deriveStoryDirectionLockState({
    generationLocked,
    generationLockReason,
    scenesCreated,
    storyReviewStatus,
  });
  const storyLocked = storyDirectionLock.locked;
  const storyLockReason = storyDirectionLock.reason;

  const storyStatusLabel = storyStatusText(storyReviewStatus, storyChangeSource);

  const hasExistingStory = Boolean(project.storyPrompt?.trim());

  function handleCreateStoryClick() {
    if (hasExistingStory) {
      setShowFeedbackModal(true);
    } else {
      createStory();
    }
  }

  function handleFeedbackSubmit(feedback?: string) {
    setShowFeedbackModal(false);
    createStory(feedback);
  }

  return (
    <div className="customize-panel flex flex-col gap-[8px]">
      <StoryFeedbackModal
        open={showFeedbackModal}
        onSubmit={handleFeedbackSubmit}
        onClose={() => setShowFeedbackModal(false)}
      />

      <FieldBlock
        icon={BookText}
        label="Story"
        surface="card"
        action={
          <div className="flex items-center gap-[8px]">
            {storyStatusLabel ? (
              <span
                className={cn(
                  "inline-flex h-[24px] items-center gap-[6px] rounded-full border px-[8px] text-[11px] font-[800]",
                  storyReviewStatus === "dirty"
                    ? "border-[var(--editor-accent)] bg-[var(--editor-accent-soft)] text-[var(--editor-accent)]"
                    : "border-[var(--editor-line)] bg-[var(--editor-panel-soft)] text-[var(--editor-muted)]",
                )}
              >
                <span className="size-[6px] rounded-full bg-current" />
                {storyStatusLabel}
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleCreateStoryClick}
              disabled={creatingStory || storyLocked}
              title={storyLocked ? storyLockReason : undefined}
              className="inline-flex h-[31px] items-center gap-[6px] rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[10px] text-[12px] font-[800] text-[var(--editor-text)] hover:bg-[var(--editor-bg)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingStory ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Wand2 className="h-[14px] w-[14px]" />}
              {creatingStory ? "Creating..." : "Create new story"}
            </button>
          </div>
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
          rows={6}
          placeholder={"Act 1:\nA cinematic opening that establishes the character, world, and core visual motif.\n\nAct 2:\nThe emotional conflict grows and the visuals shift into a new space."}
          className="min-h-[136px] w-full resize-y rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[12px] py-[10px] text-[13px] font-[500] leading-[21px] text-[var(--editor-text)] outline-none placeholder:text-[var(--editor-muted)]/60 focus:border-[var(--editor-accent)] disabled:cursor-not-allowed disabled:bg-[var(--editor-panel-strong)] disabled:text-[var(--editor-muted)]"
        />
      </FieldBlock>

      <FieldBlock icon={PencilLine} label="Style" locked={storyLocked} lockReason={storyLockReason} surface="card">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[9px]">
          {STYLE_OPTIONS.map((style) => {
            const Icon = STYLE_ICON_BY_KEY[style.icon];
            const selected = project.artStyle === style.value;
            return (
              <button
                key={style.value}
                type="button"
                onClick={() => updateProjectField("artStyle", style.value)}
                disabled={storyLocked}
                title={storyLocked ? storyLockReason : undefined}
                className={cn(
                  "relative flex h-[45px] min-w-0 items-center gap-[10px] rounded-[6px] border px-[11px] pr-[28px] text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                  selected
                    ? "border-[var(--editor-accent)] bg-[var(--editor-accent-soft)] text-[var(--editor-text)] shadow-[inset_0_0_0_1px_var(--editor-accent)]"
                    : "border-[var(--editor-line)] bg-[var(--editor-panel)] text-[var(--editor-muted)] hover:bg-[var(--editor-bg)] hover:text-[var(--editor-text)]",
                )}
              >
                <span
                  className={cn(
                    "flex size-[25px] shrink-0 items-center justify-center rounded-[5px]",
                    selected ? "text-[var(--editor-accent)]" : "text-[var(--editor-subtle)]",
                  )}
                >
                  <Icon className="h-[15px] w-[15px]" />
                </span>
                <span className="min-w-0 truncate text-[12px] font-[800]">{style.label}</span>
                {selected ? (
                  <span className="absolute right-[8px] top-[7px] flex size-[15px] items-center justify-center rounded-full bg-[var(--editor-accent)] text-[var(--editor-accent-ink)]">
                    <Check className="h-[10px] w-[10px] stroke-[3]" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </FieldBlock>

      <FieldBlock icon={Monitor} label="Format" locked={storyLocked} lockReason={storyLockReason} surface="card">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[9px]">
          {FORMAT_OPTIONS.map((format) => {
            const FormatIcon = FORMAT_ICON_BY_KEY[format.icon];
            const selected = project.aspectRatio === format.value;
            return (
              <button
                key={format.value}
                type="button"
                onClick={() => updateProjectField("aspectRatio", format.value)}
                disabled={storyLocked}
                title={storyLocked ? storyLockReason : undefined}
                className={cn(
                  "relative flex h-[48px] min-w-0 items-center gap-[11px] rounded-[6px] border px-[12px] pr-[30px] text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                  selected
                    ? "border-[var(--editor-accent)] bg-[var(--editor-accent-soft)] text-[var(--editor-text)] shadow-[inset_0_0_0_1px_var(--editor-accent)]"
                    : "border-[var(--editor-line)] bg-[var(--editor-panel)] text-[var(--editor-muted)] hover:bg-[var(--editor-bg)] hover:text-[var(--editor-text)]",
                )}
              >
                <span className="flex size-[28px] shrink-0 items-center justify-center rounded-[5px] bg-[var(--editor-panel-strong)] text-[var(--editor-muted)]">
                  <FormatIcon className="h-[15px] w-[15px]" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-[900] leading-[15px]">{format.label}</span>
                  <span className="mt-[2px] block truncate text-[11px] font-[650] leading-[14px] text-[var(--editor-subtle)]">
                    {format.description}
                  </span>
                </span>
                {selected ? (
                  <span className="absolute right-[8px] top-[7px] flex size-[15px] items-center justify-center rounded-full bg-[var(--editor-accent)] text-[var(--editor-accent-ink)]">
                    <Check className="h-[10px] w-[10px] stroke-[3]" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </FieldBlock>

    </div>
  );
}

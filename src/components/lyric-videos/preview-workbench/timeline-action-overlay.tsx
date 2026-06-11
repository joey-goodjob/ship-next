"use client";

import { AlertCircle, Loader2, RefreshCcw, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import type { GenerationRun, GenerationStep, LyricExport, LyricScene, LyricVideoProject, RuntimeState, SaveStatus, StoryChangeSource, StoryReviewStatus } from "./types";
import { deriveGenerationProgress } from "./utils";

type TimelineOverlayAction = "confirm" | "apply" | "cancel" | "edit" | "generate" | "retry" | "refresh" | "none";

type TimelineActionOverlayInput = {
  generationLocked?: boolean;
  generationRun?: GenerationRun | null;
  generationSteps: GenerationStep[];
  latestExport?: LyricExport;
  loadError?: string;
  project: LyricVideoProject | null;
  runtimeState?: RuntimeState | null;
  saveStatus: SaveStatus;
  scenes: LyricScene[];
  storyConfirmation?: {
    source?: StoryChangeSource;
    status: StoryReviewStatus;
  };
};

type TimelineActionOverlayModel = {
  action: TimelineOverlayAction;
  buttonLabel: string;
  disabled: boolean;
  message: string;
  secondaryAction?: TimelineOverlayAction;
  secondaryButtonLabel?: string;
  tone: "default" | "danger" | "working";
  visible: boolean;
};

export function deriveTimelineActionOverlayModel(input: TimelineActionOverlayInput): TimelineActionOverlayModel {
  const { generationLocked = false, generationRun = null, generationSteps, latestExport, loadError = "", project, runtimeState, saveStatus, scenes, storyConfirmation } = input;
  const progress = deriveGenerationProgress({ project, generationRun, generationSteps, runtimeState, scenes });
  const continuing = saveStatus === "saving";
  const exportReady = project?.renderStatus === "ready" || latestExport?.status === "success";
  const scenesReady =
    (progress.total > 0 && progress.success === progress.total && progress.processing === 0 && progress.failed === 0) ||
    project?.scenesStatus === "ready" ||
    progress.imageStatus === "success";
  const currentStage = runtimeState?.currentStage || generationRun?.currentStage || project?.pipelineStage || "";
  const storyReady = progress.directionReady || currentStage === "direction_ready" || Boolean(project?.storyPrompt?.trim());
  const blockingError = loadError || progress.error || latestExport?.error || "";

  if (exportReady || scenesReady) {
    return hiddenModel();
  }

  if (blockingError) {
    if (progress.retryable) {
      return {
        action: "retry",
        buttonLabel: "Retry failed batches",
        disabled: continuing || generationLocked,
        message: blockingError,
        tone: "danger",
        visible: true,
      };
    }

    return {
      action: "refresh",
      buttonLabel: "Refresh",
      disabled: false,
      message: blockingError,
      tone: "danger",
      visible: true,
    };
  }

  if (progress.isActive) {
    return {
      action: "none",
      buttonLabel: "Generating...",
      disabled: true,
      message: "Generating scenes. You can leave this page and come back later.",
      tone: "working",
      visible: true,
    };
  }

  if (storyReady) {
    if (storyConfirmation?.status === "dirty") {
      const isAiStory = storyConfirmation.source === "ai_rewrite" || storyConfirmation.source === "ai_new_story";
      const message =
        storyConfirmation.source === "ai_rewrite"
          ? "AI updated the story based on your feedback. Review it before generating scenes."
          : storyConfirmation.source === "ai_new_story"
            ? "AI created a new story version. Review it before generating scenes."
            : "You changed the story. Apply your edits before generating scenes.";
      return {
        action: "apply",
        buttonLabel: isAiStory ? "Accept New Story" : "Apply Story Changes",
        disabled: generationLocked,
        message,
        secondaryAction: "cancel",
        secondaryButtonLabel: "Cancel",
        tone: "default",
        visible: true,
      };
    }

    if (storyConfirmation?.status === "confirmed") {
      return {
        action: "generate",
        buttonLabel: "Generate Scenes",
        disabled: generationLocked,
        message: "Story confirmed. Generate scenes when ready.",
        secondaryAction: "edit",
        secondaryButtonLabel: "Edit Story",
        tone: "default",
        visible: true,
      };
    }

    return {
      action: "confirm",
      buttonLabel: "Confirm Story",
      disabled: generationLocked,
      message: "Review the story on the right. Confirm it when you're happy with the direction.",
      tone: "default",
      visible: true,
    };
  }

  return hiddenModel();
}

export function TimelineActionOverlay() {
  const {
    applyStoryPromptChanges,
    cancelStoryPromptChanges,
    confirmStoryPrompt,
    editStoryPrompt,
    generateStoryboardPrompts,
    generationLocked,
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
    storyChangeSource,
    storyReviewStatus,
  } = useEditor();
  const model = deriveTimelineActionOverlayModel({
    generationLocked,
    generationRun,
    generationSteps,
    latestExport,
    loadError,
    project,
    runtimeState,
    saveStatus,
    scenes,
    storyConfirmation: { source: storyChangeSource, status: storyReviewStatus },
  });

  if (!model.visible) return null;

  async function handleAction() {
    if (model.disabled) return;
    if (model.action === "confirm") confirmStoryPrompt();
    if (model.action === "apply") applyStoryPromptChanges();
    if (model.action === "generate") await generateStoryboardPrompts();
    if (model.action === "retry") await retryFailedImageBatches();
    if (model.action === "refresh") await refresh();
  }

  function handleSecondaryAction() {
    if (!model.secondaryAction || model.disabled) return;
    if (model.secondaryAction === "cancel") cancelStoryPromptChanges();
    if (model.secondaryAction === "edit") editStoryPrompt();
  }

  return (
    <div className="timeline-action-overlay absolute inset-0 z-30 flex items-center justify-center bg-black/45 px-[16px] pb-[24px] backdrop-blur-[1px]">
      <div className="grid w-[min(760px,calc(100%-32px))] -translate-y-[10px] grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-[14px] rounded-[8px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[16px] py-[10px] shadow-[0_14px_44px_rgba(0,0,0,0.32)] max-[640px]:grid-cols-[30px_minmax(0,1fr)]">
        <div
          className={cn(
            "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full",
            model.tone === "danger" ? "bg-[var(--editor-danger-soft)] text-[var(--editor-danger)]" : "bg-[var(--editor-accent-soft)] text-[var(--editor-accent)]",
          )}
        >
          {model.tone === "danger" ? <AlertCircle className="h-[16px] w-[16px]" /> : model.tone === "working" ? <Loader2 className="h-[16px] w-[16px] animate-spin" /> : <Wand2 className="h-[16px] w-[16px]" />}
        </div>
        <p className={cn("min-w-0 text-center text-[13px] font-[800] leading-5", model.tone === "danger" ? "text-[var(--editor-danger)]" : "text-[var(--editor-text)]")}>
          {model.message}
        </p>
        <div className="flex shrink-0 items-center justify-end gap-[8px] max-[640px]:col-span-2 max-[640px]:w-full max-[640px]:justify-center">
          {model.secondaryAction ? (
            <button
              type="button"
              onClick={handleSecondaryAction}
              disabled={model.disabled}
              className="flex h-[34px] min-w-[96px] shrink-0 items-center justify-center rounded-[8px] border border-[var(--editor-line)] px-[14px] text-[13px] font-[900] text-[var(--editor-text)] transition-colors hover:bg-[var(--editor-bg)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {model.secondaryButtonLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleAction}
            disabled={model.disabled}
            className={cn(
              "flex h-[34px] min-w-[170px] shrink-0 items-center justify-center gap-[8px] rounded-[8px] px-[14px] text-[13px] font-[900] transition-colors disabled:cursor-not-allowed disabled:opacity-70 max-[640px]:min-w-0 max-[640px]:flex-1",
              model.tone === "danger"
                ? "bg-[var(--editor-danger)] text-white hover:opacity-90"
                : "bg-[var(--editor-accent)] text-[var(--editor-accent-ink)] hover:bg-[var(--editor-accent-hover)]",
            )}
          >
            {model.tone === "working" ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : model.action === "retry" || model.action === "refresh" ? <RefreshCcw className="h-[14px] w-[14px]" /> : null}
            {model.buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function hiddenModel(): TimelineActionOverlayModel {
  return {
    action: "none",
    buttonLabel: "",
    disabled: true,
    message: "",
    tone: "default",
    visible: false,
  };
}

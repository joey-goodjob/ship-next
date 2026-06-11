"use client";

import { cn } from "@/lib/utils";
import { DEFAULT_CAPTION_FONT_SIZE, MAX_CAPTION_FONT_SIZE, MIN_CAPTION_FONT_SIZE } from "./constants";
import { useEditor } from "./editor-context";
import { FieldBlock } from "./field-block";
import { PanelEmpty } from "./panel-empty";
import type { LyricPreviewConfig } from "./types";
import { normalizePreviewConfig } from "./utils";

export function FontPanel() {
  const { generationLocked, generationLockReason, project, updateProjectField } = useEditor();
  if (!project) return <PanelEmpty title="Project unavailable" description="Refresh the page or open a project from the library." />;

  const previewConfig = normalizePreviewConfig(project.previewConfig);

  function updatePreviewConfig(patch: Partial<LyricPreviewConfig>) {
    updateProjectField("previewConfig", { ...previewConfig, ...patch });
  }

  return (
    <div className="font-panel flex flex-col gap-[22px]">
      <FieldBlock
        label="Subtitles"
        locked={generationLocked}
        lockReason={generationLockReason}
        action={
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
        }
      >
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
      </FieldBlock>
    </div>
  );
}

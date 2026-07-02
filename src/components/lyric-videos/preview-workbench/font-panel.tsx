"use client";

import { useEffect } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  Bold,
  Italic,
  PanelBottom,
  PanelTop,
  Underline,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CAPTION_FONT_OPTIONS,
  DEFAULT_CAPTION_FONT_SIZE,
  MAX_CAPTION_FONT_SIZE,
  MIN_CAPTION_FONT_SIZE,
} from "./constants";
import { useEditor } from "./editor-context";
import { FieldBlock } from "./field-block";
import { PanelEmpty } from "./panel-empty";
import type { LyricPreviewConfig } from "./types";
import { normalizePreviewConfig } from "./utils";

const FONT_LINK_ID = "lyric-video-caption-fonts";

function googleFontHref() {
  const families = CAPTION_FONT_OPTIONS.map((option) => `family=${option.value.replace(/\s+/g, "+")}`);
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

export function FontPanel() {
  const { generationLocked, generationLockReason, project, updateProjectField } = useEditor();

  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = googleFontHref();
    document.head.appendChild(link);
  }, []);

  if (!project) return <PanelEmpty title="Project unavailable" description="Refresh the page or open a project from the library." />;

  const previewConfig = normalizePreviewConfig(project.previewConfig);
  const controlsDisabled = !previewConfig.captionsEnabled || generationLocked;

  function updatePreviewConfig(patch: Partial<LyricPreviewConfig>) {
    updateProjectField("previewConfig", { ...previewConfig, ...patch });
  }

  return (
    <div className="font-panel flex flex-col gap-[14px]">
      <FieldBlock
        label="Subtitles"
        locked={generationLocked}
        lockReason={generationLockReason}
        action={
          <SwitchControl
            checked={Boolean(previewConfig.captionsEnabled)}
            disabled={generationLocked}
            label={previewConfig.captionsEnabled ? "Turn subtitles off" : "Turn subtitles on"}
            lockReason={generationLockReason}
            onClick={() => updatePreviewConfig({ captionsEnabled: !previewConfig.captionsEnabled })}
          />
        }
      >
        <span className="sr-only">Subtitle visibility toggle</span>
      </FieldBlock>

      <FieldBlock label="Font" locked={generationLocked} lockReason={generationLockReason}>
        <div className={panelClassName(controlsDisabled)}>
          <SelectRow
            disabled={controlsDisabled}
            label="Font Family"
            onChange={(value) => updatePreviewConfig({ fontFamily: value })}
            options={CAPTION_FONT_OPTIONS}
            value={previewConfig.fontFamily || "Inter"}
          />
          <SegmentRow
            disabled={controlsDisabled}
            label="Font Style"
            options={[
              { icon: Bold, label: "Bold", value: "bold" },
              { icon: Italic, label: "Italic", value: "italic" },
              { icon: Underline, label: "Underline", value: "underline" },
            ]}
            selectedValues={[
              previewConfig.fontWeight && previewConfig.fontWeight >= 900 ? "bold" : "",
              previewConfig.italic ? "italic" : "",
              previewConfig.underline ? "underline" : "",
            ]}
            onToggle={(value) => {
              if (value === "bold") updatePreviewConfig({ fontWeight: previewConfig.fontWeight && previewConfig.fontWeight >= 900 ? 850 : 950 });
              if (value === "italic") updatePreviewConfig({ italic: !previewConfig.italic });
              if (value === "underline") updatePreviewConfig({ underline: !previewConfig.underline });
            }}
          />
          <ColorRow disabled={controlsDisabled} label="Color" onChange={(value) => updatePreviewConfig({ textColor: value })} value={previewConfig.textColor || "#ffffff"} />
          <RangeRow
            disabled={controlsDisabled}
            label="Size"
            max={MAX_CAPTION_FONT_SIZE}
            min={MIN_CAPTION_FONT_SIZE}
            onChange={(value) => updatePreviewConfig({ fontSize: value })}
            value={previewConfig.fontSize || DEFAULT_CAPTION_FONT_SIZE}
          />
          <RangeRow
            disabled={controlsDisabled}
            label="Letter Spacing"
            max={12}
            min={-4}
            onChange={(value) => updatePreviewConfig({ letterSpacing: value })}
            suffix="px"
            value={previewConfig.letterSpacing || 0}
          />
          <RangeRow
            disabled={controlsDisabled}
            label="Line Spacing"
            max={24}
            min={-10}
            onChange={(value) => updatePreviewConfig({ lineSpacing: value })}
            value={previewConfig.lineSpacing || 0}
          />
          <SegmentRow
            disabled={controlsDisabled}
            label="Font Case"
            onSelect={(value) => updatePreviewConfig({ fontCase: value })}
            options={[
              { label: "Aa", value: "capitalize" },
              { label: "AA", value: "uppercase" },
              { label: "aa", value: "lowercase" },
            ]}
            value={previewConfig.fontCase === "none" ? "capitalize" : previewConfig.fontCase || "capitalize"}
          />
          <SegmentRow
            disabled={controlsDisabled}
            label="Alignment"
            onSelect={(value) => updatePreviewConfig({ alignment: value })}
            options={[
              { icon: AlignLeft, label: "Left", value: "left" },
              { icon: AlignCenter, label: "Center", value: "center" },
              { icon: AlignRight, label: "Right", value: "right" },
            ]}
            value={previewConfig.alignment || "center"}
          />
          <SegmentRow
            disabled={controlsDisabled}
            label="Anchor"
            onSelect={(value) => updatePreviewConfig({ position: value })}
            options={[
              { icon: PanelTop, label: "Top", value: "top" },
              { icon: AlignVerticalJustifyCenter, label: "Center", value: "center" },
              { icon: PanelBottom, label: "Bottom", value: "bottom" },
            ]}
            value={previewConfig.position || "bottom"}
          />
          <RangeRow
            disabled={controlsDisabled}
            label="Rotation Angle"
            max={45}
            min={-45}
            onChange={(value) => updatePreviewConfig({ rotation: value })}
            suffix="deg"
            value={previewConfig.rotation || 0}
          />
        </div>
      </FieldBlock>
    </div>
  );
}

function panelClassName(disabled: boolean) {
  return cn(
    "caption-tool-panel flex flex-col gap-[12px] rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[12px] py-[12px]",
    disabled && "bg-[var(--editor-panel-soft)] opacity-60",
  );
}

function SwitchControl({
  checked,
  disabled,
  label,
  lockReason,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  lockReason?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? lockReason : undefined}
      className={cn(
        "flex h-[20px] w-[34px] shrink-0 items-center rounded-full p-[2px] transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "justify-end bg-[var(--editor-accent)]" : "justify-start bg-[var(--editor-line)]",
      )}
      aria-label={label}
      aria-pressed={checked}
    >
      <span className="size-[16px] rounded-full bg-[var(--editor-panel)] shadow-sm" />
    </button>
  );
}

function RangeRow({
  className,
  disabled,
  label,
  max,
  min,
  onChange,
  suffix = "",
  value,
}: {
  className?: string;
  disabled?: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  suffix?: string;
  value: number;
}) {
  function handleChange(rawValue: string) {
    const numeric = Number(rawValue);
    if (Number.isFinite(numeric)) onChange(numeric);
  }

  return (
    <label className={cn("caption-control-row grid min-h-[42px] grid-cols-[108px_minmax(120px,1fr)_56px] items-center gap-[10px]", className)}>
      <span className="justify-self-end text-right text-[12px] font-[800] text-[var(--editor-text)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => handleChange(event.target.value)}
        className="h-[20px] min-w-0 accent-[var(--editor-accent)] disabled:cursor-not-allowed"
        aria-label={label}
      />
      <span className="relative">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(event) => handleChange(event.target.value)}
          className={cn(
            "h-[34px] w-full rounded-[6px] border border-[var(--editor-line)] bg-[#0b0b0f] px-[7px] text-right text-[13px] font-[850] text-[var(--editor-text)] outline-none focus:border-[var(--editor-accent)] disabled:cursor-not-allowed",
            suffix && "pr-[22px]",
          )}
          aria-label={`${label} value`}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-[6px] top-1/2 -translate-y-1/2 text-[10px] font-[750] text-[var(--editor-muted)]">
            {suffix}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function ColorRow({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="caption-control-row grid min-h-[38px] grid-cols-[108px_minmax(120px,1fr)] items-center gap-[10px]">
      <span className="justify-self-end text-right text-[12px] font-[800] text-[var(--editor-text)]">{label}</span>
      <span className="flex min-w-0 items-center gap-[8px]">
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-[34px] w-[44px] rounded-[6px] border border-[var(--editor-line)] bg-transparent disabled:cursor-not-allowed"
          aria-label={`${label} swatch`}
        />
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-[34px] min-w-0 flex-1 rounded-[6px] border border-[var(--editor-line)] bg-[#0b0b0f] px-[8px] text-[12px] font-[750] text-[var(--editor-text)] outline-none focus:border-[var(--editor-accent)] disabled:cursor-not-allowed"
          aria-label={label}
        />
      </span>
    </label>
  );
}

function SelectRow({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ label: string; sample?: string; value: string }>;
  value: string;
}) {
  return (
    <label className="caption-control-row grid min-h-[38px] grid-cols-[108px_minmax(120px,1fr)] items-center gap-[10px]">
      <span className="justify-self-end text-right text-[12px] font-[800] text-[var(--editor-text)]">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-[36px] min-w-0 rounded-[6px] border border-[var(--editor-line)] bg-[#0b0b0f] px-[10px] text-[12px] font-[850] text-[var(--editor-text)] outline-none focus:border-[var(--editor-accent)] disabled:cursor-not-allowed"
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SegmentRow({
  disabled,
  label,
  onSelect,
  onToggle,
  options,
  selectedValues = [],
  value,
}: {
  disabled?: boolean;
  label: string;
  onSelect?: (value: string) => void;
  onToggle?: (value: string) => void;
  options: Array<{ icon?: LucideIcon; label: string; value: string }>;
  selectedValues?: string[];
  value?: string;
}) {
  return (
    <div className="caption-control-row grid min-h-[38px] grid-cols-[108px_minmax(120px,1fr)] items-center gap-[10px]">
      <span className="justify-self-end text-right text-[12px] font-[800] text-[var(--editor-text)]">{label}</span>
      <div className="caption-segmented-control inline-grid w-fit max-w-full auto-cols-[48px] grid-flow-col gap-[3px] rounded-[6px] bg-[#07070a] p-[4px]">
        {options.map((option) => {
          const selected = value ? value === option.value : selectedValues.includes(option.value);
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              title={option.label}
              onClick={() => (onSelect ? onSelect(option.value) : onToggle?.(option.value))}
              className={cn(
                "flex h-[28px] items-center justify-center rounded-[5px] px-[7px] text-[11px] font-[850] transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                selected
                  ? "bg-[var(--editor-panel-strong)] text-[var(--editor-text)]"
                  : "text-[var(--editor-muted)] hover:bg-[var(--editor-panel-soft)] hover:text-[var(--editor-text)]",
              )}
              aria-pressed={selected}
              aria-label={option.label}
            >
              {Icon ? <Icon className="h-[14px] w-[14px]" aria-hidden="true" /> : option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

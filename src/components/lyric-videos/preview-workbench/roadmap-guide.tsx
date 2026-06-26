"use client";

import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CircleCheck,
  Clapperboard,
  FileText,
  Image as ImageIcon,
  Loader2,
  Music,
  RefreshCcw,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import type { PanelTab } from "./types";
import { deriveGenerationProgress } from "./utils";

type GuideTone = "action" | "wait" | "done";

type CurrentStep = {
  key: string;
  index: number;
  stageLabel: string;
  icon: ComponentType<{ className?: string }>;
  action: string;
  how: string;
  ctaText: string;
  ctaIcon: ComponentType<{ className?: string }>;
  tone: GuideTone;
  onCta: (() => void) | null;
  ctaDisabled?: boolean;
};

const TOTAL_STEPS = 5;
const STEP_KEYS = ["lyrics", "story", "scenes", "images", "export"] as const;
const STEP_ICONS: Record<(typeof STEP_KEYS)[number], ComponentType<{ className?: string }>> = {
  lyrics: Music,
  story: FileText,
  scenes: Clapperboard,
  images: ImageIcon,
  export: Upload,
};
const STEP_TABS: Record<(typeof STEP_KEYS)[number], PanelTab | null> = {
  lyrics: "lyrics",
  story: "customize",
  scenes: "scenes",
  images: "scenes",
  export: null,
};

export function RoadmapGuide() {
  const t = useTranslations("dashboard.workbench.roadmap");
  const {
    exporting,
    generationLocked,
    generationLockReason,
    generationRun,
    generationSteps,
    latestExport,
    lines,
    project,
    queueExport,
    runtimeState,
    scenes,
    setActiveTab,
    storyReviewStatus,
    words,
  } = useEditor();
  const [collapsed, setCollapsed] = useState(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  const current = useMemo<CurrentStep>(() => {
    const progress = deriveGenerationProgress({ project, generationRun, generationSteps, runtimeState, scenes });
    const go = (tab: PanelTab) => () => setActiveTab(tab);

    const lyricsDone = lines.length > 0 || words.length > 0 || project?.lyricsStatus === "ready";
    const storyDone =
      storyReviewStatus === "confirmed" || progress.total > 0 || progress.directionReady || Boolean(project?.storyPrompt?.trim());
    const scenesDone = progress.total > 0 || project?.scenesStatus === "ready";
    const imagesDone =
      progress.total > 0 && progress.success === progress.total && progress.processing === 0 && progress.failed === 0;
    const exportDone =
      project?.renderStatus === "ready" || latestExport?.status === "ready" || runtimeState?.latestExportStatus === "ready";

    if (!lyricsDone) {
      return { key: "lyrics", index: 0, stageLabel: t("stage_lyrics"), icon: Music, action: t("lyrics_action"), how: t("lyrics_how"), ctaText: t("lyrics_cta"), ctaIcon: ArrowRight, tone: "action", onCta: go("lyrics") };
    }
    if (!storyDone) {
      return { key: "story", index: 1, stageLabel: t("stage_story"), icon: FileText, action: t("story_action"), how: t("story_how"), ctaText: t("story_cta"), ctaIcon: ArrowRight, tone: "action", onCta: go("customize") };
    }
    if (!scenesDone) {
      return { key: "scenes", index: 2, stageLabel: t("stage_scenes"), icon: Clapperboard, action: t("scenes_action"), how: t("scenes_how"), ctaText: t("scenes_cta"), ctaIcon: ArrowRight, tone: "action", onCta: go("scenes") };
    }
    if (!imagesDone) {
      if (progress.isActive || progress.processing > 0) {
        return { key: "images-wait", index: 3, stageLabel: t("stage_images"), icon: Loader2, action: t("images_wait_action", { success: progress.success, total: progress.total }), how: t("images_wait_how"), ctaText: t("images_wait_cta"), ctaIcon: ArrowRight, tone: "wait", onCta: go("cast") };
      }
      if (progress.failed > 0) {
        return { key: "images-retry", index: 3, stageLabel: t("stage_images"), icon: RefreshCcw, action: t("images_retry_action", { failed: progress.failed }), how: t("images_retry_how"), ctaText: t("images_retry_cta"), ctaIcon: RefreshCcw, tone: "action", onCta: go("scenes") };
      }
      return { key: "images", index: 3, stageLabel: t("stage_images"), icon: ImageIcon, action: t("images_action"), how: t("images_how"), ctaText: t("images_cta"), ctaIcon: ArrowRight, tone: "action", onCta: go("scenes") };
    }
    if (!exportDone) {
      return {
        key: "export",
        index: 4,
        stageLabel: t("stage_export"),
        icon: Upload,
        action: exporting ? t("export_action_busy") : t("export_action"),
        how: exporting ? t("export_how_busy") : t("export_how"),
        ctaText: exporting ? t("export_cta_busy") : t("export_cta"),
        ctaIcon: exporting ? Loader2 : Upload,
        tone: "action",
        onCta: () => {
          void queueExport();
        },
        ctaDisabled: exporting || generationLocked,
      };
    }
    return { key: "done", index: TOTAL_STEPS, stageLabel: t("stage_done"), icon: CircleCheck, action: t("done_action"), how: t("done_how"), ctaText: "", ctaIcon: CircleCheck, tone: "done", onCta: null };
  }, [exporting, generationLocked, generationRun, generationSteps, latestExport, lines.length, project, queueExport, runtimeState, scenes, setActiveTab, storyReviewStatus, t, words.length]);

  const currentIndex = current.index;
  const effectiveIndex = viewIndex === null ? currentIndex : Math.min(viewIndex, currentIndex);
  const viewingCurrent = effectiveIndex === currentIndex;

  const view = useMemo(() => {
    if (viewingCurrent) {
      return {
        tone: current.tone,
        stageLabel: current.key === "done" ? "" : current.stageLabel,
        tileIcon: current.icon,
        action: current.action,
        how: current.how,
        ctaText: current.ctaText,
        ctaIcon: current.ctaIcon,
        onCta: current.onCta,
        ctaDisabled: current.ctaDisabled,
        spinTile: current.tone === "wait",
        spinCta: current.key === "export" && exporting,
        badge: current.tone === "done" ? t("badge_completed", { n: TOTAL_STEPS, total: TOTAL_STEPS }) : t("badge_next", { n: Math.min(currentIndex + 1, TOTAL_STEPS), total: TOTAL_STEPS }),
      };
    }
    const key = STEP_KEYS[effectiveIndex];
    const tab = STEP_TABS[key];
    return {
      tone: "done" as GuideTone,
      stageLabel: t(`stage_${key}`),
      tileIcon: Check,
      action: t(`${key}_done_title`),
      how: t(`${key}_done_how`),
      ctaText: t(`${key}_review_cta`),
      ctaIcon: ArrowRight,
      onCta: tab ? () => setActiveTab(tab) : null,
      ctaDisabled: false,
      spinTile: false,
      spinCta: false,
      badge: t("badge_completed", { n: effectiveIndex + 1, total: TOTAL_STEPS }),
    };
  }, [current, currentIndex, effectiveIndex, exporting, setActiveTab, t, viewingCurrent]);

  const TileIcon = view.tileIcon;
  const CtaIcon = view.ctaIcon;
  const isDone = view.tone === "done";
  const accentVar = isDone ? "var(--editor-success)" : "var(--editor-accent)";
  const showNav = currentIndex > 0;

  return (
    <div
      className="w-[300px] rounded-[14px] border bg-[var(--editor-panel)] p-[16px] shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
      style={{ borderColor: isDone ? "color-mix(in oklch, var(--editor-success) 45%, transparent)" : "color-mix(in oklch, var(--editor-accent) 50%, transparent)" }}
    >
      <div className="flex items-center gap-[7px]">
        <span
          className="rounded-full px-[9px] py-[3px] text-[11px] font-[800]"
          style={{ color: accentVar, background: isDone ? "var(--editor-success-soft)" : "var(--editor-accent-soft)" }}
        >
          {view.badge}
        </span>
        <span className="ml-auto text-[11px] font-[700] text-[var(--editor-subtle)]">{view.stageLabel}</span>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? t("expand") : t("collapse")}
          className="flex h-[20px] w-[20px] items-center justify-center rounded-[4px] text-[var(--editor-subtle)] hover:bg-[var(--editor-panel-strong)] hover:text-[var(--editor-text)]"
        >
          {collapsed ? <ChevronDown className="h-[15px] w-[15px]" /> : <ChevronUp className="h-[15px] w-[15px]" />}
        </button>
      </div>

      {collapsed ? null : (
        <>
          <div className="mt-[12px] flex gap-[11px]">
            <span
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px]"
              style={{ background: accentVar, color: isDone ? "#fff" : "var(--editor-accent-ink)" }}
            >
              <TileIcon className={cn("h-[19px] w-[19px]", view.spinTile && "animate-spin")} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-[800] leading-[1.3] text-[var(--editor-text)]">{view.action}</p>
              <p className="mt-[4px] text-[12px] font-[600] leading-[1.45] text-[var(--editor-muted)]">{view.how}</p>
            </div>
          </div>

          {view.onCta && view.ctaText ? (
            <button
              type="button"
              onClick={view.onCta}
              disabled={view.ctaDisabled}
              title={view.ctaDisabled && generationLocked ? generationLockReason : undefined}
              className="mt-[14px] flex h-[40px] w-full items-center justify-center gap-[6px] rounded-[9px] text-[13px] font-[800] text-[var(--editor-accent-ink)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: accentVar }}
            >
              {view.ctaText}
              <CtaIcon className={cn("h-[15px] w-[15px]", view.spinCta && "animate-spin")} />
            </button>
          ) : null}

          <div className="mt-[14px] flex items-center justify-center gap-[6px]">
            {STEP_KEYS.map((key, dotIndex) => {
              const reached = dotIndex < currentIndex;
              const isViewing = dotIndex === effectiveIndex;
              const background = reached ? "var(--editor-success)" : dotIndex === currentIndex && !isDone ? "var(--editor-accent)" : "var(--editor-line)";
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={t(`stage_${key}`)}
                  disabled={dotIndex > currentIndex}
                  onClick={() => setViewIndex(dotIndex === currentIndex ? null : dotIndex)}
                  className="rounded-full transition-all disabled:cursor-not-allowed"
                  style={{ height: "7px", width: isViewing ? "20px" : "7px", background, opacity: dotIndex > currentIndex ? 0.5 : 1 }}
                />
              );
            })}
          </div>

          {showNav ? (
            <div className="mt-[10px] flex items-center justify-between">
              <button
                type="button"
                disabled={effectiveIndex === 0}
                onClick={() => setViewIndex(Math.max(0, effectiveIndex - 1))}
                className="flex items-center gap-[3px] text-[11px] font-[700] text-[var(--editor-subtle)] hover:text-[var(--editor-text)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-[13px] w-[13px]" />
                {t("nav_prev")}
              </button>
              {!viewingCurrent ? (
                <button
                  type="button"
                  onClick={() => setViewIndex(null)}
                  className="flex items-center gap-[3px] text-[11px] font-[800] text-[var(--editor-accent)] hover:opacity-80"
                >
                  {t("nav_back")}
                  <ArrowRight className="h-[13px] w-[13px]" />
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

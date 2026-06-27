"use client";

import { useEffect, useMemo } from "react";
import type { ComponentType } from "react";
import { Activity, Clapperboard, Download, FileText, Settings, Type, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { CastPanel } from "./cast-panel";
import { CustomizePanel } from "./customize-panel";
import { DiagnosticsPanel } from "./diagnostics-panel";
import { useEditor } from "./editor-context";
import { ExportsPanel } from "./exports-panel";
import { getVisiblePanelTabs } from "./export-versions-model";
import { FontPanel } from "./font-panel";
import { LyricsPanel } from "./lyrics-panel";
import { ScenesPanel } from "./scenes-panel";
import type { GenerationRun, GenerationStep, LyricScene, LyricVideoProject, PanelTab, RuntimeState } from "./types";
import { deriveGenerationProgress } from "./utils";

const SHOW_DIAGNOSTICS_TAB = process.env.NODE_ENV === "development";

const DIAGNOSTICS_TAB: { id: PanelTab; label: string; icon: ComponentType<{ className?: string }> } = {
  id: "diagnostics",
  label: "诊断",
  icon: Activity,
};

const PANEL_TAB_ICONS: Record<PanelTab, ComponentType<{ className?: string }>> = {
  customize: Settings,
  lyrics: FileText,
  font: Type,
  cast: Users,
  scenes: Clapperboard,
  exports: Download,
  diagnostics: Activity,
};

type VisiblePanelTabsInput = {
  generationRun?: GenerationRun | null;
  generationSteps: GenerationStep[];
  project: LyricVideoProject | null;
  runtimeState?: RuntimeState | null;
  scenes: LyricScene[];
};

export function deriveVisiblePanelTabs(input: VisiblePanelTabsInput) {
  const { generationRun = null, generationSteps, project, runtimeState, scenes } = input;
  const panelTabs = getVisiblePanelTabs({ showDiagnostics: SHOW_DIAGNOSTICS_TAB });
  const progress = deriveGenerationProgress({ project, generationRun, generationSteps, runtimeState, scenes });
  const exportReady = project?.renderStatus === "ready" || runtimeState?.latestExportStatus === "ready";
  const scenesReady =
    (progress.total > 0 && progress.success === progress.total && progress.processing === 0 && progress.failed === 0) ||
    project?.scenesStatus === "ready" ||
    progress.imageStatus === "success";
  const currentStage = runtimeState?.currentStage || generationRun?.currentStage || project?.pipelineStage || "";
  const storyReady = progress.directionReady || currentStage === "direction_ready" || Boolean(project?.storyPrompt?.trim());
  const storyReviewMode = storyReady && !progress.isActive && !progress.error && !scenesReady && !exportReady;

  if (!storyReviewMode) return panelTabs;
  const storyReviewTabIds: PanelTab[] = SHOW_DIAGNOSTICS_TAB ? ["customize", "cast", "diagnostics"] : ["customize", "cast"];
  return panelTabs.filter((tab) => storyReviewTabIds.includes(tab.id));
}

export function SidePanel({ width }: { width: number }) {
  const { activeTab, generationRun, generationSteps, project, runtimeState, scenes, setActiveTab } = useEditor();
  const tabs = deriveVisiblePanelTabs({ generationRun, generationSteps, project, runtimeState, scenes });
  const visibleTabIds = useMemo(() => new Set(tabs.map((tab) => tab.id)), [tabs]);
  const effectiveActiveTab = visibleTabIds.has(activeTab) ? activeTab : "customize";

  useEffect(() => {
    if (!visibleTabIds.has(activeTab)) setActiveTab("customize");
  }, [activeTab, setActiveTab, visibleTabIds]);

  return (
    <aside
      className="side-panel h-full shrink-0 overflow-hidden border-l border-[var(--editor-line)] bg-[var(--editor-panel)]"
      style={{ width }}
    >
      <div className="flex h-[52px] items-end gap-[24px] border-b border-[var(--editor-line)] px-[24px]">
        {tabs.map((tab) => {
          const Icon = PANEL_TAB_ICONS[tab.id] || DIAGNOSTICS_TAB.icon;
          const active = effectiveActiveTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex h-[52px] items-center gap-[7px] border-b-[2px] text-[14px] font-[800] outline-none focus-visible:rounded-[4px] focus-visible:ring-2 focus-visible:ring-[var(--editor-accent-soft)]",
                active ? "border-[var(--editor-text)] text-[var(--editor-text)]" : "border-transparent text-[var(--editor-subtle)]",
              )}
            >
              <Icon className="h-[15px] w-[15px]" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="h-[calc(100%-52px)] overflow-y-auto px-[24px] py-[18px]">
        {effectiveActiveTab === "customize" ? <CustomizePanel /> : null}
        {effectiveActiveTab === "lyrics" ? <LyricsPanel /> : null}
        {effectiveActiveTab === "font" ? <FontPanel /> : null}
        {effectiveActiveTab === "cast" ? <CastPanel /> : null}
        {effectiveActiveTab === "scenes" ? <ScenesPanel /> : null}
        {effectiveActiveTab === "exports" ? <ExportsPanel /> : null}
        {SHOW_DIAGNOSTICS_TAB && effectiveActiveTab === "diagnostics" ? <DiagnosticsPanel /> : null}
      </div>
    </aside>
  );
}

"use client";

import type { ComponentType } from "react";
import { Activity, Clapperboard, FileText, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { CastPanel } from "./cast-panel";
import { CustomizePanel } from "./customize-panel";
import { DiagnosticsPanel } from "./diagnostics-panel";
import { useEditor } from "./editor-context";
import { LyricsPanel } from "./lyrics-panel";
import { ScenesPanel } from "./scenes-panel";
import type { PanelTab } from "./types";

export function SidePanel({ width }: { width: number }) {
  const { activeTab, setActiveTab } = useEditor();
  const tabs: Array<{ id: PanelTab; label: string; icon: ComponentType<{ className?: string }> }> = [
    { id: "customize", label: "Customize", icon: Settings },
    { id: "lyrics", label: "Lyrics", icon: FileText },
    { id: "cast", label: "Cast", icon: Users },
    { id: "scenes", label: "Scenes", icon: Clapperboard },
    { id: "diagnostics", label: "诊断", icon: Activity },
  ];

  return (
    <aside
      className="side-panel h-full shrink-0 overflow-hidden border-l border-[var(--editor-line)] bg-[var(--editor-panel)]"
      style={{ width }}
    >
      <div className="flex h-[52px] items-end gap-[24px] border-b border-[var(--editor-line)] px-[24px]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
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
        {activeTab === "customize" ? <CustomizePanel /> : null}
        {activeTab === "lyrics" ? <LyricsPanel /> : null}
        {activeTab === "cast" ? <CastPanel /> : null}
        {activeTab === "scenes" ? <ScenesPanel /> : null}
        {activeTab === "diagnostics" ? <DiagnosticsPanel /> : null}
      </div>
    </aside>
  );
}

"use client";

import { useState } from "react";
import type { PointerEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { AudioUploadTrim } from "@/components/audio-upload-trim";
import { Link } from "@/core/i18n/navigation";
import { DEFAULT_TIMELINE_HEIGHT, SIDE_PANEL_WIDTH_KEY, TIMELINE_HEIGHT_KEY } from "./constants";
import { useEditor } from "./editor-context";
import { HorizontalResizeHandle, VerticalResizeHandle } from "./resize-handles";
import { PlaybackControls } from "./playback-controls";
import { SidePanel } from "./side-panel";
import { StatusBar } from "./status-bar";
import { Timeline } from "./timeline";
import { TopNavBar } from "./top-nav-bar";
import { VideoPreview } from "./video-preview";
import { clamp, defaultSidePanelWidth, readStoredNumber } from "./utils";

export function EditorWorkspace() {
  const { loadError, loading, preparingAudio, project, uploadAndTranscribe } = useEditor();
  const [sidePanelWidth, setSidePanelWidth] = useState(() =>
    clamp(readStoredNumber(SIDE_PANEL_WIDTH_KEY, defaultSidePanelWidth()), 360, 900),
  );
  const [timelineHeight, setTimelineHeight] = useState(() =>
    clamp(readStoredNumber(TIMELINE_HEIGHT_KEY, DEFAULT_TIMELINE_HEIGHT), 72, 240),
  );

  function startSidePanelResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidePanelWidth;
    const maxWidth = Math.max(360, Math.min(900, window.innerWidth - 420));
    let latestWidth = startWidth;

    function move(moveEvent: globalThis.PointerEvent) {
      const nextWidth = clamp(startWidth - (moveEvent.clientX - startX), 360, maxWidth);
      latestWidth = nextWidth;
      setSidePanelWidth(nextWidth);
    }

    function stop() {
      window.localStorage.setItem(SIDE_PANEL_WIDTH_KEY, String(Math.round(latestWidth)));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  function startTimelineResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = timelineHeight;
    const maxHeight = Math.max(72, Math.min(260, window.innerHeight - 360));
    let latestHeight = startHeight;

    function move(moveEvent: globalThis.PointerEvent) {
      const nextHeight = clamp(startHeight - (moveEvent.clientY - startY), 72, maxHeight);
      latestHeight = nextHeight;
      setTimelineHeight(nextHeight);
    }

    function stop() {
      window.localStorage.setItem(TIMELINE_HEIGHT_KEY, String(Math.round(latestHeight)));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  const hasAudio = Boolean(project?.originalAudioUrl || project?.audioUrl || project?.processedAudioUrl);

  return (
    <div className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen flex-col overflow-hidden bg-white font-sans">
      <TopNavBar />
      {loading && !project ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[#F8F9FA]">
          <div className="flex flex-col items-center gap-3 text-[#667085]">
            <Loader2 className="size-8 animate-spin text-[#F5A623]" />
            <span className="text-sm font-bold">Loading project...</span>
          </div>
        </div>
      ) : loadError && !project ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[#F8F9FA] px-6 text-center">
          <div className="max-w-md rounded-[8px] border border-red-200 bg-white p-6 shadow-sm">
            <AlertCircle className="mx-auto mb-3 size-8 text-red-500" />
            <h1 className="text-lg font-bold text-[#1A1A2E]">Project not available</h1>
            <p className="mt-2 text-sm leading-6 text-[#667085]">{loadError}</p>
            <Link
              href="/"
              className="mt-4 inline-flex h-9 items-center rounded-[6px] bg-[#F5A623] px-4 text-sm font-bold text-white"
            >
              Back home
            </Link>
          </div>
        </div>
      ) : project && !hasAudio ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#F8F9FA]">
          <AudioUploadTrim
            showBack={false}
            onGenerate={uploadAndTranscribe}
            creditCost={10}
            generateLabel="Generate direction (10 credits)"
            workingLabel={preparingAudio ? "Preparing lyrics and story direction..." : "Uploading audio..."}
            successLabel="Direction ready"
          />
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1">
            <VideoPreview />
            <VerticalResizeHandle onPointerDown={startSidePanelResize} />
            <SidePanel width={sidePanelWidth} />
          </div>
          <HorizontalResizeHandle onPointerDown={startTimelineResize} />
          <PlaybackControls />
          <Timeline height={timelineHeight} />
          <StatusBar />
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { AudioUploadTrim } from "@/components/audio-upload-trim";
import { Link } from "@/core/i18n/navigation";
import { DEFAULT_TIMELINE_HEIGHT, SIDE_PANEL_WIDTH_KEY, TIMELINE_HEIGHT_KEY } from "./constants";
import { useEditor } from "./editor-context";
import { ExportStatusDialog } from "./export-status-dialog";
import { HorizontalResizeHandle, VerticalResizeHandle } from "./resize-handles";
import { PlaybackControls } from "./playback-controls";
import { SidePanel } from "./side-panel";
import { TimelineActionOverlay } from "./timeline-action-overlay";
import { Timeline } from "./timeline";
import { TopNavBar } from "./top-nav-bar";
import { VideoPreview } from "./video-preview";
import { clamp, defaultSidePanelWidth, readStoredNumber } from "./utils";

export function EditorWorkspace() {
  const { exportError, exporting, latestExport, loadError, loading, preparingAudio, project, uploadAndTranscribe } = useEditor();
  const wasExportingRef = useRef(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
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

  async function handleUploadAndTranscribe(
    file: File | null,
    startTime: number,
    endTime: number,
    options: { useEntireAudio: boolean; durationSeconds: number },
  ) {
    if (!file) throw new Error("Choose an audio file first");
    await uploadAndTranscribe(file, startTime, endTime, options);
  }

  const hasAudio = Boolean(project?.originalAudioUrl || project?.audioUrl || project?.processedAudioUrl);

  useEffect(() => {
    if (exporting && !wasExportingRef.current) {
      setExportDialogOpen(true);
    }
    wasExportingRef.current = exporting;
  }, [exporting]);

  return (
    <div className="editor-workspace fixed inset-0 z-[9999] flex h-[100dvh] w-screen flex-col overflow-hidden bg-[var(--editor-panel)] font-sans">
      <TopNavBar />
      {loading && !project ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--editor-bg)]">
          <div className="flex flex-col items-center gap-3 text-[var(--editor-muted)]">
            <Loader2 className="size-8 animate-spin text-[var(--editor-accent)]" />
            <span className="text-sm font-bold">Loading project...</span>
          </div>
        </div>
      ) : loadError && !project ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--editor-bg)] px-6 text-center">
          <div className="max-w-md rounded-[8px] border border-[var(--editor-danger)] bg-[var(--editor-panel)] p-6 shadow-sm">
            <AlertCircle className="mx-auto mb-3 size-8 text-[var(--editor-danger)]" />
            <h1 className="text-lg font-bold text-[var(--editor-text)]">Project not available</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--editor-muted)]">{loadError}</p>
            <Link
              href="/"
              className="mt-4 inline-flex h-9 items-center rounded-[6px] bg-[var(--editor-accent)] px-4 text-sm font-bold text-[var(--editor-accent-ink)]"
            >
              Back home
            </Link>
          </div>
        </div>
      ) : project && !hasAudio ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--editor-bg)]">
          <AudioUploadTrim
            showBack={false}
            onGenerate={handleUploadAndTranscribe}
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
          <div className="relative shrink-0" style={{ height: timelineHeight }}>
            <Timeline height={timelineHeight} />
            <TimelineActionOverlay />
          </div>
        </>
      )}
      <ExportStatusDialog
        exportError={exportError}
        exporting={exporting}
        latestExport={latestExport}
        onOpenChange={setExportDialogOpen}
        open={exportDialogOpen}
        renderStatus={project?.renderStatus || "empty"}
        renderUrl={project?.renderUrl}
      />
    </div>
  );
}

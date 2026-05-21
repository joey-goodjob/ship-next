"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Coins,
  Download,
  Edit3,
  Expand,
  Menu,
  Pause,
  Play,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Type,
  Users,
  Volume2,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

type GenerationStatus = "generating" | "ready";
type PanelTab = "customize" | "cast";

type MockScene = {
  sceneId: number;
  text: string;
  startTime: number;
  endTime: number;
  imageUrl: string;
};

type MockProject = {
  projectId: string;
  projectName: string;
  audioUrl: null;
  totalDuration: number;
  scenes: MockScene[];
};

type WordMarker = {
  id: number;
  startTime: number;
};

type EditorContextValue = {
  project: MockProject;
  scenes: MockScene[];
  wordMarkers: WordMarker[];
  generationStatus: GenerationStatus;
  currentTime: number;
  isPlaying: boolean;
  activeTab: PanelTab;
  zoom: number;
  currentScene: MockScene;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setActiveTab: (tab: PanelTab) => void;
  setZoom: (zoom: number) => void;
};

const mockProject: MockProject = {
  projectId: "mock-001",
  projectName: "30s",
  audioUrl: null,
  totalDuration: 20.11,
  scenes: [
    {
      sceneId: 1,
      text: "MORNING ON MY",
      startTime: 0,
      endTime: 3.5,
      imageUrl: "https://picsum.photos/1280/720?random=1",
    },
    {
      sceneId: 2,
      text: "SKIN FEELS LIKE",
      startTime: 3.5,
      endTime: 6.2,
      imageUrl: "https://picsum.photos/1280/720?random=2",
    },
    {
      sceneId: 3,
      text: "A BRAND NEW DAY",
      startTime: 6.2,
      endTime: 9.8,
      imageUrl: "https://picsum.photos/1280/720?random=3",
    },
    {
      sceneId: 4,
      text: "WALKING DOWN THE ROAD",
      startTime: 9.8,
      endTime: 13.1,
      imageUrl: "https://picsum.photos/1280/720?random=4",
    },
    {
      sceneId: 5,
      text: "FEELING ALIVE",
      startTime: 13.1,
      endTime: 17,
      imageUrl: "https://picsum.photos/1280/720?random=5",
    },
    {
      sceneId: 6,
      text: "LIKE NEVER BEFORE",
      startTime: 17,
      endTime: 20.11,
      imageUrl: "https://picsum.photos/1280/720?random=6",
    },
  ],
};

const EditorContext = createContext<EditorContextValue | null>(null);

function useEditor() {
  const value = useContext(EditorContext);
  if (!value) throw new Error("useEditor must be used inside EditorProvider");
  return value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatClock(seconds: number, withCentiseconds = false) {
  const safe = Math.max(0, seconds);
  const totalSeconds = Math.floor(safe);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const base = `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  if (!withCentiseconds) return base;
  const centiseconds = Math.floor((safe - totalSeconds) * 100);
  return `${base}.${centiseconds.toString().padStart(2, "0")}`;
}

function makeWordMarkers(totalDuration: number) {
  return Array.from({ length: 72 }, (_, index) => {
    const base = (index / 72) * totalDuration;
    const offset = Math.abs(Math.sin(index * 1.91)) * 0.22;
    return {
      id: index,
      startTime: clamp(base + offset, 0, totalDuration),
    };
  });
}

function EditorProvider({ children }: { children: React.ReactNode }) {
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("generating");
  const [currentTime, setCurrentTimeState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("customize");
  const [zoom, setZoomState] = useState(1);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);

  const scenes = mockProject.scenes;
  const wordMarkers = useMemo(() => makeWordMarkers(mockProject.totalDuration), []);
  const currentScene = useMemo(
    () =>
      scenes.find((scene) => currentTime >= scene.startTime && currentTime < scene.endTime) ||
      scenes[scenes.length - 1],
    [currentTime, scenes],
  );

  function setCurrentTime(time: number) {
    setCurrentTimeState(Number(clamp(time, 0, mockProject.totalDuration).toFixed(3)));
  }

  function setZoom(zoomValue: number) {
    setZoomState(Number(clamp(zoomValue, 1, 3).toFixed(2)));
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setGenerationStatus("ready");
    }, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (generationStatus !== "ready") return;
    scenes.forEach((scene) => {
      const image = new Image();
      image.src = scene.imageUrl;
    });
  }, [generationStatus, scenes]);

  useEffect(() => {
    if (!isPlaying || generationStatus !== "ready") {
      lastFrameAtRef.current = null;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      return;
    }

    function tick(timestamp: number) {
      if (lastFrameAtRef.current === null) lastFrameAtRef.current = timestamp;
      const deltaSeconds = (timestamp - lastFrameAtRef.current) / 1000;
      lastFrameAtRef.current = timestamp;

      setCurrentTimeState((previous) => {
        const next = previous + deltaSeconds;
        if (next >= mockProject.totalDuration) {
          setIsPlaying(false);
          return mockProject.totalDuration;
        }
        return Number(next.toFixed(3));
      });

      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [generationStatus, isPlaying]);

  const value = useMemo<EditorContextValue>(
    () => ({
      project: mockProject,
      scenes,
      wordMarkers,
      generationStatus,
      currentTime,
      isPlaying,
      activeTab,
      zoom,
      currentScene,
      setCurrentTime,
      setIsPlaying,
      setActiveTab,
      setZoom,
    }),
    [activeTab, currentScene, currentTime, generationStatus, isPlaying, scenes, wordMarkers, zoom],
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

function TopNavBar() {
  const { project } = useEditor();

  return (
    <header className="flex h-[56px] shrink-0 items-center border-b border-[#E8E8E8] bg-white px-[20px]">
      <a href="/dashboard/lyric-videos" className="flex w-[260px] items-center gap-[8px]" aria-label="Back to upload page">
        <img src="/lyricedits-assets/favicon.svg" alt="" className="h-[24px] w-[24px]" />
        <span className="text-[20px] font-[800] leading-none text-[#1A1A2E]">
          Lyric<span className="text-[#F5A623]">Edits</span>
        </span>
      </a>

      <div className="flex flex-1 items-center justify-center gap-[8px] text-[14px] font-[700] text-[#667085]">
        <span>{project.projectName}</span>
        <button type="button" aria-label="Edit project name" className="text-[#9AA4B2] hover:text-[#333333]">
          <Edit3 className="h-[14px] w-[14px]" />
        </button>
      </div>

      <div className="flex w-[360px] items-center justify-end gap-[16px]">
        <span className="flex items-center gap-[4px] text-[13px] font-[600] text-[#777777]">
          <Check className="h-[14px] w-[14px]" />
          Saved
        </span>
        <button
          type="button"
          className="flex h-[34px] items-center gap-[8px] rounded-[6px] bg-[#F5A623] px-[16px] text-[14px] font-[700] text-white hover:bg-[#E6981F]"
        >
          <Download className="h-[15px] w-[15px]" />
          Export
          <span style={{ fontSize: 11, lineHeight: 1 }}>v</span>
        </button>
        <span className="flex items-center gap-[5px] text-[14px] font-[800] text-[#F5A623]">
          <Coins className="h-[16px] w-[16px]" />
          129
        </span>
        <Settings className="h-[18px] w-[18px] text-[#777777]" />
        <Menu className="h-[18px] w-[18px] text-[#777777]" />
      </div>
    </header>
  );
}

function VideoPreview() {
  const { currentScene, generationStatus } = useEditor();

  return (
    <section className="flex min-h-0 flex-1 items-start justify-start overflow-hidden bg-[#F8F9FA] pl-[16px] pr-[16px] pt-[64px]">
      <div
        className="relative overflow-hidden rounded-[4px] bg-[#E8EEF7]"
        style={{
          aspectRatio: "16 / 9",
          width: "min(100%, 1540px, calc((100vh - 260px) * 16 / 9))",
          maxHeight: "calc(100vh - 260px)",
        }}
      >
        {generationStatus === "generating" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="h-[44px] w-[44px] animate-spin rounded-full border-[3px] border-white/20 border-t-white/80" />
            <p className="mt-[18px] text-[16px] font-[600] text-white/80">AI is analyzing your music...</p>
          </div>
        ) : (
          <>
            <img src={currentScene.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-x-[32px] bottom-[12%] flex justify-center">
              <p
                className="text-center font-black uppercase leading-[1] text-white"
                style={{
                  fontFamily: "Impact, Arial Black, system-ui, sans-serif",
                  fontSize: 54,
                  textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
                }}
              >
                {currentScene.text}
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function SidePanel() {
  const { activeTab, setActiveTab } = useEditor();

  return (
    <aside className="h-full w-[420px] shrink-0 overflow-y-auto border-l border-[#E8E8E8] bg-white px-[24px]">
      <div className="flex h-[52px] items-end gap-[24px] border-b border-[#E8E8E8]">
        <button
          type="button"
          onClick={() => setActiveTab("customize")}
          className={`flex h-[52px] items-center gap-[7px] border-b-[2px] text-[14px] font-[700] ${
            activeTab === "customize"
              ? "border-[#1A1A2E] text-[#1A1A2E]"
              : "border-transparent text-[#999999]"
          }`}
        >
          <Settings className="h-[15px] w-[15px]" />
          Customize
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("cast")}
          className={`flex h-[52px] items-center gap-[7px] border-b-[2px] text-[14px] font-[700] ${
            activeTab === "cast"
              ? "border-[#1A1A2E] text-[#1A1A2E]"
              : "border-transparent text-[#999999]"
          }`}
        >
          <Users className="h-[15px] w-[15px]" />
          Cast
        </button>
      </div>

      <div className="flex h-[220px] items-center justify-center text-center text-[14px] font-[600] text-[#999999]">
        {activeTab === "customize"
          ? "Customize panel content coming in Step 3"
          : "Cast panel content coming in Step 4"}
      </div>
    </aside>
  );
}

function PlaybackControls() {
  const { currentTime, generationStatus, isPlaying, project, setCurrentTime, setIsPlaying, setZoom, zoom } = useEditor();
  const disabled = generationStatus === "generating";

  function togglePlayback() {
    if (disabled) return;
    if (currentTime >= project.totalDuration) setCurrentTime(0);
    setIsPlaying(!isPlaying);
  }

  return (
    <div className="flex h-[40px] shrink-0 items-center border-t border-[#E8E8E8] bg-[#F8F9FA] px-[16px]">
      <div className="flex w-[220px] items-center gap-[12px] text-[#666666]">
        <Expand className="h-[18px] w-[18px]" />
        <Volume2 className="h-[18px] w-[18px]" />
        <Type className="h-[18px] w-[18px]" />
      </div>

      <div className="flex flex-1 items-center justify-center gap-[14px]">
        <div className="flex items-center gap-[8px] text-[#666666]">
          <Wand2 className="h-[16px] w-[16px]" />
          <Shuffle className="h-[16px] w-[16px]" />
        </div>

        <div className="flex items-center gap-[8px] text-[#666666]">
          <button type="button" onClick={() => setCurrentTime(0)} aria-label="Jump to start">
            <SkipBack className="h-[16px] w-[16px]" />
          </button>
          <button type="button" onClick={() => setCurrentTime(currentTime - 1)} aria-label="Previous">
            <StepBack className="h-[16px] w-[16px]" />
          </button>
          <button
            type="button"
            onClick={togglePlayback}
            disabled={disabled}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-[28px] w-[28px] items-center justify-center text-[#333333] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPlaying ? <Pause className="h-[20px] w-[20px]" /> : <Play className="h-[20px] w-[20px]" />}
          </button>
          <button type="button" onClick={() => setCurrentTime(currentTime + 1)} aria-label="Next">
            <StepForward className="h-[16px] w-[16px]" />
          </button>
          <button type="button" onClick={() => setCurrentTime(project.totalDuration)} aria-label="Jump to end">
            <SkipForward className="h-[16px] w-[16px]" />
          </button>
        </div>

        <span className="ml-[8px] font-mono text-[13px] font-[700] text-[#444444]">
          {formatClock(currentTime, true)} / {formatClock(project.totalDuration, true)}
        </span>
      </div>

      <label className="flex w-[220px] items-center justify-end gap-[8px] text-[#666666]">
        <ZoomOut className="h-[16px] w-[16px]" />
        <input
          type="range"
          min="1"
          max="3"
          step="0.25"
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="w-[80px] accent-[#999999]"
          aria-label="Timeline zoom"
        />
        <ZoomIn className="h-[16px] w-[16px]" />
      </label>
    </div>
  );
}

function Timeline() {
  const { currentScene, currentTime, project, scenes, setCurrentTime, wordMarkers, zoom } = useEditor();
  const timelineRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const trackWidth = `${Math.max(100, zoom * 100)}%`;
  const playheadPct = (currentTime / project.totalDuration) * 100;
  const ticks = Array.from({ length: Math.floor(project.totalDuration) + 1 }, (_, index) => index);

  function secondsAt(clientX: number) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return (clamp(clientX - rect.left, 0, rect.width) / rect.width) * project.totalDuration;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCurrentTime(secondsAt(event.clientX));
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    setCurrentTime(secondsAt(event.clientX));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="h-[80px] shrink-0 overflow-x-auto bg-[#FAFAFA]">
      <div
        ref={timelineRef}
        className="relative h-full min-w-full touch-none"
        style={{ width: trackWidth }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute left-0 right-0 top-0 h-[20px]">
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute top-0 flex h-[20px] -translate-x-1/2 flex-col items-center"
              style={{ left: `${(tick / project.totalDuration) * 100}%` }}
            >
              <span className="font-mono text-[11px] leading-[13px] text-[#888888]">{formatClock(tick)}</span>
              <span className="mt-[2px] h-[4px] w-[1px] bg-[#CCCCCC]" />
            </div>
          ))}
        </div>

        <div className="absolute left-0 right-0 top-[22px] h-[30px]">
          {scenes.map((scene) => {
            const left = (scene.startTime / project.totalDuration) * 100;
            const width = ((scene.endTime - scene.startTime) / project.totalDuration) * 100;
            const active = currentScene.sceneId === scene.sceneId;
            return (
              <div
                key={scene.sceneId}
                className={`absolute top-0 h-[30px] overflow-hidden border-r border-white ${
                  active ? "outline outline-[2px] outline-[#F5A623]" : ""
                }`}
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                <img src={scene.imageUrl} alt="" className="h-full w-full object-cover" />
              </div>
            );
          })}
        </div>

        <div className="absolute left-0 right-0 top-[56px] h-[20px]">
          {wordMarkers.map((marker) => (
            <span
              key={marker.id}
              className="absolute top-[5px] h-[10px] w-[2px] bg-[#4A90D9]"
              style={{ left: `${(marker.startTime / project.totalDuration) * 100}%` }}
            />
          ))}
        </div>

        <div className="absolute bottom-0 top-0 w-[2px] bg-[#E53935]" style={{ left: `${playheadPct}%` }}>
          <span className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[10px] border-x-transparent border-t-[#E53935]" />
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  const { generationStatus } = useEditor();
  const ready = generationStatus === "ready";

  return (
    <footer className="flex h-[56px] shrink-0 flex-col items-center justify-center border-t border-[#E8E8E8] bg-white">
      <p className="text-center text-[14px] font-[600] text-[#777777]">
        {ready
          ? "Preview ready! Customize the look & feel or continue:"
          : "This should take just a few seconds. Please wait while we generate the preview."}
      </p>
      <button
        type="button"
        disabled={!ready}
        onClick={() => ready && toast.info("More features coming soon")}
        className="mt-[4px] flex h-[28px] w-[180px] items-center justify-center gap-[8px] rounded-[8px] bg-[#F5A623] text-[14px] font-[700] text-white hover:bg-[#E6981F] disabled:cursor-not-allowed disabled:opacity-90"
      >
        {ready ? (
          "Continue ->"
        ) : (
          <>
            <span className="h-[14px] w-[14px] animate-spin rounded-full border-[2px] border-white/50 border-t-white" />
            Generating...
          </>
        )}
      </button>
    </footer>
  );
}

function EditorWorkspace({ projectId }: { projectId: string }) {
  return (
    <div className="fixed inset-0 z-[80] flex h-screen flex-col overflow-hidden bg-white font-sans" data-project-id={projectId}>
      <TopNavBar />
      <div className="flex min-h-0 flex-1">
        <VideoPreview />
        <SidePanel />
      </div>
      <PlaybackControls />
      <Timeline />
      <StatusBar />
    </div>
  );
}

export function PreviewWorkbench({ projectId }: { projectId: string }) {
  return (
    <EditorProvider>
      <EditorWorkspace projectId={projectId} />
    </EditorProvider>
  );
}

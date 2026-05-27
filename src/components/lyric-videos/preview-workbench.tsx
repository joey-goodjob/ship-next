"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, PointerEvent, ReactNode } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clapperboard,
  Coins,
  Download,
  Edit3,
  Expand,
  FileText,
  ImageIcon,
  Loader2,
  Menu,
  MoreVertical,
  Pause,
  Play,
  RefreshCcw,
  Save,
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
import { AudioUploadTrim } from "@/components/audio-upload-trim";
import { Link } from "@/core/i18n/navigation";
import { cn } from "@/lib/utils";

type SaveStatus = "idle" | "saving" | "saved" | "failed";
type PanelTab = "customize" | "lyrics" | "cast" | "scenes";

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

type LyricVideoProject = {
  id: string;
  title: string;
  status: string;
  audioUrl?: string | null;
  originalAudioUrl?: string | null;
  audioFilename?: string | null;
  audioDurationMs: number;
  trimStartMs?: number;
  trimEndMs?: number;
  processedAudioUrl?: string | null;
  pipelineStage: string;
  pipelineError?: string | null;
  activeRunId?: string | null;
  generationStatus?: string;
  generationProgress?: number;
  language: string;
  storyPrompt: string;
  palette: string;
  artStyle: string;
  aspectRatio: string;
  resolution: string;
  lyricsStatus: string;
  scenesStatus: string;
  renderStatus: string;
  renderUrl?: string | null;
  previewConfig?: string | null;
};

type LyricLine = {
  id?: string;
  startMs: number;
  endMs: number;
  text: string;
  sort?: number;
  words?: LyricWord[];
};

type LyricWord = {
  id: string;
  word: string;
  startMs: number;
  endMs: number;
  sort?: number;
};

type LyricScene = {
  id: string;
  startMs: number;
  endMs: number;
  text?: string;
  prompt: string;
  negativePrompt?: string | null;
  linkedLineIds?: string[];
  lyricLineIds?: string[];
  castIds?: string[];
  motionPrompt?: string | null;
  imageUrl?: string | null;
  status: string;
  error?: string | null;
  sort?: number;
};

type LyricExport = {
  id: string;
  status: string;
  videoUrl?: string | null;
  error?: string | null;
  resolution: string;
  aspectRatio: string;
  createdAt?: string;
};

type ProjectDetails = {
  project: LyricVideoProject;
  generationRun?: unknown;
  generationSteps?: unknown[];
  words?: LyricWord[];
  lines: LyricLine[];
  scenes: LyricScene[];
  cast?: unknown[];
  exports: LyricExport[];
};

type UploadAudioResponse = {
  url: string;
  key: string;
  filename: string;
  size: number;
  deduped?: boolean;
};

type StoryGenerationResponse = {
  storyPrompt: string;
  project: LyricVideoProject;
  taskId: string;
};

type LyricsNormalizeResponse = {
  lines: LyricLine[];
  project: LyricVideoProject;
  taskId: string;
};

type EditorContextValue = {
  projectId: string;
  appName: string;
  project: LyricVideoProject | null;
  lines: LyricLine[];
  scenes: LyricScene[];
  exports: LyricExport[];
  latestExport?: LyricExport;
  loading: boolean;
  loadError: string;
  saveStatus: SaveStatus;
  currentTime: number;
  isPlaying: boolean;
  activeTab: PanelTab;
  zoom: number;
  totalDuration: number;
  currentScene?: LyricScene;
  currentLine?: LyricLine;
  lyricsDirty: boolean;
  exporting: boolean;
  preparingAudio: boolean;
  creatingStory: boolean;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setActiveTab: (tab: PanelTab) => void;
  setZoom: (zoom: number) => void;
  updateProjectField: <K extends keyof LyricVideoProject>(key: K, value: LyricVideoProject[K]) => void;
  setLines: (lines: LyricLine[]) => void;
  uploadAndTranscribe: (
    file: File,
    startTime: number,
    endTime: number,
    options: { useEntireAudio: boolean; durationSeconds: number },
  ) => Promise<void>;
  createStory: () => Promise<void>;
  saveLyrics: () => Promise<void>;
  queueExport: () => Promise<void>;
  refresh: () => Promise<void>;
};

const EditorContext = createContext<EditorContextValue | null>(null);

const LANGUAGE_OPTIONS = [
  { value: "auto", label: "Auto detect" },
  { value: "en", label: "English" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "es", label: "Spanish" },
];

const STYLE_OPTIONS = [
  "cinematic illustration",
  "realistic 3D render",
  "anime",
  "cartoon",
  "digital oil painting",
  "pencil sketch",
  "pixel art",
];

const PALETTE_OPTIONS = [
  { value: "cinematic", label: "Cinematic", color: "#F5A623" },
  { value: "red-blue", label: "Red & Blue", color: "#D94A6A" },
  { value: "orange-teal", label: "Orange & Teal", color: "#E87822" },
  { value: "green-purple", label: "Green & Purple", color: "#5DAE72" },
  { value: "gold-navy", label: "Gold & Navy", color: "#D6A434" },
  { value: "black-white", label: "Black & White", color: "#222222" },
];

const FORMAT_OPTIONS = ["16:9", "9:16", "1:1"];
const SIDE_PANEL_WIDTH_KEY = "lyric-video-workbench-side-panel-width";
const TIMELINE_HEIGHT_KEY = "lyric-video-workbench-timeline-height";
const DEFAULT_TIMELINE_HEIGHT = 104;

function useEditor() {
  const value = useContext(EditorContext);
  if (!value) throw new Error("useEditor must be used inside EditorProvider");
  return value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function msToSeconds(ms?: number | null) {
  return Math.max(0, (ms || 0) / 1000);
}

function secondsToMs(seconds: number) {
  return Math.max(0, Math.round(seconds * 1000));
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

function formatMs(ms: number) {
  return formatClock(msToSeconds(ms), true);
}

function formatDurationMs(ms: number) {
  return `${Math.max(0, ms / 1000).toFixed(2)}s`;
}

function getAspectRatio(aspectRatio?: string) {
  if (aspectRatio === "9:16") return "9 / 16";
  if (aspectRatio === "1:1") return "1 / 1";
  return "16 / 9";
}

function projectIsProcessing(project: LyricVideoProject | null) {
  if (!project) return false;
  const activeStatuses = ["processing", "asr_processing", "normalizing"];
  return (
    ["queued", "running", "waiting_provider"].includes(project.generationStatus || "") ||
    [project.lyricsStatus, project.scenesStatus, project.renderStatus].some((status) => activeStatuses.includes(status || ""))
  );
}

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok || body.code !== 0) {
    throw new Error(body.message || "Request failed");
  }
  return body.data as T;
}

function readStoredNumber(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  const stored = Number(raw);
  return Number.isFinite(stored) ? stored : fallback;
}

function defaultSidePanelWidth() {
  if (typeof window === "undefined") return 640;
  return clamp(window.innerWidth * 0.39, 520, 760);
}

function EditorProvider({
  appName,
  children,
  projectId,
}: {
  appName: string;
  children: ReactNode;
  projectId: string;
}) {
  const [project, setProject] = useState<LyricVideoProject | null>(null);
  const [lines, setLinesState] = useState<LyricLine[]>([]);
  const [scenes, setScenes] = useState<LyricScene[]>([]);
  const [exports, setExports] = useState<LyricExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [currentTime, setCurrentTimeState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("customize");
  const [zoom, setZoomState] = useState(1);
  const [lyricsDirty, setLyricsDirty] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preparingAudio, setPreparingAudio] = useState(false);
  const [creatingStory, setCreatingStory] = useState(false);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const autoTranscribeProjectRef = useRef<string | null>(null);
  const autoStoryProjectRef = useRef<string | null>(null);
  const pendingProjectPatchRef = useRef<Partial<LyricVideoProject>>({});

  const totalDuration = useMemo(() => {
    const candidates = [
      project?.audioDurationMs || 0,
      ...lines.map((line) => line.endMs || 0),
      ...scenes.map((scene) => scene.endMs || 0),
      20110,
    ];
    return Math.max(...candidates) / 1000;
  }, [lines, project?.audioDurationMs, scenes]);

  const currentScene = useMemo(() => {
    return (
      scenes.find((scene) => currentTime >= msToSeconds(scene.startMs) && currentTime < msToSeconds(scene.endMs)) ||
      scenes[0]
    );
  }, [currentTime, scenes]);

  const currentLine = useMemo(() => {
    return (
      lines.find((line) => currentTime >= msToSeconds(line.startMs) && currentTime < msToSeconds(line.endMs)) ||
      lines[0]
    );
  }, [currentTime, lines]);

  const latestExport = exports[0];

  const refresh = useCallback(async () => {
    setLoadError("");
    try {
      const details = await requestJson<ProjectDetails>(`/api/lyric-videos/${projectId}`);
      if (!details?.project) throw new Error("Project not found");
      setProject(details.project);
      setLinesState(details.lines || []);
      setScenes(details.scenes || []);
      setExports(details.exports || []);
      setSaveStatus("saved");
    } catch (err: any) {
      setLoadError(err?.message || "Project not found");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!projectIsProcessing(project)) return;
    const timer = window.setInterval(() => {
      refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [project, refresh]);

  useEffect(() => {
    const hasAudio = Boolean(project?.originalAudioUrl || project?.audioUrl || project?.processedAudioUrl);
    const shouldAutoTranscribe =
      project &&
      hasAudio &&
      lines.length === 0 &&
      !preparingAudio &&
      !["processing", "asr_processing", "normalizing", "ready", "failed"].includes(project.lyricsStatus || "") &&
      autoTranscribeProjectRef.current !== project.id;
    if (!shouldAutoTranscribe) return;

    autoTranscribeProjectRef.current = project.id;
    setPreparingAudio(true);
    setSaveStatus("saving");
    setActiveTab("lyrics");
    setProject((previous) =>
      previous
        ? {
            ...previous,
            lyricsStatus: "asr_processing",
            pipelineStage: "asr_processing",
            pipelineError: null,
          }
        : previous,
    );
    console.info("[lyric-video] auto ASR started from preview", {
      projectId: project.id,
      audioUrl: project.audioUrl,
      originalAudioUrl: project.originalAudioUrl,
      processedAudioUrl: project.processedAudioUrl,
      trimStartMs: project.trimStartMs,
      trimEndMs: project.trimEndMs,
    });

    requestJson(`/api/lyric-videos/${project.id}/asr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(async () => {
        setProject((previous) =>
          previous
            ? {
                ...previous,
                lyricsStatus: "normalizing",
                pipelineStage: "lyrics_normalizing",
                pipelineError: null,
              }
            : previous,
        );
        console.info("[lyric-video] auto ASR completed from preview", {
          projectId: project.id,
        });
        const normalized = await requestJson<LyricsNormalizeResponse>(`/api/lyric-videos/${project.id}/lyrics/normalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        console.info("[lyric-video] lyrics normalization completed from preview", {
          projectId: project.id,
          lineCount: normalized.lines?.length || 0,
          firstLine: normalized.lines?.[0],
        });
        setLinesState(normalized.lines || []);
        setLyricsDirty(false);
        setCurrentTimeState(0);
        let storyCreated = false;
        try {
          const story = await requestJson<StoryGenerationResponse>(`/api/lyric-videos/${project.id}/story`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          setProject(story.project || { ...project, storyPrompt: story.storyPrompt });
          autoStoryProjectRef.current = project.id;
          storyCreated = true;
        } catch (storyError: any) {
          toast.error(storyError?.message || "Generate story failed");
        }
        await refresh();
        setSaveStatus("saved");
        toast.success(storyCreated ? "Lyrics and story are ready" : "Lyrics organized");
      })
      .catch(async (err: any) => {
        console.error("[lyric-video] auto lyrics flow failed from preview", err);
        setSaveStatus("failed");
        await refresh();
        toast.error(err?.message || "Generate lyrics failed");
      })
      .finally(() => {
        setPreparingAudio(false);
      });
  }, [lines.length, preparingAudio, project, refresh]);

  useEffect(() => {
    const shouldCreateStory =
      project &&
      lines.length > 0 &&
      !creatingStory &&
      !(project.storyPrompt || "").trim() &&
      autoStoryProjectRef.current !== project.id;
    if (!shouldCreateStory) return;

    autoStoryProjectRef.current = project.id;
    setCreatingStory(true);
    requestJson<StoryGenerationResponse>(`/api/lyric-videos/${project.id}/story`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((data) => {
        setProject((previous) => data.project || (previous ? { ...previous, storyPrompt: data.storyPrompt } : previous));
        setSaveStatus("saved");
        toast.success("Story created");
      })
      .catch((err: any) => {
        toast.error(err?.message || "Generate story failed");
      })
      .finally(() => {
        setCreatingStory(false);
      });
  }, [creatingStory, lines.length, project]);

  useEffect(() => {
    if (!isPlaying) {
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
        if (next >= totalDuration) {
          setIsPlaying(false);
          return totalDuration;
        }
        return Number(next.toFixed(3));
      });

      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [isPlaying, totalDuration]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function setCurrentTime(time: number) {
    setCurrentTimeState(Number(clamp(time, 0, totalDuration).toFixed(3)));
  }

  function setZoom(zoomValue: number) {
    setZoomState(Number(clamp(zoomValue, 1, 3).toFixed(2)));
  }

  function updateProjectField<K extends keyof LyricVideoProject>(key: K, value: LyricVideoProject[K]) {
    setProject((previous) => (previous ? { ...previous, [key]: value } : previous));
    pendingProjectPatchRef.current = { ...pendingProjectPatchRef.current, [key]: value };
    setSaveStatus("saving");

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      const patch = pendingProjectPatchRef.current;
      pendingProjectPatchRef.current = {};
      try {
        await requestJson<LyricVideoProject>(`/api/lyric-videos/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        setSaveStatus("saved");
      } catch (err: any) {
        setSaveStatus("failed");
        toast.error(err?.message || "Save failed");
      }
    }, 600);
  }

  function setLines(nextLines: LyricLine[]) {
    setLinesState(nextLines);
    setLyricsDirty(true);
  }

  async function uploadAndTranscribe(
    file: File,
    startTime: number,
    endTime: number,
    options: { useEntireAudio: boolean; durationSeconds: number },
  ) {
    if (preparingAudio) return;
    console.info("[lyric-video] upload flow started", {
      projectId,
      filename: file.name,
      fileType: file.type,
      fileSize: file.size,
      startTime,
      endTime,
      options,
    });
    setPreparingAudio(true);
    setSaveStatus("saving");
    setLoadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploaded = await requestJson<UploadAudioResponse>("/api/storage/upload-audio", {
        method: "POST",
        body: formData,
      });
      console.info("[lyric-video] original audio uploaded", uploaded);

      const originalDurationMs = secondsToMs(options.durationSeconds);
      const trimStartMs = options.useEntireAudio ? 0 : secondsToMs(startTime);
      const trimEndMs = options.useEntireAudio ? originalDurationMs : secondsToMs(endTime);
      console.info("[lyric-video] saving audio trim metadata", {
        projectId,
        originalDurationMs,
        trimStartMs,
        trimEndMs,
      });

      await requestJson<LyricVideoProject>(`/api/lyric-videos/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioUrl: uploaded.url,
          audioStorageKey: uploaded.key,
          originalAudioUrl: uploaded.url,
          originalAudioStorageKey: uploaded.key,
          audioFilename: uploaded.filename || file.name,
          audioDurationMs: originalDurationMs,
          audioMimeType: file.type || "audio/mpeg",
          audioSizeBytes: uploaded.size || file.size,
          trimStartMs,
          trimEndMs,
        }),
      });

      console.info("[lyric-video] requesting ASR", { projectId });
      await requestJson(`/api/lyric-videos/${projectId}/asr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      console.info("[lyric-video] requesting lyrics normalization", { projectId });
      const normalized = await requestJson<LyricsNormalizeResponse>(`/api/lyric-videos/${projectId}/lyrics/normalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      console.info("[lyric-video] lyrics normalization completed", {
        projectId,
        lineCount: normalized.lines?.length || 0,
        firstLine: normalized.lines?.[0],
      });

      setLinesState(normalized.lines || []);
      setLyricsDirty(false);
      setCurrentTimeState(0);
      setActiveTab("lyrics");
      let storyCreated = false;
      try {
        const story = await requestJson<StoryGenerationResponse>(`/api/lyric-videos/${projectId}/story`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        setProject((previous) => story.project || (previous ? { ...previous, storyPrompt: story.storyPrompt } : previous));
        autoStoryProjectRef.current = projectId;
        storyCreated = true;
      } catch (storyError: any) {
        toast.error(storyError?.message || "Generate story failed");
      }
      await refresh();
      setSaveStatus("saved");
      toast.success(storyCreated ? "Lyrics and story are ready" : "Lyrics organized");
    } catch (err: any) {
      console.error("[lyric-video] upload/transcribe flow failed", err);
      setSaveStatus("failed");
      await refresh();
      throw err;
    } finally {
      setPreparingAudio(false);
    }
  }

  async function createStory() {
    if (creatingStory) return;
    if (!project) {
      toast.error("Project unavailable");
      return;
    }
    if (lines.length === 0) {
      toast.error("Generate lyrics before creating a story");
      return;
    }

    setCreatingStory(true);
    setSaveStatus("saving");
    try {
      const data = await requestJson<StoryGenerationResponse>(`/api/lyric-videos/${project.id}/story`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setProject(data.project || { ...project, storyPrompt: data.storyPrompt });
      setSaveStatus("saved");
      toast.success("Story created");
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Generate story failed");
    } finally {
      setCreatingStory(false);
    }
  }

  async function saveLyrics() {
    try {
      setSaveStatus("saving");
      const saved = await requestJson<LyricLine[]>(`/api/lyric-videos/${projectId}/lyrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      setLinesState(saved || []);
      setLyricsDirty(false);
      setSaveStatus("saved");
      await refresh();
      toast.success("Lyrics saved");
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Save lyrics failed");
    }
  }

  async function queueExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const exportJob = await requestJson<LyricExport>(`/api/lyric-videos/${projectId}/exports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            aspectRatio: project?.aspectRatio,
            resolution: project?.resolution,
          },
        }),
      });
      setExports((previous) => [exportJob, ...previous.filter((item) => item.id !== exportJob.id)]);
      await refresh();
      toast.success(exportJob.videoUrl ? "Export ready" : "Export queued");
    } catch (err: any) {
      toast.error(err?.message || "Queue export failed");
    } finally {
      setExporting(false);
    }
  }

  const value = useMemo<EditorContextValue>(
    () => ({
      projectId,
      appName,
      project,
      lines,
      scenes,
      exports,
      latestExport,
      loading,
      loadError,
      saveStatus,
      currentTime,
      isPlaying,
      activeTab,
      zoom,
      totalDuration,
      currentScene,
      currentLine,
      lyricsDirty,
      exporting,
      preparingAudio,
      creatingStory,
      setCurrentTime,
      setIsPlaying,
      setActiveTab,
      setZoom,
      updateProjectField,
      setLines,
      uploadAndTranscribe,
      createStory,
      saveLyrics,
      queueExport,
      refresh,
    }),
    [
      activeTab,
      appName,
      currentLine,
      currentScene,
      currentTime,
      creatingStory,
      exporting,
      exports,
      latestExport,
      lines,
      loadError,
      loading,
      lyricsDirty,
      preparingAudio,
      project,
      projectId,
      saveStatus,
      scenes,
      totalDuration,
      isPlaying,
      zoom,
      refresh,
    ],
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

function TopNavBar() {
  const { appName, exporting, project, queueExport, saveStatus, updateProjectField } = useEditor();

  const saveLabel =
    saveStatus === "saving" ? "Saving" : saveStatus === "failed" ? "Save failed" : saveStatus === "saved" ? "Saved" : "Ready";

  return (
    <header className="flex h-[56px] shrink-0 items-center border-b border-[#E8E8E8] bg-white px-[20px]">
      <Link href="/" className="flex w-[260px] items-center gap-[8px]" aria-label="Back home">
        <span className="flex size-[24px] items-center justify-center rounded-full border-[3px] border-[#F5A623] border-r-[#1A1A2E]" />
        <span className="truncate text-[20px] font-[800] leading-none text-[#1A1A2E]">{appName}</span>
      </Link>

      <label className="flex min-w-0 flex-1 items-center justify-center gap-[8px] text-[14px] font-[700] text-[#667085]">
        <input
          value={project?.title || ""}
          onChange={(event) => project && updateProjectField("title", event.target.value)}
          className="w-full max-w-[360px] truncate bg-transparent text-center text-[14px] font-[800] text-[#1A1A2E] outline-none"
          aria-label="Project title"
          disabled={!project}
        />
        <Edit3 className="h-[14px] w-[14px] shrink-0 text-[#9AA4B2]" />
      </label>

      <div className="flex w-[360px] items-center justify-end gap-[14px]">
        <span
          className={cn(
            "flex items-center gap-[4px] text-[13px] font-[700]",
            saveStatus === "failed" ? "text-red-600" : "text-[#777777]",
          )}
        >
          {saveStatus === "saving" ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Check className="h-[14px] w-[14px]" />}
          {saveLabel}
        </span>
        <button
          type="button"
          onClick={queueExport}
          disabled={exporting || !project}
          className="flex h-[34px] items-center gap-[8px] rounded-[6px] bg-[#F5A623] px-[16px] text-[14px] font-[800] text-white hover:bg-[#E6981F] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Download className="h-[15px] w-[15px]" />}
          Export
          <ChevronDown className="h-[13px] w-[13px]" />
        </button>
        <span className="flex items-center gap-[5px] text-[14px] font-[800] text-[#F5A623]" title="Credits">
          <Coins className="h-[16px] w-[16px]" />
          --
        </span>
        <Settings className="h-[18px] w-[18px] text-[#777777]" />
        <Menu className="h-[18px] w-[18px] text-[#777777]" />
      </div>
    </header>
  );
}

function VideoPreview() {
  const { currentLine, currentScene, loading, project, totalDuration } = useEditor();
  const aspectRatio = getAspectRatio(project?.aspectRatio);
  const hasImage = Boolean(currentScene?.imageUrl);

  return (
    <section className="flex min-h-0 flex-1 items-start justify-start overflow-hidden bg-[#F8F9FA] px-[16px] pt-[16px]">
      <div
        className="relative max-h-full overflow-hidden rounded-[4px] bg-[#E8EEF7]"
        style={{
          aspectRatio,
          width: "min(100%, 1540px)",
          maxHeight: "100%",
        }}
      >
        {loading ? (
          <PreviewPlaceholder title="Loading project..." description="Preparing the editor workspace." />
        ) : hasImage ? (
          <>
            <img src={currentScene?.imageUrl || ""} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-x-[32px] bottom-[12%] flex justify-center">
              <p
                className="max-w-full text-center font-black uppercase leading-[1] text-white"
                style={{
                  fontFamily: "Impact, Arial Black, system-ui, sans-serif",
                  fontSize: "clamp(34px, 4.2vw, 72px)",
                  textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
                }}
              >
                {currentLine?.text || project?.title || "Lyric preview"}
              </p>
            </div>
          </>
        ) : (
          <PreviewPlaceholder
            title={currentScene ? "Scene image pending" : "No scene image yet"}
            description={
              currentScene
                ? currentScene.status === "failed"
                  ? currentScene.error || "Image generation failed."
                  : "Generate scene images to fill the preview."
                : totalDuration > 0
                  ? "Add lyrics and generate a storyboard to preview this video."
                  : "Create the project flow to preview your lyric video."
            }
          />
        )}
      </div>
    </section>
  );
}

function PreviewPlaceholder({ description, title }: { description: string; title: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#DCE5F0] to-[#F6F7F8] px-8 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-white/80 text-[#F5A623] shadow-sm">
        <Wand2 className="size-7" />
      </div>
      <p className="text-[18px] font-[800] text-[#1A1A2E]">{title}</p>
      <p className="mt-2 max-w-md text-[14px] font-[600] leading-6 text-[#667085]">{description}</p>
    </div>
  );
}

function SidePanel({ width }: { width: number }) {
  const { activeTab, setActiveTab } = useEditor();
  const tabs: Array<{ id: PanelTab; label: string; icon: ComponentType<{ className?: string }> }> = [
    { id: "customize", label: "Customize", icon: Settings },
    { id: "lyrics", label: "Lyrics", icon: FileText },
    { id: "cast", label: "Cast", icon: Users },
    { id: "scenes", label: "Scenes", icon: Clapperboard },
  ];

  return (
    <aside
      className="h-full shrink-0 overflow-hidden border-l border-[#E8E8E8] bg-white"
      style={{ width }}
    >
      <div className="flex h-[52px] items-end gap-[24px] border-b border-[#E8E8E8] px-[24px]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex h-[52px] items-center gap-[7px] border-b-[2px] text-[14px] font-[800]",
                active ? "border-[#1A1A2E] text-[#1A1A2E]" : "border-transparent text-[#999999]",
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
      </div>
    </aside>
  );
}

function CustomizePanel() {
  const { createStory, creatingStory, latestExport, project, updateProjectField } = useEditor();
  if (!project) return <PanelEmpty title="Project unavailable" description="Refresh the page or open a project from the library." />;

  return (
    <div className="flex flex-col gap-[22px]">
      <FieldBlock label="Lyrics Language" helper="Main language of the lyrics. Change it if auto-detection was not correct.">
        <select
          value={project.language || "auto"}
          onChange={(event) => updateProjectField("language", event.target.value)}
          className="h-[42px] w-full rounded-[6px] border border-[#D9DDE3] bg-white px-[12px] text-[14px] font-[600] text-[#334155] outline-none focus:border-[#F5A623]"
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FieldBlock>

      <FieldBlock
        label="Story"
        action={
          <button
            type="button"
            onClick={createStory}
            disabled={creatingStory}
            className="inline-flex h-[31px] items-center gap-[6px] rounded-[6px] border border-[#D9DDE3] px-[10px] text-[13px] font-[700] text-[#334155] hover:bg-[#F8F9FA]"
          >
            {creatingStory ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Wand2 className="h-[14px] w-[14px]" />}
            {creatingStory ? "Creating..." : "Create new story"}
          </button>
        }
        helper="Describe the story of your video. Include acts, characters, locations, and visual details."
      >
        <textarea
          value={project.storyPrompt || ""}
          onChange={(event) => updateProjectField("storyPrompt", event.target.value)}
          rows={10}
          placeholder="A cinematic story about longing, stage lights, and a final chorus."
          className="min-h-[240px] w-full resize-y rounded-[6px] border border-[#D9DDE3] bg-white px-[12px] py-[10px] text-[14px] font-[500] leading-6 text-[#334155] outline-none focus:border-[#F5A623]"
        />
      </FieldBlock>

      <FieldBlock label="Style">
        <div className="grid grid-cols-2 gap-[8px]">
          {STYLE_OPTIONS.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => updateProjectField("artStyle", style)}
              className={cn(
                "h-[36px] truncate rounded-[6px] border px-[10px] text-left text-[13px] font-[700]",
                project.artStyle === style
                  ? "border-[#F5A623] bg-amber-50 text-[#1A1A2E]"
                  : "border-[#E8E8E8] bg-white text-[#667085] hover:bg-[#F8F9FA]",
              )}
            >
              {style}
            </button>
          ))}
        </div>
      </FieldBlock>

      <FieldBlock label="Palette">
        <div className="grid grid-cols-2 gap-[8px]">
          {PALETTE_OPTIONS.map((palette) => (
            <button
              key={palette.value}
              type="button"
              onClick={() => updateProjectField("palette", palette.value)}
              className={cn(
                "flex h-[38px] items-center gap-[8px] rounded-[6px] border px-[10px] text-[13px] font-[700]",
                project.palette === palette.value
                  ? "border-[#F5A623] bg-amber-50 text-[#1A1A2E]"
                  : "border-[#E8E8E8] bg-white text-[#667085] hover:bg-[#F8F9FA]",
              )}
            >
              <span className="size-[14px] rounded-full" style={{ backgroundColor: palette.color }} />
              {palette.label}
            </button>
          ))}
        </div>
      </FieldBlock>

      <FieldBlock label="Format">
        <div className="grid grid-cols-3 gap-[8px]">
          {FORMAT_OPTIONS.map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => updateProjectField("aspectRatio", format)}
              className={cn(
                "h-[38px] rounded-[6px] border text-[13px] font-[800]",
                project.aspectRatio === format
                  ? "border-[#F5A623] bg-amber-50 text-[#1A1A2E]"
                  : "border-[#E8E8E8] bg-white text-[#667085] hover:bg-[#F8F9FA]",
              )}
            >
              {format}
            </button>
          ))}
        </div>
      </FieldBlock>

      <LatestExport exportJob={latestExport} renderUrl={project.renderUrl} renderStatus={project.renderStatus} />
    </div>
  );
}

function FieldBlock({
  action,
  children,
  helper,
  label,
}: {
  action?: ReactNode;
  children: ReactNode;
  helper?: string;
  label: string;
}) {
  return (
    <section>
      <div className="mb-[8px] flex items-center justify-between gap-3">
        <label className="text-[13px] font-[800] text-[#334155]">{label}</label>
        {action}
      </div>
      {children}
      {helper ? <p className="mt-[8px] text-[12px] font-[500] leading-5 text-[#667085]">{helper}</p> : null}
    </section>
  );
}

function LyricsPanel() {
  const { lines, lyricsDirty, project, saveLyrics, setLines } = useEditor();
  const lyricsProcessing = project?.lyricsStatus === "processing";
  const lyricsFailed = project?.lyricsStatus === "failed";

  function updateLine(index: number, text: string) {
    setLines(lines.map((line, lineIndex) => (lineIndex === index ? { ...line, text } : line)));
  }

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[14px] font-[800] text-[#1A1A2E]">Timed lyrics</p>
          <p className="mt-[3px] text-[12px] font-[500] text-[#667085]">Edit text while preserving the current timestamps.</p>
        </div>
        <button
          type="button"
          onClick={saveLyrics}
          disabled={!lyricsDirty || lines.length === 0}
          className="inline-flex h-[34px] items-center gap-[7px] rounded-[6px] bg-[#1A1A2E] px-[12px] text-[13px] font-[800] text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save className="h-[14px] w-[14px]" />
          Save lyrics
        </button>
      </div>

      {lyricsProcessing ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[8px] border border-dashed border-[#E8E8E8] bg-[#FAFAFA] px-8 text-center">
          <Loader2 className="mb-3 size-8 animate-spin text-[#F5A623]" />
          <p className="text-[14px] font-[800] text-[#1A1A2E]">Preparing lyrics</p>
          <p className="mt-2 max-w-sm text-[13px] font-[500] leading-6 text-[#667085]">
            The selected audio clip is being trimmed and transcribed.
          </p>
        </div>
      ) : lyricsFailed ? (
        <div className="rounded-[8px] border border-red-200 bg-red-50 p-[14px] text-red-700">
          <div className="flex items-center gap-[8px] text-[13px] font-[800]">
            <AlertCircle className="h-[15px] w-[15px]" />
            Lyrics generation failed
          </div>
          <p className="mt-[8px] text-[12px] font-[600] leading-5">{project?.pipelineError || "Please try uploading the clip again."}</p>
        </div>
      ) : lines.length === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[8px] border border-dashed border-[#E8E8E8] bg-[#FAFAFA] px-8 text-center">
          <FileText className="mb-3 size-8 text-[#F5A623]" />
          <p className="text-[14px] font-[800] text-[#1A1A2E]">No lyrics yet</p>
          <p className="mt-2 max-w-sm text-[13px] font-[500] leading-6 text-[#667085]">
            Upload an audio clip first, then Groq will generate timed lyrics here.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-[10px]">
        {lines.map((line, index) => (
          <div key={line.id || index} className="rounded-[6px] border border-[#E8E8E8] bg-[#FAFAFA] p-[10px]">
            <div className="mb-[8px] flex items-center justify-between text-[11px] font-[800] text-[#8A94A6]">
              <span>Line {index + 1}</span>
              <span className="font-mono">
                {formatMs(line.startMs)} - {formatMs(line.endMs)}
              </span>
            </div>
            <textarea
              value={line.text}
              onChange={(event) => updateLine(index, event.target.value)}
              rows={2}
              className="w-full resize-y bg-transparent text-[14px] font-[600] leading-5 text-[#1A1A2E] outline-none"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CastPanel() {
  return (
    <PanelEmpty
      title="Character consistency is coming soon"
      description="This first pass keeps the Cast entry lightweight while the editor focuses on project data, lyrics, scenes, preview, and export."
    />
  );
}

function ScenesPanel() {
  const { currentScene, scenes, setCurrentTime } = useEditor();

  return (
    <div className="flex flex-col">
      <div className="mb-[16px] flex flex-wrap items-center justify-center gap-[8px] border-b border-[#E8E8E8] pb-[16px]">
        <button
          type="button"
          disabled
          title="Batch image generation is not wired in this preview pass."
          className="inline-flex h-[38px] items-center gap-[8px] rounded-[6px] border border-[#D9DDE3] bg-white px-[12px] text-[13px] font-[800] text-[#334155] opacity-70"
        >
          <ImageIcon className="h-[15px] w-[15px]" />
          Batch Image Generation
        </button>
        <button
          type="button"
          disabled
          title="Batch video generation is not wired in this preview pass."
          className="inline-flex h-[38px] items-center gap-[8px] rounded-[6px] border border-[#D9DDE3] bg-white px-[12px] text-[13px] font-[800] text-[#334155] opacity-70"
        >
          <Clapperboard className="h-[15px] w-[15px]" />
          Batch Video Generation
        </button>
      </div>

      {scenes.length === 0 ? (
        <PanelEmpty
          title="No scenes yet"
          description="Generate a storyboard to review scene timing, imagery, and prompts here."
        />
      ) : (
        <div className="flex flex-col">
          {scenes.map((scene, index) => {
            const active = currentScene?.id === scene.id;
            const durationMs = Math.max(0, (scene.endMs || scene.startMs) - scene.startMs);
            const title = scene.text?.trim() || "Instrumental";

            return (
              <div
                key={scene.id}
                role="button"
                tabIndex={0}
                onClick={() => setCurrentTime(msToSeconds(scene.startMs))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setCurrentTime(msToSeconds(scene.startMs));
                  }
                }}
                className={cn(
                  "group flex min-h-[82px] cursor-pointer items-center gap-[12px] border-b border-[#E1E6EE] py-[10px] outline-none",
                  active ? "bg-[#FFF8EB]" : "bg-white hover:bg-[#F8F9FA]",
                )}
              >
                <div className="h-[54px] w-[92px] shrink-0 overflow-hidden rounded-[4px] bg-[#E8EEF7]">
                  {scene.imageUrl ? (
                    <img src={scene.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-[800] uppercase text-[#8A94A6]">
                      {scene.status || "draft"}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-[5px] flex min-w-0 flex-wrap items-center gap-x-[8px] gap-y-[2px] text-[11px] font-[800] text-[#61708A]">
                    <span>Scene {index + 1}</span>
                    <span className="font-mono">
                      {formatMs(scene.startMs)} - {formatMs(scene.endMs)}
                    </span>
                    <span className="font-mono">{formatDurationMs(durationMs)}</span>
                  </div>
                  <p className="line-clamp-2 text-[15px] font-[700] leading-[20px] text-[#1A1A2E]">{title}</p>
                </div>

                <div className="flex shrink-0 items-center gap-[6px]">
                  <button
                    type="button"
                    onClick={(event) => event.stopPropagation()}
                    className="h-[36px] rounded-[6px] border border-[#CAD3DF] bg-white px-[11px] text-[13px] font-[800] text-[#334155] hover:bg-[#F8F9FA]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Scene ${index + 1} more options`}
                    className="flex h-[36px] w-[32px] items-center justify-center rounded-[6px] border border-[#CAD3DF] bg-white text-[#334155] hover:bg-[#F8F9FA]"
                  >
                    <MoreVertical className="h-[16px] w-[16px]" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PanelEmpty({ description, title }: { description: string; title: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[8px] border border-dashed border-[#E8E8E8] bg-[#FAFAFA] px-8 text-center">
      <Users className="mb-3 size-8 text-[#F5A623]" />
      <p className="text-[14px] font-[800] text-[#1A1A2E]">{title}</p>
      <p className="mt-2 max-w-sm text-[13px] font-[500] leading-6 text-[#667085]">{description}</p>
    </div>
  );
}

function LatestExport({
  exportJob,
  renderStatus,
  renderUrl,
}: {
  exportJob?: LyricExport;
  renderStatus: string;
  renderUrl?: string | null;
}) {
  const url = exportJob?.videoUrl || renderUrl;
  const status = exportJob?.status || renderStatus;

  return (
    <section className="rounded-[8px] border border-[#E8E8E8] bg-[#FAFAFA] p-[14px]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-[800] text-[#1A1A2E]">Latest export</p>
          <p className="mt-[3px] text-[12px] font-[600] text-[#667085]">{status || "empty"}</p>
        </div>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-[6px] bg-[#F5A623] px-[10px] py-[7px] text-[12px] font-[800] text-white"
          >
            Download
          </a>
        ) : null}
      </div>
      {exportJob?.error ? <p className="mt-[10px] text-[12px] font-[600] leading-5 text-red-600">{exportJob.error}</p> : null}
    </section>
  );
}

function PlaybackControls() {
  const { currentTime, isPlaying, project, setCurrentTime, setIsPlaying, setZoom, totalDuration, zoom } = useEditor();

  function togglePlayback() {
    if (currentTime >= totalDuration) setCurrentTime(0);
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
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-[28px] w-[28px] items-center justify-center text-[#333333]"
          >
            {isPlaying ? <Pause className="h-[20px] w-[20px]" /> : <Play className="h-[20px] w-[20px]" />}
          </button>
          <button type="button" onClick={() => setCurrentTime(currentTime + 1)} aria-label="Next">
            <StepForward className="h-[16px] w-[16px]" />
          </button>
          <button type="button" onClick={() => setCurrentTime(totalDuration)} aria-label="Jump to end">
            <SkipForward className="h-[16px] w-[16px]" />
          </button>
        </div>

        <span className="ml-[8px] font-mono text-[13px] font-[800] text-[#444444]">
          {formatClock(currentTime, true)} / {formatClock(totalDuration, true)}
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

function Timeline({ height }: { height: number }) {
  const { currentScene, currentTime, lines, scenes, setCurrentTime, totalDuration, zoom } = useEditor();
  const timelineRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const trackWidth = `${Math.max(100, zoom * 100)}%`;
  const playheadPct = (currentTime / totalDuration) * 100;
  const ticks = Array.from({ length: Math.floor(totalDuration) + 1 }, (_, index) => index);
  const rulerHeight = 22;
  const sceneTop = 24;
  const sceneHeight = clamp(Math.round(height * 0.42), 32, 72);
  const lyricTop = sceneTop + sceneHeight + 8;
  const lyricHeight = Math.max(18, height - lyricTop - 6);

  function secondsAt(clientX: number) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return (clamp(clientX - rect.left, 0, rect.width) / rect.width) * totalDuration;
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCurrentTime(secondsAt(event.clientX));
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    setCurrentTime(secondsAt(event.clientX));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="shrink-0 overflow-x-auto bg-[#FAFAFA]" style={{ height }}>
      <div
        ref={timelineRef}
        className="relative h-full min-w-full touch-none"
        style={{ width: trackWidth }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute left-0 right-0 top-0" style={{ height: rulerHeight }}>
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute top-0 flex h-[20px] -translate-x-1/2 flex-col items-center"
              style={{ left: `${(tick / totalDuration) * 100}%` }}
            >
              <span className="font-mono text-[11px] leading-[13px] text-[#888888]">{formatClock(tick)}</span>
              <span className="mt-[2px] h-[4px] w-[1px] bg-[#CCCCCC]" />
            </div>
          ))}
        </div>

        <div className="absolute left-0 right-0" style={{ top: sceneTop, height: sceneHeight }}>
          {scenes.length === 0 ? (
            <div className="absolute inset-x-0 top-0 bg-[#E9EDF3]" style={{ height: sceneHeight }} />
          ) : (
            scenes.map((scene) => {
              const left = (msToSeconds(scene.startMs) / totalDuration) * 100;
              const width = ((scene.endMs - scene.startMs) / 1000 / totalDuration) * 100;
              const active = currentScene?.id === scene.id;
              return (
                <div
                  key={scene.id}
                  className={cn("absolute top-0 overflow-hidden border-r border-white", active ? "outline outline-[2px] outline-[#F5A623]" : "")}
                  style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%`, height: sceneHeight }}
                >
                  {scene.imageUrl ? (
                    <img src={scene.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#E8EEF7] text-[10px] font-[800] uppercase text-[#8A94A6]">
                      {scene.status}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="absolute left-0 right-0" style={{ top: lyricTop, height: lyricHeight }}>
          <div className="absolute inset-x-0 top-[13px] h-[1px] bg-[#DDE8F4]" />
          {lines.map((line, index) => {
            const left = (msToSeconds(line.startMs) / totalDuration) * 100;
            const width = ((line.endMs - line.startMs) / 1000 / totalDuration) * 100;
            return (
              <span
                key={line.id || index}
                className="absolute top-[5px] min-w-[2px] rounded-[2px] bg-[#4A90D9]/70"
                style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%`, height: Math.min(16, lyricHeight - 8) }}
              />
            );
          })}
        </div>

        <div className="absolute bottom-0 top-0 w-[2px] bg-[#E53935]" style={{ left: `${playheadPct}%` }}>
          <span className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[10px] border-x-transparent border-t-[#E53935]" />
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  const { latestExport, loadError, project, refresh } = useEditor();
  const blockingError = loadError || project?.pipelineError || latestExport?.error;
  const ready = project?.renderStatus === "ready" || latestExport?.status === "success";

  return (
    <footer className="flex h-[44px] shrink-0 items-center justify-center border-t border-[#E8E8E8] bg-white px-[16px]">
      {blockingError ? (
        <div className="flex items-center gap-[10px] text-[13px] font-[700] text-red-600">
          <AlertCircle className="h-[16px] w-[16px]" />
          <span className="max-w-[720px] truncate">{blockingError}</span>
          <button type="button" onClick={refresh} className="inline-flex items-center gap-1 rounded-[5px] border border-red-200 px-2 py-1">
            <RefreshCcw className="h-[13px] w-[13px]" />
            Retry
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-[12px] text-[13px] font-[700] text-[#777777]">
          <span>{ready ? "Export ready." : "Preview ready! Customize the look & feel or continue:"}</span>
          <button
            type="button"
            onClick={() => toast.info("Continue flow coming next")}
            className="flex h-[28px] w-[180px] items-center justify-center gap-[8px] rounded-[8px] bg-[#F5A623] text-[14px] font-[800] text-white hover:bg-[#E6981F]"
          >
            Continue -&gt;
          </button>
        </div>
      )}
    </footer>
  );
}

function VerticalResizeHandle({ onPointerDown }: { onPointerDown: (event: PointerEvent<HTMLDivElement>) => void }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize side panel"
      tabIndex={0}
      onPointerDown={onPointerDown}
      className="group relative z-10 h-full w-[8px] shrink-0 cursor-col-resize bg-transparent"
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#E8E8E8] transition group-hover:bg-[#F5A623]" />
      <span className="absolute left-1/2 top-1/2 h-[46px] w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#D6DCE5] opacity-0 transition group-hover:opacity-100" />
    </div>
  );
}

function HorizontalResizeHandle({ onPointerDown }: { onPointerDown: (event: PointerEvent<HTMLDivElement>) => void }) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize timeline"
      tabIndex={0}
      onPointerDown={onPointerDown}
      className="group relative z-10 h-[8px] shrink-0 cursor-row-resize bg-white"
    >
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[#E8E8E8] transition group-hover:bg-[#F5A623]" />
      <span className="absolute left-1/2 top-1/2 h-[4px] w-[56px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#D6DCE5] opacity-0 transition group-hover:opacity-100" />
    </div>
  );
}

function EditorWorkspace() {
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
            generateLabel="Generate lyrics (10 credits)"
            workingLabel={preparingAudio ? "Preparing clip and lyrics..." : "Uploading audio..."}
            successLabel="Lyrics generated"
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

export function PreviewWorkbench({ appName, projectId }: { appName: string; projectId: string }) {
  useEffect(() => {
    const htmlOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, []);

  return (
    <EditorProvider appName={appName} projectId={projectId}>
      <EditorWorkspace />
    </EditorProvider>
  );
}

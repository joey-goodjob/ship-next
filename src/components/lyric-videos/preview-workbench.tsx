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
  Plus,
  RefreshCcw,
  Save,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Type,
  Trash2,
  Users,
  Volume2,
  Wand2,
  X,
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
  lineId?: string | null;
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

type LyricCastMember = {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  role: string;
  description: string;
  promptFragment: string;
  referenceImageUrl?: string | null;
  imageTaskId?: string | null;
  providerTaskId?: string | null;
  imageModel?: string | null;
  imagePromptSnapshot?: string | null;
  generationParams?: string | null;
  completedAt?: string | null;
  failureCode?: string | null;
  error?: string | null;
  status: string;
  sort: number;
};

type ProjectDetails = {
  project: LyricVideoProject;
  generationRun?: unknown;
  generationSteps?: unknown[];
  words?: LyricWord[];
  lines: LyricLine[];
  scenes: LyricScene[];
  cast?: LyricCastMember[];
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

type GenerationRunResponse = {
  run?: unknown;
  steps?: unknown[];
  project?: LyricVideoProject;
  lines?: LyricLine[];
  words?: LyricWord[];
  scenes?: LyricScene[];
  songAnalysis?: unknown;
};

type EditorContextValue = {
  projectId: string;
  appName: string;
  project: LyricVideoProject | null;
  lines: LyricLine[];
  words: LyricWord[];
  scenes: LyricScene[];
  cast: LyricCastMember[];
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
  currentWord?: LyricWord;
  lyricsDirty: boolean;
  wordsDirty: boolean;
  exporting: boolean;
  preparingAudio: boolean;
  creatingStory: boolean;
  castBusy: boolean;
  audioAvailable: boolean;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlayback: () => Promise<void>;
  playFrom: (time: number) => Promise<void>;
  playScenePreview: (startTime: number, endTime: number) => Promise<void>;
  pausePlayback: () => void;
  setActiveTab: (tab: PanelTab) => void;
  setZoom: (zoom: number) => void;
  updateProjectField: <K extends keyof LyricVideoProject>(key: K, value: LyricVideoProject[K]) => void;
  setLines: (lines: LyricLine[]) => void;
  setWords: (words: LyricWord[]) => void;
  uploadAndTranscribe: (
    file: File,
    startTime: number,
    endTime: number,
    options: { useEntireAudio: boolean; durationSeconds: number },
  ) => Promise<void>;
  createStory: () => Promise<void>;
  generateStoryboardPrompts: () => Promise<void>;
  generateCastCandidates: () => Promise<void>;
  createCastMember: (params: { name: string; description: string; promptFragment?: string }) => Promise<LyricCastMember | null>;
  updateCastMember: (castId: string, data: Partial<LyricCastMember> & { selectAsMain?: boolean }) => Promise<LyricCastMember | null>;
  deleteCastMember: (castId: string) => Promise<void>;
  regenerateCastImage: (castId: string) => Promise<LyricCastMember | null>;
  syncCastImages: () => Promise<void>;
  saveLyrics: () => Promise<boolean>;
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
const LYRIC_FRAME_RATE = 30;

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

function msToFrame(ms?: number | null) {
  return Math.max(0, Math.round((ms || 0) / (1000 / LYRIC_FRAME_RATE)));
}

function frameToMs(frame: number) {
  return Math.max(0, Math.round(frame * (1000 / LYRIC_FRAME_RATE)));
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

function sortWords(words: LyricWord[]) {
  return [...words].sort((a, b) => (a.startMs || 0) - (b.startMs || 0) || (a.sort || 0) - (b.sort || 0));
}

function wordId(index: number) {
  return `draft-word-${Date.now()}-${index}`;
}

function createWordsFromLines(lines: LyricLine[]) {
  return lines.flatMap((line, lineIndex) => {
    const tokens = line.text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    const startMs = Math.max(0, line.startMs || 0);
    const endMs = Math.max(startMs + 1, line.endMs || startMs + 3500);
    const stepMs = Math.max(1, Math.round((endMs - startMs) / tokens.length));

    return tokens.map((token, tokenIndex) => ({
      id: `line-${line.id || lineIndex}-word-${tokenIndex}`,
      lineId: line.id,
      word: token,
      startMs: startMs + tokenIndex * stepMs,
      endMs: tokenIndex === tokens.length - 1 ? endMs : Math.min(endMs, startMs + (tokenIndex + 1) * stepMs),
      sort: tokenIndex,
    }));
  });
}

function wordsFromDetails(details: ProjectDetails) {
  if (details.words?.length) return sortWords(details.words);

  const lineWords = details.lines.flatMap((line) => line.words || []);
  if (lineWords.length) return sortWords(lineWords);

  return createWordsFromLines(details.lines);
}

function wordBelongsToLine(word: LyricWord, line: LyricLine) {
  if (word.lineId && line.id) return word.lineId === line.id;
  const wordStart = word.startMs || 0;
  const wordEnd = word.endMs || wordStart;
  return (wordStart >= line.startMs && wordStart < line.endMs) || (wordEnd > line.startMs && wordEnd <= line.endMs);
}

function deriveLinesFromWords(lines: LyricLine[], words: LyricWord[]) {
  const sorted = sortWords(words);
  return lines.map((line) => {
    const lineWords = sorted.filter((word) => wordBelongsToLine(word, line) && word.word.trim());
    if (lineWords.length === 0) return line;
    return {
      ...line,
      text: lineWords.map((word) => word.word.trim()).join(" "),
      startMs: Math.min(...lineWords.map((word) => word.startMs)),
      endMs: Math.max(...lineWords.map((word) => word.endMs)),
      words: lineWords,
    };
  });
}

function normalizeWordsForSave(words: LyricWord[], totalDuration: number) {
  const maxMs = Math.max(0, secondsToMs(totalDuration));
  return sortWords(words)
    .map((word, index) => {
      const text = word.word.trim();
      const frameStart = msToFrame(word.startMs);
      const maxFrame = maxMs > 0 ? msToFrame(maxMs) : Number.MAX_SAFE_INTEGER;
      const startFrame = clamp(frameStart, 0, maxFrame);
      const endFrame = clamp(Math.max(startFrame + 1, msToFrame(word.endMs)), startFrame + 1, Math.max(startFrame + 1, maxFrame));
      return {
        id: word.id,
        lineId: word.lineId,
        word: text,
        startMs: frameToMs(startFrame),
        endMs: frameToMs(endFrame),
        sort: index,
      };
    })
    .filter((word) => word.word);
}

function wordOverlapsRange(word: LyricWord, startMs: number, endMs: number) {
  return (word.endMs || word.startMs) > startMs && word.startMs < endMs;
}

function lineOverlapsRange(line: LyricLine, startMs: number, endMs: number) {
  return line.endMs > startMs && line.startMs < endMs;
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
  const [words, setWordsState] = useState<LyricWord[]>([]);
  const [scenes, setScenes] = useState<LyricScene[]>([]);
  const [cast, setCast] = useState<LyricCastMember[]>([]);
  const [exports, setExports] = useState<LyricExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [currentTime, setCurrentTimeState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("customize");
  const [zoom, setZoomState] = useState(1);
  const [lyricsDirty, setLyricsDirty] = useState(false);
  const [wordsDirty, setWordsDirty] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preparingAudio, setPreparingAudio] = useState(false);
  const [creatingStory, setCreatingStory] = useState(false);
  const [castBusy, setCastBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scenePreviewEndRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const autoTranscribeProjectRef = useRef<string | null>(null);
  const autoStoryProjectRef = useRef<string | null>(null);
  const pendingProjectPatchRef = useRef<Partial<LyricVideoProject>>({});

  const totalDuration = useMemo(() => {
    const candidates = [
      project?.audioDurationMs || 0,
      ...lines.map((line) => line.endMs || 0),
      ...words.map((word) => word.endMs || 0),
      ...scenes.map((scene) => scene.endMs || 0),
      20110,
    ];
    return Math.max(...candidates) / 1000;
  }, [lines, project?.audioDurationMs, scenes, words]);

  const currentScene = useMemo(() => {
    const currentMs = secondsToMs(currentTime);
    const activeScene = scenes.find((scene) => currentMs >= scene.startMs && currentMs < scene.endMs);
    if (activeScene) return activeScene;
    return [...scenes].reverse().find((scene) => currentMs >= scene.startMs) || scenes[0];
  }, [currentTime, scenes]);

  const currentLine = useMemo(() => {
    return (
      lines.find((line) => currentTime >= msToSeconds(line.startMs) && currentTime < msToSeconds(line.endMs)) ||
      lines[0]
    );
  }, [currentTime, lines]);

  const currentWord = useMemo(() => {
    return (
      words.find((word) => currentTime >= msToSeconds(word.startMs) && currentTime < msToSeconds(word.endMs)) ||
      undefined
    );
  }, [currentTime, words]);

  const latestExport = exports[0];
  const audioSrc = project?.processedAudioUrl || project?.audioUrl || project?.originalAudioUrl || "";
  const audioAvailable = Boolean(audioSrc);

  const refresh = useCallback(async () => {
    setLoadError("");
    try {
      const details = await requestJson<ProjectDetails>(`/api/lyric-videos/${projectId}`);
      if (!details?.project) throw new Error("Project not found");
      setProject(details.project);
      setLinesState(details.lines || []);
      setWordsState(wordsFromDetails(details));
      setScenes(details.scenes || []);
      setCast(details.cast || []);
      setExports(details.exports || []);
      setLyricsDirty(false);
      setWordsDirty(false);
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
    const hasProcessingCast = cast.some((member) => member.providerTaskId && !member.referenceImageUrl && member.status !== "failed");
    if (!hasProcessingCast) return;
    const timer = window.setInterval(() => {
      syncCastImages();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [cast]);

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
            generationStatus: "running",
            generationProgress: 5,
            pipelineStage: "generation_queued",
            pipelineError: null,
          }
        : previous,
    );
    console.info("[lyric-video] auto generation started from preview", {
      projectId: project.id,
      audioUrl: project.audioUrl,
      originalAudioUrl: project.originalAudioUrl,
      processedAudioUrl: project.processedAudioUrl,
      trimStartMs: project.trimStartMs,
      trimEndMs: project.trimEndMs,
    });

    requestJson<GenerationRunResponse>(`/api/lyric-videos/${project.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(async (generated) => {
        console.info("[lyric-video] auto generation completed from preview", {
          projectId: project.id,
          lineCount: generated.lines?.length || 0,
          sceneCount: generated.scenes?.length || 0,
          firstScene: generated.scenes?.[0],
        });
        setProject((previous) => generated.project || previous);
        setLinesState(generated.lines || []);
        setWordsState(generated.words?.length ? sortWords(generated.words) : createWordsFromLines(generated.lines || []));
        setScenes(generated.scenes || []);
        setLyricsDirty(false);
        setWordsDirty(false);
        setCurrentTimeState(0);
        setActiveTab("scenes");
        await refresh();
        setSaveStatus("saved");
        toast.success("Lyrics and storyboard prompts are ready");
      })
      .catch(async (err: any) => {
        console.error("[lyric-video] auto generation flow failed from preview", err);
        setSaveStatus("failed");
        await refresh();
        toast.error(err?.message || "Generate storyboard failed");
      })
      .finally(() => {
        setPreparingAudio(false);
      });
  }, [lines.length, preparingAudio, project, refresh]);

  useEffect(() => {
    const shouldCreateStory =
      project &&
      lines.length > 0 &&
      scenes.length === 0 &&
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
  }, [creatingStory, lines.length, project, scenes.length]);

  useEffect(() => {
    if (!audioSrc) {
      audioRef.current?.pause();
      audioRef.current = null;
      scenePreviewEndRef.current = null;
      setIsPlaying(false);
      return;
    }

    const audio = new Audio(audioSrc);
    audio.preload = "metadata";
    audio.currentTime = clamp(currentTime, 0, totalDuration);
    audioRef.current = audio;

    function syncCurrentTime() {
      const nextTime = Number(clamp(audio.currentTime || 0, 0, totalDuration).toFixed(3));
      const sceneEnd = scenePreviewEndRef.current;
      if (sceneEnd !== null && nextTime >= sceneEnd) {
        audio.currentTime = sceneEnd;
        setCurrentTimeState(Number(sceneEnd.toFixed(3)));
        scenePreviewEndRef.current = null;
        audio.pause();
        return;
      }
      setCurrentTimeState(nextTime);
    }

    function handlePlay() {
      setIsPlaying(true);
    }

    function handlePause() {
      setIsPlaying(false);
    }

    function handleEnded() {
      scenePreviewEndRef.current = null;
      setIsPlaying(false);
      setCurrentTimeState(Number(clamp(audio.duration || totalDuration, 0, totalDuration).toFixed(3)));
    }

    function handleError() {
      scenePreviewEndRef.current = null;
      setIsPlaying(false);
      toast.error("Audio failed to load");
    }

    audio.addEventListener("timeupdate", syncCurrentTime);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", syncCurrentTime);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", syncCurrentTime);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadedmetadata", syncCurrentTime);
      audio.removeEventListener("error", handleError);
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [audioSrc, totalDuration]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      audioRef.current?.pause();
    };
  }, []);

  function setCurrentTime(time: number) {
    scenePreviewEndRef.current = null;
    const nextTime = Number(clamp(time, 0, totalDuration).toFixed(3));
    setCurrentTimeState(nextTime);
    if (audioRef.current && Math.abs(audioRef.current.currentTime - nextTime) > 0.05) {
      audioRef.current.currentTime = nextTime;
    }
  }

  function pausePlayback() {
    scenePreviewEndRef.current = null;
    audioRef.current?.pause();
    setIsPlaying(false);
  }

  async function playAudio(from?: number, sceneEnd?: number | null) {
    const audio = audioRef.current;
    if (!audioAvailable || !audio) {
      setIsPlaying(false);
      toast.error("No audio available for this project");
      return;
    }

    scenePreviewEndRef.current = sceneEnd ?? null;
    if (typeof from === "number") {
      const startTime = Number(clamp(from, 0, totalDuration).toFixed(3));
      audio.currentTime = startTime;
      setCurrentTimeState(startTime);
    }

    try {
      await audio.play();
    } catch {
      scenePreviewEndRef.current = null;
      setIsPlaying(false);
      toast.error("Click play again to start audio");
    }
  }

  async function playFrom(time: number) {
    await playAudio(time, null);
  }

  async function togglePlayback() {
    if (isPlaying) {
      pausePlayback();
      return;
    }
    const startTime = currentTime >= totalDuration ? 0 : currentTime;
    await playAudio(startTime, null);
  }

  async function playScenePreview(startTime: number, endTime: number) {
    const safeStart = clamp(startTime, 0, totalDuration);
    const safeEnd = clamp(endTime, safeStart, totalDuration);
    const outsideScene = currentTime < safeStart || currentTime >= safeEnd;
    await playAudio(outsideScene ? safeStart : currentTime, safeEnd);
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

  function setWords(nextWords: LyricWord[]) {
    const sortedWords = sortWords(nextWords);
    setWordsState(sortedWords);
    setLinesState((previous) => deriveLinesFromWords(previous, sortedWords));
    setWordsDirty(true);
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

      console.info("[lyric-video] requesting one-click LLM storyboard generation", { projectId });
      const generated = await requestJson<GenerationRunResponse>(`/api/lyric-videos/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      console.info("[lyric-video] one-click LLM storyboard generation completed", {
        projectId,
        lineCount: generated.lines?.length || 0,
        sceneCount: generated.scenes?.length || 0,
        firstScene: generated.scenes?.[0],
      });

      setProject((previous) => generated.project || previous);
      setLinesState(generated.lines || []);
      setWordsState(generated.words?.length ? sortWords(generated.words) : createWordsFromLines(generated.lines || []));
      setScenes(generated.scenes || []);
      setLyricsDirty(false);
      setWordsDirty(false);
      setCurrentTimeState(0);
      setActiveTab("scenes");
      await refresh();
      setSaveStatus("saved");
      toast.success("Lyrics and storyboard prompts are ready");
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

  async function generateStoryboardPrompts() {
    if (!project) {
      toast.error("Project unavailable");
      return;
    }
    if (lines.length === 0) {
      toast.error("Generate lyrics before creating scenes");
      return;
    }

    setSaveStatus("saving");
    try {
      if (lyricsDirty || wordsDirty) {
        const saved = await saveLyrics();
        if (!saved) return;
      }

      let storyPrompt = (project.storyPrompt || "").trim();
      if (!storyPrompt) {
        const story = await requestJson<StoryGenerationResponse>(`/api/lyric-videos/${project.id}/story`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        storyPrompt = story.storyPrompt;
        setProject((previous) => story.project || (previous ? { ...previous, storyPrompt } : previous));
      }

      const generated = await requestJson<LyricScene[]>(`/api/lyric-videos/${project.id}/storyboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyPrompt }),
      });
      setScenes(generated || []);
      setProject((previous) =>
        previous
          ? {
              ...previous,
              storyPrompt,
              scenesStatus: "ready",
              pipelineStage: "storyboard_ready",
              pipelineError: null,
            }
          : previous,
      );
      setActiveTab("scenes");
      setSaveStatus("saved");
      await refresh();
      toast.success("Storyboard prompts are ready");
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Generate storyboard failed");
    }
  }

  async function generateCastCandidates() {
    if (!project || castBusy) return;
    setCastBusy(true);
    setSaveStatus("saving");
    try {
      const generated = await requestJson<LyricCastMember[]>(`/api/lyric-videos/${project.id}/cast/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setCast(generated || []);
      setActiveTab("cast");
      setSaveStatus("saved");
      toast.success("Character candidates queued");
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Generate characters failed");
    } finally {
      setCastBusy(false);
    }
  }

  async function createCastMember(params: { name: string; description: string; promptFragment?: string }) {
    if (!project || castBusy) return null;
    setCastBusy(true);
    setSaveStatus("saving");
    try {
      const created = await requestJson<LyricCastMember>(`/api/lyric-videos/${project.id}/cast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      setCast((previous) => [...previous.filter((item) => item.id !== created.id), created]);
      setSaveStatus("saved");
      toast.success("Character created");
      return created;
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Create character failed");
      return null;
    } finally {
      setCastBusy(false);
    }
  }

  async function updateCastMember(castId: string, data: Partial<LyricCastMember> & { selectAsMain?: boolean }) {
    if (!project) return null;
    setSaveStatus("saving");
    try {
      const updated = await requestJson<LyricCastMember>(`/api/lyric-videos/${project.id}/cast/${castId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setCast((previous) =>
        data.selectAsMain
          ? previous.map((item) => (item.id === updated.id ? updated : { ...item, status: item.status === "deleted" ? item.status : "inactive" }))
          : previous.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSaveStatus("saved");
      toast.success(data.selectAsMain ? "Main character selected" : "Character saved");
      return updated;
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Save character failed");
      return null;
    }
  }

  async function deleteCastMember(castId: string) {
    if (!project) return;
    setSaveStatus("saving");
    try {
      await requestJson<void>(`/api/lyric-videos/${project.id}/cast/${castId}`, { method: "DELETE" });
      setCast((previous) => previous.filter((item) => item.id !== castId));
      setSaveStatus("saved");
      toast.success("Character deleted");
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Delete character failed");
    }
  }

  async function regenerateCastImage(castId: string) {
    if (!project || castBusy) return null;
    setCastBusy(true);
    setSaveStatus("saving");
    try {
      const updated = await requestJson<LyricCastMember>(`/api/lyric-videos/${project.id}/cast/${castId}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setCast((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
      setSaveStatus("saved");
      toast.success("Character image queued");
      return updated;
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Generate character image failed");
      return null;
    } finally {
      setCastBusy(false);
    }
  }

  async function syncCastImages() {
    if (!project) return;
    try {
      const synced = await requestJson<LyricCastMember[]>(`/api/lyric-videos/${project.id}/cast/images`);
      setCast(synced || []);
    } catch (err: any) {
      toast.error(err?.message || "Sync character images failed");
    }
  }

  async function saveLyrics() {
    try {
      setSaveStatus("saving");
      const cleanWords = normalizeWordsForSave(words, totalDuration);
      const derivedLines = deriveLinesFromWords(lines, cleanWords);
      const saved = await requestJson<LyricLine[]>(`/api/lyric-videos/${projectId}/lyrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: derivedLines, words: cleanWords }),
      });
      setLinesState(saved || []);
      setWordsState(cleanWords);
      setLyricsDirty(false);
      setWordsDirty(false);
      setSaveStatus("saved");
      await refresh();
      toast.success("Lyrics saved");
      return true;
    } catch (err: any) {
      setSaveStatus("failed");
      toast.error(err?.message || "Save lyrics failed");
      return false;
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
      words,
      scenes,
      cast,
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
      currentWord,
      lyricsDirty,
      wordsDirty,
      exporting,
      preparingAudio,
      creatingStory,
      castBusy,
      audioAvailable,
      setCurrentTime,
      setIsPlaying,
      togglePlayback,
      playFrom,
      playScenePreview,
      pausePlayback,
      setActiveTab,
      setZoom,
      updateProjectField,
      setLines,
      setWords,
      uploadAndTranscribe,
      createStory,
      generateStoryboardPrompts,
      generateCastCandidates,
      createCastMember,
      updateCastMember,
      deleteCastMember,
      regenerateCastImage,
      syncCastImages,
      saveLyrics,
      queueExport,
      refresh,
    }),
    [
      activeTab,
      appName,
      audioAvailable,
      currentLine,
      currentScene,
      currentTime,
      currentWord,
      cast,
      castBusy,
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
      words,
      wordsDirty,
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
                "flex h-[52px] items-center gap-[7px] border-b-[2px] text-[14px] font-[800] outline-none focus-visible:rounded-[4px] focus-visible:ring-2 focus-visible:ring-[#D8E8FF]",
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
  const {
    currentLine,
    currentScene,
    currentTime,
    currentWord,
    isPlaying,
    lines,
    lyricsDirty,
    pausePlayback,
    playScenePreview,
    project,
    saveLyrics,
    scenes,
    setCurrentTime,
    setWords,
    totalDuration,
    words,
  } = useEditor();
  const [openWordMenuId, setOpenWordMenuId] = useState<string | null>(null);
  const lyricsProcessing = project?.lyricsStatus === "processing";
  const lyricsFailed = project?.lyricsStatus === "failed";
  const projectEndMs = secondsToMs(totalDuration);
  const segmentStartMs = currentScene?.startMs ?? 0;
  const segmentEndMs = Math.max(segmentStartMs + 1, currentScene?.endMs ?? projectEndMs);
  const maxFrame = msToFrame(Math.max(1, segmentEndMs - segmentStartMs));
  const visibleWords = currentScene ? words.filter((word) => wordOverlapsRange(word, segmentStartMs, segmentEndMs)) : words;
  const sceneIndex = currentScene ? scenes.findIndex((scene) => scene.id === currentScene.id) : -1;
  const previousScene = sceneIndex > 0 ? scenes[sceneIndex - 1] : undefined;
  const nextScene = sceneIndex >= 0 && sceneIndex < scenes.length - 1 ? scenes[sceneIndex + 1] : undefined;
  const sceneLines = currentScene ? lines.filter((line) => lineOverlapsRange(line, segmentStartMs, segmentEndMs)) : lines;
  const sceneText =
    currentScene?.text?.trim() ||
    visibleWords
      .map((word) => word.word.trim())
      .filter(Boolean)
      .join(" ") ||
    sceneLines
      .map((line) => line.text.trim())
      .filter(Boolean)
      .join(" ");
  const invalidWords = words.filter((word) => !word.word.trim() || msToFrame(word.endMs) <= msToFrame(word.startMs));
  const invalidSceneWords = visibleWords.filter((word) => !word.word.trim() || msToFrame(word.endMs) <= msToFrame(word.startMs));
  const invalidHiddenWords = invalidWords.length - invalidSceneWords.length;
  const canSaveLyrics = lyricsDirty && lines.length > 0 && words.length > 0 && invalidSceneWords.length === 0;

  function goToScene(scene?: LyricScene) {
    if (!scene) return;
    setOpenWordMenuId(null);
    setCurrentTime(msToSeconds(scene.startMs));
  }

  async function saveAndNext() {
    const saved = await saveLyrics();
    if (saved && nextScene) setCurrentTime(msToSeconds(nextScene.startMs));
  }

  function wordFrame(ms: number) {
    return clamp(msToFrame(ms - segmentStartMs), 0, maxFrame);
  }

  function frameMs(frame: number) {
    return clamp(segmentStartMs + frameToMs(frame), segmentStartMs, segmentEndMs);
  }

  function updateWord(wordId: string, patch: Partial<LyricWord>) {
    setOpenWordMenuId(null);
    setWords(words.map((word) => (word.id === wordId ? { ...word, ...patch } : word)));
  }

  function updateWordFrame(wordIdValue: string, key: "startMs" | "endMs", rawValue: string | number) {
    setOpenWordMenuId(null);
    const frame = clamp(Math.round(Number(rawValue) || 0), 0, Math.max(1, maxFrame));
    setWords(
      words.map((word) => {
        if (word.id !== wordIdValue) return word;
        const currentStartFrame = wordFrame(word.startMs);
        const currentEndFrame = wordFrame(word.endMs);
        if (key === "startMs") {
          const startFrame = clamp(frame, 0, Math.max(0, currentEndFrame - 1));
          return { ...word, startMs: frameMs(startFrame) };
        }
        const endFrame = clamp(frame, currentStartFrame + 1, Math.max(currentStartFrame + 1, maxFrame));
        return { ...word, endMs: frameMs(endFrame) };
      }),
    );
  }

  function nudgeWordFrame(word: LyricWord, key: "startMs" | "endMs", delta: number) {
    updateWordFrame(word.id, key, wordFrame(word[key]) + delta);
  }

  function addWord() {
    setOpenWordMenuId(null);
    const baseLine =
      sceneLines.find((line) => currentTime >= msToSeconds(line.startMs) && currentTime < msToSeconds(line.endMs)) ||
      currentLine ||
      sceneLines[0] ||
      lines[lines.length - 1];
    const preferredStartMs = currentWord?.endMs ?? secondsToMs(currentTime);
    const baseStartMs = clamp(preferredStartMs, segmentStartMs, Math.max(segmentStartMs, segmentEndMs - 1));
    const baseStartFrame = wordFrame(baseStartMs);
    const startFrame = clamp(baseStartFrame, 0, Math.max(0, maxFrame - 1));
    const endFrame = clamp(startFrame + Math.max(1, Math.round(LYRIC_FRAME_RATE * 0.4)), startFrame + 1, Math.max(startFrame + 1, maxFrame));
    const nextWord: LyricWord = {
      id: wordId(words.length),
      lineId: baseLine?.id || null,
      word: "word",
      startMs: frameMs(startFrame),
      endMs: frameMs(endFrame),
      sort: words.length,
    };
    setWords([...words, nextWord]);
    setCurrentTime(msToSeconds(nextWord.startMs));
  }

  function deleteWord(wordIdValue: string) {
    setWords(words.filter((word) => word.id !== wordIdValue));
    setOpenWordMenuId(null);
  }

  return (
    <div className="flex flex-col gap-[16px]" onClick={() => setOpenWordMenuId(null)}>
      {currentScene ? (
        <div className="rounded-[8px] border border-[#DDE5EF] bg-[#F8FBFF] p-[10px]">
          <div className="flex items-start justify-between gap-[10px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-[8px]">
                <span className="text-[14px] font-[900] text-[#1A1A2E]">Scene {sceneIndex + 1}</span>
                <span className="rounded-full border border-[#D8E2EE] bg-white px-[7px] py-[2px] font-mono text-[11px] font-[800] text-[#61708A]">
                  {formatMs(segmentStartMs)} - {formatMs(segmentEndMs)}
                </span>
                <span className="text-[11px] font-[800] text-[#8A94A6]">
                  {visibleWords.length} {visibleWords.length === 1 ? "word" : "words"}
                </span>
              </div>
              <p className="mt-[6px] max-h-[40px] overflow-hidden text-[12px] font-[700] leading-5 text-[#4E6384]">
                {sceneText || "No recognized words in this scene yet."}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-[6px]">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goToScene(previousScene);
                }}
                disabled={!previousScene}
                aria-label="Previous scene"
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border border-[#CAD3DF] bg-white text-[#61708A] hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <StepBack className="h-[14px] w-[14px]" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goToScene(nextScene);
                }}
                disabled={!nextScene}
                aria-label="Next scene"
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border border-[#CAD3DF] bg-white text-[#61708A] hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <StepForward className="h-[14px] w-[14px]" />
              </button>
            </div>
          </div>

          <div className="mt-[10px] flex flex-wrap justify-end gap-[8px]">
            <button
              type="button"
              onClick={saveLyrics}
              disabled={!canSaveLyrics}
              className="inline-flex h-[32px] items-center gap-[7px] rounded-[6px] border border-[#CAD3DF] bg-white px-[10px] text-[12px] font-[800] text-[#334155] hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save className="h-[14px] w-[14px]" />
              Save
            </button>
            <button
              type="button"
              onClick={saveAndNext}
              disabled={!canSaveLyrics || !nextScene}
              className="inline-flex h-[32px] items-center gap-[7px] rounded-[6px] bg-[#1A1A2E] px-[10px] text-[12px] font-[800] text-white hover:bg-[#2D2D44] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save &amp; Next
              <StepForward className="h-[14px] w-[14px]" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={saveLyrics}
            disabled={!canSaveLyrics}
            className="inline-flex h-[32px] items-center gap-[7px] rounded-[6px] border border-[#CAD3DF] bg-white px-[10px] text-[12px] font-[800] text-[#334155] hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save className="h-[14px] w-[14px]" />
            Save
          </button>
        </div>
      )}

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
            Upload an audio clip first, then ElevenLabs will generate timed lyrics here.
          </p>
        </div>
      ) : null}

      {words.length > 0 ? (
        <>
          <LyricsMiniWaveform
            currentTime={currentTime}
            currentWord={currentWord}
            isPlaying={isPlaying}
            onPlayScene={() => playScenePreview(msToSeconds(segmentStartMs), msToSeconds(segmentEndMs))}
            onPause={pausePlayback}
            segmentEndMs={segmentEndMs}
            segmentStartMs={segmentStartMs}
            setCurrentTime={setCurrentTime}
            words={visibleWords}
          />

          <div className="mx-auto w-full max-w-[560px]">
            <div className="grid grid-cols-[minmax(132px,1fr)_142px_142px_36px] gap-[8px] px-[2px] pb-[8px] text-[12px] font-[800] text-[#405372] max-[560px]:grid-cols-[minmax(116px,1fr)_112px_112px_34px]">
              <span>Word</span>
              <span>Start Frame</span>
              <span>End Frame</span>
              <span />
            </div>

            <div className="flex flex-col gap-[7px]">
              {visibleWords.map((word) => {
              const active = currentWord?.id === word.id;
              const invalid = !word.word.trim() || msToFrame(word.endMs) <= msToFrame(word.startMs);
              return (
                <div
                  key={word.id}
                  onClick={() => setCurrentTime(msToSeconds(word.startMs))}
                  className={cn(
                    "grid grid-cols-[minmax(132px,1fr)_142px_142px_36px] items-center gap-[8px] rounded-[6px] outline-none max-[560px]:grid-cols-[minmax(116px,1fr)_112px_112px_34px]",
                    active ? "bg-[#FFF8EB]" : "hover:bg-[#F8F9FA]",
                    invalid ? "border-red-300 bg-red-50" : "",
                  )}
                >
                  <input
                    value={word.word}
                    onChange={(event) => updateWord(word.id, { word: event.target.value })}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`${word.word || "word"} text`}
                    className={cn(
                      "h-[36px] min-w-0 rounded-[5px] border bg-white px-[10px] text-[13px] font-[700] text-[#26364E] outline-none focus:border-[#F5A623]",
                      active ? "border-[#F5A623]" : "border-[#CAD3DF]",
                      invalid ? "border-red-300" : "",
                    )}
                  />
                  <WordFrameStepper
                    label={`${word.word || "word"} start frame`}
                    max={maxFrame}
                    min={0}
                    value={wordFrame(word.startMs)}
                    onChange={(value) => updateWordFrame(word.id, "startMs", value)}
                    onStep={(delta) => nudgeWordFrame(word, "startMs", delta)}
                  />
                  <WordFrameStepper
                    label={`${word.word || "word"} end frame`}
                    max={maxFrame}
                    min={1}
                    value={wordFrame(word.endMs)}
                    onChange={(value) => updateWordFrame(word.id, "endMs", value)}
                    onStep={(delta) => nudgeWordFrame(word, "endMs", delta)}
                  />
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenWordMenuId(openWordMenuId === word.id ? null : word.id);
                      }}
                      aria-label={`${word.word || "word"} actions`}
                      className="flex h-[36px] w-[34px] items-center justify-center rounded-[5px] border border-[#CAD3DF] bg-white text-[#61708A] hover:bg-[#F8F9FA]"
                    >
                      <MoreVertical className="h-[15px] w-[15px]" />
                    </button>
                    {openWordMenuId === word.id ? (
                      <div
                        className="absolute right-0 top-[40px] z-20 w-[112px] rounded-[6px] border border-[#DDE5EF] bg-white p-[4px] shadow-[0_8px_20px_rgba(15,23,42,0.12)]"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => deleteWord(word.id)}
                          className="flex h-[30px] w-full items-center rounded-[4px] px-[8px] text-left text-[12px] font-[800] text-red-600 hover:bg-red-50"
                        >
                          Delete word
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
              })}
            </div>

            {visibleWords.length === 0 ? (
              <div className="rounded-[8px] border border-[#E8E8E8] bg-[#FAFAFA] p-[14px] text-center text-[13px] font-[700] leading-6 text-[#667085]">
                No words in this scene yet. Add a word to start timing this section.
              </div>
            ) : null}
          </div>

          {invalidSceneWords.length > 0 ? (
            <p className="mx-auto w-full max-w-[560px] rounded-[6px] border border-red-200 bg-red-50 px-[10px] py-[8px] text-[12px] font-[700] leading-5 text-red-700">
              Fix empty words and frame ranges in this scene before saving.
            </p>
          ) : null}
          {invalidSceneWords.length === 0 && invalidHiddenWords > 0 ? (
            <p className="mx-auto w-full max-w-[560px] rounded-[6px] border border-amber-200 bg-amber-50 px-[10px] py-[8px] text-[12px] font-[700] leading-5 text-amber-800">
              {invalidHiddenWords} issue{invalidHiddenWords === 1 ? "" : "s"} in other scenes will not block this scene.
            </p>
          ) : null}
        </>
      ) : lines.length > 0 && !lyricsProcessing ? (
        <div className="rounded-[8px] border border-[#E8E8E8] bg-[#FAFAFA] p-[14px] text-[13px] font-[600] leading-6 text-[#667085]">
          This project has line-level lyrics only. Add a word to start frame-level timing.
        </div>
      ) : null}

      <button
        type="button"
        onClick={addWord}
        disabled={lines.length === 0 || maxFrame <= 1}
        className="mx-auto inline-flex h-[34px] items-center gap-[7px] rounded-[6px] border border-[#CAD3DF] bg-white px-[12px] text-[13px] font-[800] text-[#334155] hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-[14px] w-[14px]" />
        Add word
      </button>
    </div>
  );
}

function LyricsMiniWaveform({
  currentTime,
  currentWord,
  isPlaying,
  onPause,
  onPlayScene,
  segmentEndMs,
  segmentStartMs,
  setCurrentTime,
  words,
}: {
  currentTime: number;
  currentWord?: LyricWord;
  isPlaying: boolean;
  onPause: () => void;
  onPlayScene: () => void;
  segmentEndMs: number;
  segmentStartMs: number;
  setCurrentTime: (time: number) => void;
  words: LyricWord[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const durationMs = Math.max(1, segmentEndMs - segmentStartMs);
  const playheadPct = clamp(((secondsToMs(currentTime) - segmentStartMs) / durationMs) * 100, 0, 100);
  const bars = useMemo(
    () =>
      Array.from({ length: 96 }, (_, index) => {
        const wave = Math.sin(index * 0.58) * 0.35 + Math.sin(index * 1.17) * 0.22 + Math.sin(index * 0.19) * 0.18;
        return clamp(28 + Math.abs(wave) * 52 + ((index * 13) % 17), 24, 86);
      }),
    [],
  );
  const tickCount = clamp(Math.ceil(durationMs / 1000), 1, 4);
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => index / tickCount);

  function seekFromClientX(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
    setCurrentTime(msToSeconds(segmentStartMs + durationMs * pct));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromClientX(event.clientX);
  }

  function pctForMs(ms: number) {
    return clamp(((ms - segmentStartMs) / durationMs) * 100, 0, 100);
  }

  return (
    <div className="rounded-[6px] border border-[#DDE5EF] bg-white p-[8px]">
      <div className="flex items-stretch gap-[8px]">
        <button
          type="button"
          onClick={() => (isPlaying ? onPause() : onPlayScene())}
          aria-label={isPlaying ? "Pause lyrics" : "Play lyrics"}
          className="flex h-[54px] w-[42px] shrink-0 items-center justify-center rounded-[6px] border border-[#D8E2EE] bg-white text-[#405372] hover:bg-[#F8F9FA]"
        >
          {isPlaying ? <Pause className="h-[20px] w-[20px]" /> : <Play className="h-[20px] w-[20px]" />}
        </button>
        <div
          ref={trackRef}
          className="relative h-[54px] flex-1 touch-none overflow-hidden rounded-[5px] border border-[#D8E2EE] bg-[#F4F8FF]"
          onPointerDown={handlePointerDown}
        >
          <div className="absolute inset-x-0 top-1/2 flex h-[42px] -translate-y-1/2 items-center gap-[2px] px-[2px]">
            {bars.map((height, index) => (
              <span key={index} className="flex-1 rounded-full bg-[#69A9FF]" style={{ height: `${height}%` }} />
            ))}
          </div>

          {words.map((word) => {
            const left = pctForMs(word.startMs);
            const right = pctForMs(word.endMs);
            const active = currentWord?.id === word.id;
            return (
              <button
                key={word.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setCurrentTime(msToSeconds(word.startMs));
                }}
                className={cn(
                  "absolute top-[4px] h-[46px] overflow-hidden rounded-[4px] border px-[6px] text-left text-[12px] font-[800] leading-[46px] text-[#37506F] outline-none",
                  active ? "border-[#F5A623] bg-[#E6F1FF]/95 text-[#1F3350]" : "border-[#74ADF3] bg-[#BFD9FF]/72 hover:bg-[#D9E9FF]",
                )}
                style={{ left: `${left}%`, width: `${Math.max(5, right - left)}%` }}
              >
                <span className="block truncate">{word.word || "word"}</span>
              </button>
            );
          })}

          <div className="absolute bottom-0 top-0 z-10 w-[2px] bg-[#FF4757]" style={{ left: `${playheadPct}%` }}>
            <span className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[9px] border-x-transparent border-t-[#FF4757]" />
          </div>
        </div>
      </div>

      <div className="ml-[50px] mt-[6px] flex justify-between font-mono text-[11px] font-[700] text-[#61708A]">
        {ticks.map((tick) => (
          <span key={tick}>{formatClock((durationMs * tick) / 1000, true)}</span>
        ))}
      </div>
    </div>
  );
}

function WordFrameStepper({
  label,
  max,
  min,
  onChange,
  onStep,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: string) => void;
  onStep: (delta: number) => void;
  value: number;
}) {
  return (
    <div className="flex h-[36px] min-w-0 overflow-hidden rounded-[5px] border border-[#CAD3DF] bg-white">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onStep(-1);
        }}
        disabled={value <= min}
        aria-label={`${label} decrease`}
        className="flex w-[30px] shrink-0 items-center justify-center border-r border-[#DDE5EF] text-[#8AA0BC] hover:bg-[#F8F9FA] disabled:opacity-35"
      >
        <StepBack className="h-[14px] w-[14px]" />
      </button>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        aria-label={label}
        className="h-full min-w-0 flex-1 border-0 bg-white px-[8px] font-mono text-[13px] font-[800] text-[#26364E] outline-none focus:bg-[#FFF8EB]"
      />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onStep(1);
        }}
        disabled={value >= max}
        aria-label={`${label} increase`}
        className="flex w-[30px] shrink-0 items-center justify-center border-l border-[#DDE5EF] text-[#8AA0BC] hover:bg-[#F8F9FA] disabled:opacity-35"
      >
        <StepForward className="h-[14px] w-[14px]" />
      </button>
    </div>
  );
}

function castImageIsProcessing(member: LyricCastMember) {
  return Boolean(member.providerTaskId && !member.referenceImageUrl && member.status !== "failed");
}

function CastPanel() {
  const {
    cast,
    castBusy,
    createCastMember,
    deleteCastMember,
    generateCastCandidates,
    regenerateCastImage,
    updateCastMember,
  } = useEditor();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");

  function beginCreate() {
    setEditingId(null);
    setDraftName("");
    setDraftDescription("");
    setFormOpen(true);
  }

  function beginEdit(member: LyricCastMember) {
    setEditingId(member.id);
    setDraftName(member.name);
    setDraftDescription(member.description);
    setFormOpen(true);
  }

  async function submitCharacter() {
    const name = draftName.trim();
    const description = draftDescription.trim();
    if (!name || !description) {
      toast.error("Name and description are required");
      return;
    }

    if (editingId) {
      const updated = await updateCastMember(editingId, { name, description, promptFragment: description });
      if (updated) {
        setFormOpen(false);
        setEditingId(null);
      }
      return;
    }

    const created = await createCastMember({ name, description, promptFragment: description });
    if (created) {
      setFormOpen(false);
      await regenerateCastImage(created.id);
    }
  }

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-wrap items-center justify-center gap-[8px] border-b border-[#E8E8E8] pb-[16px]">
        <button
          type="button"
          onClick={generateCastCandidates}
          disabled={castBusy}
          className="inline-flex h-[38px] items-center gap-[8px] rounded-[6px] border border-[#D9DDE3] bg-white px-[12px] text-[13px] font-[800] text-[#334155] hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {castBusy ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Wand2 className="h-[15px] w-[15px]" />}
          Generate candidates
        </button>
        <button
          type="button"
          onClick={beginCreate}
          className="inline-flex h-[38px] items-center gap-[8px] rounded-[6px] bg-[#F5A623] px-[12px] text-[13px] font-[800] text-white hover:bg-[#E6981F]"
        >
          <Plus className="h-[15px] w-[15px]" />
          Add character
        </button>
      </div>

      {formOpen ? (
        <section className="rounded-[8px] border border-[#E8E8E8] bg-[#FAFAFA] p-[14px]">
          <div className="mb-[10px] flex items-center justify-between">
            <p className="text-[13px] font-[800] text-[#1A1A2E]">{editingId ? "Edit character" : "Create character"}</p>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
              }}
              aria-label="Close character form"
              className="text-[#667085] hover:text-[#1A1A2E]"
            >
              <X className="h-[16px] w-[16px]" />
            </button>
          </div>
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="Elena"
            className="mb-[8px] h-[38px] w-full rounded-[6px] border border-[#D9DDE3] bg-white px-[11px] text-[13px] font-[700] text-[#334155] outline-none focus:border-[#F5A623]"
          />
          <textarea
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            rows={5}
            placeholder="Describe the face, hair, build, outfit, accessories, and overall vibe."
            className="w-full resize-y rounded-[6px] border border-[#D9DDE3] bg-white px-[11px] py-[9px] text-[13px] font-[500] leading-5 text-[#334155] outline-none focus:border-[#F5A623]"
          />
          <div className="mt-[10px] flex justify-end gap-[8px]">
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
              }}
              className="h-[34px] rounded-[6px] border border-[#D9DDE3] px-[12px] text-[13px] font-[800] text-[#667085] hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitCharacter}
              disabled={castBusy}
              className="inline-flex h-[34px] items-center gap-[7px] rounded-[6px] bg-[#1A1A2E] px-[12px] text-[13px] font-[800] text-white hover:bg-[#2B2B45] disabled:opacity-50"
            >
              {castBusy ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Save className="h-[14px] w-[14px]" />}
              {editingId ? "Save" : "Create & generate"}
            </button>
          </div>
        </section>
      ) : null}

      {cast.length === 0 ? (
        <PanelEmpty
          title="No characters yet"
          description="Generate a few main character candidates from the song, or create one manually."
        />
      ) : (
        <div className="flex flex-col divide-y divide-[#E8E8E8]">
          {cast.map((member) => {
            const processing = castImageIsProcessing(member);
            const active = member.status === "active";
            const failed = member.status === "failed";
            return (
              <article key={member.id} className="flex gap-[12px] py-[14px]">
                <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-[#EEF2F7]">
                  {member.referenceImageUrl ? (
                    <img src={member.referenceImageUrl} alt={member.name} className="h-full w-full object-cover" />
                  ) : processing ? (
                    <Loader2 className="h-[22px] w-[22px] animate-spin text-[#F5A623]" />
                  ) : (
                    <Users className="h-[24px] w-[24px] text-[#94A3B8]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-[10px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-[6px]">
                        <p className="truncate text-[14px] font-[900] text-[#1A1A2E]">{member.name}</p>
                        <span
                          className={cn(
                            "rounded-[999px] px-[7px] py-[2px] text-[10px] font-[800] uppercase",
                            active
                              ? "bg-emerald-50 text-emerald-700"
                              : failed
                                ? "bg-red-50 text-red-600"
                                : "bg-[#F1F5F9] text-[#64748B]",
                          )}
                        >
                          {processing ? "processing" : active ? "main" : member.status}
                        </span>
                      </div>
                      <p className="mt-[6px] line-clamp-3 text-[12px] font-[500] leading-5 text-[#526173]">{member.description}</p>
                      {member.error ? <p className="mt-[6px] text-[12px] font-[700] text-red-600">{member.error}</p> : null}
                    </div>
                  </div>
                  <div className="mt-[10px] flex flex-wrap gap-[7px]">
                    <button
                      type="button"
                      onClick={() => updateCastMember(member.id, { selectAsMain: true })}
                      disabled={active}
                      className="inline-flex h-[31px] items-center gap-[6px] rounded-[6px] border border-[#D9DDE3] px-[9px] text-[12px] font-[800] text-[#334155] hover:bg-[#F8F9FA] disabled:opacity-45"
                    >
                      <Check className="h-[13px] w-[13px]" />
                      Select
                    </button>
                    <button
                      type="button"
                      onClick={() => beginEdit(member)}
                      className="inline-flex h-[31px] items-center gap-[6px] rounded-[6px] border border-[#D9DDE3] px-[9px] text-[12px] font-[800] text-[#334155] hover:bg-[#F8F9FA]"
                    >
                      <Edit3 className="h-[13px] w-[13px]" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => regenerateCastImage(member.id)}
                      disabled={castBusy || processing}
                      className="inline-flex h-[31px] items-center gap-[6px] rounded-[6px] border border-[#D9DDE3] px-[9px] text-[12px] font-[800] text-[#334155] hover:bg-[#F8F9FA] disabled:opacity-45"
                    >
                      <RefreshCcw className="h-[13px] w-[13px]" />
                      Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCastMember(member.id)}
                      className="inline-flex h-[31px] items-center justify-center rounded-[6px] border border-[#F0D8D8] px-[9px] text-red-600 hover:bg-red-50"
                      aria-label={`Delete ${member.name}`}
                    >
                      <Trash2 className="h-[13px] w-[13px]" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScenesPanel() {
  const { currentScene, scenes, setCurrentTime } = useEditor();
  const [batchGenerationOpen, setBatchGenerationOpen] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="mb-[16px] flex flex-wrap items-center justify-center gap-[8px] border-b border-[#E8E8E8] pb-[16px]">
        <button
          type="button"
          onClick={() => setBatchGenerationOpen(true)}
          disabled={scenes.length === 0}
          className="inline-flex h-[38px] items-center gap-[8px] rounded-[6px] border border-[#D9DDE3] bg-white px-[12px] text-[13px] font-[800] text-[#334155] hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Wand2 className="h-[15px] w-[15px]" />
          Batch Generation
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
      <BatchGenerationDialog open={batchGenerationOpen} onClose={() => setBatchGenerationOpen(false)} />
    </div>
  );
}

function BatchGenerationDialog({ onClose, open }: { onClose: () => void; open: boolean }) {
  const { project, scenes } = useEditor();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [imagePromptDrafts, setImagePromptDrafts] = useState<Record<string, string>>({});
  const [videoPromptDrafts, setVideoPromptDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setImagePromptDrafts(Object.fromEntries(scenes.map((scene) => [scene.id, scene.prompt || ""])));
    setVideoPromptDrafts(Object.fromEntries(scenes.map((scene) => [scene.id, scene.motionPrompt || ""])));
  }, [open, scenes]);

  if (!open) return null;

  const selectedCount = selectedIds.size;
  const creditCost = selectedCount * 10;
  const allSelected = scenes.length > 0 && selectedCount === scenes.length;

  function toggleScene(sceneId: string, checked: boolean) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(sceneId);
      else next.delete(sceneId);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(scenes.map((scene) => scene.id)) : new Set());
  }

  function updateImagePrompt(sceneId: string, prompt: string) {
    setImagePromptDrafts((previous) => ({ ...previous, [sceneId]: prompt }));
  }

  function updateVideoPrompt(sceneId: string, prompt: string) {
    setVideoPromptDrafts((previous) => ({ ...previous, [sceneId]: prompt }));
  }

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-white text-[#1A1A2E]">
      <header className="flex h-[84px] shrink-0 items-start justify-between border-b border-[#E8E8E8] px-[22px] py-[18px]">
        <div>
          <h2 className="text-[24px] font-[800] leading-[28px] text-[#334155]">Batch Generation</h2>
          <p className="mt-[7px] text-[14px] font-[600] text-[#4E6384]">Video: {project?.title || "Lyric video"}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close batch generation"
          className="flex h-[36px] w-[36px] items-center justify-center rounded-[6px] text-[#61708A] hover:bg-[#F8F9FA]"
        >
          <X className="h-[20px] w-[20px]" />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-[22px]">
        <div className="mx-auto w-full max-w-[1360px]">
          <label className="flex h-[56px] items-center gap-[12px]">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) => toggleAll(event.target.checked)}
              className="h-[20px] w-[20px] rounded-[4px] border-[#B7C5D8] text-[#F5A623]"
              aria-label="Select all scenes"
            />
            <ChevronDown className="h-[16px] w-[16px] text-[#4E6384]" />
          </label>

          <div>
            {scenes.map((scene, index) => {
              const checked = selectedIds.has(scene.id);
              const durationMs = Math.max(0, (scene.endMs || scene.startMs) - scene.startMs);
              const title = scene.text?.trim() || "Instrumental";
              return (
	                <section
	                  key={scene.id}
	                  data-batch-scene-row
	                  className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-[14px] gap-y-[12px] border-b border-[#DDE5EF] py-[16px] md:grid-cols-[32px_minmax(140px,180px)_minmax(0,1fr)_minmax(0,1fr)] md:gap-[16px] xl:grid-cols-[44px_220px_minmax(390px,1fr)_minmax(390px,1fr)]"
	                >
	                  <div className="pt-[2px] md:pt-[92px]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => toggleScene(scene.id, event.target.checked)}
                      className="h-[20px] w-[20px] rounded-[4px] border-[#B7C5D8] text-[#F5A623]"
                      aria-label={`Select scene ${index + 1}`}
                    />
                  </div>

	                  <div className="min-w-0 pt-0 md:pt-[74px]">
                    <div className="mb-[8px] flex flex-wrap items-center gap-x-[8px] gap-y-[2px] text-[11px] font-[800] text-[#61708A]">
                      <span>Scene {index + 1}</span>
                      <span className="font-mono">
                        {formatMs(scene.startMs)} - {formatMs(scene.endMs)}
                      </span>
                      <span className="font-mono">{formatDurationMs(durationMs)}</span>
                    </div>
	                    <p className="max-w-[230px] text-[16px] font-[700] leading-[24px] text-[#26364E]">{title}</p>
	                    <span className="mt-[14px] inline-flex rounded-[5px] bg-[#EEF3F8] px-[6px] py-[3px] text-[10px] font-[800] text-[#334155]">
	                      10 credits
	                    </span>
	                  </div>

	                  <div className="col-start-2 min-w-0 rounded-[7px] border border-[#D8E0EA] bg-[#F8FAFC] p-[10px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:col-start-3 md:row-start-1">
	                    <div className="mb-[8px] flex items-center justify-between gap-[10px]">
	                      <div className="inline-flex min-w-0 items-center gap-[7px] text-[13px] font-[800] text-[#26364E]">
	                        <ImageIcon className="h-[15px] w-[15px] shrink-0" />
	                        <span className="truncate xl:hidden">Still Image</span>
	                        <span className="hidden truncate xl:inline">Create Still Image</span>
	                      </div>
	                      <button
	                        type="button"
	                        disabled
	                        className="inline-flex h-[28px] shrink-0 items-center gap-[6px] rounded-[5px] bg-[#E9EEF6] px-[9px] text-[11px] font-[800] text-[#61708A] disabled:cursor-not-allowed"
	                      >
	                        <RefreshCcw className="h-[12px] w-[12px]" />
	                        <span className="xl:hidden">Retry</span>
	                        <span className="hidden xl:inline">Retry Image</span>
	                        <span className="inline-flex items-center gap-[3px]">
	                          <Coins className="h-[11px] w-[11px]" />5
	                        </span>
	                      </button>
	                    </div>
	                    <div className="grid gap-[10px] 2xl:grid-cols-[minmax(0,1fr)_minmax(170px,0.86fr)]">
	                      <textarea
	                        value={imagePromptDrafts[scene.id] ?? scene.prompt ?? ""}
	                        onChange={(event) => updateImagePrompt(scene.id, event.target.value)}
	                        aria-label={`Scene ${index + 1} image prompt`}
	                        className="min-h-[162px] w-full resize-y rounded-[5px] border border-[#CAD3DF] bg-white px-[10px] py-[9px] text-[13px] font-[600] leading-[20px] text-[#26364E] outline-none focus:border-[#F5A623]"
	                      />
	                      <div className="aspect-video w-full overflow-hidden rounded-[5px] bg-[#E8EEF7]">
	                        {scene.imageUrl ? (
	                          <img src={scene.imageUrl} alt="" className="h-full w-full object-cover" />
	                        ) : (
	                          <div className="flex h-full w-full items-center justify-center text-[12px] font-[800] uppercase text-[#8A94A6]">
	                            {scene.status || "draft"}
	                          </div>
	                        )}
	                      </div>
	                    </div>
	                  </div>

	                  <div className="col-start-2 min-w-0 rounded-[7px] border border-[#D8E0EA] bg-[#F8FAFC] p-[10px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:col-start-4 md:row-start-1">
	                    <div className="mb-[8px] flex items-center justify-between gap-[10px]">
	                      <div className="inline-flex min-w-0 items-center gap-[7px] text-[13px] font-[800] text-[#26364E]">
	                        <Clapperboard className="h-[15px] w-[15px] shrink-0" />
	                        <span className="truncate xl:hidden">Animate</span>
	                        <span className="hidden truncate xl:inline">Animate the Image</span>
	                      </div>
	                      <button
	                        type="button"
	                        className="inline-flex h-[28px] w-[142px] shrink-0 items-center justify-between rounded-[5px] border border-[#CAD3DF] bg-white px-[9px] text-[11px] font-[800] text-[#334155]"
	                      >
	                        Video Model
	                        <ChevronDown className="h-[13px] w-[13px] text-[#61708A]" />
	                      </button>
	                    </div>
	                    <textarea
	                      value={videoPromptDrafts[scene.id] ?? scene.motionPrompt ?? ""}
	                      onChange={(event) => updateVideoPrompt(scene.id, event.target.value)}
	                      aria-label={`Scene ${index + 1} video prompt`}
	                      className="min-h-[210px] w-full resize-y rounded-[5px] border border-[#CAD3DF] bg-white px-[10px] py-[9px] text-[13px] font-[600] leading-[20px] text-[#26364E] outline-none focus:border-[#F5A623]"
	                    />
	                    <div className="mt-[8px] flex items-center justify-between rounded-[5px] border border-dashed border-[#CAD3DF] bg-white px-[10px] py-[7px] text-[11px] font-[800] text-[#61708A]">
	                      <span className="inline-flex items-center gap-[6px]">
	                        <Play className="h-[12px] w-[12px]" />
	                        Video preview placeholder
	                      </span>
	                      <span className="inline-flex items-center gap-[3px]">
	                        <Coins className="h-[11px] w-[11px]" />5
	                      </span>
	                    </div>
	                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </main>

      <footer className="flex min-h-[92px] shrink-0 flex-col items-stretch justify-center gap-[10px] border-t border-[#E8E8E8] bg-white px-[16px] py-[12px] sm:flex-row sm:items-center sm:justify-end sm:gap-[18px] sm:px-[22px]">
        <button type="button" onClick={onClose} className="h-[42px] px-[10px] text-[15px] font-[800] text-[#4E6384]">
          Cancel
        </button>
        <div className="flex flex-col items-stretch gap-[6px] sm:items-end">
          <button
            type="button"
            disabled
            title="Mock preview only. This button does not call the generation APIs yet."
            className="h-[42px] rounded-[6px] bg-[#FFD987] px-[16px] text-[15px] font-[800] text-[#8A6A1C] disabled:cursor-not-allowed disabled:opacity-90"
          >
            Regenerate {selectedCount} Scenes ({creditCost} credits)
          </button>
          <span className="text-right text-[10px] font-[600] text-[#61708A]">Estimated time to generate: ~20 minutes</span>
        </div>
      </footer>
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
  const { audioAvailable, currentTime, isPlaying, setCurrentTime, setZoom, togglePlayback, totalDuration, zoom } = useEditor();

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
            disabled={!audioAvailable}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-[28px] w-[28px] items-center justify-center text-[#333333] disabled:cursor-not-allowed disabled:opacity-40"
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
  const { currentScene, currentTime, currentWord, lines, scenes, setCurrentTime, totalDuration, words, zoom } = useEditor();
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
          {(words.length > 0 ? words : lines).map((item, index) => {
            const active = "word" in item && currentWord?.id === item.id;
            const left = (msToSeconds(item.startMs) / totalDuration) * 100;
            const width = ((item.endMs - item.startMs) / 1000 / totalDuration) * 100;
            return (
              <span
                key={item.id || index}
                className={cn(
                  "absolute top-[5px] min-w-[2px] rounded-[2px]",
                  words.length > 0 ? "bg-[#4A90D9]/75" : "bg-[#4A90D9]/70",
                  active ? "outline outline-[2px] outline-[#F5A623]" : "",
                )}
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
  const { generateStoryboardPrompts, latestExport, loadError, project, refresh, saveStatus } = useEditor();
  const blockingError = loadError || project?.pipelineError || latestExport?.error;
  const ready = project?.renderStatus === "ready" || latestExport?.status === "success";
  const continuing = saveStatus === "saving";

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
            onClick={generateStoryboardPrompts}
            disabled={continuing}
            className="flex h-[28px] w-[180px] items-center justify-center gap-[8px] rounded-[8px] bg-[#F5A623] text-[14px] font-[800] text-white hover:bg-[#E6981F] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {continuing ? "Working..." : "Continue ->"}
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

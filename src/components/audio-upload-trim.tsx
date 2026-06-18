"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Check,
  Clock,
  FolderOpen,
  Music,
  Pause,
  Play,
  RefreshCcw,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024;
const DEFAULT_FORMATS = ["mp3", "wav", "flac", "aac", "ogg", "m4a"];
const WAVEFORM_BUCKETS = 180;
const WAVEFORM_WIDTH = 1000;
const WAVEFORM_HEIGHT = 96;
const MIN_TRIM_SECONDS = 1;

type CreditsResponse = {
  code: number;
  message: string;
  data?: {
    balance?: number;
  };
};

type CreationStage = "idle" | "uploading" | "waiting-auth" | "creating" | "generating" | "redirecting" | "failed";

export type UploadedAudioSource = {
  url: string;
  key: string;
  filename: string;
  size: number;
  contentType?: string;
  checksum?: string;
  durationSeconds?: number;
};

export interface AudioUploadTrimProps {
  maxFileSize?: number;
  acceptedFormats?: string[];
  creditsPerSecond?: number;
  creditCost?: number;
  showCredits?: boolean;
  showTrimControls?: boolean;
  compact?: boolean;
  presentation?: "default" | "home-card";
  homeCardSize?: "default" | "narrow";
  completionState?: "success" | "idle";
  autoGenerateOnReady?: boolean;
  afterTrimSlot?: ReactNode;
  creationStage?: CreationStage;
  uploadProgress?: number | null;
  showBack?: boolean;
  backLabel?: string;
  generateLabel?: string;
  workingLabel?: string;
  successLabel?: string;
  maxFileSizeLabel?: string;
  initialUploadedAudio?: UploadedAudioSource | null;
  deferInitialAudioUntilReady?: boolean;
  onClearInitialAudio?: () => void;
  onBack?: () => void;
  onGenerate?: (
    file: File | null,
    startTime: number,
    endTime: number,
    options: { useEntireAudio: boolean; durationSeconds: number },
    uploadedAudio?: UploadedAudioSource | null,
  ) => Promise<void> | void;
}

function ms(seconds: number) {
  return Math.max(0, Math.round(seconds * 1000));
}

function secondsFromMs(value: number) {
  return Math.max(0, value / 1000);
}

function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function formatDecimal(seconds: number) {
  return Math.max(0, seconds).toFixed(3).replace(/\.000$/, "");
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatAudioExtension(name: string, type?: string) {
  const extension = name.split(".").pop()?.trim().toUpperCase();
  return extension || (type?.split("/").pop()?.trim().toUpperCase() || "AUDIO");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeDurationSeconds(value?: number) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function fallbackPeaks(seed: string, count = WAVEFORM_BUCKETS) {
  return Array.from({ length: count }).map((_, index) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i) + index * 17) % 9973;
    }
    const mixed = Math.sin((hash + index * 43) * 12.9898) * 43758.5453;
    return 0.25 + Math.abs(mixed % 0.75);
  });
}

async function decodeWaveform(file: File, bucketCount = WAVEFORM_BUCKETS) {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) throw new Error("AudioContext is not supported");

  const audioContext = new AudioContextCtor();
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const samples = audioBuffer.getChannelData(0);
    const bucketSize = Math.max(1, Math.floor(samples.length / bucketCount));
    const peaks = Array.from({ length: bucketCount }).map((_, bucketIndex) => {
      const start = bucketIndex * bucketSize;
      const end = Math.min(samples.length, start + bucketSize);
      let max = 0;
      for (let index = start; index < end; index += 1) {
        max = Math.max(max, Math.abs(samples[index] || 0));
      }
      return max;
    });
    const maxPeak = Math.max(...peaks, 0.001);
    return {
      duration: audioBuffer.duration,
      peaks: peaks.map((peak) => clamp(peak / maxPeak, 0.04, 1)),
    };
  } finally {
    audioContext.close?.();
  }
}

function isSupportedAudioFile(file: File, formats: string[]) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return file.type.startsWith("audio/") || formats.includes(extension);
}

function Waveform({
  peaks,
  startSeconds,
  endSeconds,
  durationSeconds,
  currentTime,
  disabled,
  onChangeStart,
  onChangeEnd,
  onSeek,
}: {
  peaks: number[];
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  currentTime: number;
  disabled?: boolean;
  onChangeStart: (value: number) => void;
  onChangeEnd: (value: number) => void;
  onSeek: (value: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragTarget, setDragTarget] = useState<"start" | "end" | null>(null);
  const leftPct = durationSeconds > 0 ? clamp((startSeconds / durationSeconds) * 100, 0, 100) : 0;
  const rightPct = durationSeconds > 0 ? clamp((endSeconds / durationSeconds) * 100, 0, 100) : 100;
  const widthPct = Math.max(1, rightPct - leftPct);
  const playheadPct = durationSeconds > 0 ? clamp((currentTime / durationSeconds) * 100, leftPct, rightPct) : leftPct;

  function secondsAtPointer(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || durationSeconds <= 0) return 0;
    return Number((clamp((clientX - rect.left) / rect.width, 0, 1) * durationSeconds).toFixed(3));
  }

  function updateDrag(target: "start" | "end", clientX: number) {
    const seconds = secondsAtPointer(clientX);
    if (target === "start") {
      onChangeStart(Number(clamp(seconds, 0, Math.max(0, endSeconds - MIN_TRIM_SECONDS)).toFixed(3)));
    } else {
      onChangeEnd(Number(clamp(seconds, startSeconds + MIN_TRIM_SECONDS, durationSeconds).toFixed(3)));
    }
  }

  function startDrag(target: "start" | "end", event: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || durationSeconds <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    setDragTarget(target);
    containerRef.current?.setPointerCapture(event.pointerId);
    updateDrag(target, event.clientX);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragTarget || disabled) return;
    event.preventDefault();
    updateDrag(dragTarget, event.clientX);
  }

  function stopDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragTarget) return;
    if (containerRef.current?.hasPointerCapture(event.pointerId)) {
      containerRef.current.releasePointerCapture(event.pointerId);
    }
    setDragTarget(null);
  }

  function handleSeek(event: React.PointerEvent<HTMLDivElement>) {
    if (dragTarget || durationSeconds <= 0) return;
    const seconds = clamp(secondsAtPointer(event.clientX), startSeconds, endSeconds);
    onSeek(seconds);
  }

  return (
    <div
      ref={containerRef}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onPointerDown={handleSeek}
      className="relative h-24 touch-none overflow-hidden rounded-sm bg-brand-soft"
    >
      <svg viewBox={`0 0 ${WAVEFORM_WIDTH} ${WAVEFORM_HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
        {peaks.map((peak, index) => {
          const x = (index / Math.max(1, peaks.length - 1)) * WAVEFORM_WIDTH;
          const barHeight = Math.max(4, peak * (WAVEFORM_HEIGHT - 18));
          const y = (WAVEFORM_HEIGHT - barHeight) / 2;
          const centerPct = (index / Math.max(1, peaks.length - 1)) * 100;
          const selected = centerPct >= leftPct && centerPct <= rightPct;
          return (
            <line
              key={index}
              x1={x}
              x2={x}
              y1={y}
              y2={y + barHeight}
              stroke="var(--brand-accent)"
              strokeOpacity={selected ? 1 : 0.28}
              strokeWidth="3"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div
        className="absolute inset-y-0 bg-brand-accent/15"
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      />
      <div className="absolute inset-y-0 w-0.5 bg-brand-ink" style={{ left: `${playheadPct}%` }}>
        <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rotate-45 bg-brand-ink" />
      </div>
      <button
        type="button"
        onPointerDown={(event) => startDrag("start", event)}
        disabled={disabled}
        className="absolute top-0 flex h-full w-4 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center bg-brand-accent text-brand-accent-ink disabled:cursor-not-allowed disabled:opacity-60"
        style={{ left: `${leftPct}%` }}
        aria-label="Drag start time"
      >
        <ChevronLeft className="size-3" />
      </button>
      <button
        type="button"
        onPointerDown={(event) => startDrag("end", event)}
        disabled={disabled}
        className="absolute top-0 flex h-full w-4 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center bg-brand-accent text-brand-accent-ink disabled:cursor-not-allowed disabled:opacity-60"
        style={{ left: `${rightPct}%` }}
        aria-label="Drag end time"
      >
        <ChevronRight className="size-3" />
      </button>
    </div>
  );
}

function AudioPreviewWaveform({
  peaks,
  durationSeconds,
  currentTime,
  onSeek,
}: {
  peaks: number[];
  durationSeconds: number;
  currentTime: number;
  onSeek: (value: number) => void;
}) {
  function handleSeek(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || durationSeconds <= 0) return;
    const next = clamp((event.clientX - rect.left) / rect.width, 0, 1) * durationSeconds;
    onSeek(Number(next.toFixed(3)));
  }

  const activePct = durationSeconds > 0 ? clamp((currentTime / durationSeconds) * 100, 0, 100) : 0;

  return (
    <div
      role="slider"
      aria-label="Audio progress"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, Math.round(durationSeconds))}
      aria-valuenow={Math.max(0, Math.round(currentTime))}
      tabIndex={0}
      onPointerDown={handleSeek}
      className="relative h-16 cursor-pointer touch-none overflow-hidden rounded-[10px]"
    >
      <svg viewBox={`0 0 ${WAVEFORM_WIDTH} ${WAVEFORM_HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
        {peaks.map((peak, index) => {
          const x = (index / Math.max(1, peaks.length - 1)) * WAVEFORM_WIDTH;
          const barHeight = Math.max(5, peak * (WAVEFORM_HEIGHT - 16));
          const y = (WAVEFORM_HEIGHT - barHeight) / 2;
          return (
            <line
              key={index}
              x1={x}
              x2={x}
              y1={y}
              y2={y + barHeight}
              stroke="var(--brand-accent)"
              strokeOpacity={index / Math.max(1, peaks.length - 1) <= activePct / 100 ? 1 : 0.62}
              strokeWidth="4"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </div>
  );
}

export function AudioUploadTrim({
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  acceptedFormats = DEFAULT_FORMATS,
  creditsPerSecond = 1,
  creditCost,
  showCredits = true,
  showTrimControls = true,
  compact = false,
  presentation = "default",
  homeCardSize = "default",
  completionState = "success",
  autoGenerateOnReady = false,
  afterTrimSlot,
  creationStage = "idle",
  uploadProgress = null,
  showBack = true,
  backLabel = "Back to Videos",
  generateLabel,
  workingLabel = "Uploading...",
  successLabel = "Uploaded",
  maxFileSizeLabel = "100MB",
  initialUploadedAudio = null,
  deferInitialAudioUntilReady = false,
  onClearInitialAudio,
  onBack,
  onGenerate,
}: AudioUploadTrimProps) {
  const initialDurationSeconds = normalizeDurationSeconds(initialUploadedAudio?.durationSeconds);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploadedAudio, setUploadedAudio] = useState<UploadedAudioSource | null>(initialUploadedAudio);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState(() => initialUploadedAudio?.url || "");
  const [audioDurationMs, setAudioDurationMs] = useState(() => (initialDurationSeconds ? ms(initialDurationSeconds) : 0));
  const [durationStatus, setDurationStatus] = useState<"idle" | "loading" | "ready" | "error">(() =>
    initialDurationSeconds ? "ready" : initialUploadedAudio?.url ? "loading" : "idle",
  );
  const [isDraggingAudio, setIsDraggingAudio] = useState(false);
  const [startSeconds, setStartSeconds] = useState(0);
  const [endSeconds, setEndSeconds] = useState(() => (initialDurationSeconds ? Number(initialDurationSeconds.toFixed(3)) : 0));
  const [useEntireAudio, setUseEntireAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [generateStatus, setGenerateStatus] = useState<"idle" | "working" | "success">("idle");
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>(() => fallbackPeaks(initialUploadedAudio?.filename || "empty"));
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditBalanceLoading, setCreditBalanceLoading] = useState(showCredits);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | null>(null);
  const autoGeneratedFileRef = useRef<File | null>(null);

  const durationSeconds = secondsFromMs(audioDurationMs);
  const selectedDuration = Math.max(0, endSeconds - startSeconds);
  const requiredCredits = Math.max(1, creditCost ?? Math.ceil((selectedDuration || durationSeconds || 1) * creditsPerSecond));
  const hasEnoughCredits = !showCredits || creditBalance === null || creditBalance >= requiredCredits;
  const isHomeCard = presentation === "home-card";
  const isNarrowHomeCard = isHomeCard && homeCardSize === "narrow";
  const hasAudio = Boolean(audioFile || uploadedAudio);
  const audioName = audioFile?.name || uploadedAudio?.filename || "";
  const audioSize = audioFile?.size || uploadedAudio?.size || 0;
  const audioType = audioFile?.type || uploadedAudio?.contentType || "";
  const tickLabels = useMemo(() => {
    const total = durationSeconds || 0;
    return [0, total * 0.25, total * 0.5, total * 0.75, total].map((value) => formatClock(value));
  }, [durationSeconds]);

  useEffect(() => {
    if (!showCredits) {
      setCreditBalance(null);
      setCreditBalanceLoading(false);
      return;
    }

    let mounted = true;
    setCreditBalanceLoading(true);
    fetch("/api/credits")
      .then((response) => response.json())
      .then((body: CreditsResponse) => {
        if (!mounted) return;
        const balance = Number(body?.data?.balance);
        setCreditBalance(Number.isFinite(balance) ? balance : 0);
      })
      .catch(() => {
        if (mounted) setCreditBalance(0);
      })
      .finally(() => {
        if (mounted) setCreditBalanceLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [showCredits]);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(audioPreviewUrl);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [audioPreviewUrl]);

  useEffect(() => {
    if (!initialUploadedAudio?.url) return;
    if (audioPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(audioPreviewUrl);
    setAudioFile(null);
    setUploadedAudio(initialUploadedAudio);
    setAudioPreviewUrl(initialUploadedAudio.url);
    const nextDurationSeconds = normalizeDurationSeconds(initialUploadedAudio.durationSeconds);
    setAudioDurationMs(nextDurationSeconds ? ms(nextDurationSeconds) : 0);
    setDurationStatus(nextDurationSeconds ? "ready" : "loading");
    setStartSeconds(0);
    setEndSeconds(nextDurationSeconds ? Number(nextDurationSeconds.toFixed(3)) : 0);
    setUseEntireAudio(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setIsDraggingAudio(false);
    setGenerateStatus("idle");
    setWaveformPeaks(fallbackPeaks(initialUploadedAudio.filename));
  }, [initialUploadedAudio?.url, initialUploadedAudio?.durationSeconds]);

  useEffect(() => {
    if (!isPlaying) return;

    function frame() {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.currentTime >= endSeconds) {
        audio.pause();
        audio.currentTime = endSeconds;
        setCurrentTime(endSeconds);
        setIsPlaying(false);
        return;
      }
      setCurrentTime(clamp(audio.currentTime, startSeconds, endSeconds));
      animationRef.current = requestAnimationFrame(frame);
    }

    animationRef.current = requestAnimationFrame(frame);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, startSeconds, endSeconds]);

  useEffect(() => {
    setCurrentTime((current) => clamp(current, startSeconds, endSeconds || startSeconds));
    const audio = audioRef.current;
    if (audio && (audio.currentTime < startSeconds || audio.currentTime > endSeconds)) {
      audio.currentTime = startSeconds;
    }
  }, [startSeconds, endSeconds]);

  function clearAudioFile() {
    autoGeneratedFileRef.current = null;
    if (audioPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(audioPreviewUrl);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setAudioFile(null);
    setUploadedAudio(null);
    setAudioPreviewUrl("");
    setAudioDurationMs(0);
    setDurationStatus("idle");
    setStartSeconds(0);
    setEndSeconds(0);
    setUseEntireAudio(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setWaveformPeaks(fallbackPeaks("empty"));
    setIsDraggingAudio(false);
    setGenerateStatus("idle");
    if (audioInputRef.current) audioInputRef.current.value = "";
    onClearInitialAudio?.();
  }

  async function selectAudioFile(file?: File | null) {
    if (!file) return;
    if (!isSupportedAudioFile(file, acceptedFormats)) {
      toast.error("Please choose an audio file");
      return;
    }
    if (file.size > maxFileSize) {
      toast.error(`Audio file exceeds the ${maxFileSizeLabel} limit`);
      return;
    }

    if (audioPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(audioPreviewUrl);
    autoGeneratedFileRef.current = null;
    const nextUrl = URL.createObjectURL(file);
    setAudioFile(file);
    setUploadedAudio(null);
    setAudioPreviewUrl(nextUrl);
    setDurationStatus("loading");
    setStartSeconds(0);
    setEndSeconds(0);
    setUseEntireAudio(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setIsDraggingAudio(false);
    setGenerateStatus("idle");
    setWaveformPeaks(fallbackPeaks(file.name));

    try {
      const decoded = await decodeWaveform(file);
      setWaveformPeaks(decoded.peaks);
      setAudioDurationMs(ms(decoded.duration));
      setStartSeconds(0);
      setEndSeconds(Number(decoded.duration.toFixed(3)));
      setCurrentTime(0);
      setDurationStatus("ready");
    } catch {
      setDurationStatus((status) => (status === "ready" ? "ready" : "error"));
      toast.error("Unable to decode audio waveform");
    }
  }

  function handleAudioDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    selectAudioFile(event.dataTransfer.files?.[0]);
  }

  function updateStart(value: string) {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    setStartSeconds(Number(clamp(next, 0, Math.max(0, endSeconds - MIN_TRIM_SECONDS)).toFixed(3)));
  }

  function updateEnd(value: string) {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    setEndSeconds(Number(clamp(next, startSeconds + MIN_TRIM_SECONDS, durationSeconds || next).toFixed(3)));
  }

  function normalizeTrim() {
    if (!durationSeconds) return;
    const safeStart = clamp(startSeconds, 0, Math.max(0, durationSeconds - MIN_TRIM_SECONDS));
    const safeEnd = clamp(endSeconds, safeStart + MIN_TRIM_SECONDS, durationSeconds);
    setStartSeconds(Number(safeStart.toFixed(3)));
    setEndSeconds(Number(safeEnd.toFixed(3)));
  }

  function nudgeStart(delta: number) {
    setStartSeconds((current) => Number(clamp(current + delta, 0, Math.max(0, endSeconds - MIN_TRIM_SECONDS)).toFixed(3)));
  }

  function nudgeEnd(delta: number) {
    setEndSeconds((current) => Number(clamp(current + delta, startSeconds + MIN_TRIM_SECONDS, durationSeconds || current + delta).toFixed(3)));
  }

  function toggleUseEntireAudio() {
    const next = !useEntireAudio;
    setUseEntireAudio(next);
    if (next && durationSeconds) {
      setStartSeconds(0);
      setEndSeconds(Number(durationSeconds.toFixed(3)));
      setCurrentTime(0);
    }
  }

  function seekAudio(value: number) {
    const next = Number(clamp(value, startSeconds, endSeconds).toFixed(3));
    const audio = audioRef.current;
    if (audio) audio.currentTime = next;
    setCurrentTime(next);
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || durationStatus !== "ready") return;
    if (audio.paused) {
      const atEnd = audio.currentTime >= endSeconds || currentTime >= endSeconds;
      const outsideSelection = audio.currentTime < startSeconds || audio.currentTime > endSeconds;
      if (atEnd || outsideSelection) {
        audio.currentTime = startSeconds;
        setCurrentTime(startSeconds);
      }
      audio.play().catch(() => toast.error("Unable to play audio"));
    } else {
      audio.pause();
    }
  }

  async function generatePreview() {
    if (!hasAudio) {
      toast.error("Choose an audio file first");
      return;
    }
    if (!hasEnoughCredits) {
      toast.error("Insufficient credits");
      return;
    }
    setGenerateStatus("working");
    try {
      const submittedStartSeconds = showTrimControls ? startSeconds : 0;
      const submittedEndSeconds = showTrimControls ? endSeconds : durationSeconds;
      const submittedUseEntireAudio = showTrimControls ? useEntireAudio : true;
      await onGenerate?.(
        audioFile,
        submittedStartSeconds,
        submittedEndSeconds,
        { useEntireAudio: submittedUseEntireAudio, durationSeconds },
        uploadedAudio,
      );
      setGenerateStatus(completionState);
    } catch (error: any) {
      setGenerateStatus("idle");
      toast.error(error?.message || "Upload failed");
    }
  }

  useEffect(() => {
    if (!autoGenerateOnReady || !audioFile || durationStatus !== "ready") return;
    if (generateStatus !== "idle") return;
    if (autoGeneratedFileRef.current === audioFile) return;

    autoGeneratedFileRef.current = audioFile;
    generatePreview();
  }, [autoGenerateOnReady, audioFile, durationStatus, generateStatus]);

  const isGenerating = generateStatus === "working";
  const isGenerated = generateStatus === "success";
  const isGenerateDisabled = isGenerating || isGenerated || durationStatus !== "ready" || !hasEnoughCredits;
  const uploadProgressValue = typeof uploadProgress === "number" ? clamp(uploadProgress, 0, 100) : null;
  const isUploadingToServer = creationStage === "uploading" && uploadProgressValue !== null;
  const externalStageLabel =
    creationStage === "uploading"
      ? "Uploading your song"
      : creationStage === "creating"
        ? "Creating your project"
        : creationStage === "generating"
          ? "Building story direction"
          : creationStage === "redirecting"
            ? "Opening the editor"
            : workingLabel;
  const fileStatusLabel =
    durationStatus === "loading"
      ? "Reading audio"
      : durationStatus === "error"
        ? "Unable to read"
        : isGenerated
          ? "Direction ready"
          : durationStatus === "ready"
            ? "Ready"
            : "Selected";
  const shouldDeferInitialAudio =
    deferInitialAudioUntilReady && Boolean(uploadedAudio) && !audioFile && durationStatus === "loading";
  const audioElement = audioPreviewUrl ? (
    <audio
      ref={audioRef}
      src={audioPreviewUrl}
      className="sr-only"
      onLoadedMetadata={(event) => {
        const duration = event.currentTarget.duration;
        if (Number.isFinite(duration) && duration > 0 && durationStatus !== "ready") {
          const durationMs = ms(duration);
          setAudioDurationMs(durationMs);
          setStartSeconds(0);
          setEndSeconds(Number(duration.toFixed(3)));
          setCurrentTime(0);
          setDurationStatus("ready");
        }
      }}
      onError={() => {
        setAudioDurationMs(0);
        setDurationStatus("error");
      }}
      onPlay={() => setIsPlaying(true)}
      onPause={() => setIsPlaying(false)}
      onEnded={() => setIsPlaying(false)}
    >
      <track kind="captions" />
    </audio>
  ) : null;

  if (isHomeCard) {
    return (
      <main className="mx-auto w-full max-w-[900px] px-0 py-0">
        {showBack ? (
          <button
            type="button"
            onClick={onBack || clearAudioFile}
            className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-brand-muted transition-colors [@media(hover:hover)]:hover:text-brand-ink"
          >
            <ArrowLeft className="size-4" />
            {backLabel}
          </button>
        ) : null}

        <input
          ref={audioInputRef}
          type="file"
          accept={acceptedFormats.map((format) => `.${format}`).join(",")}
          className="sr-only"
          onChange={(event) => selectAudioFile(event.target.files?.[0] || null)}
        />

        <section className="mx-auto w-full text-left">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!hasAudio) {
                audioInputRef.current?.click();
                return;
              }
              if (isGenerateDisabled) return;
              generatePreview();
            }}
            className={`overflow-hidden rounded-[24px] border border-brand-line bg-brand-panel p-6 shadow-[0_30px_95px_var(--brand-elevation-shadow)] ${
              isNarrowHomeCard ? "" : "sm:p-9"
            }`}
          >
            <div className={isNarrowHomeCard ? "flex flex-col gap-6" : "flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"}>
              <div>
                <span className="inline-flex h-8 items-center justify-center rounded-[10px] bg-brand-accent px-4 text-sm font-semibold leading-5 text-brand-accent-ink shadow-[0_10px_22px_var(--brand-accent-shadow)]">
                  Step 1
                </span>
                <div>
                  <p className="mt-5 text-xl font-bold leading-7 text-brand-ink lg:text-2xl lg:leading-8">Upload your song</p>
                  <p className="mt-2 text-sm font-normal leading-5 text-brand-muted lg:text-base lg:leading-6">Choose one audio file to start your lyric video.</p>
                </div>
              </div>
              <div
                className={
                  isNarrowHomeCard
                    ? "-mx-1 flex gap-3 overflow-x-auto px-1 text-center text-sm font-semibold leading-5 text-brand-ink"
                    : "-mx-1 flex gap-3 overflow-x-auto px-1 text-center text-sm font-semibold leading-5 text-brand-ink sm:mx-0 sm:grid sm:w-[450px] sm:grid-cols-3 sm:overflow-visible sm:px-0"
                }
              >
                <span
                  className={`inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[14px] border border-brand-line bg-brand-panel px-3 shadow-sm ${
                    isNarrowHomeCard ? "min-w-[140px]" : "min-w-[140px] sm:min-w-0"
                  }`}
                >
                  <Music className="size-5 text-brand-accent" />
                  Single song
                </span>
                <span
                  className={`inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[14px] border border-brand-line bg-brand-panel px-3 shadow-sm ${
                    isNarrowHomeCard ? "min-w-[120px]" : "min-w-[120px] sm:min-w-0"
                  }`}
                >
                  <FolderOpen className="size-5 text-brand-accent" />
                  {maxFileSizeLabel}
                </span>
                <span
                  className={`inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[14px] border border-brand-line bg-brand-panel px-3 shadow-sm ${
                    isNarrowHomeCard ? "min-w-[130px]" : "min-w-[130px] sm:min-w-0"
                  }`}
                >
                  <span className="flex h-5 items-center gap-0.5 text-brand-accent" aria-hidden={true}>
                    <span className="h-2 w-0.5 rounded-full bg-current" />
                    <span className="h-4 w-0.5 rounded-full bg-current" />
                    <span className="h-3 w-0.5 rounded-full bg-current" />
                  </span>
                  Audio only
                </span>
              </div>
            </div>

            {!hasAudio ? (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => audioInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") audioInputRef.current?.click();
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDraggingAudio(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDraggingAudio(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setIsDraggingAudio(false);
                  }}
                  onDrop={handleAudioDrop}
                  className={`mt-8 flex ${isNarrowHomeCard ? "min-h-[220px]" : "min-h-[280px]"} cursor-pointer items-center justify-center rounded-[18px] border-2 border-dashed px-6 py-8 text-center transition-[background-color,border-color,transform] duration-200 active:scale-[0.99] ${
                    isDraggingAudio
                      ? "border-brand-accent bg-brand-accent-soft"
                      : "border-brand-line bg-brand-panel [@media(hover:hover)]:hover:border-brand-accent [@media(hover:hover)]:hover:bg-brand-accent-soft/50"
                  }`}
                >
                  <div>
                    <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-brand-accent-soft text-brand-accent shadow-[0_18px_45px_var(--brand-accent-shadow-soft)]">
                      <CloudUpload className="size-10" aria-hidden={true} />
                    </span>
                    <p className="mt-5 text-base font-semibold leading-6 text-brand-ink">
                      {isDraggingAudio ? "Drop your audio file here" : "Drag & drop your audio file here"}
                    </p>
                    <p className="mt-2 text-sm font-normal leading-5 text-brand-muted lg:text-base lg:leading-6">or click the button below to browse</p>
                    <Button
                      type="button"
                      className="mt-6 h-11 rounded-[9px] bg-brand-accent px-6 text-base font-semibold leading-6 text-brand-accent-ink shadow-[0_18px_38px_var(--brand-accent-shadow)] [@media(hover:hover)]:hover:bg-brand-accent-hover"
                      onClick={(event) => {
                        event.stopPropagation();
                        audioInputRef.current?.click();
                      }}
                    >
                      <Upload className="size-6" />
                      Choose audio
                    </Button>
                  </div>
                </div>
                <p className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm font-normal leading-5 text-brand-muted">
                  <Check className="size-5 text-brand-accent-hover" />
                  Supports MP3, WAV, FLAC, AAC, OGG, M4A
                  <span className="mx-1 text-brand-subtle">•</span>
                  Max {maxFileSizeLabel}
                </p>
              </>
            ) : shouldDeferInitialAudio ? (
              <div className="mt-8 space-y-6">
                <section className="rounded-[18px] border border-brand-line bg-brand-panel p-8 text-center shadow-[0_14px_38px_var(--brand-elevation-shadow-soft)]">
                  <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-accent-soft text-brand-accent">
                    <Loader2 className="size-7 animate-spin" aria-hidden={true} />
                  </span>
                  <h4 className="mt-5 text-base font-semibold leading-6 text-brand-ink">Reading audio</h4>
                  <p className="mt-2 text-sm font-normal leading-5 text-brand-muted">
                    Preparing trim controls before you choose the main actor.
                  </p>
                  <div className="mx-auto mt-5 max-w-sm overflow-hidden rounded-full bg-brand-soft">
                    <div className="h-2 w-1/2 animate-pulse rounded-full bg-brand-accent" />
                  </div>
                  {audioElement}
                </section>
              </div>
            ) : (
              <div className="mt-8 space-y-6">
                <section className="rounded-[18px] border border-brand-line bg-brand-panel p-4 shadow-[0_14px_38px_var(--brand-elevation-shadow-soft)] sm:p-5">
                  <div className="flex items-start gap-4">
                    <span className="mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-accent text-brand-accent-ink shadow-[0_12px_28px_var(--brand-accent-shadow)]">
                      <Check className="size-7 stroke-[3]" />
                    </span>
                    <div>
                      <h4 className="text-base font-semibold leading-6 text-brand-ink">Song uploaded</h4>
                      <p className="mt-1 text-sm font-normal leading-5 text-brand-muted">Your audio is ready to use.</p>
                    </div>
                  </div>

                  <div className="mt-6 rounded-[16px] border border-brand-line bg-brand-panel p-4 shadow-sm sm:p-5">
                    <div className="grid gap-4 lg:grid-cols-[116px_1fr]">
                      <span className="flex size-24 items-center justify-center rounded-[14px] bg-brand-accent-soft text-brand-accent">
                        <Music className="size-12" aria-hidden={true} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold leading-6 text-brand-ink lg:text-xl lg:leading-7">{audioName}</p>
                        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-normal leading-5 text-brand-muted lg:text-base lg:leading-6">
                          <span className="inline-flex items-center gap-2">
                            <Clock className="size-5" />
                            {durationStatus === "ready" ? formatClock(durationSeconds) : fileStatusLabel}
                          </span>
                          <span className="text-brand-subtle">•</span>
                          <span>{formatAudioExtension(audioName, audioType)}</span>
                          <span className="text-brand-subtle">•</span>
                          <span>{formatFileSize(audioSize)}</span>
                        </p>

                        <div className="mt-5 grid items-center gap-3 sm:grid-cols-[48px_1fr]">
                          <button
                            type="button"
                            onClick={togglePlayback}
                            className="flex size-12 items-center justify-center rounded-full border border-brand-line bg-brand-panel text-brand-ink shadow-sm transition-[background-color,transform] active:scale-[0.96] [@media(hover:hover)]:hover:bg-brand-accent-soft [@media(hover:hover)]:hover:text-brand-accent-hover"
                            aria-label={isPlaying ? "Pause audio" : "Play audio"}
                          >
                            {isPlaying ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5 fill-current" />}
                          </button>
                          {showTrimControls && durationStatus === "ready" ? (
                            <Waveform
                              peaks={waveformPeaks}
                              startSeconds={startSeconds}
                              endSeconds={endSeconds}
                              durationSeconds={durationSeconds}
                              currentTime={currentTime}
                              onChangeStart={setStartSeconds}
                              onChangeEnd={setEndSeconds}
                              onSeek={seekAudio}
                            />
                          ) : (
                            <AudioPreviewWaveform
                              peaks={waveformPeaks}
                              durationSeconds={durationSeconds}
                              currentTime={currentTime}
                              onSeek={seekAudio}
                            />
                          )}
                        </div>

                        <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                          {showTrimControls && durationStatus === "ready" ? (
                            <div className="flex flex-col gap-3 md:flex-row md:items-end">
                              <label className="text-left text-sm font-semibold leading-5 text-brand-muted">
                                Start
                                <span className="mt-2 flex overflow-hidden rounded-[9px] border border-brand-line bg-brand-panel">
                                  <button
                                    type="button"
                                    onClick={() => nudgeStart(-1)}
                                    className="flex h-11 w-10 items-center justify-center border-r text-brand-subtle"
                                    aria-label="Decrease start time"
                                  >
                                    <ChevronLeft className="size-4" />
                                  </button>
                                  <input
                                    value={formatDecimal(startSeconds)}
                                    onChange={(event) => updateStart(event.target.value)}
                                    onBlur={normalizeTrim}
                                    className="h-11 w-20 px-3 text-center text-base font-semibold text-brand-ink outline-none sm:w-24"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => nudgeStart(1)}
                                    className="flex h-11 w-10 items-center justify-center border-l text-brand-subtle"
                                    aria-label="Increase start time"
                                  >
                                    <ChevronRight className="size-4" />
                                  </button>
                                </span>
                              </label>
                              <span className="hidden pb-3 text-base font-semibold leading-6 text-brand-muted md:inline">/ {formatClock(durationSeconds)}</span>
                              <label className="text-left text-sm font-semibold leading-5 text-brand-muted">
                                End
                                <span className="mt-2 flex overflow-hidden rounded-[9px] border border-brand-line bg-brand-panel">
                                  <button
                                    type="button"
                                    onClick={() => nudgeEnd(-1)}
                                    className="flex h-11 w-10 items-center justify-center border-r text-brand-subtle"
                                    aria-label="Decrease end time"
                                  >
                                    <ChevronLeft className="size-4" />
                                  </button>
                                  <input
                                    value={formatDecimal(endSeconds)}
                                    onChange={(event) => updateEnd(event.target.value)}
                                    onBlur={normalizeTrim}
                                    className="h-11 w-20 px-3 text-center text-base font-semibold text-brand-ink outline-none sm:w-24"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => nudgeEnd(1)}
                                    className="flex h-11 w-10 items-center justify-center border-l text-brand-subtle"
                                    aria-label="Increase end time"
                                  >
                                    <ChevronRight className="size-4" />
                                  </button>
                                </span>
                              </label>
                            </div>
                          ) : null}

                          <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end xl:pb-0.5">
                            <Button
                              type="button"
                              variant="outline"
                              className="h-11 rounded-[9px] border-brand-line px-4 text-sm font-semibold leading-5 text-brand-muted [@media(hover:hover)]:hover:bg-brand-panel-strong"
                              onClick={() => audioInputRef.current?.click()}
                            >
                              <RefreshCcw className="size-4" />
                              Replace audio
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-11 rounded-[9px] border-brand-line px-4 text-sm font-semibold leading-5 text-brand-muted [@media(hover:hover)]:hover:bg-brand-panel-strong"
                              onClick={clearAudioFile}
                            >
                              <Trash2 className="size-4" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {durationStatus === "loading" ? (
                    <div className="mt-4 overflow-hidden rounded-full bg-brand-soft">
                      <div className="h-2 w-1/2 animate-pulse rounded-full bg-brand-accent" />
                    </div>
                  ) : null}
                  {durationStatus === "error" ? <p className="mt-4 text-sm font-semibold text-red-500">Unable to read duration</p> : null}

                </section>

                {durationStatus === "ready" && afterTrimSlot ? <div>{afterTrimSlot}</div> : null}

                {isGenerating ? (
                  <div className="rounded-[12px] border border-brand-accent/25 bg-brand-accent-soft p-4">
                    <div className="flex items-center justify-between gap-4 text-sm font-semibold leading-5 text-brand-ink">
                      <span>{isUploadingToServer ? "Uploading your song" : externalStageLabel}</span>
                      {isUploadingToServer ? <span>{Math.round(uploadProgressValue || 0)}%</span> : null}
                    </div>
                    <div className="mt-3 overflow-hidden rounded-full bg-brand-panel">
                      <div
                        className={`h-2 rounded-full bg-brand-accent transition-[width] ${isUploadingToServer ? "" : "animate-pulse"}`}
                        style={{ width: `${isUploadingToServer ? uploadProgressValue : 100}%` }}
                      />
                    </div>
                    <p className="mt-3 text-xs font-semibold text-brand-accent-hover">
                      {isUploadingToServer ? "Keep this page open while the audio uploads." : workingLabel}
                    </p>
                  </div>
                ) : null}

                {audioElement}

                {!autoGenerateOnReady ? (
                <div className="border-t border-brand-line pt-6">
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 rounded-[9px] border-brand-line px-6 text-base font-semibold leading-6 text-brand-muted [@media(hover:hover)]:hover:bg-brand-panel-strong"
                      onClick={clearAudioFile}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isGenerateDisabled}
                      className="h-11 gap-3 rounded-[9px] bg-brand-accent px-6 text-base font-semibold leading-6 text-brand-accent-ink shadow-[0_16px_34px_var(--brand-accent-shadow)] [@media(hover:hover)]:hover:bg-brand-accent-hover"
                    >
                      {isGenerating && <span className="size-4 animate-spin rounded-full border-2 border-brand-accent-ink border-t-transparent" />}
                      {isGenerated && <Check className="size-5" />}
                      {!isGenerating && !isGenerated && <Sparkles className="size-5" />}
                      {isGenerating ? externalStageLabel : isGenerated ? successLabel : generateLabel || `Generate Preview (${requiredCredits} credits)`}
                    </Button>
                  </div>
                </div>
                ) : null}
              </div>
            )}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={compact ? "mx-auto w-full max-w-[960px] px-0 py-0" : "mx-auto min-h-[660px] w-full max-w-[1240px] px-8 py-10"}>
      {showBack ? (
        <button
          type="button"
          onClick={onBack || clearAudioFile}
          className="inline-flex items-center gap-2 text-sm font-bold text-brand-muted hover:text-brand-ink"
        >
          <ArrowLeft className="size-4" />
          {backLabel}
        </button>
      ) : null}

      <input
        ref={audioInputRef}
        type="file"
        accept={acceptedFormats.map((format) => `.${format}`).join(",")}
        className="sr-only"
        onChange={(event) => selectAudioFile(event.target.files?.[0] || null)}
      />

      {!hasAudio ? (
        <section className={compact ? "mx-auto max-w-[860px] text-center" : "mx-auto mt-7 max-w-[860px] text-center"}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => audioInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") audioInputRef.current?.click();
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDraggingAudio(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDraggingAudio(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDraggingAudio(false);
            }}
            onDrop={handleAudioDrop}
            className={`flex ${compact ? "min-h-[210px]" : "min-h-[236px]"} cursor-pointer flex-col items-center justify-center rounded-md border bg-brand-panel px-6 py-8 transition-colors ${
              isDraggingAudio ? "border-brand-accent bg-brand-accent/5" : "border-brand-line hover:border-brand-accent"
            }`}
          >
            <div className={`${compact ? "size-20" : "size-28"} flex items-center justify-center rounded-full border-2 border-brand-line`}>
              <CloudUpload className={`${compact ? "size-7" : "size-9"} text-brand-ink`} />
            </div>
            <p className={`${compact ? "mt-5" : "mt-8"} text-base text-brand-ink`}>
              Drag and drop your <Music className="mx-1 inline size-5 fill-brand-ink" />
              <span className="font-semibold">Audio file</span> here or{" "}
              <span className="inline-flex items-center gap-2 rounded-md border border-brand-line px-3 py-1 font-semibold">
                <FolderOpen className="size-4" />
                Browse
              </span>
            </p>
            <p className="mt-2 text-sm font-medium text-brand-muted">Max {maxFileSizeLabel} · Formats: MP3, WAV, FLAC, AAC, OGG, M4A</p>
          </div>
          <Button
            type="button"
            onClick={() => audioInputRef.current?.click()}
            className="mt-5 h-11 gap-2 rounded-md bg-brand-accent px-6 text-base font-semibold leading-6 text-brand-ink hover:bg-brand-accent-hover"
          >
            <Upload className="size-5" />
            Upload audio file
          </Button>
        </section>
      ) : (
        <section className={compact ? "mx-auto max-w-[860px] text-center" : "mx-auto mt-5 max-w-[860px] text-center"}>
          <div className="rounded-md border border-brand-line bg-brand-panel px-5 py-7">
            {isGenerated && (
              <div className="mx-auto mb-7 flex size-28 items-center justify-center rounded-full border-2 border-emerald-300 text-emerald-400">
                <Check className="size-12 stroke-[1.7]" />
              </div>
            )}
            <div className="mb-3 flex items-center justify-center gap-2 text-base font-semibold leading-6">
              <Music className="size-5 fill-brand-ink text-brand-ink" />
              <span className="truncate">{audioName}</span>
            </div>
            {isGenerated && <p className="mb-6 text-sm font-medium text-brand-muted">Your video will now be generated!</p>}
            <div className="grid grid-cols-[52px_1fr] items-center gap-3">
              <button
                type="button"
                onClick={togglePlayback}
                className="flex size-12 items-center justify-center rounded-full border border-brand-line text-brand-ink"
                aria-label={isPlaying ? "Pause audio" : "Play audio"}
              >
                {isPlaying ? <Pause className="size-5" /> : <Play className="ml-1 size-5" />}
              </button>
              <div>
                <Waveform
                  peaks={waveformPeaks}
                  startSeconds={startSeconds}
                  endSeconds={endSeconds}
                  durationSeconds={durationSeconds}
                  currentTime={currentTime}
                  disabled={useEntireAudio}
                  onChangeStart={setStartSeconds}
                  onChangeEnd={setEndSeconds}
                  onSeek={seekAudio}
                />
                <div className="mt-2 flex justify-between text-sm font-medium text-brand-muted">
                  {tickLabels.map((label, index) => (
                    <span key={`${label}-${index}`}>{label}</span>
                  ))}
                </div>
              </div>
            </div>

            {durationStatus === "loading" && <p className="mt-6 text-sm font-semibold text-brand-muted">Reading duration...</p>}
            {durationStatus === "error" && <p className="mt-6 text-sm font-semibold text-red-500">Unable to read duration</p>}
            {showTrimControls && durationStatus === "ready" && (
              <>
                {showCredits ? (
                  <>
                    <div className="mt-7 text-base font-medium leading-7 text-brand-muted">
                      <p>You have {creditBalanceLoading ? "..." : (creditBalance ?? 0)} credits in your balance,</p>
                      <p>
                        but the audio you uploaded requires <span className="font-semibold text-brand-ink">{requiredCredits} credits</span>
                      </p>
                      {!hasEnoughCredits && (
                        <Button className="mt-3 h-9 rounded-md bg-brand-accent px-5 font-bold text-brand-ink hover:bg-brand-accent-hover">
                          Add Credits
                        </Button>
                      )}
                    </div>
                    <div className="mt-9 grid grid-cols-[1fr_auto_1fr] items-center gap-5 text-brand-muted">
                      <div className="h-px bg-brand-line" />
                      <span className="font-semibold">OR</span>
                      <div className="h-px bg-brand-line" />
                    </div>
                  </>
                ) : null}
                <p className={`${showCredits ? "mt-9" : "mt-7"} text-sm font-medium text-brand-muted`}>(Optional) You can trim the audio to create a video for just a part of the song:</p>
                <div className="mt-5 flex justify-center gap-2">
                  <label className="text-left text-xs font-semibold text-brand-muted">
                    Start Time
                    <span className="mt-1 flex overflow-hidden rounded-md border border-brand-line bg-brand-panel">
                      <button
                        type="button"
                        onClick={() => nudgeStart(-1)}
                        disabled={useEntireAudio}
                        className="flex h-9 w-8 items-center justify-center border-r text-brand-subtle disabled:opacity-40"
                        aria-label="Decrease start time"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <input
                        value={formatDecimal(startSeconds)}
                        onChange={(event) => updateStart(event.target.value)}
                        onBlur={normalizeTrim}
                        disabled={useEntireAudio}
                        className="h-9 w-24 px-3 text-sm font-medium outline-none disabled:bg-brand-panel-strong disabled:text-brand-subtle"
                      />
                      <button
                        type="button"
                        onClick={() => nudgeStart(1)}
                        disabled={useEntireAudio}
                        className="flex h-9 w-8 items-center justify-center border-l text-brand-subtle disabled:opacity-40"
                        aria-label="Increase start time"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </span>
                  </label>
                  <label className="text-left text-xs font-semibold text-brand-muted">
                    End Time
                    <span className="mt-1 flex overflow-hidden rounded-md border border-brand-line bg-brand-panel">
                      <button
                        type="button"
                        onClick={() => nudgeEnd(-1)}
                        disabled={useEntireAudio}
                        className="flex h-9 w-8 items-center justify-center border-r text-brand-subtle disabled:opacity-40"
                        aria-label="Decrease end time"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <input
                        value={formatDecimal(endSeconds)}
                        onChange={(event) => updateEnd(event.target.value)}
                        onBlur={normalizeTrim}
                        disabled={useEntireAudio}
                        className="h-9 w-24 px-3 text-sm font-medium outline-none disabled:bg-brand-panel-strong disabled:text-brand-subtle"
                      />
                      <button
                        type="button"
                        onClick={() => nudgeEnd(1)}
                        disabled={useEntireAudio}
                        className="flex h-9 w-8 items-center justify-center border-l text-brand-subtle disabled:opacity-40"
                        aria-label="Increase end time"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </span>
                  </label>
                </div>
                <label className="mt-5 inline-flex cursor-pointer items-center justify-center gap-3 text-sm font-medium text-brand-ink">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useEntireAudio}
                    onClick={toggleUseEntireAudio}
                    className={`relative h-6 w-11 rounded-full transition-colors ${useEntireAudio ? "bg-brand-accent" : "bg-brand-line"}`}
                  >
                    <span
                      className={`absolute top-1 size-4 rounded-full bg-brand-panel transition-transform ${
                        useEntireAudio ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                  Use the entire audio without trimming
                </label>
              </>
            )}
            {audioElement}
          </div>

          <Button
            type="button"
            onClick={generatePreview}
            disabled={isGenerateDisabled}
            className="mt-5 h-11 gap-2 rounded-md bg-brand-accent px-6 text-base font-semibold leading-6 text-brand-ink hover:bg-brand-accent-hover"
          >
            {isGenerating && <span className="size-4 animate-spin rounded-full border-2 border-brand-ink border-t-transparent" />}
            {isGenerated && <Check className="size-5" />}
            {!isGenerating && !isGenerated && <Sparkles className="size-5" />}
            {isGenerating ? workingLabel : isGenerated ? successLabel : generateLabel || `Generate Preview (${requiredCredits} credits)`}
          </Button>
          <Button type="button" variant="outline" className="mt-3 block h-11 w-[270px] justify-self-center text-base font-bold" onClick={clearAudioFile}>
            Upload another file
          </Button>
        </section>
      )}
    </main>
  );
}

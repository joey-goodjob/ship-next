"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronDown,
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

export interface AudioUploadTrimProps {
  maxFileSize?: number;
  acceptedFormats?: string[];
  creditsPerSecond?: number;
  creditCost?: number;
  showCredits?: boolean;
  compact?: boolean;
  presentation?: "default" | "home-card";
  afterTrimSlot?: ReactNode;
  creationStage?: CreationStage;
  uploadProgress?: number | null;
  showBack?: boolean;
  backLabel?: string;
  generateLabel?: string;
  workingLabel?: string;
  successLabel?: string;
  maxFileSizeLabel?: string;
  onBack?: () => void;
  onGenerate?: (
    file: File,
    startTime: number,
    endTime: number,
    options: { useEntireAudio: boolean; durationSeconds: number },
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

function formatFileExtension(file: File) {
  const extension = file.name.split(".").pop()?.trim().toUpperCase();
  return extension || (file.type.split("/").pop()?.trim().toUpperCase() || "AUDIO");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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
      className="relative h-24 touch-none overflow-hidden rounded-sm bg-slate-100"
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
              stroke={selected ? "#4A90D9" : "#4A90D9"}
              strokeOpacity={selected ? 1 : 0.28}
              strokeWidth="3"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div
        className="absolute inset-y-0 bg-[#4A90D9]/15"
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      />
      <div className="absolute inset-y-0 w-0.5 bg-slate-900" style={{ left: `${playheadPct}%` }}>
        <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rotate-45 bg-slate-900" />
      </div>
      <button
        type="button"
        onPointerDown={(event) => startDrag("start", event)}
        disabled={disabled}
        className="absolute top-0 flex h-full w-4 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center bg-[#2563eb] text-white disabled:cursor-not-allowed disabled:opacity-60"
        style={{ left: `${leftPct}%` }}
        aria-label="Drag start time"
      >
        <ChevronLeft className="size-3" />
      </button>
      <button
        type="button"
        onPointerDown={(event) => startDrag("end", event)}
        disabled={disabled}
        className="absolute top-0 flex h-full w-4 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center bg-[#2563eb] text-white disabled:cursor-not-allowed disabled:opacity-60"
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
              stroke="#14b8a6"
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
  compact = false,
  presentation = "default",
  afterTrimSlot,
  creationStage = "idle",
  uploadProgress = null,
  showBack = true,
  backLabel = "Back to Videos",
  generateLabel,
  workingLabel = "Uploading...",
  successLabel = "Uploaded",
  maxFileSizeLabel = "100MB",
  onBack,
  onGenerate,
}: AudioUploadTrimProps) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState("");
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const [durationStatus, setDurationStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [isDraggingAudio, setIsDraggingAudio] = useState(false);
  const [startSeconds, setStartSeconds] = useState(0);
  const [endSeconds, setEndSeconds] = useState(0);
  const [useEntireAudio, setUseEntireAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [generateStatus, setGenerateStatus] = useState<"idle" | "working" | "success">("idle");
  const [isTrimExpanded, setIsTrimExpanded] = useState(true);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>(fallbackPeaks("empty"));
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditBalanceLoading, setCreditBalanceLoading] = useState(showCredits);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | null>(null);

  const durationSeconds = secondsFromMs(audioDurationMs);
  const selectedDuration = Math.max(0, endSeconds - startSeconds);
  const requiredCredits = Math.max(1, creditCost ?? Math.ceil((selectedDuration || durationSeconds || 1) * creditsPerSecond));
  const hasEnoughCredits = !showCredits || creditBalance === null || creditBalance >= requiredCredits;
  const isHomeCard = presentation === "home-card";
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
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [audioPreviewUrl]);

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
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setAudioFile(null);
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
    setIsTrimExpanded(true);
    if (audioInputRef.current) audioInputRef.current.value = "";
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

    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    const nextUrl = URL.createObjectURL(file);
    setAudioFile(file);
    setAudioPreviewUrl(nextUrl);
    setDurationStatus("loading");
    setStartSeconds(0);
    setEndSeconds(0);
    setUseEntireAudio(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setIsDraggingAudio(false);
    setGenerateStatus("idle");
    setIsTrimExpanded(true);
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
    if (!audioFile) {
      toast.error("Choose an audio file first");
      return;
    }
    if (!hasEnoughCredits) {
      toast.error("Insufficient credits");
      return;
    }
    setGenerateStatus("working");
    try {
      await onGenerate?.(audioFile, startSeconds, endSeconds, { useEntireAudio, durationSeconds });
      setGenerateStatus("success");
    } catch (error: any) {
      setGenerateStatus("idle");
      toast.error(error?.message || "Upload failed");
    }
  }

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

  if (isHomeCard) {
    return (
      <main className="mx-auto w-full max-w-[900px] px-0 py-0">
        {showBack ? (
          <button
            type="button"
            onClick={onBack || clearAudioFile}
            className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition-colors [@media(hover:hover)]:hover:text-slate-950"
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
              if (!audioFile) {
                audioInputRef.current?.click();
                return;
              }
              if (isGenerateDisabled) return;
              generatePreview();
            }}
            className="overflow-hidden rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_30px_95px_rgba(15,23,42,0.12)] sm:p-9"
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="inline-flex h-8 items-center justify-center rounded-[10px] bg-teal-600 px-4 text-sm font-black text-white shadow-[0_10px_22px_rgba(13,148,136,0.22)]">
                  Step 1
                </span>
                <div>
                  <h3 className="mt-5 text-3xl font-black tracking-[-0.012em] text-[#050b24]">Upload your song</h3>
                  <p className="mt-2 text-base font-semibold text-slate-500">Choose one audio file to start your lyric video.</p>
                </div>
              </div>
              <div className="-mx-1 flex gap-3 overflow-x-auto px-1 text-center text-sm font-extrabold text-[#050b24] sm:mx-0 sm:grid sm:w-[450px] sm:grid-cols-3 sm:overflow-visible sm:px-0">
                <span className="inline-flex h-12 min-w-[140px] items-center justify-center gap-2 whitespace-nowrap rounded-[14px] border border-slate-200 bg-white px-3 shadow-sm sm:min-w-0">
                  <Music className="size-5 text-teal-600" />
                  Single song
                </span>
                <span className="inline-flex h-12 min-w-[120px] items-center justify-center gap-2 whitespace-nowrap rounded-[14px] border border-slate-200 bg-white px-3 shadow-sm sm:min-w-0">
                  <FolderOpen className="size-5 text-teal-600" />
                  {maxFileSizeLabel}
                </span>
                <span className="inline-flex h-12 min-w-[130px] items-center justify-center gap-2 whitespace-nowrap rounded-[14px] border border-slate-200 bg-white px-3 shadow-sm sm:min-w-0">
                  <span className="flex h-5 items-center gap-0.5 text-teal-600" aria-hidden={true}>
                    <span className="h-2 w-0.5 rounded-full bg-current" />
                    <span className="h-4 w-0.5 rounded-full bg-current" />
                    <span className="h-3 w-0.5 rounded-full bg-current" />
                  </span>
                  Audio only
                </span>
              </div>
            </div>

            {!audioFile ? (
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
                  className={`mt-8 flex min-h-[280px] cursor-pointer items-center justify-center rounded-[18px] border-2 border-dashed px-6 py-8 text-center transition-[background-color,border-color,transform] duration-200 active:scale-[0.99] ${
                    isDraggingAudio
                      ? "border-teal-500 bg-teal-50"
                      : "border-sky-200 bg-white [@media(hover:hover)]:hover:border-teal-400 [@media(hover:hover)]:hover:bg-teal-50/50"
                  }`}
                >
                  <div>
                    <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-teal-50 text-teal-600 shadow-[0_18px_45px_rgba(13,148,136,0.12)]">
                      <CloudUpload className="size-10" aria-hidden={true} />
                    </span>
                    <p className="mt-5 text-xl font-black tracking-[-0.012em] text-[#050b24]">
                      {isDraggingAudio ? "Drop your audio file here" : "Drag & drop your audio file here"}
                    </p>
                    <p className="mt-2 text-base font-semibold text-slate-500">or click the button below to browse</p>
                    <Button
                      type="button"
                      className="mt-6 h-16 rounded-[18px] bg-teal-600 px-12 text-xl font-black text-white shadow-[0_18px_38px_rgba(13,148,136,0.24)] [@media(hover:hover)]:hover:bg-teal-700"
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
                <p className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm font-bold text-slate-500">
                  <Check className="size-5 text-sky-600" />
                  Supports MP3, WAV, FLAC, AAC, OGG, M4A
                  <span className="mx-1 text-slate-300">•</span>
                  Max {maxFileSizeLabel}
                </p>
              </>
            ) : (
              <div className="mt-8 space-y-6">
                <section className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_14px_38px_rgba(15,23,42,0.08)] sm:p-5">
                  <div className="flex items-start gap-4">
                    <span className="mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white shadow-[0_12px_28px_rgba(13,148,136,0.22)]">
                      <Check className="size-7 stroke-[3]" />
                    </span>
                    <div>
                      <h4 className="text-xl font-black tracking-[-0.012em] text-[#050b24]">Song uploaded</h4>
                      <p className="mt-1 text-sm font-semibold text-slate-500">Your audio is ready to use.</p>
                    </div>
                  </div>

                  <div className="mt-6 rounded-[16px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className="grid gap-4 lg:grid-cols-[116px_1fr]">
                      <span className="flex size-24 items-center justify-center rounded-[14px] bg-teal-50 text-teal-600">
                        <Music className="size-12" aria-hidden={true} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xl font-black tracking-[-0.012em] text-[#050b24]">{audioFile.name}</p>
                        <div className="mt-3 grid items-center gap-3 sm:grid-cols-[48px_1fr]">
                          <button
                            type="button"
                            onClick={togglePlayback}
                            className="flex size-12 items-center justify-center rounded-full border border-slate-200 bg-white text-[#050b24] shadow-sm transition-[background-color,transform] active:scale-[0.96] [@media(hover:hover)]:hover:bg-teal-50 [@media(hover:hover)]:hover:text-teal-700"
                            aria-label={isPlaying ? "Pause audio" : "Play audio"}
                          >
                            {isPlaying ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5 fill-current" />}
                          </button>
                          <AudioPreviewWaveform
                            peaks={waveformPeaks}
                            durationSeconds={durationSeconds}
                            currentTime={currentTime}
                            onSeek={seekAudio}
                          />
                        </div>
                        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-base font-bold text-slate-500">
                            <span className="inline-flex items-center gap-2">
                              <Clock className="size-5" />
                              {durationStatus === "ready" ? formatClock(durationSeconds) : fileStatusLabel}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span>{formatFileExtension(audioFile)}</span>
                            <span className="text-slate-300">•</span>
                            <span>{formatFileSize(audioFile.size)}</span>
                          </p>
                          <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              className="h-12 rounded-[10px] border-slate-200 px-4 text-sm font-black text-slate-600 [@media(hover:hover)]:hover:bg-slate-50"
                              onClick={() => audioInputRef.current?.click()}
                            >
                              <RefreshCcw className="size-4" />
                              Replace audio
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-12 rounded-[10px] border-slate-200 px-4 text-sm font-black text-slate-600 [@media(hover:hover)]:hover:bg-slate-50"
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
                    <div className="mt-4 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-2 w-1/2 animate-pulse rounded-full bg-teal-500" />
                    </div>
                  ) : null}
                  {durationStatus === "error" ? <p className="mt-4 text-sm font-semibold text-red-500">Unable to read duration</p> : null}

                  {durationStatus === "ready" ? (
                    <div className="mt-5 rounded-[16px] border border-slate-200 bg-white p-4 sm:p-5">
                      <button
                        type="button"
                        onClick={() => setIsTrimExpanded((expanded) => !expanded)}
                        aria-expanded={isTrimExpanded}
                        className="flex w-full items-center justify-between gap-4 text-left text-base font-semibold text-slate-500"
                      >
                        <span>Optional: trim the audio if you only want to preview part of the song.</span>
                        <ChevronDown className={`size-5 shrink-0 transition-transform ${isTrimExpanded ? "rotate-180" : ""}`} />
                      </button>
                      {isTrimExpanded ? (
                        <div className="mt-5">
                          {showCredits ? (
                            <div className="mb-4 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium leading-6 text-slate-600">
                              <p>You have {creditBalanceLoading ? "..." : (creditBalance ?? 0)} credits in your balance.</p>
                              <p>
                                This audio requires <span className="font-black text-slate-800">{requiredCredits} credits</span>.
                              </p>
                              {!hasEnoughCredits && (
                                <Button className="mt-3 h-9 rounded-md bg-teal-600 px-5 font-bold text-white [@media(hover:hover)]:hover:bg-teal-700">
                                  Add Credits
                                </Button>
                              )}
                            </div>
                          ) : null}
                          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-start">
                            <label className="text-left text-sm font-black text-[#050b24]">
                              Start Time
                              <span className="mt-2 flex overflow-hidden rounded-[9px] border border-slate-300 bg-white">
                                <button
                                  type="button"
                                  onClick={() => nudgeStart(-1)}
                                  disabled={useEntireAudio}
                                  className="flex h-11 w-10 items-center justify-center border-r text-slate-400 disabled:opacity-40"
                                  aria-label="Decrease start time"
                                >
                                  <ChevronLeft className="size-4" />
                                </button>
                                <input
                                  value={formatDecimal(startSeconds)}
                                  onChange={(event) => updateStart(event.target.value)}
                                  onBlur={normalizeTrim}
                                  disabled={useEntireAudio}
                                  className="h-11 min-w-0 flex-1 px-3 text-base font-semibold text-slate-700 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                                />
                                <button
                                  type="button"
                                  onClick={() => nudgeStart(1)}
                                  disabled={useEntireAudio}
                                  className="flex h-11 w-10 items-center justify-center border-l text-slate-400 disabled:opacity-40"
                                  aria-label="Increase start time"
                                >
                                  <ChevronRight className="size-4" />
                                </button>
                              </span>
                            </label>
                            <label className="text-left text-sm font-black text-[#050b24]">
                              End Time
                              <span className="mt-2 flex overflow-hidden rounded-[9px] border border-slate-300 bg-white">
                                <button
                                  type="button"
                                  onClick={() => nudgeEnd(-1)}
                                  disabled={useEntireAudio}
                                  className="flex h-11 w-10 items-center justify-center border-r text-slate-400 disabled:opacity-40"
                                  aria-label="Decrease end time"
                                >
                                  <ChevronLeft className="size-4" />
                                </button>
                                <input
                                  value={formatDecimal(endSeconds)}
                                  onChange={(event) => updateEnd(event.target.value)}
                                  onBlur={normalizeTrim}
                                  disabled={useEntireAudio}
                                  className="h-11 min-w-0 flex-1 px-3 text-base font-semibold text-slate-700 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                                />
                                <button
                                  type="button"
                                  onClick={() => nudgeEnd(1)}
                                  disabled={useEntireAudio}
                                  className="flex h-11 w-10 items-center justify-center border-l text-slate-400 disabled:opacity-40"
                                  aria-label="Increase end time"
                                >
                                  <ChevronRight className="size-4" />
                                </button>
                              </span>
                            </label>
                            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold leading-5 text-[#050b24] lg:pt-8">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={useEntireAudio}
                                onClick={toggleUseEntireAudio}
                                className={`relative h-8 w-14 rounded-full transition-colors ${useEntireAudio ? "bg-teal-600" : "bg-slate-300"}`}
                              >
                                <span
                                  className={`absolute top-1 size-6 rounded-full bg-white transition-transform ${
                                    useEntireAudio ? "translate-x-7" : "translate-x-1"
                                  }`}
                                />
                              </button>
                              Use the entire audio without trimming
                            </label>
                          </div>
                          <div className="mt-5">
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
                            <div className="mt-2 flex justify-between text-sm font-semibold text-slate-500">
                              {tickLabels.map((label, index) => (
                                <span key={`${label}-${index}`}>{label}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                {durationStatus === "ready" && afterTrimSlot ? <div>{afterTrimSlot}</div> : null}

                {isGenerating ? (
                  <div className="rounded-[12px] border border-teal-100 bg-teal-50 p-4">
                    <div className="flex items-center justify-between gap-4 text-sm font-extrabold text-teal-800">
                      <span>{isUploadingToServer ? "Uploading your song" : externalStageLabel}</span>
                      {isUploadingToServer ? <span>{Math.round(uploadProgressValue || 0)}%</span> : null}
                    </div>
                    <div className="mt-3 overflow-hidden rounded-full bg-white">
                      <div
                        className={`h-2 rounded-full bg-teal-600 transition-[width] ${isUploadingToServer ? "" : "animate-pulse"}`}
                        style={{ width: `${isUploadingToServer ? uploadProgressValue : 100}%` }}
                      />
                    </div>
                    <p className="mt-3 text-xs font-semibold text-teal-700">
                      {isUploadingToServer ? "Keep this page open while the audio uploads." : workingLabel}
                    </p>
                  </div>
                ) : null}

                {audioPreviewUrl && (
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
                )}

                <div className="border-t border-slate-200 pt-6">
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-14 rounded-[12px] border-slate-200 px-10 text-base font-black text-slate-600 [@media(hover:hover)]:hover:bg-slate-50"
                      onClick={clearAudioFile}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isGenerateDisabled}
                      className="h-14 gap-3 rounded-[12px] bg-teal-600 px-10 text-base font-black text-white shadow-[0_16px_34px_rgba(13,148,136,0.24)] [@media(hover:hover)]:hover:bg-teal-700"
                    >
                      {isGenerating && <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                      {isGenerated && <Check className="size-5" />}
                      {!isGenerating && !isGenerated && <Sparkles className="size-5" />}
                      {isGenerating ? externalStageLabel : isGenerated ? successLabel : generateLabel || `Generate Preview (${requiredCredits} credits)`}
                    </Button>
                  </div>
                </div>
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
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-950"
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

      {!audioFile ? (
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
            className={`flex ${compact ? "min-h-[210px]" : "min-h-[236px]"} cursor-pointer flex-col items-center justify-center rounded-md border bg-white px-6 py-8 transition-colors ${
              isDraggingAudio ? "border-[#fbbf24] bg-[#fbbf24]/5" : "border-slate-200 hover:border-[#fbbf24]"
            }`}
          >
            <div className={`${compact ? "size-20" : "size-28"} flex items-center justify-center rounded-full border-2 border-slate-200`}>
              <CloudUpload className={`${compact ? "size-7" : "size-9"} text-slate-700`} />
            </div>
            <p className={`${compact ? "mt-5" : "mt-8"} text-base text-slate-700`}>
              Drag and drop your <Music className="mx-1 inline size-5 fill-slate-700" />
              <span className="font-black">Audio file</span> here or{" "}
              <span className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1 font-semibold">
                <FolderOpen className="size-4" />
                Browse
              </span>
            </p>
            <p className="mt-2 text-sm font-medium text-slate-500">Max {maxFileSizeLabel} · Formats: MP3, WAV, FLAC, AAC, OGG, M4A</p>
          </div>
          <Button
            type="button"
            onClick={() => audioInputRef.current?.click()}
            className="mt-5 h-11 gap-2 rounded-md bg-[#fbbf24] px-6 text-base font-black text-slate-950 hover:bg-[#f59e0b]"
          >
            <Upload className="size-5" />
            Upload audio file
          </Button>
        </section>
      ) : (
        <section className={compact ? "mx-auto max-w-[860px] text-center" : "mx-auto mt-5 max-w-[860px] text-center"}>
          <div className="rounded-md border border-slate-200 bg-white px-5 py-7">
            {isGenerated && (
              <div className="mx-auto mb-7 flex size-28 items-center justify-center rounded-full border-2 border-emerald-300 text-emerald-400">
                <Check className="size-12 stroke-[1.7]" />
              </div>
            )}
            <div className="mb-3 flex items-center justify-center gap-2 text-base font-black">
              <Music className="size-5 fill-slate-700 text-slate-700" />
              <span className="truncate">{audioFile.name}</span>
            </div>
            {isGenerated && <p className="mb-6 text-sm font-medium text-slate-500">Your video will now be generated!</p>}
            <div className="grid grid-cols-[52px_1fr] items-center gap-3">
              <button
                type="button"
                onClick={togglePlayback}
                className="flex size-12 items-center justify-center rounded-full border border-slate-300 text-slate-700"
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
                <div className="mt-2 flex justify-between text-sm font-medium text-slate-500">
                  {tickLabels.map((label, index) => (
                    <span key={`${label}-${index}`}>{label}</span>
                  ))}
                </div>
              </div>
            </div>

            {durationStatus === "loading" && <p className="mt-6 text-sm font-semibold text-slate-500">Reading duration...</p>}
            {durationStatus === "error" && <p className="mt-6 text-sm font-semibold text-red-500">Unable to read duration</p>}
            {durationStatus === "ready" && (
              <>
                {showCredits ? (
                  <>
                    <div className="mt-7 text-base font-medium leading-7 text-slate-600">
                      <p>You have {creditBalanceLoading ? "..." : (creditBalance ?? 0)} credits in your balance,</p>
                      <p>
                        but the audio you uploaded requires <span className="font-black text-slate-800">{requiredCredits} credits</span>
                      </p>
                      {!hasEnoughCredits && (
                        <Button className="mt-3 h-9 rounded-md bg-[#fbbf24] px-5 font-bold text-slate-950 hover:bg-[#f59e0b]">
                          Add Credits
                        </Button>
                      )}
                    </div>
                    <div className="mt-9 grid grid-cols-[1fr_auto_1fr] items-center gap-5 text-slate-500">
                      <div className="h-px bg-slate-200" />
                      <span className="font-semibold">OR</span>
                      <div className="h-px bg-slate-200" />
                    </div>
                  </>
                ) : null}
                <p className={`${showCredits ? "mt-9" : "mt-7"} text-sm font-medium text-slate-500`}>(Optional) You can trim the audio to create a video for just a part of the song:</p>
                <div className="mt-5 flex justify-center gap-2">
                  <label className="text-left text-xs font-black text-slate-600">
                    Start Time
                    <span className="mt-1 flex overflow-hidden rounded-md border border-slate-300 bg-white">
                      <button
                        type="button"
                        onClick={() => nudgeStart(-1)}
                        disabled={useEntireAudio}
                        className="flex h-9 w-8 items-center justify-center border-r text-slate-400 disabled:opacity-40"
                        aria-label="Decrease start time"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <input
                        value={formatDecimal(startSeconds)}
                        onChange={(event) => updateStart(event.target.value)}
                        onBlur={normalizeTrim}
                        disabled={useEntireAudio}
                        className="h-9 w-24 px-3 text-sm font-medium outline-none disabled:bg-slate-50 disabled:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => nudgeStart(1)}
                        disabled={useEntireAudio}
                        className="flex h-9 w-8 items-center justify-center border-l text-slate-400 disabled:opacity-40"
                        aria-label="Increase start time"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </span>
                  </label>
                  <label className="text-left text-xs font-black text-slate-600">
                    End Time
                    <span className="mt-1 flex overflow-hidden rounded-md border border-slate-300 bg-white">
                      <button
                        type="button"
                        onClick={() => nudgeEnd(-1)}
                        disabled={useEntireAudio}
                        className="flex h-9 w-8 items-center justify-center border-r text-slate-400 disabled:opacity-40"
                        aria-label="Decrease end time"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <input
                        value={formatDecimal(endSeconds)}
                        onChange={(event) => updateEnd(event.target.value)}
                        onBlur={normalizeTrim}
                        disabled={useEntireAudio}
                        className="h-9 w-24 px-3 text-sm font-medium outline-none disabled:bg-slate-50 disabled:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => nudgeEnd(1)}
                        disabled={useEntireAudio}
                        className="flex h-9 w-8 items-center justify-center border-l text-slate-400 disabled:opacity-40"
                        aria-label="Increase end time"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </span>
                  </label>
                </div>
                <label className="mt-5 inline-flex cursor-pointer items-center justify-center gap-3 text-sm font-medium text-slate-700">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useEntireAudio}
                    onClick={toggleUseEntireAudio}
                    className={`relative h-6 w-11 rounded-full transition-colors ${useEntireAudio ? "bg-[#2563eb]" : "bg-slate-300"}`}
                  >
                    <span
                      className={`absolute top-1 size-4 rounded-full bg-white transition-transform ${
                        useEntireAudio ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                  Use the entire audio without trimming
                </label>
              </>
            )}
            {audioPreviewUrl && (
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
            )}
          </div>

          <Button
            type="button"
            onClick={generatePreview}
            disabled={isGenerateDisabled}
            className="mt-5 h-12 gap-2 rounded-md bg-[#fbbf24] px-6 text-base font-black text-slate-950 hover:bg-[#f59e0b]"
          >
            {isGenerating && <span className="size-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />}
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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Check,
  FolderOpen,
  Music,
  Pause,
  Play,
  Sparkles,
  Upload,
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

export interface AudioUploadTrimProps {
  maxFileSize?: number;
  acceptedFormats?: string[];
  creditsPerSecond?: number;
  creditCost?: number;
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

export function AudioUploadTrim({
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  acceptedFormats = DEFAULT_FORMATS,
  creditsPerSecond = 1,
  creditCost,
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
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>(fallbackPeaks("empty"));
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditBalanceLoading, setCreditBalanceLoading] = useState(true);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | null>(null);

  const durationSeconds = secondsFromMs(audioDurationMs);
  const selectedDuration = Math.max(0, endSeconds - startSeconds);
  const requiredCredits = Math.max(1, creditCost ?? Math.ceil((selectedDuration || durationSeconds || 1) * creditsPerSecond));
  const hasEnoughCredits = creditBalance === null || creditBalance >= requiredCredits;
  const tickLabels = useMemo(() => {
    const total = durationSeconds || 0;
    return [0, total * 0.25, total * 0.5, total * 0.75, total].map((value) => formatClock(value));
  }, [durationSeconds]);

  useEffect(() => {
    let mounted = true;
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
  }, []);

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

  return (
    <main className="mx-auto min-h-[660px] w-full max-w-[1240px] px-8 py-10">
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
        <section className="mx-auto mt-7 max-w-[860px] text-center">
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
            className={`flex min-h-[236px] cursor-pointer flex-col items-center justify-center rounded-md border bg-white px-6 py-8 transition-colors ${
              isDraggingAudio ? "border-[#fbbf24] bg-[#fbbf24]/5" : "border-slate-200 hover:border-[#fbbf24]"
            }`}
          >
            <div className="flex size-28 items-center justify-center rounded-full border-2 border-slate-200">
              <CloudUpload className="size-9 text-slate-700" />
            </div>
            <p className="mt-8 text-base text-slate-700">
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
        <section className="mx-auto mt-5 max-w-[860px] text-center">
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
                <p className="mt-9 text-sm font-medium text-slate-500">(Optional) You can trim the audio to create a video for just a part of the song:</p>
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
            disabled={isGenerating || isGenerated || durationStatus !== "ready" || !hasEnoughCredits}
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

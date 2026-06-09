"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Music, Music2, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLyricVideoCreationFlow } from "@/hooks/use-lyric-video-creation-flow";
import { DEFAULT_CHARACTER_PRESET_SLUG, getCharacterPreset } from "@/lib/character-presets";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ["mp3", "wav", "flac", "aac", "ogg", "m4a"];
const RESOLUTION_OPTIONS = ["1080p", "720p"] as const;
const ASPECT_RATIO_OPTIONS = ["16:9", "9:16"] as const;

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function getFileExtension(file: File) {
  return file.name.split(".").pop()?.toLowerCase() || "";
}

function isAcceptedAudio(file: File) {
  return file.type.startsWith("audio/") || ACCEPTED_EXTENSIONS.includes(getFileExtension(file));
}

export default function DashboardCreatePage() {
  const t = useTranslations("dashboard.create");
  const inputRef = useRef<HTMLInputElement>(null);
  const [projectName, setProjectName] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [durationLoading, setDurationLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [resolution, setResolution] = useState<(typeof RESOLUTION_OPTIONS)[number]>("1080p");
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIO_OPTIONS)[number]>("16:9");
  const { stage, uploadProgress, isWorking, generateFromFile, resetCreationState } = useLyricVideoCreationFlow();

  useEffect(() => {
    return () => {
      resetCreationState();
    };
  }, [resetCreationState]);

  async function readAudioDuration(file: File) {
    setDurationLoading(true);
    const url = URL.createObjectURL(file);
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const audio = document.createElement("audio");
        audio.preload = "metadata";
        audio.onloadedmetadata = () => {
          const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
          resolve(nextDuration);
        };
        audio.onerror = () => reject(new Error(t("read_error")));
        audio.src = url;
      });
      setAudioDuration(duration);
    } catch (error: any) {
      setAudioDuration(0);
      toast.error(error?.message || t("read_error"));
    } finally {
      URL.revokeObjectURL(url);
      setDurationLoading(false);
    }
  }

  function selectAudioFile(file?: File | null) {
    if (!file) return;
    if (!isAcceptedAudio(file)) {
      toast.error(t("choose_audio"));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t("max_size"));
      return;
    }
    setAudioFile(file);
    resetCreationState();
    readAudioDuration(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectName.trim()) {
      toast.error(t("name_required"));
      return;
    }
    if (!audioFile) {
      toast.error(t("choose_audio"));
      return;
    }

    try {
      await generateFromFile(
        audioFile,
        0,
        audioDuration || 0,
        {
          useEntireAudio: true,
          durationSeconds: audioDuration || 0,
          projectTitle: projectName.trim(),
          resolution,
          aspectRatio,
        },
        getCharacterPreset(DEFAULT_CHARACTER_PRESET_SLUG),
      );
    } catch (error: any) {
      toast.error(error?.message || t("failed"));
    }
  }

  const canSubmit = Boolean(projectName.trim() && audioFile && !durationLoading && !isWorking);
  const progress = typeof uploadProgress === "number" ? Math.max(0, Math.min(100, uploadProgress)) : null;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#030701] px-4 py-10 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-md bg-[#d7ff2f] text-[#071000] shadow-[0_0_32px_rgba(215,255,47,0.25)]">
            <Music2 className="size-7" />
          </div>
          <h1 className="text-4xl font-black leading-tight text-[#dfff5a] sm:text-5xl">{t("title")}</h1>
          <p className="mt-4 text-sm font-medium leading-6 text-zinc-400 sm:text-base">{t("description")}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full rounded-lg border border-zinc-700 bg-[#18191c] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-6"
        >
          <label className="block text-sm font-semibold text-zinc-300">
            {t("project_name")} <span className="text-red-400">*</span>
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder={t("project_name_placeholder")}
              disabled={isWorking}
              className="mt-3 h-12 w-full rounded-md border border-zinc-700 bg-[#1d1e22] px-4 text-base font-semibold text-zinc-100 outline-none transition focus:border-[#d7ff2f] focus:ring-2 focus:ring-[#d7ff2f]/20 disabled:opacity-60"
            />
          </label>

          <div className="mt-6">
            <p className="mb-3 text-sm font-semibold text-zinc-300">
              {t("upload_audio")} <span className="text-red-400">*</span>
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS.map((extension) => `.${extension}`).join(",")}
              className="sr-only"
              onChange={(event) => selectAudioFile(event.target.files?.[0] || null)}
            />
            <div
              role="button"
              tabIndex={0}
              onClick={() => !isWorking && inputRef.current?.click()}
              onKeyDown={(event) => {
                if (!isWorking && (event.key === "Enter" || event.key === " ")) inputRef.current?.click();
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                if (!isWorking) setIsDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (!isWorking) setIsDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                if (!isWorking) selectAudioFile(event.dataTransfer.files?.[0] || null);
              }}
              className={cn(
                "flex min-h-56 cursor-pointer items-center justify-center rounded-lg border px-6 py-8 text-center transition disabled:cursor-not-allowed",
                isDragging
                  ? "border-[#d7ff2f] bg-[#d7ff2f]/10"
                  : "border-[#8bb300] bg-[#20241f] hover:border-[#d7ff2f] hover:bg-[#22281e]",
                isWorking && "pointer-events-none opacity-70",
              )}
            >
              <div className="max-w-sm">
                <span className="mx-auto flex size-16 items-center justify-center rounded-md bg-[#191a1f] text-[#d7ff2f] shadow-[0_16px_42px_rgba(215,255,47,0.12)]">
                  {audioFile ? <Check className="size-8" /> : <Music className="size-8" />}
                </span>
                <p className="mt-4 text-lg font-black text-[#d7ff2f]">
                  {audioFile ? t("selected") : t("drop_title")}
                </p>
                <p className="mt-2 truncate text-sm font-semibold text-zinc-400">
                  {audioFile ? audioFile.name : t("drop_description")}
                </p>
                <p className="mt-5 text-xs font-bold uppercase text-zinc-500">
                  {t("formats")} · {t("max_size")}
                </p>
              </div>
            </div>

            {audioFile ? (
              <div className="mt-3 grid gap-3 rounded-md border border-zinc-700 bg-[#1d1e22] p-3 text-sm font-semibold text-zinc-400 sm:grid-cols-2">
                <span className="truncate">{audioFile.name}</span>
                <span className="text-left sm:text-right">
                  {t("duration")}: {durationLoading ? "..." : formatDuration(audioDuration)}
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-zinc-300">{t("resolution")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {RESOLUTION_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={isWorking}
                    onClick={() => setResolution(option)}
                    className={cn(
                      "h-11 rounded-md border text-sm font-black transition",
                      resolution === option
                        ? "border-[#d7ff2f] bg-[#d7ff2f]/12 text-[#d7ff2f]"
                        : "border-zinc-700 bg-[#232428] text-zinc-400 hover:border-zinc-500",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-zinc-300">{t("aspect_ratio")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {ASPECT_RATIO_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={isWorking}
                    onClick={() => setAspectRatio(option)}
                    className={cn(
                      "h-11 rounded-md border text-sm font-black transition",
                      aspectRatio === option
                        ? "border-[#d7ff2f] bg-[#d7ff2f]/12 text-[#d7ff2f]"
                        : "border-zinc-700 bg-[#232428] text-zinc-400 hover:border-zinc-500",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          {isWorking ? (
            <div className="mt-6 rounded-md border border-[#d7ff2f]/25 bg-[#d7ff2f]/8 p-4">
              <div className="flex items-center justify-between gap-3 text-sm font-bold text-[#d7ff2f]">
                <span>{t("working")}</span>
                {progress !== null ? <span>{Math.round(progress)}%</span> : null}
              </div>
              <div className="mt-3 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={cn("h-2 rounded-full bg-[#d7ff2f]", progress === null && "animate-pulse")}
                  style={{ width: `${progress ?? 100}%` }}
                />
              </div>
              <p className="mt-3 text-xs font-semibold text-zinc-400">{stage}</p>
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={!canSubmit}
            className="mt-6 h-14 w-full gap-3 rounded-md bg-[#d7ff2f] text-base font-black text-[#101409] hover:bg-[#c7ef22] disabled:bg-zinc-700 disabled:text-zinc-500"
          >
            {isWorking ? <Loader2 className="size-5 animate-spin" /> : audioFile ? <Plus className="size-5" /> : <Upload className="size-5" />}
            {isWorking ? t("working") : t("start")}
          </Button>
        </form>
      </div>
    </div>
  );
}

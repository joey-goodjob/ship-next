"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Music2 } from "lucide-react";
import { toast } from "sonner";
import { AudioUploadTrim, type UploadedAudioSource } from "@/components/audio-upload-trim";
import { CharacterPresetPicker } from "@/components/character-preset-picker";
import {
  clearHomeUploadedAudio,
  readHomeUploadedAudio,
  useLyricVideoCreationFlow,
  type UploadedAudio,
} from "@/hooks/use-lyric-video-creation-flow";
import {
  CHARACTER_PRESETS,
  DEFAULT_CHARACTER_PRESET_SLUG,
  getCharacterPreset,
} from "@/lib/character-presets";
import { cn } from "@/lib/utils";

const RESOLUTION_OPTIONS = ["1080p", "720p"] as const;
const ASPECT_RATIO_OPTIONS = ["16:9", "9:16"] as const;

function titleFromFilename(filename: string) {
  return filename.replace(/\.[^/.]+$/, "").trim() || "Untitled lyric video";
}

function uploadedToAudioSource(uploaded: UploadedAudio): UploadedAudioSource {
  return {
    url: uploaded.url,
    key: uploaded.key,
    filename: uploaded.filename,
    size: uploaded.size,
    contentType: uploaded.contentType,
    checksum: uploaded.checksum,
  };
}

export default function DashboardCreatePage() {
  const t = useTranslations("dashboard.create");
  const [projectName, setProjectName] = useState("");
  const [resolution, setResolution] = useState<(typeof RESOLUTION_OPTIONS)[number]>("1080p");
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIO_OPTIONS)[number]>("16:9");
  const [selectedCharacterSlug, setSelectedCharacterSlug] = useState(DEFAULT_CHARACTER_PRESET_SLUG);
  const [homeUploadedAudio, setHomeUploadedAudio] = useState<UploadedAudio | null>(null);
  const {
    stage,
    error,
    uploadProgress,
    isWorking,
    generateFromFile,
    generateFromUploaded,
    resetCreationState,
  } = useLyricVideoCreationFlow();

  useEffect(() => {
    const uploaded = readHomeUploadedAudio();
    if (!uploaded) return;
    setHomeUploadedAudio(uploaded);
    setProjectName((current) => current || titleFromFilename(uploaded.filename));
  }, []);

  useEffect(() => {
    return () => {
      resetCreationState();
    };
  }, [resetCreationState]);

  async function handleGenerate(
    file: File | null,
    startTime: number,
    endTime: number,
    options: { useEntireAudio: boolean; durationSeconds: number },
    uploadedAudio?: UploadedAudioSource | null,
  ) {
    if (!projectName.trim()) {
      toast.error(t("name_required"));
      return;
    }

    const selectedCharacter = getCharacterPreset(selectedCharacterSlug);
    const generateOptions = {
      ...options,
      projectTitle: projectName.trim(),
      resolution,
      aspectRatio,
    };

    try {
      if (uploadedAudio) {
        await generateFromUploaded(uploadedAudio, startTime, endTime, generateOptions, selectedCharacter);
        clearHomeUploadedAudio();
        setHomeUploadedAudio(null);
        return;
      }

      if (!file) {
        toast.error(t("choose_audio"));
        return;
      }

      await generateFromFile(file, startTime, endTime, generateOptions, selectedCharacter);
    } catch (err: any) {
      toast.error(err?.message || t("failed"));
    }
  }

  function clearInitialAudio() {
    clearHomeUploadedAudio();
    setHomeUploadedAudio(null);
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-brand-page px-4 py-8 text-brand-ink sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-md bg-brand-accent text-brand-accent-ink shadow-[0_0_32px_var(--brand-accent-shadow)]">
            <Music2 className="size-7" />
          </div>
          <h1 className="text-4xl font-black leading-tight text-brand-ink sm:text-5xl">{t("title")}</h1>
          <p className="mt-4 text-sm font-medium leading-6 text-brand-muted sm:text-base">{t("description")}</p>
        </div>

        <section className="mb-6 rounded-lg border border-brand-line bg-brand-panel p-5 shadow-[0_18px_60px_var(--brand-elevation-shadow)] sm:p-6">
          <label className="block text-sm font-semibold text-brand-muted">
            {t("project_name")} <span className="text-destructive">*</span>
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder={t("project_name_placeholder")}
              disabled={isWorking}
              className="mt-3 h-12 w-full rounded-md border border-brand-line bg-brand-panel-strong px-4 text-base font-semibold text-brand-ink outline-none transition placeholder:text-brand-muted/60 focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 disabled:opacity-60"
            />
          </label>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-brand-muted">{t("resolution")}</legend>
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
                        ? "border-brand-accent bg-brand-accent-soft text-brand-ink"
                        : "border-brand-line bg-brand-panel-strong text-brand-muted hover:border-brand-accent/50 hover:text-brand-ink",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-brand-muted">{t("aspect_ratio")}</legend>
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
                        ? "border-brand-accent bg-brand-accent-soft text-brand-ink"
                        : "border-brand-line bg-brand-panel-strong text-brand-muted hover:border-brand-accent/50 hover:text-brand-ink",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </section>

        <AudioUploadTrim
          compact
          creationStage={stage}
          uploadProgress={uploadProgress}
          showBack={false}
          initialUploadedAudio={homeUploadedAudio ? uploadedToAudioSource(homeUploadedAudio) : null}
          onClearInitialAudio={clearInitialAudio}
          afterTrimSlot={
            <CharacterPresetPicker
              presets={CHARACTER_PRESETS}
              selectedSlug={selectedCharacterSlug}
              disabled={isWorking}
              onChange={setSelectedCharacterSlug}
            />
          }
          onGenerate={handleGenerate}
          creditCost={10}
          generateLabel={homeUploadedAudio ? "Start creating" : t("start")}
          workingLabel={stage === "uploading" ? "Uploading audio..." : t("working")}
          successLabel="Direction ready"
        />

        {error ? (
          <div className="mx-auto mt-4 max-w-[860px] rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

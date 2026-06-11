"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Music2 } from "lucide-react";
import { toast } from "sonner";
import { AudioUploadTrim, type UploadedAudioSource } from "@/components/audio-upload-trim";
import { CharacterPresetPicker } from "@/components/character-preset-picker";
import { Typewriter } from "@/components/ui/typewriter-text";
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

const DEFAULT_RESOLUTION = "1080p";
const DEFAULT_ASPECT_RATIO = "16:9";

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
    durationSeconds: uploaded.durationSeconds,
  };
}

export default function DashboardCreatePage() {
  const t = useTranslations("dashboard.create");
  const rawTitleLoop = t.raw("title_loop");
  const titleLoop = Array.isArray(rawTitleLoop) ? rawTitleLoop.filter((item): item is string => typeof item === "string") : [t("title")];
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

  useLayoutEffect(() => {
    const uploaded = readHomeUploadedAudio();
    if (!uploaded) return;
    setHomeUploadedAudio(uploaded);
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
    const projectTitle = titleFromFilename(uploadedAudio?.filename || file?.name || "");
    const selectedCharacter = getCharacterPreset(selectedCharacterSlug);
    const generateOptions = {
      ...options,
      projectTitle,
      resolution: DEFAULT_RESOLUTION,
      aspectRatio: DEFAULT_ASPECT_RATIO,
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
          <h1 className="mx-auto min-h-[5.75rem] max-w-4xl text-4xl font-black leading-tight text-brand-ink sm:min-h-[3.75rem] sm:text-5xl">
            <Typewriter text={titleLoop.length > 0 ? titleLoop : t("title")} speed={70} deleteSpeed={35} delay={1500} loop />
          </h1>
          <p className="mt-4 text-sm font-medium leading-6 text-brand-muted sm:text-base">{t("description")}</p>
        </div>

        <AudioUploadTrim
          compact
          presentation="home-card"
          creationStage={stage}
          uploadProgress={uploadProgress}
          showBack={false}
          initialUploadedAudio={homeUploadedAudio ? uploadedToAudioSource(homeUploadedAudio) : null}
          deferInitialAudioUntilReady
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

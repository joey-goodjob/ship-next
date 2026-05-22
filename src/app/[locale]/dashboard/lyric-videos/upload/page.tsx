"use client";

import { useRouter } from "@/core/i18n/navigation";
import { AudioUploadTrim } from "@/components/audio-upload-trim";

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

type UploadAudioResponse = {
  url: string;
  key: string;
  filename: string;
  size: number;
};

type LyricVideoProject = {
  id: string;
};

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok || body.code !== 0) {
    throw new Error(body.message || "Request failed");
  }
  return body.data as T;
}

function secondsToMs(seconds: number) {
  return Math.max(0, Math.round(seconds * 1000));
}

function titleFromFilename(filename: string) {
  return filename.replace(/\.[^/.]+$/, "").trim() || "Untitled lyric video";
}

export default function LyricVideoUploadPage() {
  const router = useRouter();

  async function createPreviewProject(
    file: File,
    startTime: number,
    endTime: number,
    options: { useEntireAudio: boolean; durationSeconds: number },
  ) {
    const formData = new FormData();
    formData.append("file", file);

    const uploaded = await requestJson<UploadAudioResponse>("/api/storage/upload-audio", {
      method: "POST",
      body: formData,
    });

    const originalDurationMs = secondsToMs(options.durationSeconds);
    const trimStartMs = options.useEntireAudio ? 0 : secondsToMs(startTime);
    const trimEndMs = options.useEntireAudio ? originalDurationMs : secondsToMs(endTime);
    const filename = uploaded.filename || file.name;

    const project = await requestJson<LyricVideoProject>("/api/lyric-videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleFromFilename(filename),
        audioUrl: uploaded.url,
        audioStorageKey: uploaded.key,
        originalAudioUrl: uploaded.url,
        originalAudioStorageKey: uploaded.key,
        audioFilename: filename,
        audioDurationMs: originalDurationMs,
        audioMimeType: file.type || "audio/mpeg",
        audioSizeBytes: uploaded.size || file.size,
        trimStartMs,
        trimEndMs,
      }),
    });

    console.info("[lyric-video] upload page project created", {
      projectId: project.id,
      filename,
      originalDurationMs,
      trimStartMs,
      trimEndMs,
    });
    await requestJson(`/api/lyric-videos/${project.id}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    console.info("[lyric-video] upload page transcription requested", { projectId: project.id });

    router.push(`/dashboard/lyric-videos/${project.id}/preview`);
  }

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-white">
      <AudioUploadTrim
        onBack={() => router.push("/dashboard/lyric-videos")}
        onGenerate={createPreviewProject}
        creditCost={10}
        generateLabel="Generate lyrics (10 credits)"
        workingLabel="Creating preview..."
        successLabel="Preview ready"
      />
    </div>
  );
}

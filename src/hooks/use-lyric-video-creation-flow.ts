"use client";

import { useCallback, useState } from "react";
import { useRouter } from "@/core/i18n/navigation";

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

type GenerateOptions = {
  useEntireAudio: boolean;
  durationSeconds: number;
};

type PendingLyricVideoPayload = {
  uploaded: UploadAudioResponse;
  filename: string;
  fileType: string;
  fileSize: number;
  startTime: number;
  endTime: number;
  options: GenerateOptions;
  createdAt: number;
};

export type LyricVideoCreationStage =
  | "idle"
  | "uploading"
  | "waiting-auth"
  | "creating"
  | "transcribing"
  | "redirecting"
  | "failed";

const PENDING_KEY = "lyric-video-pending-upload";

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

async function uploadAudioFile(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return requestJson<UploadAudioResponse>("/api/storage/upload-audio", {
    method: "POST",
    body: formData,
  });
}

function readPendingPayload(): PendingLyricVideoPayload | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingLyricVideoPayload;
    if (!parsed?.uploaded?.url || !parsed.filename) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePendingPayload(payload: PendingLyricVideoPayload) {
  window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
}

function clearPendingPayload() {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(PENDING_KEY);
  }
}

export function useLyricVideoCreationFlow() {
  const router = useRouter();
  const [stage, setStage] = useState<LyricVideoCreationStage>("idle");
  const [error, setError] = useState("");

  const createProjectAndTranscribe = useCallback(
    async (payload: PendingLyricVideoPayload) => {
      setError("");
      setStage("creating");

      const originalDurationMs = secondsToMs(payload.options.durationSeconds);
      const trimStartMs = payload.options.useEntireAudio ? 0 : secondsToMs(payload.startTime);
      const trimEndMs = payload.options.useEntireAudio ? originalDurationMs : secondsToMs(payload.endTime);
      const filename = payload.uploaded.filename || payload.filename;

      const project = await requestJson<LyricVideoProject>("/api/lyric-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleFromFilename(filename),
          audioUrl: payload.uploaded.url,
          audioStorageKey: payload.uploaded.key,
          originalAudioUrl: payload.uploaded.url,
          originalAudioStorageKey: payload.uploaded.key,
          audioFilename: filename,
          audioDurationMs: originalDurationMs,
          audioMimeType: payload.fileType || "audio/mpeg",
          audioSizeBytes: payload.uploaded.size || payload.fileSize,
          trimStartMs,
          trimEndMs,
        }),
      });

      setStage("transcribing");
      await requestJson(`/api/lyric-videos/${project.id}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      clearPendingPayload();
      setStage("redirecting");
      router.push(`/lyric-videos/${project.id}/preview`);
    },
    [router],
  );

  const generateFromFile = useCallback(
    async (file: File, startTime: number, endTime: number, options: GenerateOptions) => {
      try {
        setError("");
        setStage("uploading");
        const uploaded = await uploadAudioFile(file);
        const payload: PendingLyricVideoPayload = {
          uploaded,
          filename: uploaded.filename || file.name,
          fileType: file.type || "audio/mpeg",
          fileSize: uploaded.size || file.size,
          startTime,
          endTime,
          options,
          createdAt: Date.now(),
        };

        await createProjectAndTranscribe(payload);
      } catch (err: any) {
        setStage("failed");
        setError(err?.message || "Failed to create lyric video");
        throw err;
      }
    },
    [createProjectAndTranscribe],
  );

  const preparePendingAuth = useCallback(
    async (file: File, startTime: number, endTime: number, options: GenerateOptions) => {
      try {
        setError("");
        setStage("uploading");
        const uploaded = await uploadAudioFile(file);
        writePendingPayload({
          uploaded,
          filename: uploaded.filename || file.name,
          fileType: file.type || "audio/mpeg",
          fileSize: uploaded.size || file.size,
          startTime,
          endTime,
          options,
          createdAt: Date.now(),
        });
        setStage("waiting-auth");
      } catch (err: any) {
        setStage("failed");
        setError(err?.message || "Failed to keep your upload ready");
        throw err;
      }
    },
    [],
  );

  const resumePending = useCallback(async () => {
    const payload = readPendingPayload();
    if (!payload) return false;

    try {
      await createProjectAndTranscribe(payload);
      return true;
    } catch (err: any) {
      setStage("failed");
      setError(err?.message || "Failed to create lyric video");
      return false;
    }
  }, [createProjectAndTranscribe]);

  const resetCreationState = useCallback(() => {
    setStage("idle");
    setError("");
  }, []);

  return {
    stage,
    error,
    isWorking: stage !== "idle" && stage !== "failed",
    generateFromFile,
    preparePendingAuth,
    resumePending,
    resetCreationState,
  };
}

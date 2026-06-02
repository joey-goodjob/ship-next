"use client";

import { useCallback, useState } from "react";
import { useRouter } from "@/core/i18n/navigation";
import { logLyricStage, logLyricStageError } from "@/lib/lyric-video-log";

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
  deduped?: boolean;
};

type LyricVideoProject = {
  id: string;
  title?: string;
  pipelineStage?: string;
  lyricsStatus?: string;
  scenesStatus?: string;
  storyPrompt?: string;
  generationStatus?: string;
  generationProgress?: number;
};

type GenerationRunResponse = {
  run?: unknown;
  steps?: unknown[];
  lines?: unknown[];
  words?: unknown[];
  scenes?: unknown[];
  project?: LyricVideoProject;
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
  | "generating"
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
  const startedAt = Date.now();
  logLyricStage("upload-audio", "start", {
    filename: file.name,
    size: file.size,
    type: file.type,
  });

  try {
    const uploaded = await requestJson<UploadAudioResponse>("/api/storage/upload-audio", {
      method: "POST",
      body: formData,
    });
    logLyricStage("upload-audio", "success", {
      durationMs: Date.now() - startedAt,
      url: uploaded.url,
      key: uploaded.key,
      filename: uploaded.filename,
      size: uploaded.size,
      deduped: uploaded.deduped,
    });
    return uploaded;
  } catch (error) {
    logLyricStageError("upload-audio", "fail", error, { durationMs: Date.now() - startedAt });
    throw error;
  }
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

  const createProjectAndGenerate = useCallback(
    async (payload: PendingLyricVideoPayload) => {
      setError("");
      setStage("creating");

      const originalDurationMs = secondsToMs(payload.options.durationSeconds);
      const trimStartMs = payload.options.useEntireAudio ? 0 : secondsToMs(payload.startTime);
      const trimEndMs = payload.options.useEntireAudio ? originalDurationMs : secondsToMs(payload.endTime);
      const filename = payload.uploaded.filename || payload.filename;

      const createStartedAt = Date.now();
      logLyricStage("create-project", "start", {
        title: titleFromFilename(filename),
        filename,
        audioDurationMs: originalDurationMs,
        trimStartMs,
        trimEndMs,
      });
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
      logLyricStage("create-project", "success", {
        durationMs: Date.now() - createStartedAt,
        projectId: project.id,
        title: project.title,
        pipelineStage: project.pipelineStage,
        lyricsStatus: project.lyricsStatus,
        scenesStatus: project.scenesStatus,
      });

      setStage("generating");
      const generateStartedAt = Date.now();
      logLyricStage("one-click-generate", "start", { projectId: project.id });
      const generated = await requestJson<GenerationRunResponse>(`/api/lyric-videos/${project.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      logLyricStage("one-click-generate", "queued-images", {
        durationMs: Date.now() - generateStartedAt,
        projectId: project.id,
        lineCount: generated.lines?.length || 0,
        wordCount: generated.words?.length || 0,
        sceneCount: generated.scenes?.length || 0,
        pipelineStage: generated.project?.pipelineStage,
        lyricsStatus: generated.project?.lyricsStatus,
        scenesStatus: generated.project?.scenesStatus,
        generationStatus: generated.project?.generationStatus,
        generationProgress: generated.project?.generationProgress,
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

        await createProjectAndGenerate(payload);
      } catch (err: any) {
        setStage("failed");
        setError(err?.message || "Failed to create lyric video");
        throw err;
      }
    },
    [createProjectAndGenerate],
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
      await createProjectAndGenerate(payload);
      return true;
    } catch (err: any) {
      setStage("failed");
      setError(err?.message || "Failed to create lyric video");
      return false;
    }
  }, [createProjectAndGenerate]);

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

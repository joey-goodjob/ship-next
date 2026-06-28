"use client";

import { useCallback, useState } from "react";
import { useRouter } from "@/core/i18n/navigation";
import type { CharacterPreset } from "@/lib/character-presets";
import { buildDraftProjectCreateBody, previewSetupHref } from "@/lib/lyric-video-setup-flow";
import { logLyricStage, logLyricStageError } from "@/lib/lyric-video-log";

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

export type UploadedAudio = {
  url: string;
  key: string;
  filename: string;
  size: number;
  contentType?: string;
  checksum?: string;
  deduped?: boolean;
  durationSeconds?: number;
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

type GenerateOptions = {
  useEntireAudio: boolean;
  durationSeconds: number;
  projectTitle?: string;
  aspectRatio?: string;
  resolution?: string;
};

type PendingLyricVideoPayload = {
  uploaded: UploadedAudio;
  filename: string;
  fileType: string;
  fileSize: number;
  startTime: number;
  endTime: number;
  options: GenerateOptions;
  selectedCharacterSlugs?: string[];
  selectedCharacterSlug?: string;
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
const HOME_UPLOAD_KEY = "lyric-video-home-upload";

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok || body.code !== 0) {
    throw new Error(body.message || "Request failed");
  }
  return body.data as T;
}

/**
 * 前端一键创建流程的第一步：上传原始音频。
 *
 * 只调用 `/api/storage/upload-audio` 拿到 url/key；真正的歌词视频项目还没创建。
 */
async function uploadAudioFile(file: File, onProgress?: (progress: number) => void) {
  const formData = new FormData();
  formData.append("file", file);
  const startedAt = Date.now();
  logLyricStage("upload-audio", "start", {
    filename: file.name,
    size: file.size,
    type: file.type,
  });

  try {
    onProgress?.(0);
    const uploaded = await new Promise<UploadedAudio>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/storage/upload-audio");
      xhr.responseType = "json";

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      };

      xhr.onload = () => {
        const body = (xhr.response || {}) as ApiResponse<UploadedAudio>;
        if (xhr.status < 200 || xhr.status >= 300 || body.code !== 0 || !body.data) {
          reject(new Error(body.message || "Audio upload failed"));
          return;
        }
        onProgress?.(100);
        resolve(body.data);
      };

      xhr.onerror = () => reject(new Error("Audio upload failed"));
      xhr.onabort = () => reject(new Error("Audio upload cancelled"));
      xhr.send(formData);
    });

    logLyricStage("upload-audio", "success", {
      durationMs: Date.now() - startedAt,
      url: uploaded.url,
      key: uploaded.key,
      filename: uploaded.filename,
      size: uploaded.size,
      contentType: uploaded.contentType,
      checksum: uploaded.checksum,
      deduped: uploaded.deduped,
    });
    return uploaded;
  } catch (error) {
    logLyricStageError("upload-audio", "fail", error, { durationMs: Date.now() - startedAt });
    throw error;
  }
}

export function readHomeUploadedAudio(): UploadedAudio | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(HOME_UPLOAD_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as UploadedAudio;
    if (!parsed?.url || !parsed.key || !parsed.filename) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeHomeUploadedAudio(uploaded: UploadedAudio) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(HOME_UPLOAD_KEY, JSON.stringify(uploaded));
}

export function clearHomeUploadedAudio() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(HOME_UPLOAD_KEY);
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
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const createProjectAndCustomize = useCallback(
    async (payload: PendingLyricVideoPayload) => {
      // 前端主链路：
      // 1. 用 upload-audio 返回的 url 创建 `lyric_video_project`
      // 2. 进入 preview setup 模式，让用户先选择风格和角色
      // 3. 用户确认后，再从工作台触发 direction generation 和扣费
      setError("");
      setStage("creating");
      setUploadProgress(null);

      const createBody = buildDraftProjectCreateBody({
        uploaded: {
          url: payload.uploaded.url,
          key: payload.uploaded.key,
          filename: payload.uploaded.filename || payload.filename,
          size: payload.uploaded.size || payload.fileSize,
          contentType: payload.uploaded.contentType || payload.fileType || "audio/mpeg",
          checksum: payload.uploaded.checksum,
        },
        startTime: payload.startTime,
        endTime: payload.endTime,
        options: payload.options,
      });

      const createStartedAt = Date.now();
      logLyricStage("create-project", "start", {
        title: createBody.title,
        filename: createBody.audioFilename,
        audioDurationMs: createBody.audioDurationMs,
        trimStartMs: createBody.trimStartMs,
        trimEndMs: createBody.trimEndMs,
        aspectRatio: createBody.aspectRatio,
        resolution: createBody.resolution,
      });
      const project = await requestJson<LyricVideoProject>("/api/lyric-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createBody),
      });
      logLyricStage("create-project", "success", {
        durationMs: Date.now() - createStartedAt,
        projectId: project.id,
        title: project.title,
        pipelineStage: project.pipelineStage,
        lyricsStatus: project.lyricsStatus,
        scenesStatus: project.scenesStatus,
      });

      clearPendingPayload();
      setStage("redirecting");
      router.push(previewSetupHref(project.id));
    },
    [router],
  );

  const uploadOnly = useCallback(async (file: File) => {
    try {
      setError("");
      setStage("uploading");
      setUploadProgress(0);
      const uploaded = await uploadAudioFile(file, setUploadProgress);
      setStage("idle");
      setUploadProgress(null);
      return {
        ...uploaded,
        filename: uploaded.filename || file.name,
        size: uploaded.size || file.size,
        contentType: uploaded.contentType || file.type || "audio/mpeg",
      };
    } catch (err: any) {
      setStage("failed");
      setUploadProgress(null);
      setError(err?.message || "Audio upload failed");
      throw err;
    }
  }, []);

  const continueToCustomizeFromUploaded = useCallback(
    async (
      uploaded: UploadedAudio,
      startTime: number,
      endTime: number,
      options: GenerateOptions,
      selectedCharacters?: CharacterPreset[] | CharacterPreset | null,
    ) => {
      try {
        const castSelection = Array.isArray(selectedCharacters)
          ? selectedCharacters
          : selectedCharacters
            ? [selectedCharacters]
            : [];
        const payload: PendingLyricVideoPayload = {
          uploaded,
          filename: uploaded.filename,
          fileType: uploaded.contentType || "audio/mpeg",
          fileSize: uploaded.size,
          startTime,
          endTime,
          options,
          selectedCharacterSlugs: castSelection.map((character) => character.slug).slice(0, 4),
          selectedCharacterSlug: castSelection[0]?.slug,
          createdAt: Date.now(),
        };

        await createProjectAndCustomize(payload);
      } catch (err: any) {
        setStage("failed");
        setUploadProgress(null);
        setError(err?.message || "Failed to create lyric video");
        throw err;
      }
    },
    [createProjectAndCustomize],
  );

  const continueToCustomizeFromFile = useCallback(
    async (
      file: File,
      startTime: number,
      endTime: number,
      options: GenerateOptions,
      selectedCharacters?: CharacterPreset[] | CharacterPreset | null,
    ) => {
      const uploaded = await uploadOnly(file);
      await continueToCustomizeFromUploaded(uploaded, startTime, endTime, options, selectedCharacters);
    },
    [continueToCustomizeFromUploaded, uploadOnly],
  );

  const preparePendingAuth = useCallback(
    async (
      file: File,
      startTime: number,
      endTime: number,
      options: GenerateOptions,
      selectedCharacters?: CharacterPreset[] | CharacterPreset | null,
    ) => {
      try {
        const castSelection = Array.isArray(selectedCharacters)
          ? selectedCharacters
          : selectedCharacters
            ? [selectedCharacters]
            : [];
        setError("");
        setStage("uploading");
        setUploadProgress(0);
        const uploaded = await uploadAudioFile(file, setUploadProgress);
        writePendingPayload({
          uploaded,
          filename: uploaded.filename || file.name,
          fileType: file.type || "audio/mpeg",
          fileSize: uploaded.size || file.size,
          startTime,
          endTime,
          options,
          selectedCharacterSlugs: castSelection.map((character) => character.slug).slice(0, 4),
          selectedCharacterSlug: castSelection[0]?.slug,
          createdAt: Date.now(),
        });
        setStage("waiting-auth");
        setUploadProgress(null);
      } catch (err: any) {
        setStage("failed");
        setUploadProgress(null);
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
      await createProjectAndCustomize(payload);
      return true;
    } catch (err: any) {
      setStage("failed");
      setError(err?.message || "Failed to create lyric video");
      return false;
    }
  }, [createProjectAndCustomize]);

  const resetCreationState = useCallback(() => {
    setStage("idle");
    setError("");
    setUploadProgress(null);
  }, []);

  return {
    stage,
    error,
    uploadProgress,
    isWorking: stage !== "idle" && stage !== "failed",
    uploadOnly,
    continueToCustomizeFromUploaded,
    continueToCustomizeFromFile,
    preparePendingAuth,
    resumePending,
    resetCreationState,
  };
}

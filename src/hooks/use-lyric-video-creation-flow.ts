"use client";

import { useCallback, useState } from "react";
import { useRouter } from "@/core/i18n/navigation";
import { getCharacterPreset, type CharacterPreset } from "@/lib/character-presets";
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
  songAnalysis?: {
    story_acts?: unknown[];
  } | null;
  directionReady?: boolean;
  stopAfter?: string;
};

type GenerateOptions = {
  useEntireAudio: boolean;
  durationSeconds: number;
  projectTitle?: string;
  aspectRatio?: string;
  resolution?: string;
};

type PendingLyricVideoPayload = {
  uploaded: UploadAudioResponse;
  filename: string;
  fileType: string;
  fileSize: number;
  startTime: number;
  endTime: number;
  options: GenerateOptions;
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

function resolvePublicAssetUrl(url: string) {
  if (!url || /^https?:\/\//.test(url)) return url;
  if (typeof window === "undefined") return url;
  return `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
}

function assertPrompt1DirectionReady(generated: GenerationRunResponse) {
  const reachedSongAnalysis = generated.directionReady === true || generated.stopAfter === "song_analysis";
  const hasStoryDirection =
    Boolean(generated.project?.storyPrompt?.trim()) ||
    (Array.isArray(generated.songAnalysis?.story_acts) && generated.songAnalysis.story_acts.length > 0);

  if (!reachedSongAnalysis || !hasStoryDirection) {
    throw new Error("Prompt1 story direction is not ready yet");
  }
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
    const uploaded = await new Promise<UploadAudioResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/storage/upload-audio");
      xhr.responseType = "json";

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      };

      xhr.onload = () => {
        const body = (xhr.response || {}) as ApiResponse<UploadAudioResponse>;
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
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const createProjectAndGenerate = useCallback(
    async (payload: PendingLyricVideoPayload) => {
      // 前端主链路：
      // 1. 用 upload-audio 返回的 url 创建 `lyric_video_project`
      // 2. 可选写入默认角色 `lyric_video_cast_member`
      // 3. 调 `/api/lyric-videos/:id/generate` 并等待 Prompt1 产出故事方向后再进预览页
      setError("");
      setStage("creating");
      setUploadProgress(null);

      const originalDurationMs = secondsToMs(payload.options.durationSeconds);
      const trimStartMs = payload.options.useEntireAudio ? 0 : secondsToMs(payload.startTime);
      const trimEndMs = payload.options.useEntireAudio ? originalDurationMs : secondsToMs(payload.endTime);
      const filename = payload.uploaded.filename || payload.filename;
      const projectTitle = payload.options.projectTitle?.trim() || titleFromFilename(filename);

      const createStartedAt = Date.now();
      logLyricStage("create-project", "start", {
        title: projectTitle,
        filename,
        audioDurationMs: originalDurationMs,
        trimStartMs,
        trimEndMs,
        aspectRatio: payload.options.aspectRatio,
        resolution: payload.options.resolution,
      });
      const project = await requestJson<LyricVideoProject>("/api/lyric-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: projectTitle,
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
          aspectRatio: payload.options.aspectRatio,
          resolution: payload.options.resolution,
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

      const selectedCharacter = getCharacterPreset(payload.selectedCharacterSlug);
      if (selectedCharacter) {
        const castStartedAt = Date.now();
        logLyricStage("create-project-cast", "start", {
          projectId: project.id,
          characterSlug: selectedCharacter.slug,
          characterName: selectedCharacter.name,
        });
        const thumbnailUrl = resolvePublicAssetUrl(selectedCharacter.thumbnailUrl || selectedCharacter.referenceImageUrl);
        const referenceImageUrl = resolvePublicAssetUrl(selectedCharacter.referenceImageUrl || selectedCharacter.thumbnailUrl);
        const referenceImageUrls = (
          selectedCharacter.referenceImageUrls?.length
            ? selectedCharacter.referenceImageUrls
            : [referenceImageUrl]
        )
          .map(resolvePublicAssetUrl)
          .filter(Boolean);
        await requestJson(`/api/lyric-videos/${project.id}/cast`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: selectedCharacter.name,
            role: selectedCharacter.role,
            description: selectedCharacter.description,
            promptFragment: selectedCharacter.promptFragment,
            referenceImageUrl,
            generationParams: {
              presetSlug: selectedCharacter.slug,
              thumbnailUrl,
              referenceImageUrls,
            },
            status: "active",
          }),
        });
        logLyricStage("create-project-cast", "success", {
          durationMs: Date.now() - castStartedAt,
          projectId: project.id,
          characterSlug: selectedCharacter.slug,
          characterName: selectedCharacter.name,
        });
      }

      setStage("generating");
      const generateStartedAt = Date.now();
      logLyricStage("guided-generate", "wait-start", { projectId: project.id });
      const generated = await requestJson<GenerationRunResponse>(`/api/lyric-videos/${project.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "guided", wait: true }),
      });
      assertPrompt1DirectionReady(generated);
      logLyricStage("guided-generate", "direction-ready", {
        durationMs: Date.now() - generateStartedAt,
        projectId: project.id,
        lineCount: generated.lines?.length || 0,
        wordCount: generated.words?.length || 0,
        sceneCount: generated.scenes?.length || 0,
        storyActsCount: generated.songAnalysis?.story_acts?.length || 0,
        directionReady: generated.directionReady,
        stopAfter: generated.stopAfter,
        hasStoryPrompt: Boolean(generated.project?.storyPrompt),
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
    async (
      file: File,
      startTime: number,
      endTime: number,
      options: GenerateOptions,
      selectedCharacter?: CharacterPreset | null,
    ) => {
      try {
        setError("");
        setStage("uploading");
        setUploadProgress(0);
        const uploaded = await uploadAudioFile(file, setUploadProgress);
        const payload: PendingLyricVideoPayload = {
          uploaded,
          filename: uploaded.filename || file.name,
          fileType: file.type || "audio/mpeg",
          fileSize: uploaded.size || file.size,
          startTime,
          endTime,
          options,
          selectedCharacterSlug: selectedCharacter?.slug,
          createdAt: Date.now(),
        };

        await createProjectAndGenerate(payload);
      } catch (err: any) {
        setStage("failed");
        setUploadProgress(null);
        setError(err?.message || "Failed to create lyric video");
        throw err;
      }
    },
    [createProjectAndGenerate],
  );

  const preparePendingAuth = useCallback(
    async (
      file: File,
      startTime: number,
      endTime: number,
      options: GenerateOptions,
      selectedCharacter?: CharacterPreset | null,
    ) => {
      try {
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
          selectedCharacterSlug: selectedCharacter?.slug,
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
    setUploadProgress(null);
  }, []);

  return {
    stage,
    error,
    uploadProgress,
    isWorking: stage !== "idle" && stage !== "failed",
    generateFromFile,
    preparePendingAuth,
    resumePending,
    resetCreationState,
  };
}

export type DraftUploadedAudio = {
  url: string;
  key: string;
  filename: string;
  size: number;
  contentType?: string;
  checksum?: string;
};

export type DraftProjectGenerateOptions = {
  useEntireAudio: boolean;
  durationSeconds: number;
  projectTitle?: string;
  aspectRatio?: string;
  resolution?: string;
};

export type DraftProjectUploadPayload = {
  uploaded: DraftUploadedAudio;
  startTime: number;
  endTime: number;
  options: DraftProjectGenerateOptions;
};

export type DraftProjectCreateBody = {
  title: string;
  audioUrl: string;
  audioStorageKey: string;
  originalAudioUrl: string;
  originalAudioStorageKey: string;
  audioFilename: string;
  audioDurationMs: number;
  audioMimeType: string;
  audioSizeBytes: number;
  audioChecksum?: string;
  trimStartMs: number;
  trimEndMs: number;
  aspectRatio?: string;
  resolution?: string;
};

function secondsToMs(seconds: number) {
  return Math.max(0, Math.round(seconds * 1000));
}

function titleFromFilename(filename: string) {
  return filename.replace(/\.[^/.]+$/, "").trim() || "Untitled lyric video";
}

export function buildDraftProjectCreateBody(payload: DraftProjectUploadPayload): DraftProjectCreateBody {
  const originalDurationMs = secondsToMs(payload.options.durationSeconds);
  const trimStartMs = payload.options.useEntireAudio ? 0 : secondsToMs(payload.startTime);
  const trimEndMs = payload.options.useEntireAudio ? originalDurationMs : secondsToMs(payload.endTime);
  const filename = payload.uploaded.filename;

  return {
    title: payload.options.projectTitle?.trim() || titleFromFilename(filename),
    audioUrl: payload.uploaded.url,
    audioStorageKey: payload.uploaded.key,
    originalAudioUrl: payload.uploaded.url,
    originalAudioStorageKey: payload.uploaded.key,
    audioFilename: filename,
    audioDurationMs: originalDurationMs,
    audioMimeType: payload.uploaded.contentType || "audio/mpeg",
    audioSizeBytes: payload.uploaded.size,
    audioChecksum: payload.uploaded.checksum,
    trimStartMs,
    trimEndMs,
    aspectRatio: payload.options.aspectRatio,
    resolution: payload.options.resolution,
  };
}

export function previewSetupHref(projectId: string) {
  return `/creations/${projectId}/preview?setup=1`;
}

export function shouldAutoStartDirection({
  deferAutoDirection,
  hasAudio,
  lineCount,
}: {
  deferAutoDirection: boolean;
  hasAudio: boolean;
  lineCount: number;
}) {
  return !deferAutoDirection && hasAudio && lineCount === 0;
}

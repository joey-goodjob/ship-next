import type { LyricExport } from "./types";

export function buildExportDownloadFilename(exportJob?: Pick<LyricExport, "id"> | null) {
  const prefix = exportJob?.id?.slice(0, 8);
  return prefix ? `lyric-video-${prefix}.mp4` : "lyric-video.mp4";
}

export function buildExportDownloadUrl(params?: { projectId?: string | null; exportId?: string | null }) {
  if (!params?.projectId || !params.exportId) return "";
  return `/api/lyric-videos/${encodeURIComponent(params.projectId)}/exports/${encodeURIComponent(params.exportId)}/download`;
}

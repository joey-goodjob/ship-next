export type CreationProgressStageId = "lyrics" | "scenes" | "export";
export type CreationProgressStageState = "complete" | "active" | "waiting" | "blocked";
export type CreationProgressTone = "success" | "active" | "warning" | "danger" | "muted";

export type CreationProgressProject = {
  status: string;
  pipelineStage: string;
  lyricsStatus: string;
  scenesStatus: string;
  renderStatus: string;
};

export type CreationProgressStage = {
  id: CreationProgressStageId;
  status: string;
  state: CreationProgressStageState;
};

export type CreationProgress = {
  copyKey: string;
  title: string;
  detail: string;
  tone: CreationProgressTone;
  stages: CreationProgressStage[];
};

const COMPLETE_STATUSES = new Set(["ready", "success", "completed", "done"]);
const ACTIVE_STATUSES = new Set([
  "asr_processing",
  "audio_processing",
  "processing",
  "generating",
  "queued",
  "rendering",
  "running",
  "waiting_provider",
  "storyboard_generating",
  "images_queueing",
  "images_processing",
]);
const FAILED_STATUSES = new Set(["failed", "error", "canceled"]);
const DRAFT_STATUSES = new Set(["lyrics_draft", "draft"]);

function normalizeStatus(status?: string | null) {
  return String(status || "empty").trim().toLowerCase();
}

function isComplete(status: string) {
  return COMPLETE_STATUSES.has(normalizeStatus(status));
}

function isActive(status: string) {
  return ACTIVE_STATUSES.has(normalizeStatus(status));
}

function isFailed(status: string) {
  return FAILED_STATUSES.has(normalizeStatus(status));
}

function isDraft(status: string) {
  return DRAFT_STATUSES.has(normalizeStatus(status));
}

function stageState(status: string, fallback: CreationProgressStageState): CreationProgressStageState {
  if (isFailed(status)) return "blocked";
  if (isComplete(status)) return "complete";
  if (isActive(status) || isDraft(status)) return "active";
  return fallback;
}

export function formatProgressStatus(status: string) {
  return normalizeStatus(status).replaceAll("_", " ");
}

export function deriveCreationProgress(project: CreationProgressProject): CreationProgress {
  const lyricsStatus = normalizeStatus(project.lyricsStatus);
  const scenesStatus = normalizeStatus(project.scenesStatus);
  const renderStatus = normalizeStatus(project.renderStatus);
  const pipelineStage = normalizeStatus(project.pipelineStage);
  const projectStatus = normalizeStatus(project.status);

  let title = "Start creating";
  let detail = "Open the project to continue setup.";
  let copyKey = "start_creating";
  let tone: CreationProgressTone = "muted";
  let lyricsState = stageState(lyricsStatus, "active");
  let scenesState = stageState(scenesStatus, "waiting");
  let exportState = stageState(renderStatus, "waiting");

  if (isFailed(lyricsStatus) || isFailed(projectStatus) || pipelineStage.includes("asr_failed")) {
    title = "Needs attention";
    detail = "Lyrics failed. Open the project to retry.";
    copyKey = "lyrics_failed";
    tone = "danger";
    lyricsState = "blocked";
  } else if (isFailed(scenesStatus) || pipelineStage.includes("storyboard_failed") || pipelineStage.includes("image_generation_failed")) {
    title = "Needs attention";
    detail = "Scenes failed. Open the project to retry.";
    copyKey = "scenes_failed";
    tone = "danger";
    lyricsState = isComplete(lyricsStatus) ? "complete" : lyricsState;
    scenesState = "blocked";
  } else if (isFailed(renderStatus)) {
    title = "Needs attention";
    detail = "Export failed. Open the project to retry.";
    copyKey = "export_failed";
    tone = "danger";
    lyricsState = isComplete(lyricsStatus) ? "complete" : lyricsState;
    scenesState = isComplete(scenesStatus) ? "complete" : scenesState;
    exportState = "blocked";
  } else if (isComplete(renderStatus)) {
    title = "Video ready";
    detail = "Open to preview or download the export.";
    copyKey = "video_ready";
    tone = "success";
    lyricsState = "complete";
    scenesState = "complete";
    exportState = "complete";
  } else if (isActive(renderStatus) || pipelineStage === "rendering") {
    title = "Exporting video";
    detail = "Your MP4 is being rendered.";
    copyKey = "exporting_video";
    tone = "active";
    lyricsState = "complete";
    scenesState = "complete";
    exportState = "active";
  } else if (isComplete(scenesStatus)) {
    title = "Ready to export";
    detail = "Scenes are ready for preview and MP4 export.";
    copyKey = "ready_to_export";
    tone = "warning";
    lyricsState = "complete";
    scenesState = "complete";
    exportState = "active";
  } else if (isDraft(scenesStatus)) {
    title = "Review scene draft";
    detail = "Open the project to review scenes before export.";
    copyKey = "review_scene_draft";
    tone = "warning";
    lyricsState = "complete";
    scenesState = "active";
    exportState = "waiting";
  } else if (isActive(scenesStatus) || ["storyboard_generating", "images_queueing", "images_processing"].includes(pipelineStage)) {
    title = "Creating scenes";
    detail = "Storyboards and visuals are being prepared.";
    copyKey = "creating_scenes";
    tone = "active";
    lyricsState = isComplete(lyricsStatus) ? "complete" : lyricsState;
    scenesState = "active";
  } else if (isComplete(lyricsStatus)) {
    title = "Lyrics ready";
    detail = "Open the project to create or review scenes.";
    copyKey = "lyrics_ready";
    tone = "warning";
    lyricsState = "complete";
    scenesState = "active";
  } else if (isActive(lyricsStatus) || ["asr_processing", "audio_processing"].includes(pipelineStage)) {
    title = "Transcribing lyrics";
    detail = "Audio is being processed into timed lyrics.";
    copyKey = "transcribing_lyrics";
    tone = "active";
    lyricsState = "active";
  }

  return {
    copyKey,
    title,
    detail,
    tone,
    stages: [
      { id: "lyrics", status: lyricsStatus, state: lyricsState },
      { id: "scenes", status: scenesStatus, state: scenesState },
      { id: "export", status: renderStatus, state: exportState },
    ],
  };
}

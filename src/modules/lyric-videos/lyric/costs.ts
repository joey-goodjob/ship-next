export const LYRIC_VIDEO_IMAGE_SUCCESS_COST_CREDITS = 5;
export const LYRIC_VIDEO_SCENE_VIDEO_COST_CREDITS_PER_SECOND = 5;
export const LYRIC_VIDEO_SCENE_VIDEO_MIN_COST_DURATION_SECONDS = 4;
export const LYRIC_VIDEO_SCENE_VIDEO_MAX_COST_DURATION_SECONDS = 12;
export const LYRIC_VIDEO_SCENE_VIDEO_COST_CREDITS =
  LYRIC_VIDEO_SCENE_VIDEO_MIN_COST_DURATION_SECONDS * LYRIC_VIDEO_SCENE_VIDEO_COST_CREDITS_PER_SECOND;

export function resolvePreviewGenerationDurationMs(params: {
  audioDurationMs?: number | null;
  trimStartMs?: number | null;
  trimEndMs?: number | null;
}) {
  const trimStartMs = Number(params.trimStartMs || 0);
  const trimEndMs = Number(params.trimEndMs || 0);
  const audioDurationMs = Number(params.audioDurationMs || 0);
  const trimmedDurationMs = trimEndMs > trimStartMs ? trimEndMs - trimStartMs : 0;
  return Math.max(1, Math.ceil(trimmedDurationMs || audioDurationMs || 0));
}

export function calculatePreviewGenerationCostCredits(params: {
  audioDurationMs?: number | null;
  trimStartMs?: number | null;
  trimEndMs?: number | null;
}) {
  return Math.max(1, Math.ceil(resolvePreviewGenerationDurationMs(params) / 1000));
}

export function resolveSceneVideoCostDurationSeconds(scene: {
  startMs?: number | null;
  endMs?: number | null;
  durationMs?: number | null;
}) {
  const explicitDurationMs = Math.max(0, Number(scene.durationMs || 0));
  const timedDurationMs = Math.max(0, Number(scene.endMs || 0) - Number(scene.startMs || 0));
  const durationSeconds = Math.ceil((explicitDurationMs || timedDurationMs) / 1000);
  return Math.max(
    LYRIC_VIDEO_SCENE_VIDEO_MIN_COST_DURATION_SECONDS,
    Math.min(LYRIC_VIDEO_SCENE_VIDEO_MAX_COST_DURATION_SECONDS, durationSeconds || LYRIC_VIDEO_SCENE_VIDEO_MIN_COST_DURATION_SECONDS),
  );
}

export function calculateSceneVideoCostCredits(params: {
  sceneCount?: number | null;
  scenes?: Array<{ startMs?: number | null; endMs?: number | null; durationMs?: number | null }> | null;
}) {
  if (params.scenes) {
    return params.scenes.reduce(
      (total, scene) => total + resolveSceneVideoCostDurationSeconds(scene) * LYRIC_VIDEO_SCENE_VIDEO_COST_CREDITS_PER_SECOND,
      0,
    );
  }

  const sceneCount = Math.max(0, Math.floor(Number(params.sceneCount || 0)));
  return sceneCount * LYRIC_VIDEO_SCENE_VIDEO_COST_CREDITS;
}

export const LYRIC_VIDEO_IMAGE_SUCCESS_COST_CREDITS = 5;
export const LYRIC_VIDEO_SCENE_VIDEO_COST_CREDITS = 40;

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

export function calculateSceneVideoCostCredits(params: { sceneCount?: number | null }) {
  const sceneCount = Math.max(0, Math.floor(Number(params.sceneCount || 0)));
  return sceneCount * LYRIC_VIDEO_SCENE_VIDEO_COST_CREDITS;
}

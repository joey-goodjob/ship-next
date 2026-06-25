import type { LyricSceneImageCandidate } from "./types";

export const SCENE_IMAGE_CANDIDATE_WINDOW_SIZE = 4;

function candidateCreatedAtMs(candidate: LyricSceneImageCandidate) {
  const value = candidate.createdAt instanceof Date ? candidate.createdAt.getTime() : Date.parse(String(candidate.createdAt || ""));
  return Number.isFinite(value) ? value : 0;
}

export function sortSceneImageCandidates(candidates: LyricSceneImageCandidate[] = []) {
  return [...candidates].sort((a, b) => candidateCreatedAtMs(b) - candidateCreatedAtMs(a));
}

export function getVisibleSceneImageCandidates(candidates: LyricSceneImageCandidate[] = [], offset = 0) {
  const sorted = sortSceneImageCandidates(candidates);
  const maxOffset = Math.max(0, sorted.length - SCENE_IMAGE_CANDIDATE_WINDOW_SIZE);
  const safeOffset = Math.max(0, Math.min(maxOffset, Math.floor(Number(offset) || 0)));
  return sorted.slice(safeOffset, safeOffset + SCENE_IMAGE_CANDIDATE_WINDOW_SIZE);
}

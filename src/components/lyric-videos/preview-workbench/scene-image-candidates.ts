import type { LyricScene, LyricSceneImageCandidate } from "./types";

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

export function getSceneImageCandidateDisplayList(scene: Pick<LyricScene, "id" | "imageUrl" | "imageCandidates" | "prompt" | "status">) {
  const candidates = scene.imageCandidates || [];
  const currentImageUrl = String(scene.imageUrl || "").trim();
  if (!currentImageUrl || candidates.some((candidate) => candidate.imageUrl === currentImageUrl)) {
    return candidates;
  }

  return [
    {
      id: `current-${scene.id}`,
      sceneId: scene.id,
      imageUrl: currentImageUrl,
      status: scene.status || "success",
      createdAt: "9999-12-31T23:59:59.999Z",
      promptSnapshot: scene.prompt || null,
    },
    ...candidates,
  ];
}

export function getSceneImageCandidateViewerIndex(candidates: LyricSceneImageCandidate[] = [], imageUrl?: string | null) {
  const selectedUrl = String(imageUrl || "").trim();
  const index = selectedUrl ? candidates.findIndex((candidate) => candidate.imageUrl === selectedUrl) : -1;
  return index >= 0 ? index : 0;
}

export function moveSceneImageCandidateViewerIndex(candidates: LyricSceneImageCandidate[] = [], currentIndex = 0, direction: -1 | 1) {
  if (candidates.length <= 0) return 0;
  return (currentIndex + direction + candidates.length) % candidates.length;
}

export function applySelectedSceneImageCandidate(scene: LyricScene, candidate: LyricSceneImageCandidate) {
  return {
    ...scene,
    imageUrl: candidate.imageUrl,
    status: scene.status === "processing" ? scene.status : "success",
  };
}

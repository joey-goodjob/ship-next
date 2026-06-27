import type { LyricScene, LyricSceneVideoCandidate } from "./types";

export const SCENE_VIDEO_CANDIDATE_WINDOW_SIZE = 4;

export type SceneVideoCandidateStripItem =
  | {
      kind: "pending";
      id: "pending-scene-video";
    }
  | {
      kind: "candidate";
      id: string;
      candidate: LyricSceneVideoCandidate;
    };

function candidateCreatedAtMs(candidate: LyricSceneVideoCandidate) {
  const value = candidate.createdAt instanceof Date ? candidate.createdAt.getTime() : Date.parse(String(candidate.createdAt || ""));
  return Number.isFinite(value) ? value : 0;
}

export function sortSceneVideoCandidates(candidates: LyricSceneVideoCandidate[] = []) {
  return [...candidates].sort((a, b) => candidateCreatedAtMs(b) - candidateCreatedAtMs(a));
}

export function getSceneVideoCandidateStripItems({
  candidates = [],
  offset = 0,
  pending = false,
}: {
  candidates?: LyricSceneVideoCandidate[];
  offset?: number;
  pending?: boolean;
}) {
  const sortedItems: SceneVideoCandidateStripItem[] = sortSceneVideoCandidates(candidates).map((candidate) => ({
    kind: "candidate",
    id: candidate.id,
    candidate,
  }));
  const items: SceneVideoCandidateStripItem[] = pending
    ? [
        {
          kind: "pending",
          id: "pending-scene-video",
        },
        ...sortedItems,
      ]
    : sortedItems;
  const maxOffset = Math.max(0, items.length - SCENE_VIDEO_CANDIDATE_WINDOW_SIZE);
  const safeOffset = Math.max(0, Math.min(maxOffset, Math.floor(Number(offset) || 0)));

  return {
    visible: items.slice(safeOffset, safeOffset + SCENE_VIDEO_CANDIDATE_WINDOW_SIZE),
    total: items.length,
    offset: safeOffset,
    canMoveNewer: safeOffset > 0,
    canMoveOlder: safeOffset + SCENE_VIDEO_CANDIDATE_WINDOW_SIZE < items.length,
  };
}

export function getSceneVideoCandidateDisplayList(
  scene: Pick<LyricScene, "id" | "motionPrompt" | "videoCandidates" | "videoStatus" | "videoUrl">,
) {
  const candidates = scene.videoCandidates || [];
  const currentVideoUrl = String(scene.videoUrl || "").trim();
  if (!currentVideoUrl || candidates.some((candidate) => candidate.videoUrl === currentVideoUrl)) {
    return candidates;
  }

  return [
    {
      id: `current-${scene.id}`,
      sceneId: scene.id,
      videoUrl: currentVideoUrl,
      status: scene.videoStatus || "success",
      createdAt: "9999-12-31T23:59:59.999Z",
      promptSnapshot: scene.motionPrompt || null,
    },
    ...candidates,
  ];
}

export function getSceneVideoPosterUrl({
  candidate,
  fallbackPosterUrl,
}: {
  candidate?: Pick<LyricSceneVideoCandidate, "sourceImageUrl"> | null;
  fallbackPosterUrl?: string | null;
}) {
  return String(candidate?.sourceImageUrl || fallbackPosterUrl || "").trim();
}

export function getSelectedSceneVideoPosterUrl({
  scene,
}: {
  scene: Pick<LyricScene, "imageUrl" | "videoCandidates" | "videoUrl">;
}) {
  const selectedVideoUrl = String(scene.videoUrl || "").trim();
  const selectedCandidate = selectedVideoUrl
    ? scene.videoCandidates?.find((candidate) => candidate.videoUrl === selectedVideoUrl)
    : undefined;
  return getSceneVideoPosterUrl({
    candidate: selectedCandidate,
    fallbackPosterUrl: scene.imageUrl,
  });
}

export function applySelectedSceneVideoCandidate(scene: LyricScene, candidate: LyricSceneVideoCandidate) {
  return {
    ...scene,
    videoUrl: candidate.videoUrl,
    videoStatus: scene.videoStatus === "processing" ? scene.videoStatus : "success",
    videoCompletedAt: scene.videoCompletedAt || candidate.createdAt,
  };
}

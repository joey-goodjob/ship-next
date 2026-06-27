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

export type SceneVideoRetryPendingPhase = "saving" | "processing";

export type SceneVideoRetryPendingMarker = {
  phase: SceneVideoRetryPendingPhase;
  videoProviderTaskId?: string | null;
  videoTaskId?: string | null;
};

export type SceneVideoRetryPendingMap = Map<string, SceneVideoRetryPendingMarker>;

function candidateCreatedAtMs(candidate: LyricSceneVideoCandidate) {
  const value = candidate.createdAt instanceof Date ? candidate.createdAt.getTime() : Date.parse(String(candidate.createdAt || ""));
  return Number.isFinite(value) ? value : 0;
}

function normalizedId(value?: string | null) {
  return String(value || "").trim();
}

function sceneMatchesPendingVideoTask(
  scene: Pick<LyricScene, "videoProviderTaskId" | "videoTaskId">,
  marker: SceneVideoRetryPendingMarker,
) {
  const markerProviderTaskId = normalizedId(marker.videoProviderTaskId);
  const markerVideoTaskId = normalizedId(marker.videoTaskId);
  return Boolean(
    (markerProviderTaskId && normalizedId(scene.videoProviderTaskId) === markerProviderTaskId) ||
      (markerVideoTaskId && normalizedId(scene.videoTaskId) === markerVideoTaskId),
  );
}

function sceneHasCandidateForPendingVideoTask(
  scene: Pick<LyricScene, "videoCandidates">,
  marker: SceneVideoRetryPendingMarker,
) {
  const markerProviderTaskId = normalizedId(marker.videoProviderTaskId);
  const markerVideoTaskId = normalizedId(marker.videoTaskId);
  return Boolean(
    scene.videoCandidates?.some(
      (candidate) =>
        (markerProviderTaskId && normalizedId(candidate.providerTaskId) === markerProviderTaskId) ||
        (markerVideoTaskId && normalizedId(candidate.videoTaskId) === markerVideoTaskId),
    ),
  );
}

export function sortSceneVideoCandidates(candidates: LyricSceneVideoCandidate[] = []) {
  return [...candidates].sort((a, b) => candidateCreatedAtMs(b) - candidateCreatedAtMs(a));
}

function candidateDedupeKey(candidate: LyricSceneVideoCandidate) {
  const sceneId = String(candidate.sceneId || "").trim();
  const providerTaskId = String(candidate.providerTaskId || "").trim();
  if (sceneId && providerTaskId) return `${sceneId}:provider:${providerTaskId}`;

  const videoTaskId = String(candidate.videoTaskId || "").trim();
  if (sceneId && videoTaskId) return `${sceneId}:task:${videoTaskId}`;

  const videoUrl = String(candidate.videoUrl || "").trim();
  return sceneId && videoUrl ? `${sceneId}:url:${videoUrl}` : "";
}

export function dedupeSceneVideoCandidates(candidates: LyricSceneVideoCandidate[] = []) {
  const byKey = new Map<string, LyricSceneVideoCandidate>();
  const unkeyed: LyricSceneVideoCandidate[] = [];

  for (const candidate of candidates) {
    const key = candidateDedupeKey(candidate);
    if (!key) {
      unkeyed.push(candidate);
      continue;
    }

    const existing = byKey.get(key);
    if (!existing || candidateCreatedAtMs(candidate) > candidateCreatedAtMs(existing)) {
      byKey.set(key, candidate);
    }
  }

  return sortSceneVideoCandidates([...byKey.values(), ...unkeyed]);
}

function sourceImageUrlFromGenerationParams(params?: LyricScene["videoGenerationParams"]) {
  const raw = normalizeSceneVideoGenerationParams(params);
  if (!raw || typeof raw !== "object") return "";
  return String((raw as Record<string, unknown>).sourceImageUrl || "").trim();
}

function normalizeSceneVideoGenerationParams(params?: LyricScene["videoGenerationParams"]) {
  return typeof params === "string" ? safeParseJson(params) : params;
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
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
  scene: Pick<LyricScene, "id" | "motionPrompt" | "videoCandidates" | "videoGenerationParams" | "videoStatus" | "videoUrl">,
) {
  const candidates = dedupeSceneVideoCandidates(scene.videoCandidates || []);
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
      sourceImageUrl: sourceImageUrlFromGenerationParams(scene.videoGenerationParams) || null,
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
  scene: Pick<LyricScene, "imageUrl" | "videoCandidates" | "videoGenerationParams" | "videoUrl">;
}) {
  const selectedVideoUrl = String(scene.videoUrl || "").trim();
  const selectedCandidate = selectedVideoUrl
    ? scene.videoCandidates?.find((candidate) => candidate.videoUrl === selectedVideoUrl)
    : undefined;
  return getSceneVideoPosterUrl({
    candidate: selectedCandidate,
    fallbackPosterUrl: sourceImageUrlFromGenerationParams(scene.videoGenerationParams) || scene.imageUrl,
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

export function applyQueuedSceneVideo(scene: LyricScene) {
  const existingParams = normalizeSceneVideoGenerationParams(scene.videoGenerationParams);
  const params = existingParams && typeof existingParams === "object" ? existingParams : {};
  return {
    ...scene,
    videoStatus: "processing",
    videoError: null,
    videoGenerationParams: {
      ...params,
      sourceImageUrl: scene.imageUrl || sourceImageUrlFromGenerationParams(scene.videoGenerationParams) || "",
    },
  };
}

export function nextSceneVideoRetryPendingAfterQueueResponse({
  previous,
  queued,
  sceneId,
}: {
  previous: SceneVideoRetryPendingMap;
  queued?: LyricScene | null;
  sceneId: string;
}) {
  const next = new Map(previous);
  if (queued?.videoStatus === "processing" && (queued.videoProviderTaskId || queued.videoTaskId)) {
    next.set(sceneId, {
      phase: "processing",
      videoProviderTaskId: queued.videoProviderTaskId || null,
      videoTaskId: queued.videoTaskId || null,
    });
  } else {
    next.delete(sceneId);
  }
  return next;
}

export function pruneFinishedSceneVideoRetryPending({
  previous,
  scenes,
}: {
  previous: SceneVideoRetryPendingMap;
  scenes: LyricScene[];
}) {
  if (previous.size === 0) return previous;
  const scenesById = new Map(scenes.map((scene) => [scene.id, scene]));
  const next = new Map(previous);
  for (const [sceneId, marker] of previous) {
    if (marker.phase !== "processing") continue;
    const scene = scenesById.get(sceneId);
    if (!scene) {
      next.delete(sceneId);
      continue;
    }
    const finishedMatchingTask =
      scene.videoStatus !== "processing" &&
      (sceneMatchesPendingVideoTask(scene, marker) || sceneHasCandidateForPendingVideoTask(scene, marker));
    if (finishedMatchingTask) next.delete(sceneId);
  }
  return next.size === previous.size ? previous : next;
}

export function mergeVideoSyncedScenes({
  fields,
  previous,
  synced,
}: {
  fields: string[];
  previous: LyricScene[];
  synced: LyricScene[];
}) {
  if (synced.length === 0) return previous;
  const syncedById = new Map(synced.map((scene) => [scene.id, scene]));
  return previous.map((scene) => {
    const next = syncedById.get(scene.id);
    if (!next) return scene;
    return {
      ...scene,
      ...Object.fromEntries(
        fields
          .map((field) => [field, (next as any)[field]])
          .filter(([, value]) => value !== undefined),
      ),
    };
  });
}

export function mergeScenesWithPendingSceneVideoRetries({
  incoming,
  pending,
  previous,
}: {
  incoming: LyricScene[];
  pending: SceneVideoRetryPendingMap;
  previous: LyricScene[];
}) {
  if (previous.length === 0 || incoming.length === 0) return incoming;
  const previousById = new Map(previous.map((scene) => [scene.id, scene]));
  return incoming.map((incomingScene) => {
    const previousScene = previousById.get(incomingScene.id);
    if (!previousScene) return incomingScene;
    if (
      incomingScene.videoStatus === "processing" &&
      previousScene.videoStatus !== "processing" &&
      sceneHasCandidateForPendingVideoTask(previousScene, {
        phase: "processing",
        videoProviderTaskId: incomingScene.videoProviderTaskId,
        videoTaskId: incomingScene.videoTaskId,
      })
    ) {
      return previousScene;
    }

    const marker = pending.get(incomingScene.id);
    if (!marker || previousScene.videoStatus !== "processing") return incomingScene;
    if (incomingScene.videoStatus === "processing") return incomingScene;
    if (sceneMatchesPendingVideoTask(incomingScene, marker) || sceneHasCandidateForPendingVideoTask(incomingScene, marker)) {
      return incomingScene;
    }
    return {
      ...incomingScene,
      videoTaskId: previousScene.videoTaskId,
      videoProviderTaskId: previousScene.videoProviderTaskId,
      videoStatus: previousScene.videoStatus,
      videoModel: previousScene.videoModel,
      videoPromptSnapshot: previousScene.videoPromptSnapshot,
      videoGenerationParams: previousScene.videoGenerationParams,
      videoCompletedAt: previousScene.videoCompletedAt,
      videoError: previousScene.videoError,
      videoCandidates: dedupeSceneVideoCandidates([
        ...(incomingScene.videoCandidates || []),
        ...(previousScene.videoCandidates || []),
      ]),
    };
  });
}

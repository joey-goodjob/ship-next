type SceneVideoCandidateLike = {
  sceneId?: string | null;
  providerTaskId?: string | null;
  videoTaskId?: string | null;
  videoUrl?: string | null;
  generationParams?: unknown;
  createdAt?: string | Date | null;
};

function candidateCreatedAtMs(candidate: SceneVideoCandidateLike) {
  const value = candidate.createdAt instanceof Date ? candidate.createdAt.getTime() : Date.parse(String(candidate.createdAt || ""));
  return Number.isFinite(value) ? value : 0;
}

function candidateDedupeKey(candidate: SceneVideoCandidateLike) {
  const sceneId = String(candidate.sceneId || "").trim();
  const providerTaskId = String(candidate.providerTaskId || "").trim();
  if (sceneId && providerTaskId) return `${sceneId}:provider:${providerTaskId}`;

  const videoTaskId = String(candidate.videoTaskId || "").trim();
  if (sceneId && videoTaskId) return `${sceneId}:task:${videoTaskId}`;

  const videoUrl = String(candidate.videoUrl || "").trim();
  return sceneId && videoUrl ? `${sceneId}:url:${videoUrl}` : "";
}

export function dedupeSceneVideoCandidates<T extends SceneVideoCandidateLike>(candidates: T[] = []) {
  const byKey = new Map<string, T>();
  const unkeyed: T[] = [];

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

  return [...byKey.values(), ...unkeyed].sort((a, b) => candidateCreatedAtMs(b) - candidateCreatedAtMs(a));
}

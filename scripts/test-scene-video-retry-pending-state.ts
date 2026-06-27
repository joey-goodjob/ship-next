import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mergeScenesWithPendingSceneVideoRetries,
  nextSceneVideoRetryPendingAfterQueueResponse,
  pruneFinishedSceneVideoRetryPending,
} from "../src/components/lyric-videos/preview-workbench/scene-video-candidates";

const oldSuccessScene = {
  id: "scene-1",
  sort: 1,
  imageUrl: "https://cdn.example.com/source.jpg",
  videoUrl: "https://cdn.example.com/old.mp4",
  videoStatus: "success",
  videoProviderTaskId: "old-provider",
  videoTaskId: "old-task",
  videoCandidates: [
    {
      id: "old-candidate",
      sceneId: "scene-1",
      videoUrl: "https://cdn.example.com/old.mp4",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

const optimisticProcessingScene = {
  ...oldSuccessScene,
  videoStatus: "processing",
  videoProviderTaskId: "new-provider",
  videoTaskId: "new-task",
  videoError: null,
};

const pending = new Map([
  [
    "scene-1",
    {
      phase: "processing" as const,
      videoProviderTaskId: "new-provider",
      videoTaskId: "new-task",
    },
  ],
]);

const mergedAgainstStaleRefresh = mergeScenesWithPendingSceneVideoRetries({
  previous: [optimisticProcessingScene as any],
  incoming: [oldSuccessScene as any],
  pending,
});

assert.equal(
  mergedAgainstStaleRefresh[0].videoStatus,
  "processing",
  "stale refresh returning the old successful scene must not clear optimistic Retry Video pending state",
);
assert.equal(mergedAgainstStaleRefresh[0].videoProviderTaskId, "new-provider");
assert.equal(mergedAgainstStaleRefresh[0].videoCandidates?.[0]?.id, "old-candidate");

const afterQueue = nextSceneVideoRetryPendingAfterQueueResponse({
  previous: new Map([["scene-1", { phase: "saving" as const }]]),
  sceneId: "scene-1",
  queued: optimisticProcessingScene as any,
});
assert.equal(afterQueue.get("scene-1")?.phase, "processing");
assert.equal(afterQueue.get("scene-1")?.videoProviderTaskId, "new-provider");

const finalSuccessScene = {
  ...optimisticProcessingScene,
  videoUrl: "https://cdn.example.com/new.mp4",
  videoStatus: "success",
  videoCandidates: [
    {
      id: "new-candidate",
      sceneId: "scene-1",
      videoUrl: "https://cdn.example.com/new.mp4",
      providerTaskId: "new-provider",
      videoTaskId: "new-task",
      status: "success",
      createdAt: "2026-01-02T00:00:00.000Z",
    },
  ],
};

const pruned = pruneFinishedSceneVideoRetryPending({
  previous: pending,
  scenes: [finalSuccessScene as any],
});
assert.equal(pruned.has("scene-1"), false, "confirmed success for the queued task must clear pending immediately");

const mergedAgainstStaleProcessingAfterSuccess = mergeScenesWithPendingSceneVideoRetries({
  previous: [finalSuccessScene as any],
  incoming: [optimisticProcessingScene as any],
  pending: new Map(),
});
assert.equal(
  mergedAgainstStaleProcessingAfterSuccess[0].videoStatus,
  "success",
  "stale processing refresh must not regress a scene after the matching video candidate is ready",
);
assert.equal(mergedAgainstStaleProcessingAfterSuccess[0].videoUrl, "https://cdn.example.com/new.mp4");

const twoScenePending = new Map([
  [
    "scene-1",
    {
      phase: "processing" as const,
      videoProviderTaskId: "new-provider-1",
      videoTaskId: "new-task-1",
    },
  ],
  [
    "scene-2",
    {
      phase: "processing" as const,
      videoProviderTaskId: "new-provider-2",
      videoTaskId: "new-task-2",
    },
  ],
]);
const twoScenePruned = pruneFinishedSceneVideoRetryPending({
  previous: twoScenePending,
  scenes: [
    {
      ...finalSuccessScene,
      id: "scene-1",
      videoProviderTaskId: "new-provider-1",
      videoTaskId: "new-task-1",
      videoCandidates: [
        {
          ...finalSuccessScene.videoCandidates[0],
          sceneId: "scene-1",
          providerTaskId: "new-provider-1",
          videoTaskId: "new-task-1",
        },
      ],
    } as any,
    {
      id: "scene-2",
      videoStatus: "processing",
      videoProviderTaskId: "new-provider-2",
      videoTaskId: "new-task-2",
      videoCandidates: [],
    } as any,
  ],
});
assert.equal(twoScenePruned.has("scene-1"), false);
assert.equal(twoScenePruned.has("scene-2"), true, "two simultaneous retries must stay isolated by sceneId");

const scenesPanelSource = readFileSync(
  join(process.cwd(), "src/components/lyric-videos/preview-workbench/scenes-panel.tsx"),
  "utf8",
);

assert.match(scenesPanelSource, /pendingVideoRetryBySceneId/);
assert.match(scenesPanelSource, /scene\.videoStatus === "processing" \|\| videoRetryPending/);

const sceneVideoGenerationSource = readFileSync(
  join(process.cwd(), "src/modules/lyric-videos/lyric/scene-video-generation.ts"),
  "utf8",
);

assert.match(
  sceneVideoGenerationSource,
  /return hydrateSceneVideoCandidates\(\{[\s\S]*userId: params\.userId,[\s\S]*projectId: params\.projectId,[\s\S]*scenes: queued,/,
  "queueSceneVideos should return hydrated scenes with videoCandidates",
);

console.log("scene video retry pending state tests passed");

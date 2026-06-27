import assert from "node:assert/strict";
import {
  applyQueuedSceneVideo,
  applySelectedSceneVideoCandidate,
  getSceneVideoCandidateDisplayList,
  getSceneVideoPosterUrl,
  getSceneVideoCandidateStripItems,
  getSelectedSceneVideoPosterUrl,
  mergeVideoSyncedScenes,
} from "../src/components/lyric-videos/preview-workbench/scene-video-candidates";
import type { LyricSceneVideoCandidate } from "../src/components/lyric-videos/preview-workbench/types";

const scene = {
  id: "scene-1",
  startMs: 0,
  endMs: 4000,
  prompt: "image prompt",
  motionPrompt: "video prompt",
  imageUrl: "https://cdn.example.com/source.jpg",
  videoUrl: "https://cdn.example.com/current.mp4",
  videoStatus: "success",
  status: "success",
  videoCandidates: [
    {
      id: "candidate-old",
      sceneId: "scene-1",
      videoUrl: "https://cdn.example.com/old.mp4",
      status: "success",
      createdAt: "2026-01-01T00:00:00.000Z",
      sourceImageUrl: "https://cdn.example.com/old-source.jpg",
    },
    {
      id: "candidate-new",
      sceneId: "scene-1",
      videoUrl: "https://cdn.example.com/new.mp4",
      status: "success",
      createdAt: "2026-01-02T00:00:00.000Z",
      sourceImageUrl: "https://cdn.example.com/new-source.jpg",
    },
  ],
};

const display = getSceneVideoCandidateDisplayList(scene);
assert.equal(display.length, 3);
assert.equal(display[0].videoUrl, "https://cdn.example.com/current.mp4");

const duplicatedProviderTaskDisplay = getSceneVideoCandidateDisplayList({
  ...scene,
  videoUrl: "https://cdn.example.com/retry-archive-2.mp4",
  videoCandidates: [
    {
      id: "candidate-retry-2",
      sceneId: "scene-1",
      videoUrl: "https://cdn.example.com/retry-archive-2.mp4",
      status: "success",
      createdAt: "2026-01-04T00:00:01.000Z",
      providerTaskId: "provider-task-1",
      videoTaskId: "video-task-1",
      sourceImageUrl: "https://cdn.example.com/retry-source.jpg",
    },
    {
      id: "candidate-retry-1",
      sceneId: "scene-1",
      videoUrl: "https://cdn.example.com/retry-archive-1.mp4",
      status: "success",
      createdAt: "2026-01-04T00:00:00.000Z",
      providerTaskId: "provider-task-1",
      videoTaskId: "video-task-1",
      sourceImageUrl: "https://cdn.example.com/retry-source.jpg",
    },
  ],
});
assert.equal(duplicatedProviderTaskDisplay.length, 1);
assert.equal(duplicatedProviderTaskDisplay[0].id, "candidate-retry-2");

const strip = getSceneVideoCandidateStripItems({ candidates: display, pending: true });
assert.equal(strip.visible[0].kind, "pending");
assert.equal(strip.visible.length, 4);

const queued = applyQueuedSceneVideo({
  ...scene,
  imageUrl: "https://cdn.example.com/retry-source.jpg",
  videoError: "previous error",
  videoGenerationParams: {
    sourceImageUrl: "https://cdn.example.com/old-source.jpg",
    duration: 4,
  },
});
assert.equal(queued.videoStatus, "processing");
assert.equal(queued.videoError, null);
assert.equal(
  (queued.videoGenerationParams as Record<string, unknown>).sourceImageUrl,
  "https://cdn.example.com/retry-source.jpg",
);
assert.equal((queued.videoGenerationParams as Record<string, unknown>).duration, 4);

const selected = applySelectedSceneVideoCandidate(scene, scene.videoCandidates[0]);
assert.equal(selected.videoUrl, "https://cdn.example.com/old.mp4");
assert.equal(selected.videoStatus, "success");

const legacyCandidate: LyricSceneVideoCandidate = {
  id: "legacy",
  sceneId: "scene-1",
  videoUrl: "https://cdn.example.com/legacy.mp4",
  status: "success",
  createdAt: "2026-01-03T00:00:00.000Z",
};

assert.equal(
  getSceneVideoPosterUrl({
    candidate: scene.videoCandidates[0],
    fallbackPosterUrl: "https://cdn.example.com/current-scene-image.jpg",
  }),
  "https://cdn.example.com/old-source.jpg",
);

assert.equal(
  getSceneVideoPosterUrl({
    candidate: legacyCandidate,
    fallbackPosterUrl: "https://cdn.example.com/current-scene-image.jpg",
  }),
  "https://cdn.example.com/current-scene-image.jpg",
);

assert.equal(
  getSelectedSceneVideoPosterUrl({
    scene: {
      ...scene,
      imageUrl: "https://cdn.example.com/newly-selected-still.jpg",
      videoUrl: "https://cdn.example.com/old.mp4",
    },
  }),
  "https://cdn.example.com/old-source.jpg",
);

assert.equal(
  getSelectedSceneVideoPosterUrl({
    scene: {
      ...scene,
      imageUrl: "https://cdn.example.com/newly-selected-still.jpg",
      videoUrl: "https://cdn.example.com/current.mp4",
      videoCandidates: [],
      videoGenerationParams: {
        sourceImageUrl: "https://cdn.example.com/original-video-source.jpg",
      },
    },
  }),
  "https://cdn.example.com/original-video-source.jpg",
);

const syntheticCurrent = getSceneVideoCandidateDisplayList({
  ...scene,
  videoCandidates: [],
  videoGenerationParams: {
    sourceImageUrl: "https://cdn.example.com/current-source.jpg",
  },
});
assert.equal(syntheticCurrent[0].sourceImageUrl, "https://cdn.example.com/current-source.jpg");

const mergedConcurrentSceneVideos = mergeVideoSyncedScenes({
  fields: ["videoUrl", "videoStatus", "videoCandidates"],
  previous: [
    {
      ...scene,
      id: "scene-10",
      videoUrl: "https://cdn.example.com/scene-10-old.mp4",
      videoCandidates: [],
    },
    {
      ...scene,
      id: "scene-12",
      videoUrl: "https://cdn.example.com/scene-12-old.mp4",
      videoCandidates: [],
    },
  ],
  synced: [
    {
      ...scene,
      id: "scene-10",
      videoUrl: "https://cdn.example.com/scene-10-new.mp4",
      videoStatus: "success",
      videoCandidates: [
        {
          id: "scene-10-candidate",
          sceneId: "scene-10",
          videoUrl: "https://cdn.example.com/scene-10-new.mp4",
          status: "success",
          createdAt: "2026-01-05T00:00:00.000Z",
        },
      ],
    },
    {
      ...scene,
      id: "scene-12",
      videoUrl: "https://cdn.example.com/scene-12-new.mp4",
      videoStatus: "success",
      videoCandidates: [
        {
          id: "scene-12-candidate",
          sceneId: "scene-12",
          videoUrl: "https://cdn.example.com/scene-12-new.mp4",
          status: "success",
          createdAt: "2026-01-05T00:00:00.000Z",
        },
      ],
    },
  ],
});
assert.equal(mergedConcurrentSceneVideos[0].videoUrl, "https://cdn.example.com/scene-10-new.mp4");
assert.equal(mergedConcurrentSceneVideos[1].videoUrl, "https://cdn.example.com/scene-12-new.mp4");
assert.equal(mergedConcurrentSceneVideos[0].videoCandidates?.[0]?.sceneId, "scene-10");
assert.equal(mergedConcurrentSceneVideos[1].videoCandidates?.[0]?.sceneId, "scene-12");

console.log("scene video candidate strip tests passed");

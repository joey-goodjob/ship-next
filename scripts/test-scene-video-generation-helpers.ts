import assert from "node:assert/strict";
import {
  getSceneVideoCandidateSnapshotForRetry,
  getSceneVideoSourceImageUrl,
  providerVideoUrl,
} from "../src/modules/lyric-videos/lyric/scene-video-generation";

assert.equal(
  providerVideoUrl({
    taskInfo: {
      videos: [{ videoUrl: "" }, { videoUrl: "https://cdn.example.com/from-task-info.mp4" }],
    },
  }),
  "https://cdn.example.com/from-task-info.mp4",
);

assert.equal(
  providerVideoUrl({
    taskResult: {
      videoUrl: "https://cdn.example.com/from-task-result.mp4",
    },
  }),
  "https://cdn.example.com/from-task-result.mp4",
);

assert.equal(
  providerVideoUrl({
    data: {
      videos: [{ url: "https://cdn.example.com/from-data-url.mp4" }],
    },
  }),
  "https://cdn.example.com/from-data-url.mp4",
);

assert.equal(providerVideoUrl({ taskInfo: { videos: [] } }), "");

assert.equal(
  getSceneVideoSourceImageUrl({
    imageUrl: "https://cdn.example.com/current-still.jpg",
    videoGenerationParams: {
      sourceImageUrl: "https://cdn.example.com/original-source.jpg",
    },
  }),
  "https://cdn.example.com/original-source.jpg",
);

assert.equal(
  getSceneVideoSourceImageUrl({
    imageUrl: "https://cdn.example.com/current-still.jpg",
    videoGenerationParams: "{\"sourceImageUrl\":\"https://cdn.example.com/string-source.jpg\"}",
  }),
  "https://cdn.example.com/string-source.jpg",
);

assert.equal(
  getSceneVideoSourceImageUrl({
    imageUrl: "https://cdn.example.com/fallback-still.jpg",
    videoGenerationParams: null,
  }),
  "https://cdn.example.com/fallback-still.jpg",
);

assert.deepEqual(
  getSceneVideoCandidateSnapshotForRetry({
    id: "scene-1",
    videoUrl: "https://cdn.example.com/current.mp4",
    videoProviderTaskId: "provider-1",
    videoTaskId: "task-1",
    videoGenerationParams: {
      sourceImageUrl: "https://cdn.example.com/source.jpg",
    },
  }),
  {
    sceneId: "scene-1",
    videoUrl: "https://cdn.example.com/current.mp4",
    providerTaskId: "provider-1",
    videoTaskId: "task-1",
    sourceImageUrl: "https://cdn.example.com/source.jpg",
  },
);

assert.equal(
  getSceneVideoCandidateSnapshotForRetry({
    id: "scene-1",
    videoUrl: "",
  }),
  null,
);

console.log("scene video generation helper tests passed");

import assert from "node:assert/strict";
import {
  applySelectedSceneVideoCandidate,
  getSceneVideoCandidateDisplayList,
  getSceneVideoPosterUrl,
  getSceneVideoCandidateStripItems,
  getSelectedSceneVideoPosterUrl,
} from "../src/components/lyric-videos/preview-workbench/scene-video-candidates";

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

const strip = getSceneVideoCandidateStripItems({ candidates: display, pending: true });
assert.equal(strip.visible[0].kind, "pending");
assert.equal(strip.visible.length, 4);

const selected = applySelectedSceneVideoCandidate(scene, scene.videoCandidates[0]);
assert.equal(selected.videoUrl, "https://cdn.example.com/old.mp4");
assert.equal(selected.videoStatus, "success");

assert.equal(
  getSceneVideoPosterUrl({
    candidate: scene.videoCandidates[0],
    fallbackPosterUrl: "https://cdn.example.com/current-scene-image.jpg",
  }),
  "https://cdn.example.com/old-source.jpg",
);

assert.equal(
  getSceneVideoPosterUrl({
    candidate: {
      id: "legacy",
      sceneId: "scene-1",
      videoUrl: "https://cdn.example.com/legacy.mp4",
      status: "success",
      createdAt: "2026-01-03T00:00:00.000Z",
    },
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

console.log("scene video candidate strip tests passed");

import assert from "node:assert/strict";

import { getSceneVideoPreloadUrls } from "../src/components/lyric-videos/preview-workbench/utils";

const scenes = [
  {
    id: "scene-1",
    startMs: 0,
    endMs: 4000,
    prompt: "",
    status: "success",
    imageUrl: "https://cdn.example.com/scene-1.jpg",
    videoUrl: "https://cdn.example.com/scene-1.mp4",
  },
  {
    id: "scene-2",
    startMs: 4000,
    endMs: 8000,
    prompt: "",
    status: "success",
    imageUrl: "https://cdn.example.com/scene-2.jpg",
    videoUrl: "https://cdn.example.com/scene-2.mp4",
  },
  {
    id: "scene-3",
    startMs: 8000,
    endMs: 12000,
    prompt: "",
    status: "success",
    imageUrl: "https://cdn.example.com/scene-3.jpg",
    videoUrl: "https://cdn.example.com/scene-3.mp4",
  },
  {
    id: "scene-4",
    startMs: 12000,
    endMs: 16000,
    prompt: "",
    status: "success",
    imageUrl: "https://cdn.example.com/scene-4.jpg",
  },
  {
    id: "scene-5",
    startMs: 16000,
    endMs: 20000,
    prompt: "",
    status: "success",
    imageUrl: "https://cdn.example.com/scene-5.jpg",
    videoUrl: "https://cdn.example.com/scene-5.mp4",
  },
];

assert.deepEqual(getSceneVideoPreloadUrls({ scenes, currentSceneId: "scene-1" }), [
  "https://cdn.example.com/scene-2.mp4",
  "https://cdn.example.com/scene-3.mp4",
]);

assert.deepEqual(getSceneVideoPreloadUrls({ scenes, currentSceneId: "scene-3" }), [
  "https://cdn.example.com/scene-5.mp4",
  "https://cdn.example.com/scene-2.mp4",
]);

assert.deepEqual(getSceneVideoPreloadUrls({ scenes, currentSceneId: "scene-2", limit: 1 }), [
  "https://cdn.example.com/scene-3.mp4",
]);

console.log("preview scene video preload helpers ok");

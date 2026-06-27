import assert from "node:assert/strict";
import { dedupeSceneVideoCandidates } from "../src/modules/lyric-videos/lyric/scene-video-candidates";

const candidates = dedupeSceneVideoCandidates([
  {
    id: "scene-13-new",
    sceneId: "scene-13",
    providerTaskId: "provider-scene-13",
    videoTaskId: "video-scene-13",
    videoUrl: "https://cdn.example.com/scene-13-new.mp4",
    createdAt: "2026-01-02T00:00:01.000Z",
  },
  {
    id: "scene-13-old",
    sceneId: "scene-13",
    providerTaskId: "provider-scene-13",
    videoTaskId: "video-scene-13",
    videoUrl: "https://cdn.example.com/scene-13-old.mp4",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "scene-14",
    sceneId: "scene-14",
    providerTaskId: "provider-scene-14",
    videoTaskId: "video-scene-14",
    videoUrl: "https://cdn.example.com/scene-14.mp4",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
]);

assert.equal(candidates.length, 2);
assert.deepEqual(candidates.map((candidate) => candidate.id), ["scene-13-new", "scene-14"]);
assert.deepEqual(candidates.map((candidate) => candidate.sceneId), ["scene-13", "scene-14"]);

console.log("scene video candidate helper tests passed");

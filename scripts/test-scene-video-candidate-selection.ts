import assert from "node:assert/strict";
import { getSceneVideoCandidateDisplayList } from "../src/components/lyric-videos/preview-workbench/scene-video-candidates";

const list = getSceneVideoCandidateDisplayList({
  id: "scene-1",
  videoUrl: "https://cdn.example.com/main.mp4",
  videoStatus: "success",
  motionPrompt: "slow camera push",
  videoCandidates: [
    {
      id: "candidate-1",
      sceneId: "scene-1",
      videoUrl: "https://cdn.example.com/alt.mp4",
      status: "success",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
});

assert.equal(list[0].videoUrl, "https://cdn.example.com/main.mp4");
assert.equal(list[1].videoUrl, "https://cdn.example.com/alt.mp4");
console.log("scene video candidate selection tests passed");

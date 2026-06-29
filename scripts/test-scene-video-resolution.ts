import assert from "node:assert/strict";
import { SEEDANCE_SCENE_VIDEO_RESOLUTION } from "../src/modules/lyric-videos/lyric/scene-video-generation";

assert.equal(
  SEEDANCE_SCENE_VIDEO_RESOLUTION,
  "720p",
  "Seedance scene video generation should request 720p source videos",
);

console.log("scene video resolution checks passed");

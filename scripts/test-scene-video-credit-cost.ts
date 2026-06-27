import assert from "node:assert/strict";
import {
  LYRIC_VIDEO_SCENE_VIDEO_COST_CREDITS_PER_SECOND,
  calculateSceneVideoCostCredits,
  resolveSceneVideoCostDurationSeconds,
} from "../src/modules/lyric-videos/lyric/costs";

assert.equal(
  LYRIC_VIDEO_SCENE_VIDEO_COST_CREDITS_PER_SECOND,
  5,
  "scene video reel model should cost 5 credits per second",
);

assert.equal(
  resolveSceneVideoCostDurationSeconds({ startMs: 0, endMs: 3_390 }),
  4,
  "scene video cost duration should round up and respect the 4-second minimum",
);

assert.equal(
  calculateSceneVideoCostCredits({ scenes: [{ startMs: 0, endMs: 3_390 }] }),
  20,
  "a 3.39-second scene should cost 20 credits",
);

assert.equal(
  calculateSceneVideoCostCredits({ scenes: [{ startMs: 0, endMs: 5_000 }] }),
  25,
  "a 5-second scene should cost 25 credits",
);

assert.equal(
  calculateSceneVideoCostCredits({
    scenes: [
      { startMs: 0, endMs: 4_000 },
      { startMs: 4_000, endMs: 9_000 },
    ],
  }),
  45,
  "selected scene video cost should sum each scene duration",
);

assert.equal(
  calculateSceneVideoCostCredits({ sceneCount: 2 }),
  40,
  "legacy scene-count calls should keep the old 4-second-per-scene minimum cost",
);

console.log("scene video credit cost checks passed");

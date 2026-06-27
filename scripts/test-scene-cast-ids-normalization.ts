import assert from "node:assert/strict";
import { normalizeSceneCastIds } from "../src/components/lyric-videos/preview-workbench/scene-cast-ids";

assert.deepEqual(
  normalizeSceneCastIds(["cast-a", "cast-b"]),
  ["cast-a", "cast-b"],
  "array cast ids should be preserved",
);

assert.deepEqual(
  normalizeSceneCastIds('["cast-a","cast-b"]'),
  ["cast-a", "cast-b"],
  "JSON string cast ids should be parsed before the scene panel uses array methods",
);

assert.deepEqual(
  normalizeSceneCastIds(["cast-a", "", null, 42]),
  ["cast-a", "42"],
  "blank cast ids should be removed and valid ids should be stringified",
);

assert.deepEqual(
  normalizeSceneCastIds("not-json"),
  [],
  "invalid cast id payloads should fall back to an empty selection",
);

assert.deepEqual(
  normalizeSceneCastIds({ castIds: ["cast-a"] }),
  [],
  "non-array payloads should fall back to an empty selection",
);

console.log("scene cast id normalization checks passed");

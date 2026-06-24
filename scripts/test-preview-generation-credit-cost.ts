import assert from "node:assert/strict";
import { calculatePreviewGenerationCostCredits } from "../src/modules/lyric-videos/lyric/costs";

assert.equal(
  calculatePreviewGenerationCostCredits({ audioDurationMs: 30_000 }),
  30,
  "30 seconds should cost 30 preview generation credits",
);

assert.equal(
  calculatePreviewGenerationCostCredits({ audioDurationMs: 30_001 }),
  31,
  "partial seconds should round up for preview generation credits",
);

assert.equal(
  calculatePreviewGenerationCostCredits({ audioDurationMs: 90_000, trimStartMs: 10_000, trimEndMs: 40_000 }),
  30,
  "trimmed duration should take precedence over full audio duration",
);

assert.equal(
  calculatePreviewGenerationCostCredits({ audioDurationMs: 0 }),
  1,
  "preview generation should have a 1-credit minimum when duration is missing",
);

assert.equal(
  calculatePreviewGenerationCostCredits({ audioDurationMs: 90_000, trimStartMs: 40_000, trimEndMs: 10_000 }),
  90,
  "invalid trim ranges should fall back to full audio duration",
);

console.log("preview generation credit cost checks passed");

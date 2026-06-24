import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import { resolvePreviewCaptionText } from "../src/components/lyric-videos/preview-workbench/utils";

const firstLine = {
  text: "I kept your blue ticket stub in a book by my bed.",
  startMs: 9380,
  endMs: 14500,
};

assert.equal(
  resolvePreviewCaptionText({
    activeChunkText: undefined,
    currentLine: firstLine,
    currentTimeMs: 8880,
    hasLyrics: true,
    fallbackTitle: "Blue Ticket",
  }),
  "",
  "Preview captions should stay empty before the first lyric starts.",
);

assert.equal(
  resolvePreviewCaptionText({
    activeChunkText: "I kept your blue ticket stub",
    currentLine: firstLine,
    currentTimeMs: 9500,
    hasLyrics: true,
    fallbackTitle: "Blue Ticket",
  }),
  "I kept your blue ticket stub",
  "Preview captions should show the active caption chunk while lyrics are active.",
);

assert.equal(
  resolvePreviewCaptionText({
    activeChunkText: undefined,
    currentLine: undefined,
    currentTimeMs: 0,
    hasLyrics: false,
    fallbackTitle: "Blue Ticket",
  }),
  "Blue Ticket",
  "Preview captions may use the title only when the project has no lyrics yet.",
);

const videoPreviewSource = readFileSync("src/components/lyric-videos/preview-workbench/video-preview.tsx", "utf8");

assert(
  videoPreviewSource.includes("previewConfig.captionsEnabled && captionText"),
  "VideoPreview should not render an empty caption box when the caption text is empty.",
);

console.log("preview caption intro silence: ok");

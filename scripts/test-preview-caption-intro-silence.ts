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
    currentLine: firstLine,
    currentTimeMs: 12000,
    hasLyrics: true,
    fallbackTitle: "Blue Ticket",
    allowLineFallback: false,
  }),
  "",
  "Preview captions should not flash the full lyric line during a timed word chunk gap.",
);

assert.equal(
  resolvePreviewCaptionText({
    activeChunkText: undefined,
    currentLine: firstLine,
    currentTimeMs: 12000,
    hasLyrics: true,
    fallbackTitle: "Blue Ticket",
    allowLineFallback: true,
  }),
  "I kept your blue ticket stub in a book by my bed.",
  "Preview captions may still show a full lyric line when whole-verse fallback is explicitly allowed.",
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
  videoPreviewSource.includes("previewConfig.captionsEnabled && displayCaptionText"),
  "VideoPreview should not render an empty caption box when the caption text is empty.",
);

assert(
  videoPreviewSource.includes("allowLineFallback: previewConfig.showWholeVerse || words.length === 0"),
  "VideoPreview should disable full-line fallback while timed word chunks are available.",
);

console.log("preview caption intro silence: ok");

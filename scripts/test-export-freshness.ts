import assert from "node:assert/strict";

import {
  buildLyricVideoExportFingerprint,
  extractExportFingerprintFromSettings,
  withExportFreshnessSettings,
} from "../src/lib/lyric-video-export-freshness";

const baseInput = {
  project: {
    title: "Blue Ticket Stub",
    aspectRatio: "16:9",
    resolution: "1080p",
    previewConfig: {
      captionsEnabled: true,
      fontFamily: "Inter",
      fontSize: 56,
      textColor: "#ffffff",
    },
    audioUrl: "https://cdn.example.com/audio.mp3",
    processedAudioUrl: "https://cdn.example.com/audio-trimmed.mp3",
    renderStatus: "ready",
    renderUrl: "https://cdn.example.com/old-render.mp4",
    updatedAt: "2026-06-26T10:00:00.000Z",
  },
  lines: [
    {
      id: "line_1",
      text: "I hear your name",
      startMs: 0,
      endMs: 2000,
      sort: 1,
    },
  ],
  words: [
    {
      id: "word_1",
      lineId: "line_1",
      word: "I",
      startMs: 0,
      endMs: 200,
      sort: 1,
    },
  ],
  scenes: [
    {
      id: "scene_1",
      sort: 1,
      startMs: 0,
      endMs: 4000,
      prompt: "A quiet hallway",
      imageUrl: "https://cdn.example.com/scene.jpg",
      videoUrl: "https://cdn.example.com/scene.mp4",
      videoCompletedAt: "2026-06-26T10:05:00.000Z",
      updatedAt: "2026-06-26T10:06:00.000Z",
    },
  ],
};

const first = buildLyricVideoExportFingerprint(baseInput);
const second = buildLyricVideoExportFingerprint({
  ...baseInput,
  project: {
    ...baseInput.project,
    renderStatus: "processing",
    renderUrl: "https://cdn.example.com/new-render.mp4",
    updatedAt: "2026-06-26T11:00:00.000Z",
  },
  scenes: [
    {
      ...baseInput.scenes[0],
      updatedAt: "2026-06-26T11:00:00.000Z",
    },
  ],
});
assert.equal(first, second, "render bookkeeping fields must not change fingerprint");

assert.notEqual(
  first,
  buildLyricVideoExportFingerprint({
    ...baseInput,
    project: {
      ...baseInput.project,
      previewConfig: { ...baseInput.project.previewConfig, fontSize: 64 },
    },
  }),
  "caption style changes must change fingerprint",
);

assert.notEqual(
  first,
  buildLyricVideoExportFingerprint({
    ...baseInput,
    words: [{ ...baseInput.words[0], endMs: 320 }],
  }),
  "word timing changes must change fingerprint",
);

assert.notEqual(
  first,
  buildLyricVideoExportFingerprint({
    ...baseInput,
    scenes: [{ ...baseInput.scenes[0], videoUrl: "https://cdn.example.com/new-scene.mp4" }],
  }),
  "scene video changes must change fingerprint",
);

const settings = withExportFreshnessSettings({
  settings: { captionsEnabled: true },
  fingerprint: first,
  exportedAt: "2026-06-26T12:00:00.000Z",
});
assert.equal(settings.exportFingerprint, first);
assert.equal(settings.exportedAt, "2026-06-26T12:00:00.000Z");
assert.equal(settings.captionsEnabled, true);
assert.equal(extractExportFingerprintFromSettings(settings), first);
assert.equal(extractExportFingerprintFromSettings(JSON.stringify(settings)), first);
assert.equal(extractExportFingerprintFromSettings({}), "");

console.log("export freshness helpers ok");

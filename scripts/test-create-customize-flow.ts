import assert from "node:assert/strict";
import {
  buildDraftProjectCreateBody,
  previewSetupHref,
  shouldAutoStartDirection,
  type DraftProjectUploadPayload,
} from "../src/lib/lyric-video-setup-flow";

const payload: DraftProjectUploadPayload = {
  uploaded: {
    url: "https://cdn.example.com/audio/song.mp3",
    key: "uploads/audio/user/song.mp3",
    filename: "Blue Ticket Stub.mp3",
    size: 4_400_000,
    contentType: "audio/mpeg",
    checksum: "abc123",
  },
  startTime: 12.25,
  endTime: 65.384,
  options: {
    useEntireAudio: false,
    durationSeconds: 217,
    projectTitle: "Blue Ticket Stub",
    aspectRatio: "16:9",
    resolution: "1080p",
  },
};

const body = buildDraftProjectCreateBody(payload);

assert.deepEqual(body, {
  title: "Blue Ticket Stub",
  audioUrl: "https://cdn.example.com/audio/song.mp3",
  audioStorageKey: "uploads/audio/user/song.mp3",
  originalAudioUrl: "https://cdn.example.com/audio/song.mp3",
  originalAudioStorageKey: "uploads/audio/user/song.mp3",
  audioFilename: "Blue Ticket Stub.mp3",
  audioDurationMs: 217000,
  audioMimeType: "audio/mpeg",
  audioSizeBytes: 4_400_000,
  audioChecksum: "abc123",
  trimStartMs: 12250,
  trimEndMs: 65384,
  aspectRatio: "16:9",
  resolution: "1080p",
});

assert.equal(Object.prototype.hasOwnProperty.call(body, "selectedCharacterSlugs"), false);
assert.equal(Object.prototype.hasOwnProperty.call(body, "selectedCharacterSlug"), false);
assert.equal(previewSetupHref("project-123"), "/creations/project-123/preview?setup=1");
assert.equal(shouldAutoStartDirection({ deferAutoDirection: true, hasAudio: true, lineCount: 0 }), false);
assert.equal(shouldAutoStartDirection({ deferAutoDirection: false, hasAudio: true, lineCount: 0 }), true);
assert.equal(shouldAutoStartDirection({ deferAutoDirection: false, hasAudio: false, lineCount: 0 }), false);
assert.equal(shouldAutoStartDirection({ deferAutoDirection: false, hasAudio: true, lineCount: 2 }), false);

console.log("create customize flow checks passed");

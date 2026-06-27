import assert from "node:assert/strict";

import {
  buildSceneMediaConcatFile,
  buildSceneMediaSegmentArgs,
  resolveRenderableSceneMedia,
} from "../src/modules/lyric-videos/lyric/worker-render";

const scenes = [
  {
    id: "scene_video",
    startMs: 0,
    endMs: 4200,
    imageUrl: "https://cdn.example.com/poster.jpg",
    videoUrl: "https://cdn.example.com/scene.mp4",
    videoStatus: "success",
  },
  {
    id: "scene_image",
    startMs: 4200,
    endMs: 7200,
    imageUrl: "https://cdn.example.com/fallback.jpg",
    videoUrl: "",
    videoStatus: "empty",
  },
];

const media = resolveRenderableSceneMedia(scenes);
assert.equal(media.length, 2);
assert.equal(media[0].kind, "video");
assert.equal(media[0].url, "https://cdn.example.com/scene.mp4");
assert.equal(media[0].posterUrl, "https://cdn.example.com/poster.jpg");
assert.equal(media[0].durationSeconds, 4.2);
assert.equal(media[1].kind, "image");
assert.equal(media[1].url, "https://cdn.example.com/fallback.jpg");
assert.equal(media[1].durationSeconds, 3);

assert.throws(
  () =>
    resolveRenderableSceneMedia([
      {
        id: "scene_processing",
        startMs: 0,
        endMs: 4000,
        imageUrl: "https://cdn.example.com/fallback.jpg",
        videoStatus: "processing",
        videoProviderTaskId: "provider_task_1",
      },
    ]),
  /Scene video generation is still processing/,
);

assert.throws(() => resolveRenderableSceneMedia([{ id: "empty", startMs: 0, endMs: 4000 }]), /Generate at least one scene image or video before export/);

const videoArgs = buildSceneMediaSegmentArgs({
  ffmpegPath: "ffmpeg",
  inputPath: "/tmp/scene.mp4",
  outputPath: "/tmp/segment-video.mp4",
  media: media[0],
  width: 1920,
  height: 1080,
});
assert(videoArgs.includes("-stream_loop"), "video segment should loop short source videos");
assert(videoArgs.includes("-t"), "video segment should trim to scene duration");
assert(videoArgs.includes("/tmp/scene.mp4"), "video segment should use the downloaded video input");

const imageArgs = buildSceneMediaSegmentArgs({
  ffmpegPath: "ffmpeg",
  inputPath: "/tmp/scene.jpg",
  outputPath: "/tmp/segment-image.mp4",
  media: media[1],
  width: 1920,
  height: 1080,
});
assert(imageArgs.includes("-loop"), "image segment should loop the still image");
assert(imageArgs.includes("/tmp/scene.jpg"), "image segment should use the downloaded image input");

assert.equal(
  buildSceneMediaConcatFile(["/tmp/segment-video.mp4", "/tmp/segment-image.mp4"]),
  "file '/tmp/segment-video.mp4'\nfile '/tmp/segment-image.mp4'",
);

console.log("worker render scene media helpers ok");

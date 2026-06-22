import assert from "node:assert/strict";
import { buildExportSettings, buildWatermarkDrawtextFilter } from "../src/modules/lyric-videos/lyric/render";

const freeFilter = buildWatermarkDrawtextFilter({
  watermark: { enabled: true, text: "Lyrics:Video'ai%" },
  width: 1920,
  height: 1080,
});

assert.ok(freeFilter, "free export should include a watermark drawtext filter");
assert.ok(freeFilter.includes("drawtext="), "free export should use ffmpeg drawtext");
assert.ok(freeFilter.includes("Lyrics\\:Video\\'ai%"), "watermark text should escape ffmpeg special characters");
assert.ok(freeFilter.includes("expansion=none"), "watermark text should disable drawtext expansion");
assert.ok(freeFilter.includes("fontsize=35"), "16:9 watermark should size text from the short edge");
assert.ok(freeFilter.includes("x=w-tw-54"), "16:9 watermark should anchor near the right edge");
assert.ok(freeFilter.includes("y=h-th-54"), "16:9 watermark should anchor near the bottom edge");

const subscribedFilter = buildWatermarkDrawtextFilter({
  watermark: { enabled: false, text: "LyricsVideo.ai" },
  width: 1920,
  height: 1080,
});

assert.equal(subscribedFilter, null, "subscribed export should not include a watermark filter");

const defaultBrandFilter = buildWatermarkDrawtextFilter({
  watermark: { enabled: true },
  width: 1920,
  height: 1080,
});

assert.ok(defaultBrandFilter?.includes("LyricVideoMaker.app"), "default watermark should use the app-name .app brand suffix");

const portraitFilter = buildWatermarkDrawtextFilter({
  watermark: { enabled: true, text: "LyricsVideo.ai" },
  width: 1080,
  height: 1920,
});

assert.ok(portraitFilter, "portrait free export should include a watermark drawtext filter");
assert.ok(portraitFilter.includes("fontsize=35"), "9:16 watermark should size text from the short edge");
assert.ok(portraitFilter.includes("x=w-tw-54"), "9:16 watermark should anchor near the right edge");
assert.ok(portraitFilter.includes("y=h-th-54"), "9:16 watermark should anchor near the bottom edge");

const storedSettings = buildExportSettings({
  settings: { captionsEnabled: false, resolution: "1080p" },
  watermark: { enabled: true },
});

assert.deepEqual(
  storedSettings.watermark,
  { enabled: true, text: "LyricVideoMaker.app" },
  "export settings should record the server-side watermark decision",
);
assert.equal(storedSettings.captionsEnabled, false, "export settings should preserve client export settings");

console.log("lyric video export watermark checks passed");

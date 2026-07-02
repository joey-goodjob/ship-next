import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import { CAPTION_EFFECT_OPTIONS, CAPTION_FONT_OPTIONS, CAPTION_STYLE_OPTIONS } from "../src/components/lyric-videos/preview-workbench/constants";
import { applyCaptionFontCase, getPreviewCaptionStyle, normalizePreviewConfig } from "../src/components/lyric-videos/preview-workbench/utils";
import { buildCaptionChunks } from "../src/lib/lyric-caption-chunks";

const optionIds = CAPTION_STYLE_OPTIONS.map((option) => option.value);
assert.deepEqual(
  optionIds,
  ["classic", "cinematic", "pop", "slide", "stacked"],
  "Font panel should expose the first five lyric caption presets.",
);

const defaultConfig = normalizePreviewConfig({});
assert.equal(defaultConfig.captionStyle, "classic", "Preview captions should default to the classic lyric style.");
assert.equal(defaultConfig.wordsPerGroup, 3, "Preview captions should default to three words per group.");
assert.equal(defaultConfig.strokeWidth, 0, "Caption stroke should default off.");
assert.equal(defaultConfig.shadowEnabled, true, "Drop shadow should default on for readable lyric video text.");
assert.equal(defaultConfig.effect, "fade", "Caption effect should default to fade.");

assert.ok(CAPTION_FONT_OPTIONS.length >= 24, "Font panel should expose a practical curated font family list.");
assert.ok(CAPTION_FONT_OPTIONS.some((option) => option.value === "Bebas Neue"), "Font list should include lyric-video display fonts.");
assert.ok(CAPTION_EFFECT_OPTIONS.some((option) => option.value === "glitch"), "Effect list should include Glitch.");

const groupedChunks = buildCaptionChunks(
  [
    { word: "Morning", startMs: 0, endMs: 100 },
    { word: "on", startMs: 120, endMs: 200 },
    { word: "my", startMs: 220, endMs: 300 },
    { word: "face", startMs: 320, endMs: 420 },
  ],
  { wordsPerGroup: 2, minDurationMs: 1 },
);
assert.deepEqual(
  groupedChunks.map((chunk) => chunk.text),
  ["Morning on", "my face"],
  "Words Per Group should split active caption chunks into fixed lyric groups.",
);

const cinematic = getPreviewCaptionStyle(normalizePreviewConfig({ captionStyle: "cinematic", fontSize: 52 }));
assert.match(cinematic.containerClassName, /bottom-\[12%\]/, "Cinematic captions should sit higher than ordinary subtitles.");
assert.match(cinematic.textClassName, /uppercase/, "Cinematic captions should feel like lyric-title text.");
assert.equal(cinematic.textStyle.fontSize, "clamp(37px, 2.65vw, 52px)");

const stacked = getPreviewCaptionStyle(normalizePreviewConfig({ captionStyle: "stacked", fontSize: 44 }));
assert.match(stacked.textClassName, /rounded-\[14px\]/, "Stacked captions should use a pill-like lyric container.");
assert.notEqual(stacked.textClassName, cinematic.textClassName, "Each preset should map to a distinct visual treatment.");

const outlined = getPreviewCaptionStyle(
  normalizePreviewConfig({
    fontFamily: "Bebas Neue",
    strokeColor: "#ffcc00",
    strokeWidth: 3,
    shadowEnabled: false,
    effect: "glitch",
    opacity: 72,
  }),
);
assert.match(String(outlined.textStyle.WebkitTextStroke), /3px #ffcc00/, "Stroke controls should affect preview caption text.");
assert.equal(outlined.textStyle.opacity, 0.72, "Composite opacity should affect preview caption text.");
assert.match(outlined.textClassName, /lyric-caption-motion-glitch/, "Effect controls should map to preview motion classes.");

const positionedTopLeft = getPreviewCaptionStyle(normalizePreviewConfig({ alignment: "left", position: "top", rotation: -12 }));
assert.match(positionedTopLeft.containerClassName, /items-start/, "Anchor top should move captions to the top band.");
assert.match(positionedTopLeft.containerClassName, /justify-start/, "Left alignment should move the caption block left.");
assert.equal(positionedTopLeft.textStyle.textAlign, "left", "Left alignment should affect caption text alignment.");
assert.equal(positionedTopLeft.textStyle.transform, "rotate(-12deg)", "Rotation should affect caption text transform.");

const positionedCenter = getPreviewCaptionStyle(normalizePreviewConfig({ alignment: "center", position: "center" }));
assert.match(positionedCenter.containerClassName, /items-center/, "Anchor center should move captions to the middle band.");
assert.match(positionedCenter.containerClassName, /justify-center/, "Center alignment should center the caption block.");

const positionedBottomRight = getPreviewCaptionStyle(normalizePreviewConfig({ alignment: "right", position: "bottom" }));
assert.match(positionedBottomRight.containerClassName, /items-end/, "Anchor bottom should move captions to the bottom band.");
assert.match(positionedBottomRight.containerClassName, /justify-end/, "Right alignment should move the caption block right.");

assert.equal(applyCaptionFontCase("carry YOUR world", "uppercase"), "CARRY YOUR WORLD", "Uppercase should transform the rendered caption text.");
assert.equal(applyCaptionFontCase("carry YOUR world", "lowercase"), "carry your world", "Lowercase should transform the rendered caption text.");
assert.equal(applyCaptionFontCase("carry YOUR world", "capitalize"), "Carry Your World", "Aa should transform the rendered caption text to title case.");

const source = readFileSync("src/components/lyric-videos/preview-workbench/font-panel.tsx", "utf8");
assert.doesNotMatch(source, /Lyrics Style/, "Font panel should not show lyric style presets while the simplified editor layout is active.");
assert.doesNotMatch(source, /CAPTION_STYLE_OPTIONS/, "Font panel should not render caption preset cards in the simplified layout.");
assert.match(source, /Font Family/, "Font panel should expose font family selection.");
assert.match(source, /Underline/, "Font panel should keep the underline control shown in the reference layout.");
assert.doesNotMatch(source, /Words Per Group/, "Font panel should hide lyric density controls in the simplified layout.");
assert.doesNotMatch(source, /Stroke/, "Font panel should hide stroke controls in the simplified layout.");
assert.doesNotMatch(source, /Drop Shadow/, "Font panel should hide shadow controls in the simplified layout.");
assert.doesNotMatch(source, /Composite/, "Font panel should hide composite controls in the simplified layout.");
assert.doesNotMatch(source, /label="Effect"|>Effect</, "Font panel should hide caption effect controls in the simplified layout.");
assert.match(source, /caption-tool-panel/, "Font panel should use the compact editor-style tool panel layout.");
assert.match(source, /caption-control-row/, "Font panel controls should share the left-label, right-control row layout.");
assert.match(source, /caption-segmented-control/, "Font panel should use compact segmented controls for subtitle options.");

console.log("preview caption style presets: ok");

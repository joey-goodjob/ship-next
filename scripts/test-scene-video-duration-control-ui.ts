import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/lyric-videos/preview-workbench/scenes-panel.tsx", "utf8");

assert.match(
  source,
  /function SceneVideoDurationControl\(/,
  "Scenes panel should render a dedicated scene video duration control.",
);

const animateLabelIndex = source.indexOf("Animate the Image");
const promptGridIndex = source.indexOf('sm:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]', animateLabelIndex);
const promptColumnIndex = source.indexOf('<div className="relative min-w-0">', promptGridIndex);
const durationControlIndex = source.indexOf("<SceneVideoDurationControl", animateLabelIndex);
const motionPromptIndex = source.indexOf('ariaLabel={`Scene ${index + 1} video prompt`}', animateLabelIndex);
const videoPreviewColumnIndex = source.indexOf('<div className="min-w-0 sm:w-full sm:max-w-[292px] sm:justify-self-end">', promptGridIndex);
const compactPromptIndex = source.indexOf("compact", motionPromptIndex);

assert.notEqual(animateLabelIndex, -1, "Animate the Image card should exist.");
assert.notEqual(promptGridIndex, -1, "Animate the Image card should contain the prompt/video two-column grid.");
assert.notEqual(promptColumnIndex, -1, "Animate the Image card should contain a left prompt column.");
assert.notEqual(durationControlIndex, -1, "Duration control should be rendered inside the Animate the Image card.");
assert.notEqual(motionPromptIndex, -1, "Video motion prompt textarea should exist inside the Animate the Image card.");
assert.notEqual(videoPreviewColumnIndex, -1, "Animate the Image card should contain a right video preview column.");
assert(
  promptColumnIndex < durationControlIndex,
  "Duration control should be scoped to the left prompt column.",
);
assert(
  durationControlIndex < motionPromptIndex,
  "Duration control should appear above the video motion prompt textarea.",
);
assert(
  durationControlIndex < videoPreviewColumnIndex,
  "Duration control should not span into the right video preview column.",
);
assert(
  compactPromptIndex > motionPromptIndex && compactPromptIndex < videoPreviewColumnIndex,
  "Video motion prompt should use compact height so the added duration control does not overflow the card.",
);

assert.match(
  source,
  /resolveSceneVideoCostDurationSeconds/,
  "Duration control should display the same rounded duration used for scene video billing.",
);

console.log("scene video duration control UI checks passed");

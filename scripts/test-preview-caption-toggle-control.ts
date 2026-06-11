import { readFileSync } from "node:fs";

const source = readFileSync("src/components/lyric-videos/preview-workbench/playback-controls.tsx", "utf8");

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  source.includes("normalizePreviewConfig(project?.previewConfig)"),
  "PlaybackControls should derive the current caption state from project.previewConfig.",
);

assert(
  /updateProjectField\(\s*"previewConfig"\s*,/.test(source),
  "PlaybackControls should persist caption visibility through updateProjectField.",
);

assert(
  /aria-pressed=\{previewConfig\.captionsEnabled\}/.test(source),
  "The caption toggle should expose its pressed state for accessibility and UI state.",
);

assert(
  /captionsEnabled:\s*!previewConfig\.captionsEnabled/.test(source),
  "The Type control should toggle captionsEnabled instead of only opening a panel.",
);

assert(
  source.includes('aria-hidden="true"') && source.includes("rotate-[-35deg]"),
  "The disabled caption state should render a diagonal slash over the Type icon.",
);

assert(
  source.includes("toggleMute") && source.includes("VolumeX"),
  "The volume control should toggle audio mute state and show a muted icon.",
);

assert(
  source.includes("requestFullscreen") && source.includes("[data-preview-stage]"),
  "The fullscreen control should request fullscreen on the preview stage.",
);

console.log("preview caption toggle control: ok");

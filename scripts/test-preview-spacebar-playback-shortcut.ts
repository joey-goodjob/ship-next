import { readFileSync } from "node:fs";

const source = readFileSync("src/components/lyric-videos/preview-workbench/editor-workspace.tsx", "utf8");

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  /import\s+\{\s*usePlayback\s*\}\s+from\s+"\.\/playback-context";/.test(source),
  "EditorWorkspace should use the playback context for keyboard playback shortcuts.",
);

assert(
  /const\s+\{\s*audioAvailable,\s*isAudioLoading,\s*togglePlayback\s*\}\s*=\s*usePlayback\(\);/.test(source),
  "EditorWorkspace should read audio availability, loading state, and togglePlayback from usePlayback().",
);

assert(
  source.includes('window.addEventListener("keydown", handlePlaybackShortcut)') &&
    source.includes('window.removeEventListener("keydown", handlePlaybackShortcut)'),
  "EditorWorkspace should bind and clean up a window keydown handler for playback shortcuts.",
);

assert(
  source.includes('event.code !== "Space"'),
  "The playback shortcut should be bound to the Space key.",
);

assert(
  source.includes("event.preventDefault()") && source.includes("void togglePlayback()"),
  "The Space shortcut should prevent page scrolling and call togglePlayback().",
);

assert(
  source.includes("isEditableShortcutTarget") &&
    source.includes("HTMLInputElement") &&
    source.includes("HTMLTextAreaElement") &&
    source.includes("HTMLSelectElement") &&
    source.includes("HTMLButtonElement") &&
    source.includes("HTMLAnchorElement"),
  "The Space shortcut should ignore editable and interactive controls so native keyboard behavior still works.",
);

console.log("preview spacebar playback shortcut: ok");

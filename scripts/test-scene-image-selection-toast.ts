import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const editorProviderSource = readFileSync(
  join(process.cwd(), "src/components/lyric-videos/preview-workbench/editor-provider.tsx"),
  "utf8",
);

assert.equal(
  editorProviderSource.includes('toast.success("Scene image selected")'),
  false,
  "selecting a scene image candidate should not show a success toast",
);

assert.equal(
  editorProviderSource.includes('toast.error(err?.message || "Select scene image failed")'),
  true,
  "selecting a scene image candidate should still show an error toast when it fails",
);

console.log("scene image selection toast checks passed");

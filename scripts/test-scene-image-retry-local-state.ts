import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "src/components/lyric-videos/preview-workbench/scenes-panel.tsx"),
  "utf8",
);

const retryImageCandidateMatch = source.match(/async function retryImageCandidate\(scene: LyricScene\) \{[\s\S]*?\n  \}/);
assert.ok(retryImageCandidateMatch, "retryImageCandidate should exist");

const retryImageCandidateSource = retryImageCandidateMatch[0];
assert.equal(
  retryImageCandidateSource.includes("setSubmitting("),
  false,
  "single-scene image retry should not toggle the dialog-wide submitting state",
);
assert.equal(
  retryImageCandidateSource.includes("submitting"),
  false,
  "single-scene image retry should not use dialog-wide submitting to decide whether it can run",
);
assert.equal(
  retryImageCandidateSource.includes("retrySceneImage(scene.id, { allowDuringImageGeneration: true })"),
  true,
  "single-scene image retry should always allow different scenes to queue concurrently",
);
assert.equal(
  retryImageCandidateSource.includes('queued?.status === "processing" && (queued.providerTaskId || queued.imageTaskId)'),
  true,
  "single-scene image retry should keep pending state only when the backend returns a real processing task id",
);

assert.match(
  source,
  /<RefreshCcw className=\{cn\("h-\[12px\] w-\[12px\]", imageRetryPending && "animate-spin"\)\} \/>/,
  "Retry Image icon should spin only for the scene currently retrying",
);

assert.doesNotMatch(
  source,
  /<RefreshCcw className=\{cn\("h-\[12px\] w-\[12px\]", submitting && "animate-spin"\)\} \/>/,
  "Retry Image icon should not use dialog-wide submitting state",
);

const providerSource = readFileSync(
  join(process.cwd(), "src/components/lyric-videos/preview-workbench/editor-provider.tsx"),
  "utf8",
);

assert.equal(
  providerSource.includes('toast.success("Queued a new image candidate")'),
  false,
  "retrying a scene image should not show a queued toast before a provider task is confirmed",
);

console.log("scene image retry local state checks passed");

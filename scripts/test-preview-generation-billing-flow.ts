import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string) {
  const fullPath = path.join(root, relativePath);
  assert(fs.existsSync(fullPath), `${relativePath} must exist.`);
  return fs.readFileSync(fullPath, "utf8");
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const generationRunner = read("src/modules/lyric-videos/lyric/generation-runner.ts");
const createPage = read("src/app/[locale]/(workspace)/create/page.tsx");
const editorWorkspace = read("src/components/lyric-videos/preview-workbench/editor-workspace.tsx");
const homeTool = read("src/components/lyric-video-home-tool.tsx");

assert(
  generationRunner.includes("createPreviewGenerationBillingTask("),
  "Generation runs must create a preview-generation billing task before ASR starts.",
);
assert(
  generationRunner.includes('mediaType: "lyric_video_preview"') ||
    generationRunner.includes("mediaType: 'lyric_video_preview'"),
  "Preview generation billing task must use the lyric_video_preview media type.",
);
assert(
  generationRunner.includes("billingTaskId"),
  "Generation run snapshots must carry billingTaskId for failure refunds.",
);
assert(
  generationRunner.includes("refundPreviewGenerationBillingTask("),
  "Failed generation runs must refund the preview-generation billing task.",
);
assert(
  generationRunner.includes("markPreviewGenerationBillingTaskSucceeded("),
  "Generation runs must mark preview billing successful after included image generation is queued.",
);
assert(
  !createPage.includes("creditCost={10}"),
  "Create page must not hard-code a 10-credit preview generation cost.",
);
assert(
  !editorWorkspace.includes("creditCost={10}"),
  "Preview workspace upload must not hard-code a 10-credit direction cost.",
);
assert(
  homeTool.includes("showCredits={false}") && !homeTool.includes("creditCost={10}"),
  "Homepage upload may hide credits but must not pass a stale fixed 10-credit cost.",
);

console.log("preview generation billing flow checks passed");

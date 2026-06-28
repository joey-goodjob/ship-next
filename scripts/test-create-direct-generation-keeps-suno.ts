import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function readWorkspaceFile(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const createPage = readWorkspaceFile("src/app/[locale]/(workspace)/create/page.tsx");
const creationFlowHook = readWorkspaceFile("src/hooks/use-lyric-video-creation-flow.ts");
const previewPage = readWorkspaceFile("src/app/[locale]/creations/[id]/preview/page.tsx");
const previewWorkbench = readWorkspaceFile("src/components/lyric-videos/preview-workbench.tsx");
const editorProvider = readWorkspaceFile("src/components/lyric-videos/preview-workbench/editor-provider.tsx");
const customizePanel = readWorkspaceFile("src/components/lyric-videos/preview-workbench/customize-panel.tsx");
const editorTypes = readWorkspaceFile("src/components/lyric-videos/preview-workbench/types.ts");
const enDashboard = readWorkspaceFile("src/config/locale/messages/en/dashboard.json");
const zhDashboard = readWorkspaceFile("src/config/locale/messages/zh/dashboard.json");

assert.match(createPage, /CharacterPresetPicker/, "Create page should keep the character picker.");
assert.match(createPage, /enableSunoImport/, "Create page should keep Suno import enabled.");
assert.match(createPage, /generateFromUploaded/, "Create page should generate directly from imported audio.");
assert.match(createPage, /generateFromFile/, "Create page should generate directly from uploaded local files.");
assert.doesNotMatch(createPage, /continueToCustomize/, "Create page should not redirect into setup-only customize flow.");
assert.doesNotMatch(createPage, /continue_to_customize|customize_ready/, "Create labels should not use setup flow wording.");

assert.match(creationFlowHook, /\/api\/lyric-videos\/\$\{project\.id\}\/generate/, "Create flow should call the existing generate endpoint.");
assert.match(creationFlowHook, /mode:\s*"guided"/, "Create flow should keep guided direction generation.");
assert.match(creationFlowHook, /wait:\s*true/, "Create flow should keep waiting for direction generation before preview.");
assert.doesNotMatch(creationFlowHook, /lyric-video-setup-flow|previewSetupHref|continueToCustomize/, "Create flow hook should not depend on setup flow helpers.");

for (const [name, source] of [
  ["preview page", previewPage],
  ["preview workbench", previewWorkbench],
  ["editor provider", editorProvider],
  ["customize panel", customizePanel],
  ["editor types", editorTypes],
] as const) {
  assert.doesNotMatch(source, /deferAutoDirection|startDirectionGeneration/, `${name} should not contain deferred direction setup controls.`);
}

assert.doesNotMatch(customizePanel, /Customize before generating/, "Customize panel should not show the removed setup confirmation card.");
assert.doesNotMatch(editorProvider, /shouldAutoStartDirection/, "Editor provider should auto-start through its existing flow.");
assert.equal(existsSync(path.join(root, "src/lib/lyric-video-setup-flow.ts")), false, "Setup flow helper should be removed.");
assert.equal(existsSync(path.join(root, "scripts/test-create-customize-flow.ts")), false, "Removed setup flow test should be removed.");

assert.doesNotMatch(enDashboard, /continue_to_customize|customize_ready/, "English dashboard copy should not keep setup flow labels.");
assert.doesNotMatch(zhDashboard, /continue_to_customize|customize_ready/, "Chinese dashboard copy should not keep setup flow labels.");

console.log("create direct generation with Suno retention tests passed");

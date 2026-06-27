import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const topNavPath = join(root, "src/components/lyric-videos/preview-workbench/top-nav-bar.tsx");
const drawerPath = join(root, "src/components/lyric-videos/preview-workbench/editor-menu-drawer.tsx");

const topNavSource = readFileSync(topNavPath, "utf8");

assert.match(topNavSource, /<button[\s\S]*aria-label="Open editor menu"/, "menu icon must be a clickable button");
assert.match(topNavSource, /<button[\s\S]*aria-label="Open settings"/, "settings icon must be a clickable button");
assert.match(topNavSource, /EditorMenuDrawer/, "top nav must render the editor menu drawer");

assert.equal(existsSync(drawerPath), true, "editor menu drawer component must exist");

const drawerSource = readFileSync(drawerPath, "utf8");

assert.match(drawerSource, /SheetContent[\s\S]*side="right"/, "editor menu must open as a right side drawer");
assert.match(drawerSource, /\/creations/, "drawer must link back to the user's videos");
assert.match(drawerSource, /\/settings\/billing/, "drawer must link to billing");
assert.match(drawerSource, /\/settings\/profile/, "drawer must link to account settings");
assert.match(drawerSource, /\/api\/lyric-videos\/\$\{projectId\}/, "drawer must delete the current project through the existing API");
assert.match(drawerSource, /Delete Video/, "drawer must include the destructive current-video action");
assert.match(drawerSource, /signOut/, "drawer must expose logout");

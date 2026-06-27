import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/lyric-videos/preview-workbench/scenes-panel.tsx", "utf8");
const editLabelIndex = source.indexOf("\n                    Edit\n");
const editButtonStart = source.lastIndexOf("<button", editLabelIndex);
const editButtonEnd = source.indexOf("</button>", editLabelIndex);

assert.notEqual(editLabelIndex, -1, "Scenes panel must render a scene Edit button.");
assert.notEqual(editButtonStart, -1, "Scene Edit label must be inside a button.");
assert.notEqual(editButtonEnd, -1, "Scene Edit button must have a closing tag.");

const editButtonSource = source.slice(editButtonStart, editButtonEnd);

assert.match(
  editButtonSource,
  /event\.stopPropagation\(\)[\s\S]*setBatchGenerationOpen\(true\)/,
  "Scene Edit buttons should open Batch Generation without selecting the timeline row.",
);

console.log("scenes panel edit button opens batch generation");

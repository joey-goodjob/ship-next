import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const audioUploadTrim = readFileSync(path.join(root, 'src/components/audio-upload-trim.tsx'), 'utf8');
const homeTool = readFileSync(path.join(root, 'src/components/lyric-video-home-tool.tsx'), 'utf8');
const createPage = readFileSync(path.join(root, 'src/app/[locale]/(workspace)/create/page.tsx'), 'utf8');

assert.match(
  audioUploadTrim,
  /sunoImportTrigger\?:\s*"upload-area"\s*\|\s*"button"/,
  'AudioUploadTrim should expose a trigger mode for Suno import.',
);
assert.match(
  audioUploadTrim,
  /sunoImportTrigger === "button"/,
  'Button trigger mode should keep the upload area opening local file selection.',
);
assert.match(
  audioUploadTrim,
  /openSunoImportDialog/,
  'A separate Suno import trigger should open the dialog.',
);
assert.match(
  homeTool,
  /enableSunoImport[\s\S]*sunoImportTrigger="button"/,
  'Homepage tool should enable Suno import through a separate button.',
);
assert.doesNotMatch(
  createPage,
  /sunoImportTrigger="button"/,
  'Create page should keep the original upload-area dialog behavior.',
);

console.log('suno import trigger mode tests passed');

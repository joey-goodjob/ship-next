import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const globals = readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
const tokens = [
  '--editor-bg',
  '--editor-panel',
  '--editor-panel-soft',
  '--editor-panel-strong',
  '--editor-line',
  '--editor-text',
  '--editor-muted',
  '--editor-subtle',
  '--editor-accent',
  '--editor-danger',
];

for (const token of tokens) {
  assert.match(globals, new RegExp(`${token}:`), `missing ${token} in globals.css`);
}

const checkedFiles = [
  'editor-workspace.tsx',
  'top-nav-bar.tsx',
  'side-panel.tsx',
  'playback-controls.tsx',
  'status-bar.tsx',
  'timeline.tsx',
  'field-block.tsx',
  'panel-empty.tsx',
  'latest-export.tsx',
  'resize-handles.tsx',
  'customize-panel.tsx',
  'lyrics-panel.tsx',
  'cast-panel.tsx',
  'scenes-panel.tsx',
  'diagnostics-panel.tsx',
  'video-preview.tsx',
];

const forbidden = ['bg-white', '#F8F9FA', '#E8E8E8', '#1A1A2E'];

for (const file of checkedFiles) {
  const rel = `src/components/lyric-videos/preview-workbench/${file}`;
  const content = readFileSync(path.join(root, rel), 'utf8');
  for (const value of forbidden) {
    assert.equal(content.includes(value), false, `${rel} still contains ${value}`);
  }
}

console.log('preview theme token tests passed');

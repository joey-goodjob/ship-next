import assert from 'node:assert/strict';
import { calculatePreviewTotalDurationSeconds } from '../src/components/lyric-videos/preview-workbench/utils';

assert.equal(
  calculatePreviewTotalDurationSeconds({
    audioDurationMs: 13_000,
    lines: [{ endMs: 12_980 }],
    words: [{ endMs: 12_740 }],
    scenes: [],
  }),
  13,
);

assert.equal(
  calculatePreviewTotalDurationSeconds({
    audioDurationMs: 13_000,
    lines: [{ endMs: 12_980 }],
    words: [{ endMs: 12_740 }],
    scenes: [{ endMs: 15_500 }],
  }),
  15.5,
);

assert.equal(calculatePreviewTotalDurationSeconds({}), 0);

console.log('preview total duration helpers ok');

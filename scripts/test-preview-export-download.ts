import assert from 'node:assert/strict';
import { buildExportDownloadFilename } from '../src/components/lyric-videos/preview-workbench/export-download';

assert.equal(
  buildExportDownloadFilename({ id: '0d83a006-2f71-4bd8-a4dd-1c2ff7b531c5' }),
  'lyric-video-0d83a006.mp4'
);

assert.equal(buildExportDownloadFilename(null), 'lyric-video.mp4');

console.log('preview export download helpers ok');

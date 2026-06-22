import assert from 'node:assert/strict';

import {
  compactAdminCreationId,
  deriveAdminCreationMetrics,
  findAdminCreationMediaUrl,
  formatAdminCreationDuration,
} from '../src/modules/lyric-videos/admin';

assert.equal(formatAdminCreationDuration(0), '-');
assert.equal(formatAdminCreationDuration(12_400), '0:12');
assert.equal(formatAdminCreationDuration(75_100), '1:15');
assert.equal(formatAdminCreationDuration(3_665_000), '1:01:05');

assert.equal(compactAdminCreationId('1234567890abcdef'), '1234567890abcdef');
assert.equal(compactAdminCreationId('1234567890abcdef123456'), '12345678...3456');

assert.deepEqual(
  deriveAdminCreationMetrics({
    scenes: [
      { imageUrl: 'https://example.com/a.png', status: 'success' },
      { imageUrl: '', status: 'failed' },
      { imageUrl: null, status: 'processing' },
    ],
    exports: [
      { status: 'ready', videoUrl: 'https://example.com/video.mp4' },
      { status: 'failed', videoUrl: null },
    ],
    mediaJobs: [
      { status: 'queued' },
      { status: 'failed' },
      { status: 'ready' },
    ],
  }),
  {
    sceneCount: 3,
    imageReadyCount: 1,
    imageFailedCount: 1,
    exportCount: 2,
    exportReadyCount: 1,
    exportFailedCount: 1,
    mediaJobQueuedCount: 1,
    mediaJobFailedCount: 1,
  }
);

assert.equal(
  findAdminCreationMediaUrl({
    project: {
      originalAudioUrl: 'https://example.com/original.mp3',
      audioUrl: 'https://example.com/current.mp3',
      processedAudioUrl: 'https://example.com/processed.mp3',
      renderUrl: 'https://example.com/render.mp4',
    },
    exports: [
      { videoUrl: 'https://example.com/export.mp4' },
    ],
  }, 'source-audio'),
  'https://example.com/original.mp3'
);

assert.equal(
  findAdminCreationMediaUrl({
    project: {
      originalAudioUrl: '',
      audioUrl: 'https://example.com/current.mp3',
      processedAudioUrl: 'https://example.com/processed.mp3',
      renderUrl: 'https://example.com/render.mp4',
    },
    exports: [
      { videoUrl: 'https://example.com/export.mp4' },
    ],
  }, 'processed-audio'),
  'https://example.com/processed.mp3'
);

assert.equal(
  findAdminCreationMediaUrl({
    project: {
      originalAudioUrl: '',
      audioUrl: '',
      processedAudioUrl: '',
      renderUrl: 'https://example.com/render.mp4',
    },
    exports: [
      { videoUrl: 'https://example.com/export.mp4' },
    ],
  }, 'rendered-video'),
  'https://example.com/export.mp4'
);

console.log('admin creations summary helpers ok');

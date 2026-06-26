import assert from 'node:assert/strict';

import {
  compactAdminCreationId,
  deriveAdminCreationUsageSummary,
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

assert.deepEqual(
  deriveAdminCreationUsageSummary([
    {
      pipelineStage: 'preview_ready',
      generationStatus: 'success',
      renderStatus: 'ready',
      generationProgress: 100,
      metrics: {
        sceneCount: 6,
        imageReadyCount: 6,
        imageFailedCount: 0,
        exportCount: 1,
        exportReadyCount: 1,
        exportFailedCount: 0,
        mediaJobQueuedCount: 0,
        mediaJobFailedCount: 0,
      },
      exports: [{ costCredits: 5 }],
      firstError: '',
      hasSourceAudio: true,
      hasProcessedAudio: true,
      hasRenderedVideo: true,
    },
    {
      pipelineStage: 'generating_images',
      generationStatus: 'processing',
      renderStatus: 'empty',
      generationProgress: 42,
      metrics: {
        sceneCount: 5,
        imageReadyCount: 2,
        imageFailedCount: 1,
        exportCount: 0,
        exportReadyCount: 0,
        exportFailedCount: 0,
        mediaJobQueuedCount: 1,
        mediaJobFailedCount: 0,
      },
      exports: [],
      firstError: '',
      hasSourceAudio: true,
      hasProcessedAudio: false,
      hasRenderedVideo: false,
    },
    {
      pipelineStage: 'failed',
      generationStatus: 'failed',
      renderStatus: 'failed',
      generationProgress: 58,
      metrics: {
        sceneCount: 4,
        imageReadyCount: 1,
        imageFailedCount: 2,
        exportCount: 1,
        exportReadyCount: 0,
        exportFailedCount: 1,
        mediaJobQueuedCount: 0,
        mediaJobFailedCount: 1,
      },
      exports: [{ costCredits: 3 }],
      firstError: 'render failed',
      hasSourceAudio: true,
      hasProcessedAudio: true,
      hasRenderedVideo: false,
    },
  ]),
  {
    total: 3,
    completed: 1,
    processing: 1,
    failed: 1,
    needsAttention: 2,
    withSourceAudio: 3,
    withProcessedAudio: 2,
    withRenderedVideo: 1,
    consumedCredits: 8,
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

import assert from 'node:assert/strict';
import { assertSupportedMediaJobKind } from '../src/modules/lyric-videos/lyric/media-jobs';
import { buildAudioTrimJobInput, parseAudioTrimJobOutput, shouldQueueAudioTrimJob } from '../src/modules/lyric-videos/lyric/audio-trim-jobs';

const project = {
  id: 'project-1',
  audioUrl: 'https://cdn.example.com/uploads/song.mp3',
  audioStorageKey: 'uploads/song.mp3',
  originalAudioUrl: 'https://cdn.example.com/uploads/original-song.mp3',
  originalAudioStorageKey: 'uploads/original-song.mp3',
  audioDurationMs: 180_000,
  trimStartMs: 12_345,
  trimEndMs: 67_890,
};

assert.equal(assertSupportedMediaJobKind('audio_trim'), 'audio_trim');

const input = buildAudioTrimJobInput({ project });
assert.equal(input.sourceAudioStorageKey, 'uploads/original-song.mp3');
assert.equal(input.sourceAudioUrl, 'https://cdn.example.com/uploads/original-song.mp3');
assert.equal(input.trimStartMs, 12_345);
assert.equal(input.trimEndMs, 67_890);
assert.equal(input.clipDurationMs, 55_545);
assert.equal(shouldQueueAudioTrimJob(project), true);
assert.equal(shouldQueueAudioTrimJob({ ...project, trimStartMs: 0, trimEndMs: 180_000 }), false);
assert.equal(
  shouldQueueAudioTrimJob({
    ...project,
    audioUrl: project.originalAudioUrl,
    audioStorageKey: project.originalAudioStorageKey,
    processedAudioUrl: project.originalAudioUrl,
    processedAudioStorageKey: project.originalAudioStorageKey,
    trimStartMs: 0,
    trimEndMs: 13_000,
  }),
  true,
);

const output = parseAudioTrimJobOutput({
  processedAudioUrl: 'https://cdn.example.com/processed-audio/project-1.mp3',
  processedAudioStorageKey: 'processed-audio/project-1.mp3',
  originalAudioUrl: project.originalAudioUrl,
  originalAudioStorageKey: project.originalAudioStorageKey,
  audioDurationMs: 55_545,
  trimStartMs: 12_345,
  trimEndMs: 67_890,
});

assert.equal(output.processedAudioStorageKey, 'processed-audio/project-1.mp3');
assert.equal(output.audioUrl, 'https://cdn.example.com/processed-audio/project-1.mp3');

console.log('audio trim media job helpers ok');

import assert from 'node:assert/strict';
import {
  buildAudioUploadKey,
  extFromAudioMime,
} from '../src/modules/storage/audio-upload';

const key = buildAudioUploadKey({
  userId: 'user_123',
  digest: 'abc123',
  mimeType: 'audio/mpeg',
  uploadedAt: new Date('2026-06-09T12:34:56.000Z'),
});

assert.equal(key, 'uploads/audio/user_123/2026/06/abc123.mp3');
assert.equal(extFromAudioMime('audio/x-wav'), 'wav');
assert.equal(extFromAudioMime('audio/mp4'), 'm4a');
assert.equal(extFromAudioMime('', 'demo.flac'), 'flac');

console.log('upload audio storage key tests passed');

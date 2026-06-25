import assert from 'node:assert/strict';
import { resolveSelectedSceneImageUrlAfterCandidate } from '../src/modules/lyric-videos/lyric/media-generation';

assert.equal(
  resolveSelectedSceneImageUrlAfterCandidate({
    currentImageUrl: 'https://cdn.example.com/current.jpg',
    candidateImageUrl: 'https://cdn.example.com/new.jpg',
  }),
  'https://cdn.example.com/current.jpg',
  'new candidates must not overwrite an existing selected scene image',
);

assert.equal(
  resolveSelectedSceneImageUrlAfterCandidate({
    currentImageUrl: null,
    candidateImageUrl: 'https://cdn.example.com/first.jpg',
  }),
  'https://cdn.example.com/first.jpg',
  'the first generated candidate should become the selected scene image',
);

assert.equal(
  resolveSelectedSceneImageUrlAfterCandidate({
    currentImageUrl: '',
    candidateImageUrl: 'https://cdn.example.com/first.jpg',
  }),
  'https://cdn.example.com/first.jpg',
  'blank current image urls should be treated as missing',
);

console.log('scene image candidate selection checks passed');

import assert from 'node:assert/strict';
import {
  applySelectedSceneImageCandidate,
  getSceneImageCandidateDisplayList,
  getSceneImageCandidateViewerIndex,
  getVisibleSceneImageCandidates,
  moveSceneImageCandidateViewerIndex,
} from '../src/components/lyric-videos/preview-workbench/scene-image-candidates';

const candidates = Array.from({ length: 6 }, (_, index) => ({
  id: `candidate-${index + 1}`,
  sceneId: 'scene-1',
  imageUrl: `https://cdn.example.com/${index + 1}.jpg`,
  status: 'success',
  createdAt: `2026-06-25T00:0${index}:00.000Z`,
}));

assert.deepEqual(
  getVisibleSceneImageCandidates(candidates, 0).map((candidate) => candidate.id),
  ['candidate-6', 'candidate-5', 'candidate-4', 'candidate-3'],
  'candidate strip should default to the newest four images',
);

assert.deepEqual(
  getVisibleSceneImageCandidates(candidates, 1).map((candidate) => candidate.id),
  ['candidate-5', 'candidate-4', 'candidate-3', 'candidate-2'],
  'candidate strip should slide through older candidates',
);

assert.deepEqual(
  getVisibleSceneImageCandidates(candidates, 99).map((candidate) => candidate.id),
  ['candidate-4', 'candidate-3', 'candidate-2', 'candidate-1'],
  'candidate strip should clamp the window to available candidates',
);

console.log('scene image candidate strip checks passed');

const scene = {
  id: 'scene-1',
  startMs: 0,
  endMs: 1000,
  prompt: 'prompt',
  imageUrl: 'https://cdn.example.com/old.jpg',
  status: 'success',
  imageCandidates: candidates,
};

const selected = applySelectedSceneImageCandidate(scene, candidates[1]);
assert.equal(
  selected.imageUrl,
  candidates[1].imageUrl,
  'selecting a candidate should update the local scene image immediately',
);
assert.equal(
  scene.imageUrl,
  'https://cdn.example.com/old.jpg',
  'optimistic candidate selection should not mutate the original scene object',
);

console.log('scene image candidate optimistic selection checks passed');

const sceneWithCurrentImageOnly = {
  id: 'scene-current-only',
  startMs: 0,
  endMs: 1000,
  prompt: 'prompt',
  imageUrl: 'https://cdn.example.com/current-only.jpg',
  status: 'success',
  imageCandidates: [],
};

const currentOnlyCandidates = getSceneImageCandidateDisplayList(sceneWithCurrentImageOnly);
assert.equal(
  currentOnlyCandidates.length,
  1,
  'candidate strip should show the current image even before retry creates candidate history',
);
assert.equal(
  currentOnlyCandidates[0]?.imageUrl,
  sceneWithCurrentImageOnly.imageUrl,
  'the synthetic current image candidate should use the scene image URL',
);

console.log('scene image candidate current image fallback checks passed');

assert.equal(
  getSceneImageCandidateViewerIndex(candidates, 'https://cdn.example.com/3.jpg'),
  2,
  'image viewer should open on the matching candidate image',
);
assert.equal(
  getSceneImageCandidateViewerIndex(candidates, 'https://cdn.example.com/missing.jpg'),
  0,
  'image viewer should fall back to the first candidate when the image is missing',
);
assert.equal(
  moveSceneImageCandidateViewerIndex(candidates, 0, -1),
  candidates.length - 1,
  'image viewer should wrap to the last image when moving left from the first image',
);
assert.equal(
  moveSceneImageCandidateViewerIndex(candidates, candidates.length - 1, 1),
  0,
  'image viewer should wrap to the first image when moving right from the last image',
);

console.log('scene image candidate viewer navigation checks passed');

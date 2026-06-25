import assert from 'node:assert/strict';
import { getVisibleSceneImageCandidates } from '../src/components/lyric-videos/preview-workbench/scene-image-candidates';

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

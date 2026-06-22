import { strict as assert } from 'node:assert';
import { hasActiveSceneImageGeneration, hasActiveVisualGeneration } from '../src/modules/lyric-videos/lyric/media-generation';
import { deriveTimelineActionOverlayModel } from '../src/components/lyric-videos/preview-workbench/timeline-action-overlay';

assert.equal(
  hasActiveSceneImageGeneration([{ status: 'processing', imageUrl: null, providerTaskId: 'provider-task-1' }]),
  true,
  'processing scenes with a provider task should count as active'
);

assert.equal(
  hasActiveSceneImageGeneration([{ status: 'processing', imageUrl: null, providerTaskId: null }]),
  false,
  'placeholder processing scenes without provider task should not count as active'
);

assert.equal(
  hasActiveVisualGeneration({
    project: { generationStatus: 'waiting_provider', pipelineStage: 'images_processing' },
    scenes: [],
  }),
  true,
  'active project generation status should block duplicate visuals requests'
);

assert.equal(
  hasActiveVisualGeneration({
    project: { generationStatus: 'success', pipelineStage: 'images_ready', scenesStatus: 'ready' },
    scenes: [{ status: 'success', imageUrl: 'https://example.com/image.jpg', providerTaskId: null }],
  }),
  false,
  'ready visuals should not be treated as active'
);

const busyModel = deriveTimelineActionOverlayModel({
  visualGenerationBusy: true,
  generationSteps: [],
  project: { storyPrompt: 'A confirmed story.' } as any,
  runtimeState: null,
  saveStatus: 'saved',
  scenes: [],
  storyConfirmation: { status: 'confirmed' },
});
assert.equal(busyModel.visible, true);
assert.equal(busyModel.action, 'none');
assert.equal(busyModel.disabled, true);
assert.equal(busyModel.buttonLabel, 'Generating...');

const readyToGenerateModel = deriveTimelineActionOverlayModel({
  generationSteps: [],
  project: { storyPrompt: 'A confirmed story.' } as any,
  runtimeState: null,
  saveStatus: 'saved',
  scenes: [],
  storyConfirmation: { status: 'confirmed' },
});
assert.equal(readyToGenerateModel.visible, true);
assert.equal(readyToGenerateModel.action, 'generate');
assert.equal(readyToGenerateModel.buttonLabel, 'Generate Scenes');

console.log('scene generation idempotency checks passed');

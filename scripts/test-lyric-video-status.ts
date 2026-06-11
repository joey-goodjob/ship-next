import assert from 'node:assert/strict';
import {
  buildProjectGenerationSnapshot,
  deriveRuntimeState,
  isActiveGenerationRunStatus,
  isTerminalGenerationRunStatus,
} from '../src/modules/lyric-videos/lyric/status';

function baseProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project_1',
    activeRunId: null,
    generationStatus: 'idle',
    generationProgress: 0,
    pipelineStage: 'draft',
    pipelineError: null,
    lyricsStatus: 'empty',
    scenesStatus: 'empty',
    renderStatus: 'empty',
    ...overrides,
  };
}

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run_1',
    status: 'running',
    currentStage: 'song_analysis',
    progressPercent: 50,
    errorMessage: null,
    ...overrides,
  };
}

function step(overrides: Record<string, unknown> = {}) {
  return {
    id: 'step_1',
    stage: 'song_analysis',
    status: 'running',
    progressPercent: 50,
    errorMessage: null,
    ...overrides,
  };
}

function assertRuntimeState() {
  {
    const state = deriveRuntimeState({ project: baseProject() });
    assert.equal(state.generationStatus, 'idle');
    assert.equal(state.currentStage, 'draft');
    assert.equal(state.isGenerationActive, false);
    assert.equal(state.isGenerationLocked, false);
  }

  {
    const state = deriveRuntimeState({
      project: baseProject({ generationStatus: 'waiting_provider', generationProgress: 95, pipelineStage: 'images_processing' }),
      generationRun: run({ status: 'success', currentStage: 'finalize_project', progressPercent: 100 }),
    });
    assert.equal(state.generationStatus, 'success');
    assert.equal(state.currentStage, 'finalize_project');
    assert.equal(state.progressPercent, 100);
    assert.equal(state.isGenerationLocked, false);
  }

  {
    const state = deriveRuntimeState({
      project: baseProject({ generationStatus: 'success', generationProgress: 100, pipelineStage: 'images_ready' }),
      generationRun: run({ status: 'waiting_provider', currentStage: 'image_generation', progressPercent: 95 }),
    });
    assert.equal(state.generationStatus, 'waiting_provider');
    assert.equal(state.currentStage, 'image_generation');
    assert.equal(state.isGenerationActive, true);
    assert.equal(state.isGenerationLocked, true);
  }

  {
    const state = deriveRuntimeState({
      project: baseProject(),
      generationRun: run({ status: 'running', currentStage: 'song_analysis', errorMessage: null }),
      generationSteps: [step({ status: 'failed', errorMessage: 'Prompt1 failed' })],
    });
    assert.equal(state.error, 'Prompt1 failed');
  }

  {
    const state = deriveRuntimeState({
      project: baseProject({
        activeRunId: 'run_direction',
        generationStatus: 'success',
        generationProgress: 70,
        pipelineStage: 'direction_ready',
        scenesStatus: 'lyrics_draft',
      }),
      generationRun: run({
        id: 'run_direction',
        status: 'success',
        currentStage: 'direction_ready',
        progressPercent: 70,
      }),
      generationSteps: [
        step({ stage: 'asr_words', status: 'success', progressPercent: 100 }),
        step({ stage: 'song_analysis', status: 'success', progressPercent: 100 }),
        step({ stage: 'prompt_generation', status: 'pending', progressPercent: 0 }),
      ],
    });
    assert.equal(state.generationStatus, 'success');
    assert.equal(state.currentStage, 'direction_ready');
    assert.equal(state.progressPercent, 70);
    assert.equal(state.isGenerationActive, false);
    assert.equal(state.isGenerationLocked, false);
    assert.equal(state.scenesStatus, 'lyrics_draft');
  }

  {
    const state = deriveRuntimeState({
      project: baseProject({
        activeRunId: 'run_visuals',
        generationStatus: 'running',
        generationProgress: 75,
        pipelineStage: 'storyboard_generating',
      }),
      generationRun: run({
        id: 'run_visuals',
        status: 'running',
        currentStage: 'prompt_generation',
        progressPercent: 75,
      }),
      generationSteps: [
        step({ stage: 'prompt_generation', status: 'running', progressPercent: 75 }),
        step({ stage: 'image_generation', status: 'pending', progressPercent: 0 }),
      ],
    });
    assert.equal(state.generationStatus, 'running');
    assert.equal(state.currentStage, 'prompt_generation');
    assert.equal(state.isGenerationActive, true);
    assert.equal(state.isGenerationLocked, true);
  }

  {
    const state = deriveRuntimeState({
      project: baseProject({
        activeRunId: 'run_images',
        generationStatus: 'waiting_provider',
        generationProgress: 95,
        pipelineStage: 'images_processing',
        scenesStatus: 'processing',
      }),
      generationRun: run({
        id: 'run_images',
        status: 'waiting_provider',
        currentStage: 'image_generation',
        progressPercent: 95,
      }),
      generationSteps: [
        step({ stage: 'prompt_generation', status: 'success', progressPercent: 100 }),
        step({ stage: 'image_generation', status: 'waiting_provider', progressPercent: 95 }),
        step({ stage: 'finalize_project', status: 'pending', progressPercent: 0 }),
      ],
      scenes: [{ id: 'scene_1', status: 'processing', providerTaskId: 'provider_1', imageUrl: null }],
    });
    assert.equal(state.generationStatus, 'waiting_provider');
    assert.equal(state.currentStage, 'image_generation');
    assert.equal(state.isGenerationActive, true);
    assert.equal(state.isGenerationLocked, true);
    assert.deepEqual(state.sceneImageSummary, { total: 1, success: 0, processing: 1, failed: 0 });
  }

  {
    const state = deriveRuntimeState({
      project: baseProject({
        activeRunId: 'run_done',
        generationStatus: 'success',
        generationProgress: 100,
        pipelineStage: 'images_ready',
        scenesStatus: 'ready',
      }),
      generationRun: run({
        id: 'run_done',
        status: 'success',
        currentStage: 'finalize_project',
        progressPercent: 100,
      }),
      generationSteps: [
        step({ stage: 'prompt_generation', status: 'success', progressPercent: 100 }),
        step({ stage: 'image_generation', status: 'success', progressPercent: 100 }),
        step({ stage: 'finalize_project', status: 'success', progressPercent: 100 }),
      ],
      scenes: [{ id: 'scene_1', status: 'success', imageUrl: 'https://example.com/scene.png' }],
    });
    assert.equal(state.generationStatus, 'success');
    assert.equal(state.currentStage, 'finalize_project');
    assert.equal(state.progressPercent, 100);
    assert.equal(state.isGenerationActive, false);
    assert.equal(state.isGenerationLocked, false);
    assert.deepEqual(state.sceneImageSummary, { total: 1, success: 1, processing: 0, failed: 0 });
  }

  {
    const state = deriveRuntimeState({
      project: baseProject({ renderStatus: 'ready' }),
      scenes: [
        { id: 'scene_1', status: 'success', imageUrl: 'https://example.com/1.png' },
        { id: 'scene_2', status: 'processing', imageUrl: null },
        { id: 'scene_3', status: 'failed', imageUrl: null },
        { id: 'scene_4', status: 'failed', imageUrl: 'https://example.com/4.png' },
      ],
      exports: [{ id: 'export_1', status: 'success' }],
    });
    assert.deepEqual(state.sceneImageSummary, { total: 4, success: 2, processing: 1, failed: 1 });
    assert.equal(state.latestExportStatus, 'success');
  }
}

function assertSnapshots() {
  assert.equal(isActiveGenerationRunStatus('queued'), true);
  assert.equal(isActiveGenerationRunStatus('success'), false);
  assert.equal(isTerminalGenerationRunStatus('partial_success'), true);
  assert.equal(isTerminalGenerationRunStatus('waiting_provider'), false);

  assert.deepEqual(
    buildProjectGenerationSnapshot(run({ status: 'queued', currentStage: 'audio_prepare', progressPercent: 0 }), {
      activeRunId: 'run_1',
    }),
    {
      activeRunId: 'run_1',
      generationStatus: 'queued',
      generationProgress: 0,
      pipelineError: null,
      pipelineStage: 'generation_queued',
    }
  );

  assert.deepEqual(
    buildProjectGenerationSnapshot(run({ status: 'failed', currentStage: 'prompt_generation', errorMessage: 'Prompt2 failed' })),
    {
      generationStatus: 'failed',
      generationProgress: 50,
      pipelineError: 'Prompt2 failed',
      pipelineStage: 'prompt_generation_failed',
    }
  );

  assert.deepEqual(
    buildProjectGenerationSnapshot(run({ status: 'waiting_provider', currentStage: 'image_generation', progressPercent: 95 }), {
      pipelineStage: 'images_processing',
      pipelineError: null,
    }),
    {
      generationStatus: 'waiting_provider',
      generationProgress: 95,
      pipelineError: null,
      pipelineStage: 'images_processing',
    }
  );
}

assertRuntimeState();
assertSnapshots();

console.log('lyric-video status tests passed');

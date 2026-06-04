export const ACTIVE_GENERATION_RUN_STATUSES = ['queued', 'running', 'waiting_provider'] as const;
export const TERMINAL_GENERATION_RUN_STATUSES = ['success', 'partial_success', 'failed', 'canceled'] as const;

type RuntimeStateInput = {
  project: any;
  generationRun?: any | null;
  generationSteps?: any[];
  scenes?: any[];
  exports?: any[];
};

type ProjectSnapshotOptions = {
  status?: string;
  currentStage?: string | null;
  progressPercent?: number | null;
  pipelineStage?: string;
  pipelineError?: string | null;
  activeRunId?: string | null;
};

export function isActiveGenerationRunStatus(status?: string | null) {
  return ACTIVE_GENERATION_RUN_STATUSES.includes(status as (typeof ACTIVE_GENERATION_RUN_STATUSES)[number]);
}

export function isTerminalGenerationRunStatus(status?: string | null) {
  return TERMINAL_GENERATION_RUN_STATUSES.includes(status as (typeof TERMINAL_GENERATION_RUN_STATUSES)[number]);
}

function fallbackPipelineStageForRun(params: { status: string; currentStage?: string | null }) {
  if (params.status === 'queued') return 'generation_queued';
  if (params.status === 'waiting_provider') return 'images_processing';
  if (params.status === 'failed') return params.currentStage ? `${params.currentStage}_failed` : 'generation_failed';
  if (params.status === 'partial_success') return 'images_partial_success';
  if (params.status === 'success') return params.currentStage || 'generation_complete';
  return params.currentStage || 'generation_running';
}

export function buildProjectGenerationSnapshot(run: any, options: ProjectSnapshotOptions = {}) {
  const status = options.status || run?.status || 'idle';
  const currentStage = options.currentStage ?? run?.currentStage ?? null;
  const progressPercent = Number(options.progressPercent ?? run?.progressPercent ?? 0);
  const snapshot: Record<string, unknown> = {
    generationStatus: status,
    generationProgress: Number.isFinite(progressPercent) ? progressPercent : 0,
    pipelineStage: options.pipelineStage || fallbackPipelineStageForRun({ status, currentStage }),
  };

  if (options.pipelineError !== undefined) {
    snapshot.pipelineError = options.pipelineError;
  } else if (status === 'failed') {
    snapshot.pipelineError = run?.errorMessage || 'Generation failed';
  } else {
    snapshot.pipelineError = null;
  }

  if (options.activeRunId !== undefined) {
    snapshot.activeRunId = options.activeRunId;
  }

  return snapshot;
}

export function deriveRuntimeState(params: RuntimeStateInput) {
  const project = params.project || {};
  const generationRun = params.generationRun || null;
  const generationSteps = params.generationSteps || [];
  const scenes = params.scenes || [];
  const exports = params.exports || [];
  const currentStage = generationRun?.currentStage || project.pipelineStage || 'draft';
  const generationStatus = generationRun?.status || project.generationStatus || 'idle';
  const progressPercent = Number(generationRun?.progressPercent ?? project.generationProgress ?? 0);
  const currentStep = generationSteps.find((step: any) => step.stage === generationRun?.currentStage);
  const failedStep = generationSteps.find((step: any) => step.status === 'failed');
  const processingScenes = scenes.filter((scene: any) => scene.status === 'processing' && !scene.imageUrl).length;
  const successfulScenes = scenes.filter((scene: any) => scene.imageUrl || scene.status === 'success').length;
  const failedScenes = scenes.filter((scene: any) => scene.status === 'failed' && !scene.imageUrl).length;
  const latestExport = exports[0] || null;
  const isGenerationActive = Boolean(generationRun && isActiveGenerationRunStatus(generationStatus));

  return {
    generationStatus,
    currentStage,
    progressPercent: Number.isFinite(progressPercent) ? progressPercent : 0,
    error: generationRun?.errorMessage || currentStep?.errorMessage || failedStep?.errorMessage || project.pipelineError || '',
    isGenerationActive,
    isGenerationLocked: isGenerationActive,
    activeRunId: project.activeRunId || null,
    runId: generationRun?.id || null,
    lyricsStatus: project.lyricsStatus || 'empty',
    scenesStatus: project.scenesStatus || 'empty',
    renderStatus: project.renderStatus || 'empty',
    sceneImageSummary: {
      total: scenes.length,
      success: successfulScenes,
      processing: processingScenes,
      failed: failedScenes,
    },
    latestExportStatus: latestExport?.status || project.renderStatus || 'empty',
  };
}

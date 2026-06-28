export type SaveStatus = "idle" | "saving" | "saved" | "failed";
export type PanelTab = "customize" | "lyrics" | "font" | "cast" | "scenes" | "exports" | "diagnostics";
export type StoryReviewStatus = "idle" | "unconfirmed" | "dirty" | "confirmed";
export type StoryChangeSource = "manual_edit" | "ai_rewrite" | "ai_new_story" | null;

export type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

export type LyricPreviewConfig = {
  captionsEnabled?: boolean;
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  shadowColor?: string;
  position?: string;
  transition?: string;
};

export type LyricVideoProject = {
  id: string;
  title: string;
  status: string;
  audioUrl?: string | null;
  originalAudioUrl?: string | null;
  audioFilename?: string | null;
  audioDurationMs: number;
  trimStartMs?: number;
  trimEndMs?: number;
  processedAudioUrl?: string | null;
  pipelineStage: string;
  pipelineError?: string | null;
  activeRunId?: string | null;
  generationStatus?: string;
  generationProgress?: number;
  language: string;
  storyPrompt: string;
  palette: string;
  artStyle: string;
  customStyle: string;
  aspectRatio: string;
  resolution: string;
  lyricsStatus: string;
  scenesStatus: string;
  renderStatus: string;
  renderUrl?: string | null;
  previewConfig?: LyricPreviewConfig | string | null;
};

export type LyricLine = {
  id?: string;
  startMs: number;
  endMs: number;
  text: string;
  sort?: number;
  words?: LyricWord[];
};

export type LyricWord = {
  id: string;
  lineId?: string | null;
  word: string;
  startMs: number;
  endMs: number;
  sort?: number;
};

export type LyricScene = {
  id: string;
  startMs: number;
  endMs: number;
  text?: string;
  prompt: string;
  negativePrompt?: string | null;
  linkedLineIds?: string[];
  lyricLineIds?: string[];
  castIds?: string[];
  motionPrompt?: string | null;
  imageUrl?: string | null;
  imageTaskId?: string | null;
  providerTaskId?: string | null;
  videoUrl?: string | null;
  videoTaskId?: string | null;
  videoProviderTaskId?: string | null;
  videoStatus?: string | null;
  videoModel?: string | null;
  videoPromptSnapshot?: string | null;
  videoGenerationParams?: Record<string, unknown> | string | null;
  videoCompletedAt?: string | Date | null;
  videoError?: string | null;
  generationParams?: Record<string, unknown> | string | null;
  status: string;
  error?: string | null;
  sort?: number;
  imageCandidates?: LyricSceneImageCandidate[];
  videoCandidates?: LyricSceneVideoCandidate[];
};

export type LyricSceneImageCandidate = {
  id: string;
  sceneId: string;
  imageUrl: string;
  status: string;
  createdAt: string | Date;
  promptSnapshot?: string | null;
  imageModel?: string | null;
};

export type LyricSceneVideoCandidate = {
  id: string;
  sceneId: string;
  videoUrl: string;
  status: string;
  createdAt: string | Date;
  videoTaskId?: string | null;
  providerTaskId?: string | null;
  videoModel?: string | null;
  promptSnapshot?: string | null;
  sourceImageUrl?: string | null;
  generationParams?: Record<string, unknown> | string | null;
};

export type LyricScenePatch = {
  text?: string;
  prompt?: string;
  negativePrompt?: string | null;
  motionPrompt?: string | null;
  castIds?: string[];
};

export type GenerationRun = {
  id: string;
  status: string;
  currentStage?: string | null;
  progressPercent?: number | null;
  errorMessage?: string | null;
};

export type GenerationStep = {
  id: string;
  stage: string;
  status: string;
  progressPercent?: number | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  outputJson?: unknown;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  sort?: number | null;
};

export type RuntimeState = {
  generationStatus: string;
  currentStage: string;
  progressPercent: number;
  error?: string;
  isGenerationActive: boolean;
  isGenerationLocked: boolean;
  activeRunId?: string | null;
  runId?: string | null;
  lyricsStatus?: string;
  scenesStatus?: string;
  renderStatus?: string;
  sceneImageSummary?: {
    total: number;
    success: number;
    processing: number;
    failed: number;
  };
  latestExportStatus?: string;
};

export type LyricExport = {
  id: string;
  projectId?: string;
  status: string;
  videoUrl?: string | null;
  exportFingerprint?: string | null;
  error?: string | null;
  resolution: string;
  aspectRatio: string;
  createdAt?: string;
};

export type LyricCastMember = {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  role: string;
  description: string;
  promptFragment: string;
  referenceImageUrl?: string | null;
  imageTaskId?: string | null;
  providerTaskId?: string | null;
  imageModel?: string | null;
  imagePromptSnapshot?: string | null;
  generationParams?: string | Record<string, unknown> | null;
  completedAt?: string | null;
  failureCode?: string | null;
  error?: string | null;
  status: string;
  sort: number;
};

export type CreateCastMemberInput = {
  name: string;
  role?: string;
  description: string;
  promptFragment?: string;
  referenceImageUrl?: string | null;
  generationParams?: Record<string, unknown>;
  status?: string;
};

export type ProjectDetails = {
  project: LyricVideoProject;
  runtimeState?: RuntimeState;
  generationRun?: GenerationRun | null;
  generationSteps?: GenerationStep[];
  words?: LyricWord[];
  lines: LyricLine[];
  scenes: LyricScene[];
  cast?: LyricCastMember[];
  exports: LyricExport[];
};

export type UploadAudioResponse = {
  url: string;
  key: string;
  filename: string;
  size: number;
  deduped?: boolean;
};

export type StoryGenerationResponse = {
  storyPrompt: string;
  project: LyricVideoProject;
  taskId: string;
};

export type GenerationRunResponse = {
  run?: GenerationRun;
  steps?: GenerationStep[];
  project?: LyricVideoProject;
  lines?: LyricLine[];
  words?: LyricWord[];
  scenes?: LyricScene[];
  songAnalysis?: unknown;
  queued?: boolean;
};

export type VisualGenerationResponse = {
  project?: LyricVideoProject;
  scenes?: LyricScene[];
  queuedImages?: LyricScene[];
  storyPrompt?: string;
  generatedStoryboard?: boolean;
  alreadyRunning?: boolean;
};

export type RetryFailedBatchesResponse = {
  queuedScenes: LyricScene[];
  batches: Array<{
    batchKey: string;
    sceneIds: string[];
    queuedCount: number;
  }>;
  summary: {
    total: number;
    success: number;
    processing: number;
    failed: number;
    failedBatches: number;
    retryable: boolean;
  };
};

export type EditorContextValue = {
  projectId: string;
  appName: string;
  project: LyricVideoProject | null;
  generationRun: GenerationRun | null;
  generationSteps: GenerationStep[];
  lines: LyricLine[];
  words: LyricWord[];
  scenes: LyricScene[];
  cast: LyricCastMember[];
  exports: LyricExport[];
  latestExport?: LyricExport;
  currentExportFingerprint: string;
  runtimeState?: RuntimeState | null;
  loading: boolean;
  loadError: string;
  saveStatus: SaveStatus;
  activeTab: PanelTab;
  zoom: number;
  lyricsDirty: boolean;
  wordsDirty: boolean;
  exportError: string;
  exporting: boolean;
  preparingAudio: boolean;
  creatingStory: boolean;
  castBusy: boolean;
  visualGenerationBusy: boolean;
  generationLocked: boolean;
  generationLockReason: string;
  storyChangeSource: StoryChangeSource;
  storyReviewStatus: StoryReviewStatus;
  setActiveTab: (tab: PanelTab) => void;
  setZoom: (zoom: number) => void;
  confirmStoryPrompt: () => void;
  applyStoryPromptChanges: () => void;
  cancelStoryPromptChanges: () => void;
  editStoryPrompt: () => void;
  updateProjectField: <K extends keyof LyricVideoProject>(key: K, value: LyricVideoProject[K]) => void;
  setLines: (lines: LyricLine[]) => void;
  setWords: (words: LyricWord[]) => void;
  uploadAndTranscribe: (
    file: File,
    startTime: number,
    endTime: number,
    options: { useEntireAudio: boolean; durationSeconds: number },
  ) => Promise<void>;
  createStory: (feedback?: string) => Promise<void>;
  generateStoryboardPrompts: () => Promise<void>;
  createCastMember: (params: CreateCastMemberInput) => Promise<LyricCastMember | null>;
  updateCastMember: (castId: string, data: Partial<LyricCastMember> & { selectAsMain?: boolean }) => Promise<LyricCastMember | null>;
  deleteCastMember: (castId: string) => Promise<boolean>;
  updateScene: (sceneId: string, data: LyricScenePatch, options?: { allowDuringImageGeneration?: boolean; successMessage?: string | null; errorMessage?: string }) => Promise<LyricScene | null>;
  updateSceneCastIds: (sceneId: string, castIds: string[]) => Promise<LyricScene | null>;
  regenerateCastImage: (castId: string) => Promise<LyricCastMember | null>;
  syncCastImages: () => Promise<void>;
  generateSceneVideoPrompts: (sceneIds?: string[]) => Promise<LyricScene[]>;
  queueSceneImages: (sceneIds: string[]) => Promise<LyricScene[]>;
  queueSceneVideos: (sceneIds: string[]) => Promise<LyricScene[]>;
  retrySceneImage: (sceneId: string, options?: { allowDuringImageGeneration?: boolean }) => Promise<LyricScene | null>;
  selectSceneImageCandidate: (sceneId: string, candidate: LyricSceneImageCandidate) => Promise<LyricScene | null>;
  selectSceneVideoCandidate: (sceneId: string, candidate: LyricSceneVideoCandidate) => Promise<LyricScene | null>;
  syncSceneImages: () => Promise<void>;
  syncSceneVideos: () => Promise<void>;
  retryFailedImageBatches: () => Promise<void>;
  saveLyrics: () => Promise<boolean>;
  queueExport: () => Promise<void>;
  refresh: () => Promise<void>;
};

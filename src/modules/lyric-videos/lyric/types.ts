export const LYRIC_VIDEO_DEFAULT_STYLE = {
  fontFamily: 'Inter',
  fontSize: 56,
  textColor: '#ffffff',
  shadowColor: '#000000',
  position: 'bottom',
  transition: 'fade',
};

export type StoryboardScene = {
  startMs: number;
  endMs: number;
  text?: string;
  prompt: string;
  negativePrompt?: string;
  linkedLineIds?: string[];
  castIds?: string[];
  styleOverrides?: unknown;
  timelineConfig?: unknown;
  motionPrompt?: string;
  imageUrl?: string;
};

export type AsrDraftResult = {
  raw: any;
  rawText: string;
  rawSegments: LyricLineInput[];
  words: LyricWordInput[];
};

export type AudioAnalysisSegment = {
  startMs: number;
  endMs: number;
  durationMs: number;
  avgEnergy: number;
};

export type AudioAnalysisRmsPoint = {
  startMs: number;
  endMs: number;
  rms: number;
};

export type AudioAnalysisResult = {
  durationSec: number;
  sampleRate: number;
  bpm: number;
  key: string;
  beatTimesMs: number[];
  segmentBoundariesMs: number[];
  rmsBySecond?: AudioAnalysisRmsPoint[];
  segments: AudioAnalysisSegment[];
};

export type PreprocessLyricLine = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  wordStartIndex?: number;
  wordEndIndex?: number;
};

export type PreprocessEnergySegment = AudioAnalysisSegment & {
  energyLevel: 'low' | 'medium' | 'high';
};

export type PreprocessScene = {
  sceneId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  linkedLineIds: string[];
  lyricsText: string;
  avgEnergy: number;
  energyLevel: 'low' | 'medium' | 'high';
  beatCount: number;
  cutReason: 'vocal_gap' | 'target_duration' | 'max_duration' | 'final';
};

export type LyricVideoPreprocessResult = {
  track: {
    durationMs: number;
    bpm?: number;
    key?: string;
  };
  lyrics: PreprocessLyricLine[];
  vocalGaps: Array<{
    startMs: number;
    endMs: number;
    durationMs: number;
    fromLineId: string;
    toLineId: string;
  }>;
  energySegments: PreprocessEnergySegment[];
  scenes: PreprocessScene[];
};

export type LyricVideoLlmPreprocessResult = {
  song: string;
  duration_s: number;
  bpm?: number;
  key?: string;
  lines: Array<{
    start_s: number;
    end_s: number;
    text: string;
  }>;
  energy_per_second: number[];
};

export type LyricVideoSongAnalysisResult = {
  theme: string;
  characters: Array<{
    id: string;
    description: string;
  }>;
  key_props: Array<{
    id: string;
    description: string;
    symbolic_meaning: string;
    state_progression: string;
    appears_in_sections: string[];
  }>;
  narrative_arc: Array<{
    time_range: string;
    section_label: string;
    plot_beat: string;
    visual_anchor: string;
  }>;
  location_plan: Array<{
    time_range: string;
    location: string;
    lighting: string;
    color_tone: string;
    spatial_feel: string;
  }>;
  emotion_arc: Array<{
    time_range: string;
    emotion: string;
    intensity: number;
  }>;
  visual_style: string;
  color_palette: string[];
  notes: string;
};

export type LyricVideoPromptSceneResult = {
  scene_id: number | string;
  start_s: number;
  end_s: number;
  lyrics_summary: string;
  image_prompt: string;
  video_prompt: string;
  kind?: 'lyric' | 'instrumental';
  timeline_config?: unknown;
};

export type DebugSongAnalysisProvider = 'kie_claude' | 'kie_codex' | 'kie_gemini';

export type DebugImageSceneInput = Partial<LyricVideoPromptSceneResult> & {
  id?: number | string;
  prompt?: string;
};

export const GENERATION_STAGES = [
  'audio_prepare',
  'asr_words',
  'song_analysis',
  'prompt_generation',
  'finalize_project',
] as const;

export const ACTIVE_RUN_STATUSES = ['queued', 'running', 'waiting_provider'] as const;
export const DEFAULT_TRANSCRIBE_MODEL = 'whisper-large-v3';
export const DEFAULT_SONG_ANALYSIS_MODEL = 'claude-opus-4-5';
export const DEFAULT_STORYBOARD_MODEL = 'claude-opus-4-5';
export const DEFAULT_MAX_STORYBOARD_SCENES = 16;
export const INSTRUMENTAL_GAP_MS = 1000;
export const ASR_LONG_SEGMENT_MS = 8000;
export const ASR_TARGET_LINE_MS = 6000;
export const ASR_WORD_GAP_CUT_MS = 700;
export const ASR_MAX_WORDS_PER_LINE = 10;

export type GenerationStage = (typeof GENERATION_STAGES)[number];

export type StoryboardShotType = 'character_shot' | 'insert_shot' | 'landscape_shot';

export type FixedStoryboardSceneDraft = {
  dbId?: string;
  sceneId: string;
  kind: 'lyric' | 'instrumental';
  shotType: StoryboardShotType;
  startMs: number;
  endMs: number;
  text: string;
  linkedLineIds: string[];
  energyLevel: 'low' | 'medium' | 'high';
  avgEnergy: number;
  beatCount: number;
  bpm?: number;
  key?: string;
  prevLyric?: string;
  nextLyric?: string;
};

export type LyricLineInput = {
  id?: string;
  startMs?: number;
  endMs?: number;
  text: string;
  source?: string;
  wordStartIndex?: number;
  wordEndIndex?: number;
  confidence?: number;
};

export type LyricWordInput = {
  word: string;
  startMs?: number;
  endMs?: number;
  confidence?: number;
  timingRepaired?: boolean;
};

export type SceneInput = {
  id?: string;
  startMs?: number;
  endMs?: number;
  text?: string;
  prompt: string;
  negativePrompt?: string;
  linkedLineIds?: string[];
  castIds?: string[];
  styleOverrides?: unknown;
  timelineConfig?: unknown;
  motionPrompt?: string;
  imageUrl?: string;
  status?: string;
};

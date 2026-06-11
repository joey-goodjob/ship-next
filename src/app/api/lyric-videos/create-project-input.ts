export type LyricVideoCreateProjectInput = {
  title?: string;
  audioUrl?: string;
  audioStorageKey?: string;
  originalAudioUrl?: string;
  originalAudioStorageKey?: string;
  audioFilename?: string;
  audioDurationMs?: number;
  audioMimeType?: string;
  audioSizeBytes?: number;
  audioChecksum?: string;
  trimStartMs?: number;
  trimEndMs?: number;
  processedAudioUrl?: string;
  processedAudioStorageKey?: string;
  language?: string;
  storyPrompt?: string;
  palette?: string;
  artStyle?: string;
  aspectRatio?: string;
  resolution?: string;
};

const CREATE_PROJECT_INPUT_KEYS = [
  'title',
  'audioUrl',
  'audioStorageKey',
  'originalAudioUrl',
  'originalAudioStorageKey',
  'audioFilename',
  'audioDurationMs',
  'audioMimeType',
  'audioSizeBytes',
  'audioChecksum',
  'trimStartMs',
  'trimEndMs',
  'processedAudioUrl',
  'processedAudioStorageKey',
  'language',
  'storyPrompt',
  'palette',
  'artStyle',
  'aspectRatio',
  'resolution',
] as const satisfies readonly (keyof LyricVideoCreateProjectInput)[];

export function pickLyricVideoCreateProjectInput(body: unknown): LyricVideoCreateProjectInput {
  if (!body || typeof body !== 'object') return {};

  const input = body as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of CREATE_PROJECT_INPUT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined) {
      picked[key] = input[key];
    }
  }

  return picked as LyricVideoCreateProjectInput;
}

export type LyricVideoExportFingerprintInput = {
  project?: Record<string, any> | null;
  lines?: Array<Record<string, any>>;
  words?: Array<Record<string, any>>;
  scenes?: Array<Record<string, any>>;
};

function parseJson(value: unknown, fallback: unknown) {
  if (typeof value !== 'string') return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cleanText(value: unknown) {
  return String(value || '').trim();
}

function numericValue(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = stableValue((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

function stableStringify(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function hashString(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return `ef_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function normalizedProject(project: Record<string, any> = {}) {
  return {
    title: cleanText(project.title),
    aspectRatio: cleanText(project.aspectRatio || '16:9'),
    resolution: cleanText(project.resolution || '1080p'),
    previewConfig: stableValue(parseJson(project.previewConfig, {})),
    audioUrl: cleanText(project.processedAudioUrl || project.audioUrl || project.originalAudioUrl),
    audioDurationMs: numericValue(project.audioDurationMs),
    trimStartMs: numericValue(project.trimStartMs),
    trimEndMs: numericValue(project.trimEndMs),
  };
}

function normalizedLines(lines: Array<Record<string, any>> = []) {
  return lines
    .map((line) => ({
      sort: numericValue(line.sort),
      startMs: numericValue(line.startMs),
      endMs: numericValue(line.endMs),
      text: cleanText(line.text),
    }))
    .sort((a, b) => a.sort - b.sort || a.startMs - b.startMs || a.text.localeCompare(b.text));
}

function normalizedWords(words: Array<Record<string, any>> = []) {
  return words
    .map((word) => ({
      sort: numericValue(word.sort),
      startMs: numericValue(word.startMs),
      endMs: numericValue(word.endMs),
      word: cleanText(word.word),
    }))
    .sort((a, b) => a.sort - b.sort || a.startMs - b.startMs || a.word.localeCompare(b.word));
}

function normalizedScenes(scenes: Array<Record<string, any>> = []) {
  return scenes
    .map((scene) => ({
      sort: numericValue(scene.sort),
      startMs: numericValue(scene.startMs),
      endMs: numericValue(scene.endMs),
      prompt: cleanText(scene.prompt),
      imageUrl: cleanText(scene.imageUrl),
      videoUrl: cleanText(scene.videoUrl),
      videoCompletedAt: scene.videoCompletedAt ? new Date(scene.videoCompletedAt).toISOString() : '',
    }))
    .sort((a, b) => a.sort - b.sort || a.startMs - b.startMs || a.prompt.localeCompare(b.prompt));
}

export function buildLyricVideoExportFingerprint(input: LyricVideoExportFingerprintInput) {
  const payload = {
    version: 1,
    project: normalizedProject(input.project || {}),
    lines: normalizedLines(input.lines || []),
    words: normalizedWords(input.words || []),
    scenes: normalizedScenes(input.scenes || []),
  };
  return hashString(stableStringify(payload));
}

export function extractExportFingerprintFromSettings(settings: unknown) {
  const parsed = parseJson(settings, {});
  if (!parsed || typeof parsed !== 'object') return '';
  return cleanText((parsed as Record<string, unknown>).exportFingerprint);
}

export function withExportFreshnessSettings(params: {
  settings?: unknown;
  fingerprint: string;
  exportedAt?: string;
}): Record<string, unknown> & { exportFingerprint: string; exportedAt: string } {
  const base =
    params.settings && typeof params.settings === 'object' && !Array.isArray(params.settings)
      ? { ...(params.settings as Record<string, unknown>) }
      : parseJson(params.settings, {});
  return {
    ...(base && typeof base === 'object' && !Array.isArray(base) ? (base as Record<string, unknown>) : {}),
    exportFingerprint: params.fingerprint,
    exportedAt: params.exportedAt || new Date().toISOString(),
  };
}

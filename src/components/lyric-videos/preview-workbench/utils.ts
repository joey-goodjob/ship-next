import type {
  GenerationRun,
  GenerationStep,
  ApiResponse,
  LyricLine,
  LyricPreviewConfig,
  LyricScene,
  LyricVideoProject,
  LyricWord,
  ProjectDetails,
  RuntimeState,
} from "./types";
import { DEFAULT_CAPTION_FONT_SIZE, LYRIC_FRAME_RATE, MAX_CAPTION_FONT_SIZE, MIN_CAPTION_FONT_SIZE } from "./constants";

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function normalizePreviewConfig(config?: LyricVideoProject["previewConfig"]): LyricPreviewConfig {
  let rawConfig: unknown = config;
  if (typeof config === "string") {
    try {
      rawConfig = JSON.parse(config);
    } catch {
      rawConfig = {};
    }
  }
  const raw = rawConfig && typeof rawConfig === "object" ? (rawConfig as LyricPreviewConfig) : {};
  const numericFontSize = Number(raw.fontSize);
  const fontSize = Number.isFinite(numericFontSize) ? numericFontSize : DEFAULT_CAPTION_FONT_SIZE;
  return {
    captionsEnabled: raw.captionsEnabled !== false,
    fontFamily: raw.fontFamily || "Inter",
    fontSize: Math.round(clamp(fontSize, MIN_CAPTION_FONT_SIZE, MAX_CAPTION_FONT_SIZE)),
    textColor: raw.textColor || "#ffffff",
    shadowColor: raw.shadowColor || "#000000",
    position: raw.position || "bottom",
    transition: raw.transition || "fade",
  };
}

export function msToSeconds(ms?: number | null) {
  return Math.max(0, (ms || 0) / 1000);
}

export function secondsToMs(seconds: number) {
  return Math.max(0, Math.round(seconds * 1000));
}

export function msToFrame(ms?: number | null) {
  return Math.max(0, Math.round((ms || 0) / (1000 / LYRIC_FRAME_RATE)));
}

export function frameToMs(frame: number) {
  return Math.max(0, Math.round(frame * (1000 / LYRIC_FRAME_RATE)));
}

export function formatClock(seconds: number, withCentiseconds = false) {
  const safe = Math.max(0, seconds);
  const totalSeconds = Math.floor(safe);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const base = `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  if (!withCentiseconds) return base;
  const centiseconds = Math.floor((safe - totalSeconds) * 100);
  return `${base}.${centiseconds.toString().padStart(2, "0")}`;
}

export function formatMs(ms: number) {
  return formatClock(msToSeconds(ms), true);
}

export function formatDurationMs(ms: number) {
  return `${Math.max(0, ms / 1000).toFixed(2)}s`;
}

export function getAspectRatio(aspectRatio?: string) {
  if (aspectRatio === "9:16") return "9 / 16";
  if (aspectRatio === "1:1") return "1 / 1";
  return "16 / 9";
}

export function projectIsProcessing(project: LyricVideoProject | null, runtimeState?: RuntimeState | null) {
  if (!project) return false;
  const activeStatuses = ["processing", "asr_processing", "normalizing"];
  return (
    Boolean(runtimeState?.isGenerationActive) ||
    ["queued", "running", "waiting_provider"].includes(project.generationStatus || "") ||
    [project.lyricsStatus, project.scenesStatus, project.renderStatus].some((status) => activeStatuses.includes(status || ""))
  );
}

const ACTIVE_GENERATION_STATUSES = ["queued", "running", "waiting_provider"];

export const GENERATION_LOCK_REASON =
  "Generation is running. Editing unlocks after image generation finishes.";

export function isGenerationLocked(project: LyricVideoProject | null, generationRun: GenerationRun | null, runtimeState?: RuntimeState | null) {
  return (
    Boolean(runtimeState?.isGenerationLocked) ||
    ACTIVE_GENERATION_STATUSES.includes(generationRun?.status || "") ||
    ACTIVE_GENERATION_STATUSES.includes(project?.generationStatus || "")
  );
}

export function sceneHasImage(scene: LyricScene) {
  return Boolean(scene.imageUrl || scene.status === "success");
}

export function sceneGridParams(scene: LyricScene) {
  if (!scene.generationParams) return null;
  let params = typeof scene.generationParams === "string" ? null : scene.generationParams;
  if (!params && typeof scene.generationParams === "string") {
    try {
      params = JSON.parse(scene.generationParams) as Record<string, unknown>;
    } catch {
      params = null;
    }
  }
  if (params?.mode !== "grid_4x4" || !params.grid || typeof params.grid !== "object") return null;
  return params.grid as Record<string, unknown>;
}

export function sceneBatchKey(scene: LyricScene) {
  const grid = sceneGridParams(scene);
  const providerTaskId = String(grid?.providerTaskId || scene.providerTaskId || "").trim();
  if (providerTaskId) return `provider:${providerTaskId}`;
  const imageTaskId = String(grid?.imageTaskId || scene.imageTaskId || "").trim();
  if (imageTaskId) return `task:${imageTaskId}`;
  return "";
}

export function failedImageBatchCount(scenes: LyricScene[]) {
  const failed = scenes
    .filter((scene) => scene.status === "failed" && !scene.imageUrl)
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const keys = new Set<string>();
  let fallbackGroups = 0;
  let previousSort: number | null = null;
  for (const scene of failed) {
    const key = sceneBatchKey(scene);
    if (key) {
      keys.add(key);
      previousSort = null;
      continue;
    }
    const sort = scene.sort || 0;
    if (previousSort === null || sort !== previousSort + 1) fallbackGroups += 1;
    previousSort = sort;
  }
  return keys.size + fallbackGroups;
}

export function stepByStage(steps: GenerationStep[], stage: string) {
  return steps.find((step) => step.stage === stage);
}

export function stageLabel(stage?: string | null) {
  if (stage === "audio_prepare") return "Preparing audio";
  if (stage === "asr_words") return "Recognizing lyrics";
  if (stage === "song_analysis") return "Prompt1 song analysis";
  if (stage === "prompt_generation") return "Prompt2 storyboard prompts";
  if (stage === "image_generation") return "Image generation";
  if (stage === "finalize_project") return "Finalizing project";
  return "Generation";
}

export function deriveGenerationProgress(params: {
  project: LyricVideoProject | null;
  generationRun: GenerationRun | null;
  generationSteps: GenerationStep[];
  runtimeState?: RuntimeState | null;
  scenes: LyricScene[];
}) {
  const { generationRun, generationSteps, project, runtimeState, scenes } = params;
  const total = scenes.length;
  const success = scenes.filter(sceneHasImage).length;
  const processing = scenes.filter((scene) => scene.status === "processing" && !scene.imageUrl).length;
  const failed = scenes.filter((scene) => scene.status === "failed" && !scene.imageUrl).length;
  const failedBatches = failedImageBatchCount(scenes);
  const songAnalysisStep = stepByStage(generationSteps, "song_analysis");
  const promptStep = stepByStage(generationSteps, "prompt_generation");
  const imageStep = stepByStage(generationSteps, "image_generation");
  const currentStage = runtimeState?.currentStage || generationRun?.currentStage || project?.pipelineStage;
  const generationStatus = runtimeState?.generationStatus || generationRun?.status || project?.generationStatus || "idle";
  const retryable = failed > 0 && processing === 0;
  const isActive = Boolean(runtimeState?.isGenerationActive) || ["queued", "running", "waiting_provider"].includes(generationStatus || "") || processing > 0;
  const progressPercent = Math.max(
    Number(runtimeState?.progressPercent || 0),
    Number(project?.generationProgress || 0),
    Number(generationRun?.progressPercent || 0),
    Number(imageStep?.progressPercent || 0),
  );
  const imageText =
    total > 0
      ? `Images ${success}/${total}${processing ? `, processing ${processing}` : ""}${failed ? `, failed ${failed}` : ""}`
      : "Images not queued yet";
  const primary =
    failed > 0 && processing === 0
      ? `Image generation partial ${success}/${total}, failed ${failed}, retry available`
      : total > 0 && (processing > 0 || generationStatus === "waiting_provider")
        ? `Image generation ${success}/${total}${failed ? `, failed ${failed}` : ""}`
        : stageLabel(currentStage);

  return {
    primary,
    imageText,
    total,
    success,
    processing,
    failed,
    failedBatches,
    retryable,
    isActive,
    progressPercent,
    generationStatus,
    currentStage: stageLabel(currentStage),
    songAnalysisStatus: songAnalysisStep?.status || "pending",
    promptStatus: promptStep?.status || "pending",
    imageStatus: imageStep?.status || (total > 0 ? "pending" : "empty"),
    error: runtimeState?.error || generationRun?.errorMessage || songAnalysisStep?.errorMessage || promptStep?.errorMessage || imageStep?.errorMessage || project?.pipelineError || "",
  };
}

export async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok || body.code !== 0) {
    throw new Error(body.message || "Request failed");
  }
  return body.data as T;
}

export function readStoredNumber(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  const stored = Number(raw);
  return Number.isFinite(stored) ? stored : fallback;
}

export function defaultSidePanelWidth() {
  if (typeof window === "undefined") return 640;
  return clamp(window.innerWidth * 0.39, 520, 760);
}

export function sortWords(words: LyricWord[]) {
  return [...words].sort((a, b) => (a.startMs || 0) - (b.startMs || 0) || (a.sort || 0) - (b.sort || 0));
}

export function wordId(index: number) {
  return `draft-word-${Date.now()}-${index}`;
}

export function createWordsFromLines(lines: LyricLine[]) {
  return lines.flatMap((line, lineIndex) => {
    const tokens = line.text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    const startMs = Math.max(0, line.startMs || 0);
    const endMs = Math.max(startMs + 1, line.endMs || startMs + 3500);
    const stepMs = Math.max(1, Math.round((endMs - startMs) / tokens.length));

    return tokens.map((token, tokenIndex) => ({
      id: `line-${line.id || lineIndex}-word-${tokenIndex}`,
      lineId: line.id,
      word: token,
      startMs: startMs + tokenIndex * stepMs,
      endMs: tokenIndex === tokens.length - 1 ? endMs : Math.min(endMs, startMs + (tokenIndex + 1) * stepMs),
      sort: tokenIndex,
    }));
  });
}

export function wordsFromDetails(details: ProjectDetails) {
  if (details.words?.length) return sortWords(details.words);

  const lineWords = details.lines.flatMap((line) => line.words || []);
  if (lineWords.length) return sortWords(lineWords);

  return createWordsFromLines(details.lines);
}

export function wordBelongsToLine(word: LyricWord, line: LyricLine) {
  if (word.lineId && line.id) return word.lineId === line.id;
  const wordStart = word.startMs || 0;
  const wordEnd = word.endMs || wordStart;
  return (wordStart >= line.startMs && wordStart < line.endMs) || (wordEnd > line.startMs && wordEnd <= line.endMs);
}

export function deriveLinesFromWords(lines: LyricLine[], words: LyricWord[]) {
  const sorted = sortWords(words);
  return lines.map((line) => {
    const lineWords = sorted.filter((word) => wordBelongsToLine(word, line) && word.word.trim());
    if (lineWords.length === 0) return line;
    return {
      ...line,
      text: lineWords.map((word) => word.word.trim()).join(" "),
      startMs: Math.min(...lineWords.map((word) => word.startMs)),
      endMs: Math.max(...lineWords.map((word) => word.endMs)),
      words: lineWords,
    };
  });
}

export function normalizeWordsForSave(words: LyricWord[], totalDuration: number) {
  const maxMs = Math.max(0, secondsToMs(totalDuration));
  return sortWords(words)
    .map((word, index) => {
      const text = word.word.trim();
      const frameStart = msToFrame(word.startMs);
      const maxFrame = maxMs > 0 ? msToFrame(maxMs) : Number.MAX_SAFE_INTEGER;
      const startFrame = clamp(frameStart, 0, maxFrame);
      const endFrame = clamp(Math.max(startFrame + 1, msToFrame(word.endMs)), startFrame + 1, Math.max(startFrame + 1, maxFrame));
      return {
        id: word.id,
        lineId: word.lineId,
        word: text,
        startMs: frameToMs(startFrame),
        endMs: frameToMs(endFrame),
        sort: index,
      };
    })
    .filter((word) => word.word);
}

export function wordOverlapsRange(word: LyricWord, startMs: number, endMs: number) {
  return (word.endMs || word.startMs) > startMs && word.startMs < endMs;
}

export function lineOverlapsRange(line: LyricLine, startMs: number, endMs: number) {
  return line.endMs > startMs && line.startMs < endMs;
}

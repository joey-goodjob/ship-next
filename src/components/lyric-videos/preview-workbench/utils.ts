import type { CSSProperties } from "react";
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
import {
  CAPTION_BLEND_MODE_OPTIONS,
  CAPTION_EFFECT_OPTIONS,
  CAPTION_FONT_OPTIONS,
  CAPTION_STYLE_OPTIONS,
  DEFAULT_CAPTION_FONT_SIZE,
  LYRIC_FRAME_RATE,
  MAX_CAPTION_FONT_SIZE,
  MIN_CAPTION_FONT_SIZE,
} from "./constants";

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function numericConfigValue(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  return Math.round(clamp(Number.isFinite(numeric) ? numeric : fallback, min, max));
}

function captionJustifyClass(alignment?: string) {
  if (alignment === "left") return "justify-start";
  if (alignment === "right") return "justify-end";
  return "justify-center";
}

function captionContainerClassName({
  alignment,
  bottomClass,
  centerClass,
  insetClass,
  position,
  topClass,
}: {
  alignment?: string;
  bottomClass: string;
  centerClass: string;
  insetClass: string;
  position?: string;
  topClass: string;
}) {
  const justifyClass = captionJustifyClass(alignment);
  if (position === "top") return `absolute ${insetClass} ${topClass} flex items-start ${justifyClass}`;
  if (position === "center") return `absolute ${insetClass} ${centerClass} flex items-center ${justifyClass}`;
  return `absolute ${insetClass} ${bottomClass} flex items-end ${justifyClass}`;
}

export function applyCaptionFontCase(text: string, fontCase?: string) {
  if (fontCase === "uppercase") return text.toUpperCase();
  if (fontCase === "lowercase") return text.toLowerCase();
  if (fontCase === "capitalize") {
    return text
      .toLowerCase()
      .replace(/\p{L}[\p{L}\p{M}'-]*/gu, (word) => word.charAt(0).toUpperCase() + word.slice(1));
  }
  return text;
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
  const captionStyle = CAPTION_STYLE_OPTIONS.some((option) => option.value === raw.captionStyle) ? raw.captionStyle : "classic";
  const fontFamily = CAPTION_FONT_OPTIONS.some((option) => option.value === raw.fontFamily) ? raw.fontFamily : "Inter";
  const effect = CAPTION_EFFECT_OPTIONS.some((option) => option.value === raw.effect)
    ? raw.effect
    : CAPTION_EFFECT_OPTIONS.some((option) => option.value === raw.transition)
      ? raw.transition
      : "fade";
  const blendMode = CAPTION_BLEND_MODE_OPTIONS.some((option) => option.value === raw.blendMode) ? raw.blendMode : "normal";
  const position = ["top", "center", "bottom"].includes(raw.position || "") ? raw.position : "bottom";
  const alignment = ["left", "center", "right"].includes(raw.alignment || "") ? raw.alignment : "center";
  const fontCase = ["none", "capitalize", "uppercase", "lowercase"].includes(raw.fontCase || "") ? raw.fontCase : "none";
  return {
    captionsEnabled: raw.captionsEnabled !== false,
    captionStyle,
    showWholeVerse: Boolean(raw.showWholeVerse),
    wordsPerGroup: numericConfigValue(raw.wordsPerGroup, 3, 1, 8),
    fontFamily,
    fontSize: Math.round(clamp(fontSize, MIN_CAPTION_FONT_SIZE, MAX_CAPTION_FONT_SIZE)),
    fontWeight: numericConfigValue(raw.fontWeight, 850, 400, 950),
    italic: Boolean(raw.italic),
    underline: Boolean(raw.underline),
    textColor: raw.textColor || "#ffffff",
    letterSpacing: numericConfigValue(raw.letterSpacing, 0, -4, 12),
    lineSpacing: numericConfigValue(raw.lineSpacing, 0, -10, 24),
    fontCase,
    alignment,
    rotation: numericConfigValue(raw.rotation, 0, -45, 45),
    strokeColor: raw.strokeColor || "#000000",
    strokeWidth: numericConfigValue(raw.strokeWidth, 0, 0, 12),
    shadowColor: raw.shadowColor || "#000000",
    shadowEnabled: raw.shadowEnabled !== false,
    shadowOffsetX: numericConfigValue(raw.shadowOffsetX, 2, -24, 24),
    shadowOffsetY: numericConfigValue(raw.shadowOffsetY, 2, -24, 24),
    shadowBlur: numericConfigValue(raw.shadowBlur, 8, 0, 40),
    shadowOpacity: numericConfigValue(raw.shadowOpacity, 80, 0, 100),
    blendMode,
    opacity: numericConfigValue(raw.opacity, 100, 0, 100),
    position,
    transition: effect,
    effect,
  };
}

export function getPreviewCaptionStyle(config: LyricPreviewConfig) {
  const fontSize = config.fontSize || DEFAULT_CAPTION_FONT_SIZE;
  const effectClass = config.effect === "none" ? "" : `lyric-caption-motion-${config.effect || "fade"}`;
  const shadowOpacity = clamp((config.shadowOpacity ?? 80) / 100, 0, 1);
  const textShadow = config.shadowEnabled
    ? `${config.shadowOffsetX || 0}px ${config.shadowOffsetY || 0}px ${config.shadowBlur || 0}px color-mix(in srgb, ${config.shadowColor || "#000000"} ${Math.round(
        shadowOpacity * 100,
      )}%, transparent)`
    : "none";
  const baseTextStyle: CSSProperties = {
    fontFamily: config.fontFamily,
    color: config.textColor,
    fontWeight: config.fontWeight,
    fontStyle: config.italic ? "italic" : "normal",
    textDecoration: config.underline ? "underline" : "none",
    letterSpacing: `${config.letterSpacing || 0}px`,
    lineHeight: `${1.12 + (config.lineSpacing || 0) / 100}`,
    textAlign: config.alignment as CSSProperties["textAlign"],
    textTransform: config.fontCase === "uppercase" ? "uppercase" : config.fontCase === "lowercase" ? "lowercase" : "none",
    textShadow,
    WebkitTextStroke: `${config.strokeWidth || 0}px ${config.strokeColor || "#000000"}`,
    paintOrder: "stroke fill",
    mixBlendMode: (config.blendMode === "normal" ? "normal" : config.blendMode) as CSSProperties["mixBlendMode"],
    opacity: clamp((config.opacity ?? 100) / 100, 0, 1),
    transform: `rotate(${config.rotation || 0}deg)`,
  };
  const sizedTextStyle = (vw: string) => ({
    ...baseTextStyle,
    fontSize: `clamp(${Math.max(18, Math.round(fontSize * 0.72))}px, ${vw}, ${fontSize}px)`,
  });

  if (config.captionStyle === "cinematic") {
    return {
      containerClassName: captionContainerClassName({
        alignment: config.alignment,
        bottomClass: "bottom-[12%]",
        centerClass: "inset-y-[16%]",
        insetClass: "inset-x-[36px]",
        position: config.position,
        topClass: "top-[12%]",
      }),
      textClassName: `${effectClass} max-w-[84%] text-center font-[900] uppercase leading-[1.05] text-white`,
      textStyle: {
        ...sizedTextStyle("2.65vw"),
      },
    };
  }

  if (config.captionStyle === "pop") {
    return {
      containerClassName: captionContainerClassName({
        alignment: config.alignment,
        bottomClass: "bottom-[12%]",
        centerClass: "inset-y-[18%]",
        insetClass: "inset-x-[30px]",
        position: config.position,
        topClass: "top-[12%]",
      }),
      textClassName:
        `${effectClass || "lyric-caption-motion-pop"} max-w-[86%] rounded-[12px] bg-black/30 px-[22px] py-[12px] text-center font-[950] leading-[1.05] text-white shadow-[0_16px_42px_rgba(0,0,0,0.28)]`,
      textStyle: sizedTextStyle("3vw"),
    };
  }

  if (config.captionStyle === "slide") {
    return {
      containerClassName: captionContainerClassName({
        alignment: config.alignment,
        bottomClass: "bottom-[14%]",
        centerClass: "inset-y-[16%]",
        insetClass: "inset-x-[32px]",
        position: config.position,
        topClass: "top-[14%]",
      }),
      textClassName:
        `${effectClass || "lyric-caption-motion-slide"} max-w-[82%] rounded-[10px] bg-black/38 px-[18px] py-[10px] text-center font-[900] leading-[1.1] text-white`,
      textStyle: sizedTextStyle("2.55vw"),
    };
  }

  if (config.captionStyle === "stacked") {
    return {
      containerClassName: captionContainerClassName({
        alignment: config.alignment,
        bottomClass: "bottom-[9%]",
        centerClass: "inset-y-[14%]",
        insetClass: "inset-x-[32px]",
        position: config.position,
        topClass: "top-[9%]",
      }),
      textClassName:
        `${effectClass} max-w-[86%] rounded-[14px] bg-black/42 px-[18px] py-[12px] text-center font-[850] leading-[1.12] text-white shadow-[0_14px_34px_rgba(0,0,0,0.26)]`,
      textStyle: sizedTextStyle("2.35vw"),
    };
  }

  return {
    containerClassName: captionContainerClassName({
      alignment: config.alignment,
      bottomClass: "bottom-[10%]",
      centerClass: "inset-y-[14%]",
      insetClass: "inset-x-[32px]",
      position: config.position,
      topClass: "top-[10%]",
    }),
    textClassName:
      `${effectClass} max-w-[82%] rounded-[8px] bg-black/34 px-[18px] py-[10px] text-center font-[850] leading-[1.12] text-white shadow-[0_12px_30px_rgba(0,0,0,0.2)]`,
    textStyle: sizedTextStyle("2.5vw"),
  };
}

export function resolvePreviewCaptionText(params: {
  activeChunkText?: string | null;
  allowLineFallback?: boolean;
  currentLine?: Pick<LyricLine, "text" | "startMs" | "endMs">;
  currentTimeMs: number;
  hasLyrics: boolean;
  fallbackTitle?: string | null;
}) {
  const activeChunkText = params.activeChunkText?.trim();
  if (activeChunkText) return activeChunkText;

  const lineText = params.currentLine?.text?.trim();
  if (
    params.allowLineFallback !== false &&
    lineText &&
    params.currentLine &&
    params.currentTimeMs >= params.currentLine.startMs &&
    params.currentTimeMs < params.currentLine.endMs
  ) {
    return lineText;
  }

  if (params.hasLyrics) return "";
  return params.fallbackTitle?.trim() || "Lyric preview";
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

export function calculatePreviewTotalDurationSeconds(params: {
  audioDurationMs?: number | null;
  lines?: Array<Pick<LyricLine, "endMs">>;
  words?: Array<Pick<LyricWord, "endMs">>;
  scenes?: Array<Pick<LyricScene, "endMs">>;
}) {
  const candidates = [
    params.audioDurationMs || 0,
    ...(params.lines || []).map((line) => line.endMs || 0),
    ...(params.words || []).map((word) => word.endMs || 0),
    ...(params.scenes || []).map((scene) => scene.endMs || 0),
  ];
  return Math.max(0, ...candidates) / 1000;
}

export function getPreviewStageStyle(aspectRatio?: string) {
  if (aspectRatio === "9:16") {
    return {
      aspectRatio: "9 / 16",
      height: "min(100%, 760px)",
      maxHeight: "100%",
      maxWidth: "min(100%, 560px)",
      width: "auto",
    };
  }

  return {
    aspectRatio: "16 / 9",
    height: "auto",
    maxHeight: "100%",
    width: "min(100%, 1540px)",
  };
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

export function sceneImageIsPending(scene: LyricScene) {
  return Boolean((scene.providerTaskId || scene.imageTaskId) && scene.status === "processing");
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

function imageGenerationIsActive(project: LyricVideoProject | null) {
  return project?.pipelineStage === "images_queueing" || project?.pipelineStage === "images_processing";
}

export function canUpdateSceneWhileGenerationLocked({
  allowDuringImageGeneration,
  generationLocked,
  project,
}: {
  allowDuringImageGeneration?: boolean;
  generationLocked: boolean;
  project: LyricVideoProject | null;
}) {
  if (!generationLocked) return true;
  return Boolean(allowDuringImageGeneration) && imageGenerationIsActive(project);
}

export function canRetrySceneImage({
  generationLocked,
  pendingRetry,
  project,
  scene,
  submitting,
}: {
  generationLocked: boolean;
  pendingRetry?: boolean;
  project: LyricVideoProject | null;
  scene: LyricScene;
  submitting?: boolean;
}) {
  if (submitting || pendingRetry || sceneImageIsPending(scene)) return false;
  if (!generationLocked) return true;
  return imageGenerationIsActive(project);
}

export function sceneHasImage(scene: LyricScene) {
  return Boolean(scene.imageUrl || scene.status === "success");
}

export function resolveSceneMedia(scene?: Pick<LyricScene, "imageUrl" | "videoUrl"> | null) {
  const videoUrl = String(scene?.videoUrl || "").trim();
  const imageUrl = String(scene?.imageUrl || "").trim();
  if (videoUrl) {
    return {
      kind: "video" as const,
      url: videoUrl,
      posterUrl: imageUrl || undefined,
    };
  }
  if (imageUrl) {
    return {
      kind: "image" as const,
      url: imageUrl,
      posterUrl: undefined,
    };
  }
  return {
    kind: "empty" as const,
    url: "",
    posterUrl: undefined,
  };
}

export function getSceneVideoPreloadUrls({
  currentSceneId,
  limit = 2,
  scenes,
}: {
  currentSceneId?: string;
  limit?: number;
  scenes: Array<Pick<LyricScene, "id" | "videoUrl">>;
}) {
  const safeLimit = Math.max(0, Math.floor(limit));
  if (!currentSceneId || safeLimit === 0 || scenes.length === 0) return [];

  const currentIndex = scenes.findIndex((scene) => scene.id === currentSceneId);
  if (currentIndex < 0) return [];

  const urls: string[] = [];
  const seen = new Set<string>();
  const addScene = (scene?: Pick<LyricScene, "id" | "videoUrl">) => {
    const videoUrl = String(scene?.videoUrl || "").trim();
    if (!videoUrl || seen.has(videoUrl)) return;
    seen.add(videoUrl);
    urls.push(videoUrl);
  };

  for (let index = currentIndex + 1; index < scenes.length && urls.length < safeLimit; index += 1) {
    addScene(scenes[index]);
  }
  for (let index = currentIndex - 1; index >= 0 && urls.length < safeLimit; index -= 1) {
    addScene(scenes[index]);
  }

  return urls;
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
  if (!params || !["grid_3x3", "grid_4x4"].includes(String(params.mode || "")) || !params.grid || typeof params.grid !== "object") return null;
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
  if (stage === "song_analysis") return "Analyzing song";
  if (stage === "direction_ready") return "Direction ready for review";
  if (stage === "prompt_generation") return "Preparing scenes";
  if (stage === "image_generation") return "Creating visuals";
  if (stage === "finalize_project") return "Finalizing video";
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
  const processing = scenes.filter((scene) => scene.status === "processing" && scene.providerTaskId).length;
  const failed = scenes.filter((scene) => scene.status === "failed" && !scene.imageUrl).length;
  const failedBatches = failedImageBatchCount(scenes);
  const songAnalysisStep = stepByStage(generationSteps, "song_analysis");
  const promptStep = stepByStage(generationSteps, "prompt_generation");
  const imageStep = stepByStage(generationSteps, "image_generation");
  const currentStage = runtimeState?.currentStage || generationRun?.currentStage || project?.pipelineStage;
  const generationStatus = runtimeState?.generationStatus || generationRun?.status || project?.generationStatus || "idle";
  const directionReady = generationStatus === "success" && currentStage === "direction_ready";
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
  const isPartialComplete = failed > 0 && processing === 0;
  const refundNotice = isPartialComplete
    ? "We kept the successful images and refunded all credits for this generation."
    : "";
  const primary =
    directionReady
      ? "方向已生成，等待生成全部场景"
      : isPartialComplete
      ? "Partial generation completed"
      : total > 0 && (processing > 0 || generationStatus === "waiting_provider")
        ? `Image generation ${success}/${total}${failed ? `, failed ${failed}` : ""}`
        : stageLabel(currentStage);

  return {
    primary,
    imageText,
    refundNotice,
    total,
    success,
    processing,
    failed,
    failedBatches,
    retryable,
    isActive,
    progressPercent,
    directionReady,
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

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// mock 项目的特殊 ID：访问 /api/lyric-videos/__mock__ 时会走这份数据，不查数据库。
export const MOCK_LYRIC_VIDEO_PROJECT_ID = "__mock__";

// mock 数据源开关：只改这里的文件夹名，就能切换 debug/fixtures/<目录>/analyze.json。
export const MOCK_LYRIC_VIDEO_ANALYZE_FIXTURE_DIR =
  process.env.MOCK_LYRIC_VIDEO_ANALYZE_FIXTURE_DIR ||
  process.env.MOCK_LYRIC_VIDEO_FIXTURE_KEY ||
  "open-sky-mp3";
const MOCK_LYRIC_VIDEO_PROMPT2_FILENAME = "prompt2-kie_codex-gpt-5-5.json";

// 固定的 mock 元信息：这些字段用来补齐数据库记录里通常会有的 user/run/date。
const mockDate = "2026-05-25T08:00:00.000Z";
const mockUserId = "mock-user";
const mockRunId = "mock-run";
const mockAudioUrl = "/uploads/audio/6a355abe9019a7a7999822233198af5ac9f9c69bbf4c2db542167b5dae0c63d8.mp3";

type Prompt2Scene = {
  id?: string;
  scene_id?: string;
  lyrics_summary?: string;
  image_prompt?: string;
  video_prompt?: string;
  timeline_config?: Record<string, unknown>;
};

// 读取 debug analyze API 缓存文件；如果本地没有缓存，用空结构兜底，避免 mock 预览阻塞构建。
const analyzeFixturePath = path.join(process.cwd(), "debug/fixtures", MOCK_LYRIC_VIDEO_ANALYZE_FIXTURE_DIR, "analyze.json");
const officialLikeAnalyze = existsSync(analyzeFixturePath)
  ? (JSON.parse(readFileSync(analyzeFixturePath, "utf8")) as any)
  : {
      audioAnalysis: { durationSec: 30.015, bpm: 95.7, key: "F" },
      transcription: { rawText: "", rawSegments: [], words: [] },
      fixedScenes: [],
    };
const prompt2FixturePath = path.join(
  process.cwd(),
  "debug/fixtures",
  MOCK_LYRIC_VIDEO_ANALYZE_FIXTURE_DIR,
  MOCK_LYRIC_VIDEO_PROMPT2_FILENAME,
);
const officialLikePrompt2 = existsSync(prompt2FixturePath)
  ? (JSON.parse(readFileSync(prompt2FixturePath, "utf8")) as any)
  : { scenes: [] };

// 从 analyze.json 里拆出后面转换要用的几个核心部分。
const officialLikeAudioAnalysis = officialLikeAnalyze.audioAnalysis || {};
const officialLikeTranscription = officialLikeAnalyze.transcription || {};
const officialLikeFixedScenes = Array.isArray(officialLikeAnalyze.fixedScenes) ? officialLikeAnalyze.fixedScenes : [];
const officialLikePrompt2Scenes: Prompt2Scene[] = Array.isArray(officialLikePrompt2.scenes) ? officialLikePrompt2.scenes : [];
const officialLikePrompt2BySceneId = new Map<string, Prompt2Scene>(
  officialLikePrompt2Scenes.flatMap((scene) => {
    const entries: Array<[string, Prompt2Scene]> = [];
    if (scene.id) entries.push([String(scene.id), scene]);
    if (scene.scene_id) entries.push([String(scene.scene_id), scene]);
    return entries;
  }),
);
const officialLikeDurationMs = Math.round((Number(officialLikeAudioAnalysis.durationSec) || 0) * 1000);
const officialLikeSongTitle = String(
  officialLikeAnalyze.preprocess?.song || officialLikeAnalyze.filename || "Open Sky Tonight",
)
  .replace(/\.[^.]+$/, "")
  .replace(/\s*（素材）\s*$/, "")
  .trim();

// 临时视觉设定：Prompt2 负责具体 image_prompt，这里只提供占位角色和配色。
const songAnalysis = {
  theme: "离开过去、踏上未知旅途以重新感受生命的觉醒之旅",
  characters: [
    {
      id: "char_1",
      description:
        "25-30岁的男性旅人，蓬乱的深棕色短发，脸上有风尘和淡淡的疲惫痕迹，穿着褪色的卡其色亚麻衬衫和深棕色工装裤，脚踩沾满尘土的旧皮靴，肩背一个磨损的帆布包，眼神中带着坚定与期待，气质介于沧桑与希望之间",
    },
  ],
  emotion_arc: [
    { time_range: "0s-9s", emotion: "沉静、告别、怀旧", intensity: 0.35 },
    { time_range: "9s-18s", emotion: "觉醒、渐起、决心", intensity: 0.55 },
    { time_range: "18s-24s", emotion: "渴望、积蓄、张力", intensity: 0.7 },
    { time_range: "24s-30s", emotion: "爆发、释放、重生", intensity: 0.85 },
  ],
  visual_style: "电影感写实，柯达胶片质感，广角公路片风格",
  color_palette: ["#3D2B1F", "#C9A66B", "#E8D5B7", "#6B8E9F", "#F4A261"],
  notes:
    "清晨或黄昏的侧逆光，美国西部荒漠公路氛围，画面有轻微颗粒感和暖色调滤镜，空气中漂浮着金色尘埃，远景有延伸至地平线的孤独道路",
};

// 生成一张 SVG 占位缩略图，用来让预览区、时间线和 Scenes 列表有可见画面。
function sceneImage(title: string, from: string, to: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${from}"/>
          <stop offset="100%" stop-color="${to}"/>
        </linearGradient>
        <radialGradient id="light" cx="65%" cy="35%" r="55%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#bg)"/>
      <rect width="1600" height="900" fill="url(#light)"/>
      <circle cx="1220" cy="210" r="126" fill="#ffffff" opacity="0.18"/>
      <circle cx="340" cy="700" r="230" fill="#000000" opacity="0.13"/>
      <path d="M0 690 C260 610 390 760 650 690 C910 620 1080 530 1600 635 L1600 900 L0 900 Z" fill="#0b1020" opacity="0.35"/>
      <text x="80" y="105" fill="#ffffff" opacity="0.88" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800">${title}</text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 当 analyze.json 里的歌词行没有 id 时，用这个函数补一个稳定的 mock line id。
function lineId(index: number) {
  return `mock-line-${index + 1}`;
}

// 把 transcription.rawSegments 转成预览页需要的 lines 结构。
const officialLikeLines = (officialLikeTranscription.rawSegments || []).map((line: any, index: number) => ({
  id: line.id || lineId(index),
  projectId: MOCK_LYRIC_VIDEO_PROJECT_ID,
  userId: mockUserId,
  sort: index,
  startMs: Math.max(0, Number(line.startMs) || 0),
  endMs: Math.max(Number(line.startMs) || 0, Number(line.endMs) || 0),
  text: String(line.text || ""),
  source: line.source || "open_sky_mp3_fixture",
  runId: mockRunId,
  wordStartIndex: Number.isFinite(Number(line.wordStartIndex)) ? Number(line.wordStartIndex) : null,
  wordEndIndex: Number.isFinite(Number(line.wordEndIndex)) ? Number(line.wordEndIndex) : null,
  confidence: 96,
  editedAt: null,
  createdAt: mockDate,
  updatedAt: mockDate,
}));

// 把 transcription.words 转成预览页需要的 words 结构，并根据时间落到对应 line。
const officialLikeWords = (officialLikeTranscription.words || []).map((word: any, index: number) => {
  const startMs = Math.max(0, Number(word.startMs) || 0);
  const endMs = Math.max(startMs, Number(word.endMs) || startMs);
  const line =
    officialLikeLines.find((candidate: any) => startMs >= candidate.startMs && startMs < candidate.endMs) ||
    officialLikeLines.find((candidate: any) => endMs > candidate.startMs && endMs <= candidate.endMs);
  return {
    id: `mock-word-${index + 1}`,
    projectId: MOCK_LYRIC_VIDEO_PROJECT_ID,
    userId: mockUserId,
    runId: mockRunId,
    lineId: line?.id || null,
    sceneId: null,
    sort: index,
    word: String(word.word || ""),
    startMs,
    endMs,
    confidence: 96,
    createdAt: mockDate,
    updatedAt: mockDate,
  };
});

// 把每个 line 关联的 words 塞回 line.words，方便歌词面板和预览逻辑直接读取。
for (const line of officialLikeLines) {
  line.words = officialLikeWords.filter((word: any) => word.lineId === line.id);
}

// 把 fixedScenes 转成预览页需要的 scenes 结构，并用 Prompt2 缓存补上 image_prompt/video_prompt。
const officialLikeScenes = officialLikeFixedScenes.map((scene: any, index: number) => {
  const startMs = Math.max(0, Number(scene.startMs) || 0);
  const endMs = Math.max(startMs + 500, Number(scene.endMs) || startMs + 500);
  const colors = songAnalysis.color_palette;
  const prompt2Scene = officialLikePrompt2BySceneId.get(String(scene.sceneId)) || officialLikePrompt2BySceneId.get(String(index + 1));
  const text = String(
    prompt2Scene?.lyrics_summary || scene.text || (scene.kind === "instrumental" ? "Instrumental" : `Scene ${index + 1}`),
  );
  const prompt = String(
    prompt2Scene?.image_prompt || `${scene.kind === "instrumental" ? "Instrumental transition" : "Lyric scene"}: ${text}`,
  );
  const motionPrompt = String(prompt2Scene?.video_prompt || "");
  return {
    id: `mock-scene-${scene.sceneId || index + 1}`,
    projectId: MOCK_LYRIC_VIDEO_PROJECT_ID,
    userId: mockUserId,
    sort: index,
    startMs,
    endMs,
    runId: mockRunId,
    text,
    prompt,
    negativePrompt: "",
    linkedLineIds: Array.isArray(scene.linkedLineIds) ? scene.linkedLineIds : [],
    lyricLineIds: Array.isArray(scene.linkedLineIds) ? scene.linkedLineIds : [],
    castIds: ["mock-cast-char-1"],
    styleOverrides: {},
    timelineConfig: prompt2Scene?.timeline_config || {
      kind: scene.kind,
      energyLevel: scene.energyLevel,
      avgEnergy: scene.avgEnergy,
      bpm: scene.bpm,
      key: scene.key,
      beatCount: scene.beatCount,
      prevLyric: scene.prevLyric,
      nextLyric: scene.nextLyric,
    },
    motionPrompt,
    imageUrl: sceneImage(text, colors[index % colors.length], colors[(index + 1) % colors.length]),
    imageTaskId: `mock-image-task-${index + 1}`,
    providerTaskId: `mock-provider-image-${index + 1}`,
    generationParams: {
      source: "open_sky_mp3_analyze_fixture",
      prompt2Source: prompt2Scene ? MOCK_LYRIC_VIDEO_PROMPT2_FILENAME : null,
    },
    attemptCount: 1,
    lastAttemptAt: mockDate,
    nextRetryAt: null,
    completedAt: mockDate,
    failureCode: null,
    imageModel: "mock",
    imageSeed: String(1001 + index),
    imagePromptSnapshot: prompt,
    error: null,
    status: "ready",
    createdAt: mockDate,
    updatedAt: mockDate,
  };
});

// 保留原始分析结果，塞进 project.transcriptionRaw，方便调试时追溯 analyze.json 内容。
const officialLikeTranscriptionRaw = {
  ...officialLikeTranscription,
  audioAnalysis: officialLikeAudioAnalysis,
  fixedScenes: officialLikeFixedScenes,
  createdAt: mockDate,
};

// 最终返回给 /api/lyric-videos/__mock__ 的完整详情结构，形状对齐真实 getProjectDetails。
export const mockLyricVideoPreviewDetails = {
  // project 模拟 lyricVideoProject 表记录，预览页顶部、播放器和状态都从这里取值。
  project: {
    id: MOCK_LYRIC_VIDEO_PROJECT_ID,
    userId: mockUserId,
    title: officialLikeSongTitle || "Open Sky Tonight",
    status: "ready",
    audioUrl: mockAudioUrl,
    audioStorageKey: "mock/audio/6a355abe9019a7a7999822233198af5ac9f9c69bbf4c2db542167b5dae0c63d8.mp3",
    originalAudioUrl: mockAudioUrl,
    originalAudioStorageKey: "mock/audio/6a355abe9019a7a7999822233198af5ac9f9c69bbf4c2db542167b5dae0c63d8.mp3",
    audioFilename: officialLikeAnalyze.filename || "Open Sky Tonight.mp3",
    audioDurationMs: officialLikeDurationMs || 30015,
    audioMimeType: officialLikeAnalyze.contentType || "audio/mpeg",
    audioSizeBytes: officialLikeAnalyze.size || 614890,
    audioChecksum: "fixture-open-sky-mp3",
    trimStartMs: 0,
    trimEndMs: officialLikeDurationMs || 30015,
    processedAudioUrl: mockAudioUrl,
    processedAudioStorageKey: "mock/audio/6a355abe9019a7a7999822233198af5ac9f9c69bbf4c2db542167b5dae0c63d8.mp3",
    transcriptionRaw: JSON.stringify(officialLikeTranscriptionRaw),
    pipelineStage: "preview_ready",
    pipelineError: null,
    activeRunId: mockRunId,
    generationStatus: "completed",
    generationProgress: 100,
    lastGeneratedAt: mockDate,
    language: "en",
    storyPrompt: `${songAnalysis.theme}\n\nStyle: ${songAnalysis.visual_style}\nPalette: ${songAnalysis.color_palette.join(", ")}\nNotes: ${songAnalysis.notes}`,
    palette: songAnalysis.color_palette.join(", "),
    artStyle: songAnalysis.visual_style,
    aspectRatio: "16:9",
    resolution: "1080p",
    lyricsStatus: "ready",
    scenesStatus: "ready",
    renderStatus: "ready",
    renderUrl: null,
    renderTaskId: null,
    previewConfig: {
      fontFamily: "Inter",
      fontSize: 56,
      textColor: "#ffffff",
      shadowColor: "#000000",
      position: "bottom",
      transition: "fade",
    },
    createdAt: mockDate,
    updatedAt: mockDate,
    deletedAt: null,
  },
  // generationRun 模拟一次已经完成的生成流程。
  generationRun: {
    id: mockRunId,
    projectId: MOCK_LYRIC_VIDEO_PROJECT_ID,
    userId: mockUserId,
    status: "completed",
    currentStage: "preview_ready",
    progressPercent: 100,
    totalSteps: 4,
    completedSteps: 4,
    failedSteps: 0,
    idempotencyKey: "mock-preview-run",
    requestHash: "fixture-open-sky-mp3",
    inputSnapshot: null,
    outputSnapshot: null,
    errorCode: null,
    errorMessage: null,
    startedAt: mockDate,
    completedAt: mockDate,
    canceledAt: null,
    createdAt: mockDate,
    updatedAt: mockDate,
  },
  // generationSteps 模拟生成流程里的几个阶段，用于状态展示。
  generationSteps: [
    { id: "mock-step-analyze", stage: "analyze", status: "completed", sort: 0, progressPercent: 100 },
    { id: "mock-step-prompt1", stage: "prompt1", status: "completed", sort: 1, progressPercent: 100 },
    { id: "mock-step-prompt2", stage: "prompt2", status: "completed", sort: 2, progressPercent: 100 },
    { id: "mock-step-preview", stage: "preview", status: "completed", sort: 3, progressPercent: 100 },
  ],
  words: officialLikeWords,
  lines: officialLikeLines,
  scenes: officialLikeScenes,
  // cast 目前只是补齐角色数据，让 scene.castIds 有对象可以对应。
  cast: [
    {
      id: "mock-cast-char-1",
      projectId: MOCK_LYRIC_VIDEO_PROJECT_ID,
      userId: mockUserId,
      name: "char_1",
      role: "main traveler",
      description: songAnalysis.characters[0].description,
      promptFragment: songAnalysis.characters[0].description,
      referenceImageUrl: null,
      status: "active",
      sort: 0,
      createdAt: mockDate,
      updatedAt: mockDate,
      deletedAt: null,
    },
  ],
  // exports 模拟一个已完成导出记录，让预览页底部状态保持 ready。
  exports: [
    {
      id: "mock-export-1",
      projectId: MOCK_LYRIC_VIDEO_PROJECT_ID,
      userId: mockUserId,
      status: "completed",
      format: "mp4",
      resolution: "1080p",
      aspectRatio: "16:9",
      videoUrl: null,
      storageKey: null,
      taskId: "mock-export-task",
      error: null,
      settings: null,
      costCredits: 0,
      createdAt: mockDate,
      updatedAt: mockDate,
    },
  ],
};

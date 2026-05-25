export const MOCK_LYRIC_VIDEO_PROJECT_ID = "__mock__";

const mockDate = "2026-05-25T08:00:00.000Z";
const mockUserId = "mock-user";
const mockRunId = "mock-run";

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

const lyricLineFixtures = [
  {
    startMs: 0,
    endMs: 18800,
    text: "Mourning on my face, dust on my shoes I left the old road for something new",
    wordStartIndex: 0,
    wordEndIndex: 15,
  },
  {
    startMs: 18800,
    endMs: 29240,
    text: "Pocket full of sparks, hard and dry I've been waiting on this to feel alive",
    wordStartIndex: 16,
    wordEndIndex: 30,
  },
  {
    startMs: 29240,
    endMs: 29760,
    text: "0",
    wordStartIndex: 31,
    wordEndIndex: 31,
  },
];

const wordFixtures = [
  { word: "Mourning", startMs: 0, endMs: 9840, lineIndex: 0 },
  { word: "on", startMs: 9840, endMs: 10220, lineIndex: 0 },
  { word: "my", startMs: 10220, endMs: 10460, lineIndex: 0 },
  { word: "face,", startMs: 10460, endMs: 11600, lineIndex: 0 },
  { word: "dust", startMs: 11600, endMs: 12140, lineIndex: 0 },
  { word: "on", startMs: 12140, endMs: 12440, lineIndex: 0 },
  { word: "my", startMs: 12440, endMs: 12760, lineIndex: 0 },
  { word: "shoes", startMs: 12760, endMs: 13240, lineIndex: 0 },
  { word: "I", startMs: 13240, endMs: 14620, lineIndex: 0 },
  { word: "left", startMs: 14620, endMs: 14880, lineIndex: 0 },
  { word: "the", startMs: 14880, endMs: 15040, lineIndex: 0 },
  { word: "old", startMs: 15040, endMs: 15540, lineIndex: 0 },
  { word: "road", startMs: 15540, endMs: 16160, lineIndex: 0 },
  { word: "for", startMs: 16160, endMs: 17320, lineIndex: 0 },
  { word: "something", startMs: 17320, endMs: 17840, lineIndex: 0 },
  { word: "new", startMs: 17840, endMs: 18380, lineIndex: 0 },
  { word: "Pocket", startMs: 19300, endMs: 19820, lineIndex: 1 },
  { word: "full", startMs: 19820, endMs: 20300, lineIndex: 1 },
  { word: "of", startMs: 20300, endMs: 20560, lineIndex: 1 },
  { word: "sparks,", startMs: 20560, endMs: 22100, lineIndex: 1 },
  { word: "hard", startMs: 22100, endMs: 22500, lineIndex: 1 },
  { word: "and", startMs: 22500, endMs: 22820, lineIndex: 1 },
  { word: "dry", startMs: 22820, endMs: 23200, lineIndex: 1 },
  { word: "I've", startMs: 23200, endMs: 25040, lineIndex: 1 },
  { word: "been", startMs: 25040, endMs: 25180, lineIndex: 1 },
  { word: "waiting", startMs: 25180, endMs: 25380, lineIndex: 1 },
  { word: "on", startMs: 25380, endMs: 25760, lineIndex: 1 },
  { word: "this", startMs: 25760, endMs: 26280, lineIndex: 1 },
  { word: "to", startMs: 26280, endMs: 27400, lineIndex: 1 },
  { word: "feel", startMs: 27400, endMs: 27820, lineIndex: 1 },
  { word: "alive", startMs: 27820, endMs: 28500, lineIndex: 1 },
  { word: "0", startMs: 29880, endMs: 30240, lineIndex: 2 },
];

const promptSceneFixtures = [
  {
    scene_id: 1,
    start_s: 0,
    end_s: 9,
    lyrics_summary: "Mourning on my face",
    image_prompt:
      "A 25-30 year old male traveler with messy dark brown short hair, weathered face showing subtle fatigue, wearing a faded khaki linen shirt and dark brown cargo pants, dusty old leather boots, stands still at the edge of an abandoned desert road at dawn. Close-up portrait, golden hour sidelight casting long shadows across his contemplative expression, Kodak Portra 400 film grain, warm tones of #C9A66B and #E8D5B7 in the sky, #3D2B1F earth tones in shadows, soft bokeh of endless highway stretching to horizon behind him, dust particles floating in amber light, cinematic 2.39:1 widescreen composition",
    video_prompt:
      "Slow push-in from medium shot to close-up on the traveler's face, camera movement synchronized to 0.63s per beat at BPM 95.7, subtle floating dust particles drift lazily through frame, gentle wind slightly moves his hair every 2 beats, minimal subject movement - only his eyes slowly lift to meet camera, atmospheric golden light flickers softly, melancholic stillness with micro-movements",
  },
  {
    scene_id: 2,
    start_s: 9,
    end_s: 18,
    lyrics_summary: "Dust on my shoes, I left the old road for something new",
    image_prompt:
      "Wide establishing shot of the same traveler - messy dark brown hair, faded khaki linen shirt, worn canvas backpack on shoulder - walking away from camera on a cracked desert highway stretching into infinite horizon. American Southwest landscape, low golden sun creating dramatic sidelight, his dusty leather boots mid-stride kicking up fine sand, color palette of #F4A261 sunset orange blending with #6B8E9F cool sky, #E8D5B7 dusty road surface, Kodak film aesthetic with visible grain, epic wide-angle composition showing vast emptiness and solitary figure, lens flare from sun position",
    video_prompt:
      "Steady tracking shot following the traveler from behind as he walks, camera moves forward matching his pace at 2 steps per 4 beats synced to BPM 95.7, increasing wind lifts dust swirls around his boots progressively larger, golden dust particles accelerate through frame, his stride becomes more purposeful and confident, subtle dolly zoom creating slight tension, atmosphere intensifies with each measure",
  },
  {
    scene_id: 3,
    start_s: 18,
    end_s: 24,
    lyrics_summary: "Pocket full of sparks, hard and dry",
    image_prompt:
      "Dramatic low-angle shot of the traveler - 25-30 male, weathered face with determined eyes, messy dark brown hair catching wind, faded khaki shirt partially unbuttoned - standing at a crossroads in the desert. His hand reaches into his pocket, golden hour light exploding behind him creating a silhouette halo effect, intense #F4A261 and #C9A66B warm tones dominating the frame, sparse desert brush in #3D2B1F shadows, clouds streaked with #6B8E9F undertones, Kodak Ektachrome saturation, dynamic diagonal composition suggesting imminent action, tension in every element",
    video_prompt:
      "Crane shot rising from ground level while pushing in toward the traveler, camera ascends 1 foot per 2 beats at BPM 95.7, wind intensifies dramatically whipping his shirt and hair, sand and golden light particles swirl with increasing velocity around his figure, his hand slowly draws from pocket in deliberate motion over 4 beats, lens flare pulses with rhythm, building kinetic energy before release",
  },
  {
    scene_id: 4,
    start_s: 24,
    end_s: 30,
    lyrics_summary: "I've been waiting on this to feel alive",
    image_prompt:
      "Epic wide shot of the traveler - messy dark brown hair wild in wind, faded khaki shirt billowing, worn canvas bag swinging - running full sprint down the desert highway toward a blazing sunrise on the horizon. Maximum golden hour intensity, entire frame flooded with #F4A261 and #C9A66B warmth, his silhouette sharp against #E8D5B7 luminous sky, dust cloud trailing behind him catching light like gold confetti, #6B8E9F cool shadows grounding the composition, extreme wide-angle lens distortion emphasizing speed and freedom, Kodak Vision3 500T cinema film look, euphoric and liberating energy radiating from every pixel",
    video_prompt:
      "High-speed tracking shot running alongside the traveler matching his sprint, camera movement aggressive and dynamic synced to every beat at BPM 95.7, massive dust explosion behind him trails 10 feet, his arms pump with rhythm hitting accent on downbeats, golden particle storm fills the air, whip pan to front angle showing his face breaking into triumphant expression, final crane lift skyward revealing infinite road ahead, maximum kinetic release and catharsis",
  },
];

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

function lineId(index: number) {
  return `mock-line-${index + 1}`;
}

function sceneId(index: number) {
  return `mock-scene-${index + 1}`;
}

function lineIdsForRange(startMs: number, endMs: number) {
  return lyricLineFixtures
    .map((line, index) => ({ id: lineId(index), overlap: Math.max(0, Math.min(endMs, line.endMs) - Math.max(startMs, line.startMs)) }))
    .filter((line) => line.overlap > 0)
    .map((line) => line.id);
}

const words = wordFixtures.map((word, index) => ({
  id: `${lineId(word.lineIndex)}-word-${index + 1}`,
  projectId: MOCK_LYRIC_VIDEO_PROJECT_ID,
  userId: mockUserId,
  runId: mockRunId,
  lineId: lineId(word.lineIndex),
  sceneId: null,
  sort: index,
  word: word.word,
  startMs: word.startMs,
  endMs: word.endMs,
  confidence: 96,
  createdAt: mockDate,
  updatedAt: mockDate,
}));

const lines = lyricLineFixtures.map((line, index) => ({
  id: lineId(index),
  projectId: MOCK_LYRIC_VIDEO_PROJECT_ID,
  userId: mockUserId,
  sort: index,
  startMs: line.startMs,
  endMs: line.endMs,
  text: line.text,
  source: "fixture",
  runId: mockRunId,
  wordStartIndex: line.wordStartIndex,
  wordEndIndex: line.wordEndIndex,
  confidence: 96,
  editedAt: null,
  createdAt: mockDate,
  updatedAt: mockDate,
  words: words.filter((word) => word.lineId === lineId(index)),
}));

const transcriptionRaw = {
  provider: "groq",
  model: "whisper-large-v3-turbo",
  rawText:
    "Mourning on my face, dust on my shoes I left the old road for something new Pocket full of sparks, hard and dry I've been waiting on this to feel alive 0",
  rawSegments: lyricLineFixtures.map((line) => ({
    startMs: line.startMs,
    endMs: line.endMs,
    text: line.text,
  })),
  words: wordFixtures.map(({ word, startMs, endMs }) => ({ word, startMs, endMs })),
  raw: {},
  audioAnalysis: {
    durationSec: 30.015,
    sampleRate: 44100,
    bpm: 95.7,
    key: "F",
    beatTimesMs: [],
    segmentBoundariesMs: [],
    rmsBySecond: Array.from({ length: 31 }, (_, index) => ({ startMs: index * 1000, endMs: Math.min((index + 1) * 1000, 30015), rms: 0 })),
    segments: [
      { startMs: 0, endMs: 6000, durationMs: 6000, avgEnergy: 0 },
      { startMs: 6000, endMs: 12000, durationMs: 6000, avgEnergy: 0 },
      { startMs: 12000, endMs: 18000, durationMs: 6000, avgEnergy: 0 },
      { startMs: 18000, endMs: 24000, durationMs: 6000, avgEnergy: 0 },
      { startMs: 24000, endMs: 30015, durationMs: 6015, avgEnergy: 0 },
    ],
  },
  songAnalysis,
  createdAt: mockDate,
};

const scenes = promptSceneFixtures.map((scene, index) => {
  const startMs = Math.round(scene.start_s * 1000);
  const endMs = Math.round(scene.end_s * 1000);
  const linkedLineIds = lineIdsForRange(startMs, endMs);
  const colors = songAnalysis.color_palette;
  return {
    id: sceneId(index),
    projectId: MOCK_LYRIC_VIDEO_PROJECT_ID,
    userId: mockUserId,
    sort: index,
    startMs,
    endMs,
    runId: mockRunId,
    text: scene.lyrics_summary,
    prompt: scene.image_prompt,
    negativePrompt: "",
    linkedLineIds,
    lyricLineIds: linkedLineIds,
    castIds: ["mock-cast-char-1"],
    styleOverrides: {},
    timelineConfig: {},
    motionPrompt: scene.video_prompt,
    imageUrl: sceneImage(scene.lyrics_summary, colors[index % colors.length], colors[(index + 1) % colors.length]),
    imageTaskId: `mock-image-task-${index + 1}`,
    providerTaskId: `mock-provider-image-${index + 1}`,
    generationParams: { source: "prompt2_fixture" },
    attemptCount: 1,
    lastAttemptAt: mockDate,
    nextRetryAt: null,
    completedAt: mockDate,
    failureCode: null,
    imageModel: "mock",
    imageSeed: String(1001 + index),
    imagePromptSnapshot: scene.image_prompt,
    error: null,
    status: "ready",
    createdAt: mockDate,
    updatedAt: mockDate,
  };
});

export const mockLyricVideoPreviewDetails = {
  project: {
    id: MOCK_LYRIC_VIDEO_PROJECT_ID,
    userId: mockUserId,
    title: "30s",
    status: "ready",
    audioUrl: "/uploads/mock-open-sky-tonight.mp3",
    audioStorageKey: "mock/open-sky-tonight.mp3",
    originalAudioUrl: "/uploads/mock-open-sky-tonight.mp3",
    originalAudioStorageKey: "mock/open-sky-tonight.mp3",
    audioFilename: "30s.mp3",
    audioDurationMs: 30015,
    audioMimeType: "audio/mpeg",
    audioSizeBytes: 614890,
    audioChecksum: "fixture-open-sky-30s",
    trimStartMs: 0,
    trimEndMs: 30015,
    processedAudioUrl: "/uploads/mock-open-sky-tonight.mp3",
    processedAudioStorageKey: "mock/open-sky-tonight.mp3",
    transcriptionRaw: JSON.stringify(transcriptionRaw),
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
    requestHash: "fixture-open-sky",
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
  generationSteps: [
    { id: "mock-step-analyze", stage: "analyze", status: "completed", sort: 0, progressPercent: 100 },
    { id: "mock-step-prompt1", stage: "prompt1", status: "completed", sort: 1, progressPercent: 100 },
    { id: "mock-step-prompt2", stage: "prompt2", status: "completed", sort: 2, progressPercent: 100 },
    { id: "mock-step-preview", stage: "preview", status: "completed", sort: 3, progressPercent: 100 },
  ],
  words,
  lines,
  scenes,
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

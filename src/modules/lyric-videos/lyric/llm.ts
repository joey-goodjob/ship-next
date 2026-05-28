import { envConfigs } from '@/config';
import { GroqProvider, KieProvider } from '@/core/ai';
import { getUuid } from '@/lib/hash';
import { getAllConfigs } from '@/modules/config/service';
import { isStorageConfigured } from '@/modules/storage/service';
import { saveAIProviderFiles } from './audio';
import { audioAnalysisPromptSummary, parseLinesFromText, refineAsrSegmentsWithWords, readAudioAnalysis } from './asr';
import { chatContentToText, parseJsonLoose, previewText } from './json';
import {
  audioAnalysisFromLlmPreprocess,
  buildFixedStoryboardSceneDrafts,
  buildSceneTimelineConfig,
  fallbackPromptForFixedScene,
  secondsFromMs,
} from './storyboard';
import {
  DEFAULT_STORYBOARD_MODEL,
  DEFAULT_TRANSCRIBE_MODEL,
  type AudioAnalysisResult,
  type DebugSongAnalysisProvider,
  type FixedStoryboardSceneDraft,
  type LyricLineInput,
  type LyricVideoLlmPreprocessResult,
  type LyricVideoPromptSceneResult,
  type LyricVideoSongAnalysisResult,
  type SceneInput,
  type StoryboardScene,
} from './types';

export async function callKieGeminiChat(params: {
  text: string;
  mediaUrl?: string;
  responseFormat?: any;
  model?: string;
}) {
  const configs = await getAllConfigs();
  const apiKey = configs.kie_api_key;
  const model = params.model || configs.kie_chat_model || 'gemini-2.5-flash';
  const endpoint =
    params.model && /^gemini-[a-z0-9.-]+$/i.test(params.model)
      ? `https://api.kie.ai/${params.model}/v1/chat/completions`
      : configs.kie_chat_endpoint || 'https://api.kie.ai/gemini-2.5-flash/v1/chat/completions';

  if (!apiKey) {
    throw new Error('Kie API key is required. Add it in Admin Settings > AI.');
  }

  const content: any[] = [{ type: 'text', text: params.text }];
  if (params.mediaUrl) {
    content.push({ type: 'image_url', image_url: { url: params.mediaUrl } });
  }

  const requestBody: Record<string, unknown> = {
    model,
    stream: false,
    messages: [{ role: 'user', content }],
    response_format: params.responseFormat,
  };
  if (model === 'gemini-3.1-pro') {
    requestBody.include_thoughts = false;
    requestBody.reasoning_effort = 'high';
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kie Gemini chat failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const contentText = chatContentToText(data.choices?.[0]?.message?.content || '');
  return { model: data.model || model, raw: data, content: contentText };
}

export async function callKieClaudeMessages(params: {
  text: string;
  model?: string;
  maxTokens?: number;
  thinkingFlag?: boolean;
}) {
  const configs = await getAllConfigs();
  const apiKey = configs.kie_api_key;
  const endpoint = configs.kie_claude_endpoint || 'https://api.kie.ai/claude/v1/messages';
  const model = params.model || configs.kie_claude_model || 'claude-sonnet-4-5';

  if (!apiKey) {
    throw new Error('Kie API key is required. Add it in Admin Settings > AI.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: params.text }],
      stream: false,
      thinkingFlag: params.thinkingFlag ?? true,
      max_tokens: params.maxTokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kie Claude messages failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return {
    model: data.model || model,
    raw: data,
    content: chatContentToText(data.content || ''),
  };
}

export async function callKieCodexResponses(params: {
  text: string;
  model?: string;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
}) {
  const configs = await getAllConfigs();
  const apiKey = configs.kie_api_key;
  const endpoint = configs.kie_codex_endpoint || 'https://api.kie.ai/codex/v1/responses';
  const model = params.model || configs.kie_codex_model || 'gpt-5-4';

  if (!apiKey) {
    throw new Error('Kie API key is required. Add it in Admin Settings > AI.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: false,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: params.text }],
        },
      ],
      reasoning: { effort: params.reasoningEffort || 'medium' },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kie Codex responses failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return {
    model: data.model || model,
    raw: data,
    content: chatContentToText(data.output_text || data.output || data.content || ''),
  };
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

export function normalizeIntensity(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.5;
  return Math.max(0, Math.min(1, Number(num.toFixed(2))));
}

export function normalizeSongAnalysis(
  parsed: any
): LyricVideoSongAnalysisResult {
  const characters = Array.isArray(parsed?.characters) ? parsed.characters : [];
  const keyProps = Array.isArray(parsed?.key_props) ? parsed.key_props : [];
  const narrativeArc = Array.isArray(parsed?.narrative_arc) ? parsed.narrative_arc : [];
  const locationPlan = Array.isArray(parsed?.location_plan) ? parsed.location_plan : [];
  const emotionArc = Array.isArray(parsed?.emotion_arc) ? parsed.emotion_arc : [];
  return {
    theme: String(parsed?.theme || '').trim(),
    characters: characters
      .map((item: any, index: number) => ({
        id: String(item?.id || `char_${index + 1}`).trim(),
        description: String(item?.description || '').trim(),
      }))
      .filter((item: LyricVideoSongAnalysisResult['characters'][number]) => item.description),
    key_props: keyProps
      .map((item: any, index: number) => ({
        id: String(item?.id || `prop_${index + 1}`).trim(),
        description: String(item?.description || '').trim(),
        symbolic_meaning: String(item?.symbolic_meaning || '').trim(),
        state_progression: String(item?.state_progression || '').trim(),
        appears_in_sections: stringArray(item?.appears_in_sections),
      }))
      .filter((item: LyricVideoSongAnalysisResult['key_props'][number]) => item.description),
    narrative_arc: narrativeArc
      .map((item: any) => ({
        time_range: String(item?.time_range || '').trim(),
        section_label: String(item?.section_label || '').trim(),
        plot_beat: String(item?.plot_beat || '').trim(),
        visual_anchor: String(item?.visual_anchor || '').trim(),
      }))
      .filter((item: LyricVideoSongAnalysisResult['narrative_arc'][number]) => item.time_range && item.plot_beat),
    location_plan: locationPlan
      .map((item: any) => ({
        time_range: String(item?.time_range || '').trim(),
        location: String(item?.location || '').trim(),
        lighting: String(item?.lighting || '').trim(),
        color_tone: String(item?.color_tone || '').trim(),
        spatial_feel: String(item?.spatial_feel || '').trim(),
      }))
      .filter((item: LyricVideoSongAnalysisResult['location_plan'][number]) => item.time_range && item.location),
    emotion_arc: emotionArc
      .map((item: any) => ({
        time_range: String(item?.time_range || '').trim(),
        emotion: String(item?.emotion || '').trim(),
        intensity: normalizeIntensity(item?.intensity),
      }))
      .filter((item: LyricVideoSongAnalysisResult['emotion_arc'][number]) => item.time_range && item.emotion),
    visual_style: String(parsed?.visual_style || '').trim(),
    color_palette: stringArray(parsed?.color_palette).slice(0, 5),
    notes: String(parsed?.notes || '').trim(),
  };
}

export function buildSongAnalysisPrompt(preprocess: LyricVideoLlmPreprocessResult) {
  return `你是一位音乐视觉化导演。根据以下歌曲数据，分析这首歌并输出创意方向。

## 歌曲数据
${JSON.stringify(preprocess)}

## 你的任务
分析歌词含义、情绪走向和能量变化，输出以下 JSON（不要输出其他内容）：

{
  "theme": "一句话概括这首歌的核心主题",
  "characters": [
    {
      "id": "char_1",
      "description": "主角的外貌、穿着、气质（用于后续生图保持一致）"
    }
  ],
  "key_props": [
    {
      "id": "prop_1",
      "description": "道具的外观、材质、颜色、尺寸（要具体到可以直接用于 AI 生图）",
      "symbolic_meaning": "它在故事里代表什么情感或转折",
      "state_progression": "这个道具从开头到结尾的状态变化（如：完整 → 破损 → 修复）",
      "appears_in_sections": ["verse1", "chorus2", "outro"]
    }
  ],
  "narrative_arc": [
    {
      "time_range": "0s-28s",
      "section_label": "verse1 / chorus1 / bridge 等",
      "plot_beat": "这个段落在讲什么具体故事事件（主角在做什么、为什么、结果是什么）",
      "visual_anchor": "这个段落最核心的一个视觉画面"
    }
  ],
  "location_plan": [
    {
      "time_range": "0s-28s",
      "location": "具体场景描述（地点类型、空间特征、环境元素）",
      "lighting": "光线条件（时段、方向、强度、色温）",
      "color_tone": "这个段落的主色调偏移",
      "spatial_feel": "开阔/封闭/过渡"
    }
  ],
  "emotion_arc": [
    {
      "time_range": "0s-29s",
      "emotion": "当前段落的情绪关键词",
      "intensity": 0.4
    }
  ],
  "visual_style": "整体画面风格（如：电影感写实 / 日系动画 / 赛博朋克等）",
  "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "notes": "任何影响视觉的补充说明（如季节、光线、年代感）"
}

## 要求

### emotion_arc
- 要覆盖整首歌，按歌词内容和 energy_per_second 的变化来划分段落
- intensity 范围 0-1，要参考 energy_per_second 数据

### characters
- 描述要具体到可以直接用于 AI 生图
- 包含面部特征、发型、肤色、体型、穿着风格、标志性配饰

### key_props（关键改动）
- 至少 2 个、至多 4 个
- 必须是有叙事功能的具体物件，不能是鞋/路/天空这类泛化环境元素
- 每个道具要在歌曲的不同段落至少出现 2 次，形成前后呼应
- state_progression 必须体现变化（状态、位置、完整性），不能全程不变
- 道具之间不能功能重复（如不能既有"一封信"又有"一张纸条"）

### narrative_arc（关键改动）
- 要把歌词中的抽象意象转化为具体的、可拍摄的故事事件
- 每个 plot_beat 必须回答：主角在做什么？为什么？这个动作的结果是什么？
- 不能只写情绪描述（如"主角感到自由"），要写动作和事件（如"主角把旧地图撕碎扔向天空"）
- 相邻段落之间要有因果关系或对比关系

### location_plan（关键改动）
- 至少包含 3 种视觉上有明显差异的空间
- 必须有冷暖色调的对比（不能全暖或全冷）
- 必须有开阔与封闭空间的对比（不能全是旷野或全是室内）
- 空间转换要跟 narrative_arc 的故事节点对齐，不能随意切换
- 每个 location 的描述要具体到可以直接作为 image_prompt 的场景前缀

### color_palette
- 要与歌曲情绪和 visual_style 匹配
- 5 个颜色中至少 1 个冷色、1 个暖色

### 全局
- 只输出 JSON，不要解释`;
}

export async function analyzeSongWithKieForDebug(params: {
  preprocess: LyricVideoLlmPreprocessResult;
  provider?: DebugSongAnalysisProvider;
  model?: string;
}) {
  const provider = params.provider || 'kie_claude';
  if (!['kie_claude', 'kie_codex', 'kie_gemini'].includes(provider)) {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
  if (!params.preprocess || !Array.isArray(params.preprocess.lines) || params.preprocess.lines.length === 0) {
    throw new Error('preprocess.lines is required for song analysis');
  }

  const prompt = buildSongAnalysisPrompt(params.preprocess);
  const result =
    provider === 'kie_codex'
      ? await callKieCodexResponses({ text: prompt, model: params.model })
      : provider === 'kie_gemini'
        ? await callKieGeminiChat({ text: prompt, model: params.model })
        : await callKieClaudeMessages({ text: prompt, model: params.model, thinkingFlag: true, maxTokens: 4096 });

  const parsed = parseJsonLoose<any>(result.content, {});
  return {
    provider,
    model: params.model || result.model,
    actualModel: result.model,
    songAnalysis: normalizeSongAnalysis(parsed),
    rawText: result.content,
    raw: result.raw,
  };
}

export async function analyzeSongWithKieClaudeForDebug(preprocess: LyricVideoLlmPreprocessResult) {
  return analyzeSongWithKieForDebug({ preprocess, provider: 'kie_claude' });
}

export function normalizePromptScenes(parsed: any): LyricVideoPromptSceneResult[] {
  const scenes = Array.isArray(parsed?.scenes) ? parsed.scenes : Array.isArray(parsed) ? parsed : [];
  return scenes
    .map((scene: any, index: number) => {
      const start = Number(scene?.start_s ?? scene?.start ?? 0);
      const end = Number(scene?.end_s ?? scene?.end ?? start + 10);
      return {
        scene_id: scene?.scene_id || scene?.id || index + 1,
        start_s: Number.isFinite(start) ? Math.max(0, Number(start.toFixed(3))) : 0,
        end_s: Number.isFinite(end) ? Math.max(0, Number(end.toFixed(3))) : 0,
        lyrics_summary: String(scene?.lyrics_summary || '').trim(),
        image_prompt: String(scene?.image_prompt || scene?.prompt || '').trim(),
        video_prompt: String(scene?.video_prompt || scene?.motionPrompt || scene?.motion_prompt || '').trim(),
        kind: scene?.kind === 'instrumental' ? 'instrumental' : scene?.kind === 'lyric' ? 'lyric' : undefined,
        timeline_config: scene?.timeline_config || scene?.timelineConfig,
      };
    })
    .filter((scene: LyricVideoPromptSceneResult) => scene.end_s > scene.start_s && scene.image_prompt && scene.video_prompt)
    .map((scene: LyricVideoPromptSceneResult, index: number) => ({
      ...scene,
      scene_id: scene.scene_id || index + 1,
    }));
}

export function buildStoryboardScenesPrompt(params: {
  songAnalysis: LyricVideoSongAnalysisResult;
  scenes: FixedStoryboardSceneDraft[];
  project?: any;
  storyPrompt?: string;
}) {
  const bpm = Number(params.scenes.find((scene) => scene.bpm)?.bpm || 0);
  const beatSeconds = bpm > 0 ? Number((60 / bpm).toFixed(2)) : undefined;
  const bpmText = bpm > 0 ? `${bpm}${beatSeconds ? ` (约每拍 ${beatSeconds}s)` : ''}` : 'unknown';
  const styleText = [
    params.project?.artStyle ? `Art style: ${params.project.artStyle}` : '',
    params.project?.palette ? `Palette: ${params.project.palette}` : '',
    params.storyPrompt || params.project?.storyPrompt ? `Story direction: ${params.storyPrompt || params.project?.storyPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const fixedScenes = params.scenes.map((scene, index) => ({
    scene_id: scene.sceneId,
    index: index + 1,
    kind: scene.kind,
    shotType: scene.shotType,
    start_s: secondsFromMs(scene.startMs),
    end_s: secondsFromMs(scene.endMs),
    text: scene.text,
    energyLevel: scene.energyLevel,
    bpm: scene.bpm,
    prevLyric: scene.prevLyric,
    nextLyric: scene.nextLyric,
  }));

  return `你是一位专业音乐视频导演。现在分镜边界和镜头类型已经由系统确定，你不能改动 scene 数量、顺序、kind、shotType、start_s、end_s。

## 歌曲理解
${JSON.stringify(params.songAnalysis)}

## 视觉设定
${styleText || 'Use a cinematic lyric video style with consistent characters, location logic, and color palette.'}

## 固定分镜
${JSON.stringify(fixedScenes)}

## 你的任务
为每个固定 scene 补充 image_prompt 和 video_prompt，只输出 JSON：

{
  "scenes": [
    {
      "scene_id": "必须等于输入 scene_id",
      "image_prompt": "英文静态画面描述，严格匹配输入 shotType，适合图片生成",
      "video_prompt": "英文运动描述，包含 Camera 机位/运动/稳定性、与 shotType 匹配的运动细节，适合 img2video"
    }
  ]
}

## 要求
- 不要合并、拆分、删除、重排任何 scene；不要改变输入的 shotType
- lyric scene 根据 text 的歌词语义设计画面
- instrumental scene 使用 prevLyric/nextLyric 做过渡；优先写成物件特写、环境空镜、光影或天气变化，不引入新角色、新地点、新故事线
- shotType=character_shot：image_prompt 必须出现既定主角，保持人物外貌一致，写清人物动作/情绪/环境/光线/构图
- shotType=insert_shot：image_prompt 必须是空镜或细节特写，聚焦物件、身体局部、衣角、鞋、口袋、尘土、火光、道路纹理等；不要出现完整人物、不要露脸、不要新增角色
- shotType=landscape_shot：image_prompt 必须以环境为主体，优先大远景、道路、天空、地平线、天气、光影；可以没有人物，若有人只能是极小剪影，不要把主角放在画面中心
- image_prompt 必须保持地点、色彩和视觉元素一致，不要出现文字、歌词、字幕、logo
- video_prompt 第一短句必须以 Camera 开头；不要描述字幕；不要让画面变成新镜头内容
- character_shot 的 video_prompt 写主角动作；insert_shot 的 video_prompt 写物件/局部/粒子/光影运动；landscape_shot 的 video_prompt 写环境运动
- energyLevel=low 时运动 slow/smooth/subtle；medium 时 steady/controlled/rhythmic；high 时 faster/handheld/stronger
- video_prompt 中的运动节奏要匹配 BPM ${bpmText}
- 只输出 JSON，不要解释`;
}

export function buildDebugStoryboardScenesPrompt(params: {
  songAnalysis: LyricVideoSongAnalysisResult;
  scenes: FixedStoryboardSceneDraft[];
  project?: any;
  storyPrompt?: string;
}) {
  const bpm = Number(params.scenes.find((scene) => scene.bpm)?.bpm || 0);
  const beatSeconds = bpm > 0 ? Number((60 / bpm).toFixed(2)) : undefined;
  const bpmText = bpm > 0 ? `${bpm}${beatSeconds ? ` (约每拍 ${beatSeconds}s)` : ''}` : 'unknown';
  const styleText = [
    params.project?.artStyle ? `Art style: ${params.project.artStyle}` : '',
    params.project?.palette ? `Palette: ${params.project.palette}` : '',
    params.storyPrompt || params.project?.storyPrompt ? `Story direction: ${params.storyPrompt || params.project?.storyPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const fixedScenes = params.scenes.map((scene, index) => ({
    scene_id: scene.sceneId,
    index: index + 1,
    kind: scene.kind,
    shotType: scene.shotType,
    start_s: secondsFromMs(scene.startMs),
    end_s: secondsFromMs(scene.endMs),
    text: scene.text,
    energyLevel: scene.energyLevel,
    bpm: scene.bpm,
    prevLyric: scene.prevLyric,
    nextLyric: scene.nextLyric,
  }));

  return `你是一位专业音乐视频导演。现在分镜边界和镜头类型已经由系统确定，你不能改动 scene 数量、顺序、kind、shotType、start_s、end_s。

## 歌曲理解
${JSON.stringify(params.songAnalysis)}

## 视觉设定
${styleText || 'Use a cinematic lyric video style with consistent characters, location logic, and color palette.'}

## 固定分镜
${JSON.stringify(fixedScenes)}

## 你的任务
为每个固定 scene 补充 image_prompt 和 video_prompt，只输出 JSON：

{
  "scenes": [
    {
      "scene_id": "必须等于输入 scene_id",
      "image_prompt": "英文静态画面描述，严格匹配输入 shotType，适合图片生成",
      "video_prompt": "英文运动描述，包含 Camera 机位/运动/稳定性、与 shotType 匹配的运动细节，适合 img2video"
    }
  ]
}

## 要求

### 基本规则
- 不要合并、拆分、删除、重排任何 scene；不要改变输入的 shotType
- lyric scene 根据 text 的歌词语义设计画面
- instrumental scene 使用 prevLyric/nextLyric 做过渡；优先写成物件特写、环境空镜、光影或天气变化，不引入新角色、新地点、新故事线

### shotType 规则
- shotType=character_shot：image_prompt 必须出现既定主角，保持人物外貌一致，写清人物动作/情绪/环境/光线/构图
- shotType=insert_shot：image_prompt 必须是空镜或细节特写，聚焦物件、身体局部、衣角、道具、光影纹理等；不要出现完整人物、不要露脸、不要新增角色
- shotType=landscape_shot：image_prompt 必须以环境为主体，优先大远景、道路、天空、地平线、天气、光影；可以没有人物，若有人只能是极小剪影，不要把主角放在画面中心

### 场景空间与叙事（关键改动）
- image_prompt 的场景必须严格遵循 location_plan 中对应时间段的空间设定，不能全片用同一个环境
- 当 location_plan 指定了空间切换时，image_prompt 的环境、色调、光线必须跟着变
- 每个 character_shot 的主角动作必须对应 narrative_arc 中对应时间段的 plot_beat，不能只站着/走着/摆姿势
- 主角在不同段落的情绪表达要有明显变化，不能全程微笑或全程坚定

### 道具使用（关键改动）
- insert_shot 优先使用 key_props 中定义的道具
- 同一道具在不同场景出现时，必须体现 state_progression 中定义的状态变化（如第一次出现是完整的，第二次出现是破损的）
- 如果当前 scene 附近的 narrative_arc 提到了某个道具相关的故事事件，该 scene 的 image_prompt 必须包含该道具
- 非 key_props 的 insert_shot 可以使用环境细节，但不能重复使用同一类物件（如不能三个 insert_shot 都拍灰尘）

### 视觉一致性
- image_prompt 必须保持 visual_style 和当前段落 color_tone 的一致
- 不要出现文字、歌词、字幕、logo

### video_prompt 规则
- video_prompt 第一短句必须以 Camera 开头；不要描述字幕；不要让画面变成新镜头内容
- character_shot 的 video_prompt 写主角动作
- insert_shot 的 video_prompt 写物件/局部/粒子/光影运动
- landscape_shot 的 video_prompt 写环境运动
- energyLevel=low 时运动 slow/smooth/subtle；medium 时 steady/controlled/rhythmic；high 时 faster/handheld/stronger
- video_prompt 中的运动节奏要匹配 BPM ${bpmText}

### 全局
- 只输出 JSON，不要解释`;
}

export async function generateStoryboardScenesWithKieForDebug(params: {
  songAnalysis?: LyricVideoSongAnalysisResult;
  preprocess: LyricVideoLlmPreprocessResult;
  audioAnalysis?: AudioAnalysisResult;
  model?: string;
}) {
  if (!params.preprocess || !Array.isArray(params.preprocess.lines) || params.preprocess.lines.length === 0) {
    throw new Error('preprocess.lines is required for Prompt 2');
  }

  const model = params.model || 'claude-opus-4-5';
  const songAnalysis = params.songAnalysis && typeof params.songAnalysis === 'object'
    ? params.songAnalysis
    : normalizeSongAnalysis({
        theme: params.preprocess.song || 'lyric video',
        visual_style: 'cinematic lyric video',
        notes: 'Generate consistent scene prompts from fixed Whisper lyric scenes.',
      });
  const audioAnalysis = params.audioAnalysis || audioAnalysisFromLlmPreprocess(params.preprocess);
  const fixedScenes = buildFixedStoryboardSceneDrafts({
    lines: params.preprocess.lines.map((line, index) => ({
      id: `line_${index + 1}`,
      startMs: Math.round(line.start_s * 1000),
      endMs: Math.round(line.end_s * 1000),
      text: line.text,
    })),
    audioAnalysis,
  });
  const prompt = buildDebugStoryboardScenesPrompt({
    songAnalysis,
    scenes: fixedScenes,
  });
  const result = await callKieClaudeMessages({
    text: prompt,
    model,
    thinkingFlag: true,
    maxTokens: 4096,
  });
  const parsed = parseJsonLoose<any>(result.content, {});
  const promptScenes = new Map(normalizePromptScenes(parsed).map((scene) => [String(scene.scene_id), scene]));
  const scenes = fixedScenes.map((scene, index) => {
    const generated = promptScenes.get(scene.sceneId) || promptScenes.get(String(index + 1));
    const fallback = fallbackPromptForFixedScene({ scene, project: {}, storyPrompt: songAnalysis.theme });
    return {
      scene_id: index + 1,
      id: scene.sceneId,
      kind: scene.kind,
      start_s: secondsFromMs(scene.startMs),
      end_s: secondsFromMs(scene.endMs),
      lyrics_summary: scene.text,
      image_prompt: generated?.image_prompt || fallback.imagePrompt,
      video_prompt: generated?.video_prompt || fallback.videoPrompt,
      timeline_config: buildSceneTimelineConfig(scene),
      linkedLineIds: scene.linkedLineIds,
    };
  });

  return {
    provider: 'kie_claude',
    model,
    actualModel: result.model,
    scenes,
    fixedScenes,
    rawText: result.content,
    raw: result.raw,
  };
}

export function assertUsableSongAnalysis(songAnalysis: LyricVideoSongAnalysisResult) {
  const hasContent = Boolean(
    songAnalysis.theme ||
      songAnalysis.visual_style ||
      songAnalysis.characters.length > 0 ||
      songAnalysis.narrative_arc.length > 0 ||
      songAnalysis.location_plan.length > 0 ||
      songAnalysis.emotion_arc.length > 0
  );
  if (!hasContent) {
    throw new Error('Song analysis returned no usable JSON content');
  }
}

export async function generateStoryboardScenesWithKieClaude(params: {
  songAnalysis: LyricVideoSongAnalysisResult;
  fixedScenes: FixedStoryboardSceneDraft[];
  project: any;
  model?: string;
}) {
  if (params.fixedScenes.length === 0) {
    throw new Error('No fixed scenes available for storyboard prompt generation');
  }

  const model = params.model || DEFAULT_STORYBOARD_MODEL;
  const prompt = buildDebugStoryboardScenesPrompt({
    songAnalysis: params.songAnalysis,
    scenes: params.fixedScenes,
    project: params.project,
    storyPrompt: params.project?.storyPrompt,
  });
  const result = await callKieClaudeMessages({
    text: prompt,
    model,
    thinkingFlag: true,
    maxTokens: 4096,
  });
  const parsed = parseJsonLoose<any>(result.content, {});
  const promptScenes = new Map(normalizePromptScenes(parsed).map((scene) => [String(scene.scene_id), scene]));

  const missingSceneIds = params.fixedScenes
    .filter((scene, index) => !promptScenes.get(scene.sceneId) && !promptScenes.get(String(index + 1)))
    .map((scene) => scene.sceneId);
  if (promptScenes.size === 0 || missingSceneIds.length > 0) {
    throw new Error(
      missingSceneIds.length > 0
        ? `Storyboard prompt generation missed scenes: ${missingSceneIds.join(', ')}`
        : 'Storyboard prompt generation returned no valid scenes'
    );
  }

  const scenes: SceneInput[] = params.fixedScenes.map((scene, index) => {
    const generated = promptScenes.get(scene.sceneId) || promptScenes.get(String(index + 1));
    if (!generated?.image_prompt || !generated?.video_prompt) {
      throw new Error(`Storyboard prompt generation returned incomplete prompts for ${scene.sceneId}`);
    }
    return {
      startMs: scene.startMs,
      endMs: scene.endMs,
      text: scene.text,
      prompt: generated.image_prompt,
      motionPrompt: generated.video_prompt,
      linkedLineIds: scene.linkedLineIds,
      timelineConfig: generated.timeline_config || buildSceneTimelineConfig(scene),
      negativePrompt: 'text, captions, subtitles, lyrics, watermark, logo, blurry, low quality',
    };
  });

  return {
    provider: 'kie_claude',
    model,
    actualModel: result.model,
    scenes,
    fixedScenes: params.fixedScenes,
    rawText: result.content,
    raw: result.raw,
  };
}

export async function generateStoryboardWithKieGemini(params: {
  lines: any[];
  project: any;
  storyPrompt?: string;
}): Promise<StoryboardScene[]> {
  const audioAnalysis = readAudioAnalysis(params.project);
  const fixedScenes = buildFixedStoryboardSceneDrafts({
    lines: params.lines,
    audioAnalysis,
  });
  const fallback = buildHeuristicStoryboard(params);
  const configs = await getAllConfigs();
  if (!configs.kie_api_key) return fallback;

  const prompt = buildStoryboardScenesPrompt({
    songAnalysis: {
      theme: params.storyPrompt || params.project.storyPrompt || params.project.title || 'emotional lyric video',
      characters: [],
      key_props: [],
      narrative_arc: [],
      location_plan: [],
      emotion_arc: [],
      visual_style: params.project.artStyle || 'cinematic lyric video',
      color_palette: String(params.project.palette || '').split(',').map((color) => color.trim()).filter(Boolean),
      notes: audioAnalysisPromptSummary(params.project),
    },
    scenes: fixedScenes,
    project: params.project,
    storyPrompt: params.storyPrompt,
  });

  const result = await callKieGeminiChat({
    text: prompt,
    responseFormat: {
      type: 'json_schema',
      properties: {
        scenes: {
          type: 'array',
          items: {
              type: 'object',
              properties: {
              scene_id: { type: 'string' },
              image_prompt: { type: 'string' },
              video_prompt: { type: 'string' },
            },
            required: ['scene_id', 'image_prompt', 'video_prompt'],
          },
        },
      },
    },
  });

  const content = result.content || '{}';
  const parsed = parseJsonLoose<any>(content, {});
  const promptScenes = new Map(normalizePromptScenes(parsed).map((scene) => [String(scene.scene_id), scene]));
  if (promptScenes.size === 0) return fallback;

  return fixedScenes.map((scene, index) => {
    const generated = promptScenes.get(scene.sceneId) || promptScenes.get(String(index + 1));
    const fallbackPrompt = fallbackPromptForFixedScene({
      scene,
      project: params.project,
      storyPrompt: params.storyPrompt,
    });
    return {
      startMs: scene.startMs,
      endMs: scene.endMs,
      text: scene.text,
      prompt: generated?.image_prompt || fallbackPrompt.imagePrompt,
      motionPrompt: generated?.video_prompt || fallbackPrompt.videoPrompt,
      linkedLineIds: scene.linkedLineIds,
      timelineConfig: buildSceneTimelineConfig(scene),
      negativePrompt: 'text, captions, subtitles, lyrics, watermark, logo, blurry, low quality',
    };
  }).filter((scene) => scene.prompt);
}

export async function generateStoryPromptWithKieGemini(params: {
  lines: any[];
  project: any;
}) {
  const lyrics = params.lines
    .map((line, index) => `${index + 1}. ${line.text}`)
    .join('\n');
  const prompt = `Write an English visual story prompt for a lyric video.
Use the lyrics, title, style, palette, and format to create a cinematic concept that an image/storyboard generator can follow.
Return only the story text, no markdown, no headings, no bullet points.
Length: 120-180 English words.
Requirements: consistent characters and setting, clear visual arc from beginning to ending, recurring motifs, emotionally matched to the lyrics, no text, no typography, no subtitles in the images.

Project title: ${params.project.title}
Lyrics language: ${params.project.language || 'auto'}
Art style: ${params.project.artStyle}
Palette: ${params.project.palette}
Aspect ratio: ${params.project.aspectRatio}

Lyrics:
${lyrics}`;

  const result = await callKieGeminiChat({ text: prompt });
  return result.content.replace(/^["']|["']$/g, '').trim();
}

export function buildHeuristicStoryboard(params: { lines: any[]; project: any; storyPrompt?: string }) {
  const drafts = buildFixedStoryboardSceneDrafts({
    lines: params.lines,
    audioAnalysis: readAudioAnalysis(params.project),
  });

  return drafts.map((scene) => {
    const fallback = fallbackPromptForFixedScene({
      scene,
      project: params.project,
      storyPrompt: params.storyPrompt,
    });
    return {
      startMs: scene.startMs,
      endMs: scene.endMs,
      text: scene.text,
      linkedLineIds: scene.linkedLineIds,
      prompt: fallback.imagePrompt,
      motionPrompt: fallback.videoPrompt,
      timelineConfig: buildSceneTimelineConfig(scene),
      negativePrompt: 'text, captions, subtitles, lyrics, watermark, logo, blurry, low quality',
    };
  });
}

export async function createKieProvider() {
  const configs = await getAllConfigs();
  if (!configs.kie_api_key) {
    throw new Error('Kie API key is required. Add it in Admin Settings > AI.');
  }
  return new KieProvider({
    apiKey: configs.kie_api_key,
    customStorage: isStorageConfigured(),
    saveFiles: saveAIProviderFiles,
    uuid: getUuid,
  });
}

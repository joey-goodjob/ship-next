import { envConfigs } from '@/config';
import { GroqProvider, KieProvider } from '@/core/ai';
import { getUuid } from '@/lib/hash';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { getAllConfigs } from '@/modules/config/service';
import { isStorageConfigured } from '@/modules/storage/service';
import { saveAIProviderFiles } from './audio';
import { audioAnalysisPromptSummary, parseLinesFromText, refineAsrSegmentsWithWords, readAudioAnalysis } from './asr';
import { attachLyricVideoDiagnostics, createLyricVideoError } from './diagnostics';
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

/**
 * LLM 边界模块：负责把内部结构发给 Kie/Groq 等供应商，并把模型输出整理成内部格式。
 *
 * 主链路里，`generation-runner.ts` 不直接拼请求细节，而是调用这里：
 * - `analyzeSongWithKieForDebug`：Prompt1，分析歌曲情绪/主题/视觉方向。
 * - `generateStoryboardScenesWithKieClaude`：Prompt2，基于固定 scene 时间边界补 prompt。
 *
 * 这里通常只保存到 `ai_task` 或 generation step 的 input/output；真正业务表
 * `lyric_video_scene` 的写入仍由 `storyboard.ts` 的 `replaceScenes` 完成。
 */

function providerErrorMessage(label: string, status: number, text: string) {
  const title = text.match(/<title>(.*?)<\/title>/i)?.[1];
  const clean = previewText(title || text, 300);
  return `${label} failed: ${status}${clean ? ` ${clean}` : ''}`;
}

function isTransientProviderStatus(status: number) {
  return [408, 429, 500, 502, 503, 504, 520, 522, 524].includes(status);
}

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
    throw createLyricVideoError('Kie API key is required. Add it in Admin Settings > AI.', {
      errorKind: 'provider_request_failed',
      provider: 'kie_gemini',
      model,
      diagnostics: { endpoint },
    });
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

  const startedAt = Date.now();
  logLyricStage('kie-gemini-chat', 'request-start', {
    model,
    endpoint,
    hasMediaUrl: Boolean(params.mediaUrl),
    hasResponseFormat: Boolean(params.responseFormat),
    promptLength: params.text.length,
  });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    logLyricStageError('kie-gemini-chat', 'request-error', error, {
      durationMs: Date.now() - startedAt,
      model,
      endpoint,
    });
    throw attachLyricVideoDiagnostics(error instanceof Error ? error : new Error(String(error || 'Kie Gemini request failed')), {
      errorKind: 'provider_request_failed',
      provider: 'kie_gemini',
      model,
      diagnostics: { endpoint, durationMs: Date.now() - startedAt, promptLength: params.text.length },
    });
  }

  if (!response.ok) {
    const text = await response.text();
    logLyricStage('kie-gemini-chat', 'response-error', {
      durationMs: Date.now() - startedAt,
      model,
      endpoint,
      status: response.status,
      errorPreview: text,
    });
    throw createLyricVideoError(providerErrorMessage('Kie Gemini chat', response.status, text), {
      errorKind: 'provider_request_failed',
      provider: 'kie_gemini',
      model,
      diagnostics: {
        endpoint,
        status: response.status,
        durationMs: Date.now() - startedAt,
        responsePreview: previewText(text, 1200),
      },
    });
  }

  const data = await response.json();
  const contentText = chatContentToText(data.choices?.[0]?.message?.content || '');
  logLyricStage('kie-gemini-chat', 'response-success', {
    durationMs: Date.now() - startedAt,
    model: data.model || model,
    endpoint,
    status: response.status,
    contentLength: contentText.length,
    contentPreview: contentText,
  });
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
  const model = params.model || configs.kie_claude_model;

  if (!apiKey) {
    throw createLyricVideoError('Kie API key is required. Add it in Admin Settings > AI.', {
      errorKind: 'provider_request_failed',
      provider: 'kie_claude',
      model,
      diagnostics: { endpoint },
    });
  }
  if (!model) {
    throw createLyricVideoError('Claude model is required when using the Kie Claude endpoint.', {
      errorKind: 'input_missing',
      provider: 'kie_claude',
      diagnostics: { endpoint },
    });
  }

  const startedAt = Date.now();
  logLyricStage('kie-claude-messages', 'request-start', {
    model,
    endpoint,
    promptLength: params.text.length,
    maxTokens: params.maxTokens ?? 4096,
    thinkingFlag: params.thinkingFlag ?? true,
  });

  let response: Response;
  try {
    response = await fetch(endpoint, {
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
  } catch (error) {
    logLyricStageError('kie-claude-messages', 'request-error', error, {
      durationMs: Date.now() - startedAt,
      model,
      endpoint,
    });
    throw attachLyricVideoDiagnostics(error instanceof Error ? error : new Error(String(error || 'Kie Claude request failed')), {
      errorKind: 'provider_request_failed',
      provider: 'kie_claude',
      model,
      diagnostics: { endpoint, durationMs: Date.now() - startedAt, promptLength: params.text.length },
    });
  }

  if (!response.ok) {
    const text = await response.text();
    logLyricStage('kie-claude-messages', 'response-error', {
      durationMs: Date.now() - startedAt,
      model,
      endpoint,
      status: response.status,
      errorPreview: text,
    });
    throw createLyricVideoError(providerErrorMessage('Kie Claude messages', response.status, text), {
      errorKind: 'provider_request_failed',
      provider: 'kie_claude',
      model,
      diagnostics: {
        endpoint,
        status: response.status,
        durationMs: Date.now() - startedAt,
        responsePreview: previewText(text, 1200),
      },
    });
  }

  const data = await response.json();
  const contentText = chatContentToText(data.content || '');
  logLyricStage('kie-claude-messages', 'response-success', {
    durationMs: Date.now() - startedAt,
    model: data.model || model,
    endpoint,
    status: response.status,
    contentLength: contentText.length,
    contentPreview: contentText,
  });
  return {
    model: data.model || model,
    raw: data,
    content: contentText,
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
  const model = params.model || configs.kie_codex_model || DEFAULT_STORYBOARD_MODEL;

  if (!apiKey) {
    throw createLyricVideoError('Kie API key is required. Add it in Admin Settings > AI.', {
      errorKind: 'provider_request_failed',
      provider: 'kie_codex',
      model,
      diagnostics: { endpoint },
    });
  }

  const startedAt = Date.now();
  logLyricStage('kie-codex-responses', 'request-start', {
    model,
    endpoint,
    promptLength: params.text.length,
    reasoningEffort: params.reasoningEffort || 'medium',
  });

  let response: Response | undefined;
  let lastRequestError: unknown;
  const requestBody = JSON.stringify({
    model,
    stream: false,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: params.text }],
      },
    ],
    reasoning: { effort: params.reasoningEffort || 'medium' },
  });

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });
      if (!response.ok && isTransientProviderStatus(response.status) && attempt < maxAttempts) {
        const text = await response.text();
        logLyricStage('kie-codex-responses', 'response-retry', {
          durationMs: Date.now() - startedAt,
          model,
          endpoint,
          status: response.status,
          attempt,
          maxAttempts,
          errorPreview: previewText(text, 500),
        });
        await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
        response = undefined;
        continue;
      }
      break;
    } catch (error) {
      logLyricStageError('kie-codex-responses', attempt < 3 ? 'request-retry' : 'request-error', error, {
        durationMs: Date.now() - startedAt,
        model,
        endpoint,
        attempt,
      });
      lastRequestError = attachLyricVideoDiagnostics(error instanceof Error ? error : new Error(String(error || 'Kie Codex request failed')), {
        errorKind: 'provider_request_failed',
        provider: 'kie_codex',
        model,
        attempt,
        diagnostics: {
          endpoint,
          durationMs: Date.now() - startedAt,
          promptLength: params.text.length,
          maxAttempts,
        },
      });
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }

  if (!response) {
    throw lastRequestError;
  }

  if (!response.ok) {
    const text = await response.text();
    logLyricStage('kie-codex-responses', 'response-error', {
      durationMs: Date.now() - startedAt,
      model,
      endpoint,
      status: response.status,
      errorPreview: text,
    });
    throw createLyricVideoError(providerErrorMessage('Kie Codex responses', response.status, text), {
      errorKind: 'provider_request_failed',
      provider: 'kie_codex',
      model,
      diagnostics: {
        endpoint,
        status: response.status,
        durationMs: Date.now() - startedAt,
        responsePreview: previewText(text, 1200),
      },
    });
  }

  const data = await response.json();
  const contentText = chatContentToText(data.output_text || data.output || data.content || data.response?.output || '');
  logLyricStage('kie-codex-responses', 'response-success', {
    durationMs: Date.now() - startedAt,
    model: data.model || data.response?.model || model,
    endpoint,
    status: response.status,
    contentLength: contentText.length,
    contentPreview: contentText,
  });
  return {
    model: data.model || data.response?.model || model,
    raw: data,
    content: contentText,
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
  const storyActs = Array.isArray(parsed?.story_acts) ? parsed.story_acts : [];
  const locationPlan = Array.isArray(parsed?.location_plan) ? parsed.location_plan : [];
  const emotionArc = Array.isArray(parsed?.emotion_arc) ? parsed.emotion_arc : [];
  const normalizedNarrativeArc: LyricVideoSongAnalysisResult['narrative_arc'] = narrativeArc
    .map((item: any) => ({
      time_range: String(item?.time_range || '').trim(),
      section_label: String(item?.section_label || '').trim(),
      plot_beat: String(item?.plot_beat || '').trim(),
      visual_anchor: String(item?.visual_anchor || '').trim(),
    }))
    .filter((item: LyricVideoSongAnalysisResult['narrative_arc'][number]) => item.time_range && item.plot_beat);
  const normalizedStoryActs: LyricVideoSongAnalysisResult['story_acts'] = storyActs
    .map((item: any, index: number) => ({
      title: String(item?.title || `Act ${index + 1}`).trim(),
      description: String(item?.description || item?.text || item?.plot || '').trim(),
    }))
    .filter((item: LyricVideoSongAnalysisResult['story_acts'][number]) => item.description);
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
    narrative_arc: normalizedNarrativeArc,
    story_acts:
      normalizedStoryActs.length > 0
        ? normalizedStoryActs
        : normalizedNarrativeArc.map((item, index) => ({
            title: `Act ${index + 1}`,
            description: [item.plot_beat, item.visual_anchor ? `Visual anchor: ${item.visual_anchor}` : ''].filter(Boolean).join(' '),
          })),
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

export function formatStoryActsText(songAnalysis?: Partial<LyricVideoSongAnalysisResult> | null) {
  const acts = Array.isArray(songAnalysis?.story_acts) ? songAnalysis.story_acts : [];
  return acts
    .map((act, index) => {
      const title = String(act?.title || `Act ${index + 1}`).trim();
      const normalizedTitle = /^act\s+\d+\s*:/i.test(title)
        ? title
        : /^act\s+\d+$/i.test(title)
          ? `${title}:`
          : `Act ${index + 1}: ${title}`;
      const description = String(act?.description || '').trim();
      return description ? `${normalizedTitle}\n${description}` : '';
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
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
  "story_acts": [
    {
      "title": "Act 1",
      "description": "英文视觉叙事段落。覆盖一个较大的歌曲区间，不是单个镜头；包含主角动作、场景、视觉母题和情绪推进。"
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

### story_acts
- 产出 3-5 个 Act，作为用户在 Customize > Story 里看到和编辑的 MV 故事编排
- 每个 Act 要覆盖一个较大的叙事段落，不能是一条 scene 或一个镜头
- description 必须用英文自然段，80-120 words，写清楚人物动作、地点、视觉母题、情绪推进和转场方向
- Acts 之间要形成完整起承转合，后续 Prompt2 会根据这些 Acts 拆成很多 scenes
- 不要在 description 里写字幕、歌词文字、屏幕文字或 UI 文案

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
  const provider = params.provider || 'kie_codex';
  if (!['kie_claude', 'kie_codex', 'kie_gemini'].includes(provider)) {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
  if (!params.preprocess || !Array.isArray(params.preprocess.lines) || params.preprocess.lines.length === 0) {
    throw createLyricVideoError('preprocess.lines is required for song analysis', {
      errorKind: 'input_missing',
      stage: 'song_analysis',
      provider,
      model: params.model,
      diagnostics: { hasPreprocess: Boolean(params.preprocess), lineCount: params.preprocess?.lines?.length || 0 },
    });
  }

  const prompt = buildSongAnalysisPrompt(params.preprocess);
  const warnings: string[] = [];
  let result: Awaited<ReturnType<typeof callKieCodexResponses>> | Awaited<ReturnType<typeof callKieGeminiChat>> | Awaited<ReturnType<typeof callKieClaudeMessages>> | undefined;
  let songAnalysis: LyricVideoSongAnalysisResult | undefined;
  let lastValidationError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    result =
      provider === 'kie_codex'
        ? await callKieCodexResponses({ text: prompt, model: params.model })
        : provider === 'kie_gemini'
          ? await callKieGeminiChat({ text: prompt, model: params.model })
          : await callKieClaudeMessages({ text: prompt, model: params.model, thinkingFlag: false, maxTokens: 8192 });
    songAnalysis = normalizeSongAnalysis(parseJsonLoose<any>(result.content, {}));

    try {
      assertUsableSongAnalysis(songAnalysis);
      break;
    } catch (error) {
      lastValidationError = error;
      logLyricStageError('kie-song-analysis', attempt < 2 ? 'validation-retry' : 'validation-error', error, {
        provider,
        model: params.model || result.model,
        attempt,
        contentPreview: previewText(result.content, 500),
      });
      if (attempt < 2) {
        warnings.push('Prompt1 returned unusable song analysis; retried once.');
        continue;
      }
      throw attachLyricVideoDiagnostics(error instanceof Error ? error : new Error(String(error || 'Prompt1 validation failed')), {
        errorKind: 'provider_invalid_response',
        stage: 'song_analysis',
        provider,
        model: params.model || result.model,
        attempt,
        diagnostics: {
          attempts: 2,
          warnings,
          rawText: result.content,
          raw: result.raw,
          normalizedSongAnalysis: songAnalysis,
          contentPreview: previewText(result.content, 1200),
        },
      });
    }
  }

  if (!result || !songAnalysis) {
    throw attachLyricVideoDiagnostics(
      lastValidationError instanceof Error ? lastValidationError : new Error('Song analysis returned no usable JSON content'),
      {
        errorKind: 'provider_invalid_response',
        stage: 'song_analysis',
        provider,
        model: params.model,
        diagnostics: { warnings },
      }
    );
  }

  return {
    provider,
    model: params.model || result.model,
    actualModel: result.model,
    songAnalysis,
    rawText: result.content,
    raw: result.raw,
    retryMode: warnings.length > 0 ? 'full' : 'none',
    attempts: warnings.length > 0 ? 2 : 1,
    warnings,
  };
}

export async function analyzeSongWithKieClaudeForDebug(preprocess: LyricVideoLlmPreprocessResult) {
  return analyzeSongWithKieForDebug({ preprocess, provider: 'kie_codex' });
}

function normalizePromptScenesForRepair(parsed: any): LyricVideoPromptSceneResult[] {
  const scenes = Array.isArray(parsed?.scenes) ? parsed.scenes : Array.isArray(parsed) ? parsed : [];
  return scenes
    .map((scene: any, index: number) => {
      const start = Number(scene?.start_s ?? scene?.start ?? 0);
      const end = Number(scene?.end_s ?? scene?.end ?? start + 10);
      const rawCastIds = Array.isArray(scene?.castIds)
        ? scene.castIds
        : Array.isArray(scene?.cast_ids)
          ? scene.cast_ids
          : [];
      return {
        scene_id: scene?.scene_id || scene?.id || index + 1,
        start_s: Number.isFinite(start) ? Math.max(0, Number(start.toFixed(3))) : 0,
        end_s: Number.isFinite(end) ? Math.max(0, Number(end.toFixed(3))) : 0,
        lyrics_summary: String(scene?.lyrics_summary || '').trim(),
        image_prompt: String(scene?.image_prompt || scene?.prompt || '').trim(),
        video_prompt: String(scene?.video_prompt || scene?.motionPrompt || scene?.motion_prompt || '').trim(),
        castIds: rawCastIds.map((id: unknown) => String(id || '').trim()).filter(Boolean),
        kind: scene?.kind === 'instrumental' ? 'instrumental' : scene?.kind === 'lyric' ? 'lyric' : undefined,
        timeline_config: scene?.timeline_config || scene?.timelineConfig,
      };
    })
    .filter((scene: LyricVideoPromptSceneResult) => scene.end_s > scene.start_s)
    .map((scene: LyricVideoPromptSceneResult, index: number) => ({
      ...scene,
      scene_id: scene.scene_id || index + 1,
    }));
}

export function normalizePromptScenes(parsed: any): LyricVideoPromptSceneResult[] {
  return normalizePromptScenesForRepair(parsed).filter(
    (scene) => scene.image_prompt && scene.video_prompt
  );
}

function activeMainCast(cast?: any[]) {
  return (Array.isArray(cast) ? cast : [])
    .filter((member: any) => !member.deletedAt)
    .filter((member: any) => ['active', 'processing', 'candidate'].includes(String(member.status || 'active')))
    .filter((member: any) => String(member.role || '').toLowerCase() === 'main' || !String(member.role || '').trim())
    .sort((a: any, b: any) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
}

function singleActiveMainCastId(cast?: any[]) {
  const mainCast = activeMainCast(cast).filter((member: any) => String(member.status || 'active') === 'active');
  return mainCast.length === 1 ? String(mainCast[0].id) : '';
}

function castIdsForGeneratedScene(params: {
  generated?: LyricVideoPromptSceneResult;
  scene: FixedStoryboardSceneDraft;
  cast?: any[];
}) {
  const explicit = (params.generated?.castIds || []).filter(Boolean);
  if (explicit.length > 0) return explicit;
  const defaultCastId = singleActiveMainCastId(params.cast);
  return defaultCastId && params.scene.shotType === 'character_shot' ? [defaultCastId] : [];
}

function buildStoryboardCastBlock(cast?: any[]) {
  const mainCast = activeMainCast(cast);
  if (mainCast.length === 0) {
    return 'No user-selected cast is available. Do not invent named characters beyond the established main character implied by the song.';
  }

  const castPayload = mainCast.map((member: any) => ({
    id: member.id,
    name: member.name,
    role: member.role || 'main',
    description: member.description,
    promptFragment: member.promptFragment || member.description,
    hasReferenceImage: Boolean(member.referenceImageUrl),
  }));
  return [
    'Use only these user-selected cast members for character_shot scenes:',
    JSON.stringify(castPayload),
    'For each character_shot, include cast_ids with the selected cast id(s). If there is exactly one active main cast, use that cast for every character_shot.',
  ].join('\n');
}

export function buildStoryboardScenesPrompt(params: {
  songAnalysis: LyricVideoSongAnalysisResult;
  scenes: FixedStoryboardSceneDraft[];
  project?: any;
  storyPrompt?: string;
  cast?: any[];
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
    planning: scene.planning,
  }));

  return `你是一位专业音乐视频导演。现在分镜边界和镜头类型已经由系统确定，你不能改动 scene 数量、顺序、kind、shotType、start_s、end_s。

## 歌曲理解
${JSON.stringify(params.songAnalysis)}

	## 视觉设定
	${styleText || 'Use a cinematic lyric video style with consistent characters, location logic, and color palette.'}

## 用户选择的角色
${buildStoryboardCastBlock(params.cast)}

	## 固定分镜
	${JSON.stringify(fixedScenes)}

## 你的任务
为每个固定 scene 补充 image_prompt 和 video_prompt，只输出 JSON：

{
  "scenes": [
    {
	      "scene_id": "必须等于输入 scene_id",
	      "cast_ids": ["character_shot 使用的角色 id；非 character_shot 可为空数组"],
	      "image_prompt": "英文静态画面描述，严格匹配输入 shotType，适合图片生成",
	      "video_prompt": "英文运动描述，包含 Camera 机位/运动/稳定性、与 shotType 匹配的运动细节，适合 img2video"
	    }
  ]
}

## 要求
- 不要合并、拆分、删除、重排任何 scene；不要改变输入的 shotType
- Story direction 是 Act-level 故事编排，只用于保持连续性和视觉母题；不要把 Act 当成 scene，不要按 Act 数量生成镜头
- lyric scene 根据 text 的歌词语义设计画面
- instrumental scene 使用 prevLyric/nextLyric 做过渡；优先写成物件特写、环境空镜、光影或天气变化，不引入新角色、新地点、新故事线
- planning 是系统计算出的客观分镜约束，不是导演创意；必须遵守但不要把字段名写进 prompt
- planning.needsMotion=true 时，video_prompt 必须有明确可见的镜头运动或主体运动
- planning.isVocalMontage=true 时，image_prompt/video_prompt 必须表现为高潮蒙太奇片段，同一 vocal 段的多个 scene 要有画面变化
	- 同一 repeatGroupId 的 scene 要保持视觉母题一致，但每次出现的 image_prompt/video_prompt 不能完全重复
	- shotType=character_shot：必须使用“用户选择的角色”中的 cast，不要从 songAnalysis 自行发明主角；image_prompt 只写该 cast 的 name、主角动作、情绪、环境、光线、构图，不要重复整段 promptFragment，并输出 cast_ids
- shotType=insert_shot：image_prompt 必须是空镜或细节特写，聚焦物件、身体局部、衣角、鞋、口袋、尘土、火光、道路纹理等；不要出现完整人物、不要露脸、不要新增角色
- shotType=landscape_shot：image_prompt 必须以环境为主体，优先大远景、道路、天空、地平线、天气、光影；可以没有人物，若有人只能是极小剪影，不要把主角放在画面中心
- image_prompt 必须保持地点、色彩和视觉元素一致，不要出现文字、歌词、字幕、logo
- image_prompt 必须使用 cinematic realistic live-action still 风格；不要使用 Cinematic illustration、illustration、anime、cartoon、3D render 等插画或渲染风格词
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
  cast?: any[];
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
    planning: scene.planning,
  }));

  return `你是一位专业音乐视频导演。现在分镜边界和镜头类型已经由系统确定，你不能改动 scene 数量、顺序、kind、shotType、start_s、end_s。

## 歌曲理解
${JSON.stringify(params.songAnalysis)}

## 视觉设定
${styleText || 'Use a cinematic lyric video style with consistent characters, location logic, and color palette.'}

## 用户选择的角色
${buildStoryboardCastBlock(params.cast)}

## 固定分镜
${JSON.stringify(fixedScenes)}

## 你的任务
为每个固定 scene 补充 image_prompt 和 video_prompt，只输出 JSON：

{
  "scenes": [
    {
      "scene_id": "必须等于输入 scene_id",
      "cast_ids": ["character_shot 使用的角色 id；非 character_shot 可为空数组"],
      "image_prompt": "英文静态画面描述，严格匹配输入 shotType，适合图片生成",
      "video_prompt": "英文运动描述，包含 Camera 机位/运动/稳定性、与 shotType 匹配的运动细节，适合 img2video"
    }
  ]
}

## 要求

### 基本规则
- 不要合并、拆分、删除、重排任何 scene；不要改变输入的 shotType
- Story direction 是 Act-level 故事编排，只用于保持连续性和视觉母题；不要把 Act 当成 scene，不要按 Act 数量生成镜头
- lyric scene 根据 text 的歌词语义设计画面
- instrumental scene 使用 prevLyric/nextLyric 做过渡；优先写成物件特写、环境空镜、光影或天气变化，不引入新角色、新地点、新故事线
- planning 是系统计算出的客观分镜约束，不是导演创意；必须遵守但不要把字段名写进 prompt
- planning.needsMotion=true 时，video_prompt 必须有明确可见的镜头运动或主体运动
- planning.isVocalMontage=true 时，image_prompt/video_prompt 必须表现为高潮蒙太奇片段，同一 vocal 段的多个 scene 要有画面变化
- 同一 repeatGroupId 的 scene 要保持视觉母题一致，但每次出现的 image_prompt/video_prompt 不能完全重复

### shotType 规则
- shotType=character_shot：必须使用“用户选择的角色”中的 cast，不要从 songAnalysis 自行发明主角；image_prompt 只写该 cast 的 name、主角动作、情绪、环境、光线、构图，不要重复整段 promptFragment，并输出 cast_ids
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
- image_prompt 必须使用 cinematic realistic live-action still 风格；不要使用 Cinematic illustration、illustration、anime、cartoon、3D render 等插画或渲染风格词

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
  fixedScenes?: FixedStoryboardSceneDraft[];
  model?: string;
  cast?: any[];
}) {
  if (!params.preprocess || !Array.isArray(params.preprocess.lines) || params.preprocess.lines.length === 0) {
    throw createLyricVideoError('preprocess.lines is required for Prompt 2', {
      errorKind: 'input_missing',
      stage: 'prompt_generation',
      provider: 'kie_codex',
      model: params.model,
      diagnostics: { hasPreprocess: Boolean(params.preprocess), lineCount: params.preprocess?.lines?.length || 0 },
    });
  }

  const model = params.model || DEFAULT_STORYBOARD_MODEL;
  const songAnalysis = params.songAnalysis && typeof params.songAnalysis === 'object'
    ? params.songAnalysis
    : normalizeSongAnalysis({
        theme: params.preprocess.song || 'lyric video',
        visual_style: 'cinematic lyric video',
        notes: 'Generate consistent scene prompts from fixed Whisper lyric scenes.',
      });
  const audioAnalysis = params.audioAnalysis || audioAnalysisFromLlmPreprocess(params.preprocess);
  const fixedScenes = Array.isArray(params.fixedScenes) && params.fixedScenes.length > 0
    ? params.fixedScenes
    : buildFixedStoryboardSceneDrafts({
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
    cast: params.cast,
  });
  const result = await callKieCodexResponses({
    text: prompt,
    model,
    reasoningEffort: 'medium',
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
      cast_ids: castIdsForGeneratedScene({ generated, scene, cast: params.cast }),
      timeline_config: buildSceneTimelineConfig(scene),
      linkedLineIds: scene.linkedLineIds,
    };
  });

  return {
    provider: 'kie_codex',
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
      songAnalysis.story_acts.length > 0 ||
      songAnalysis.location_plan.length > 0 ||
      songAnalysis.emotion_arc.length > 0
  );
  if (!hasContent) {
    throw new Error('Song analysis returned no usable JSON content');
  }
}

type StoryboardPromptAttempt = Awaited<ReturnType<typeof callKieCodexResponses>>;

function sceneLookupKeys(scene: FixedStoryboardSceneDraft, index: number) {
  return [scene.sceneId, String(index + 1)];
}

function findPromptScene(params: {
  promptScenes: Map<string, LyricVideoPromptSceneResult>;
  scene: FixedStoryboardSceneDraft;
  index: number;
}) {
  for (const key of sceneLookupKeys(params.scene, params.index)) {
    const generated = params.promptScenes.get(key);
    if (generated) return generated;
  }
  return undefined;
}

function buildPromptSceneMap(scenes: LyricVideoPromptSceneResult[]) {
  const promptScenes = new Map<string, LyricVideoPromptSceneResult>();
  for (const scene of scenes) {
    promptScenes.set(String(scene.scene_id), scene);
  }
  return promptScenes;
}

function promptSceneIssues(params: {
  fixedScenes: FixedStoryboardSceneDraft[];
  promptScenes: Map<string, LyricVideoPromptSceneResult>;
}) {
  const missingSceneIds: string[] = [];
  const incompleteSceneIds: string[] = [];
  for (const [index, scene] of params.fixedScenes.entries()) {
    const generated = findPromptScene({ promptScenes: params.promptScenes, scene, index });
    if (!generated) {
      missingSceneIds.push(scene.sceneId);
      continue;
    }
    if (!generated.image_prompt || !generated.video_prompt) {
      incompleteSceneIds.push(scene.sceneId);
    }
  }
  return { missingSceneIds, incompleteSceneIds };
}

function completePromptSceneCount(params: {
  fixedScenes: FixedStoryboardSceneDraft[];
  promptScenes: Map<string, LyricVideoPromptSceneResult>;
}) {
  return params.fixedScenes.reduce((count, scene, index) => {
    const generated = findPromptScene({ promptScenes: params.promptScenes, scene, index });
    return generated?.image_prompt && generated?.video_prompt ? count + 1 : count;
  }, 0);
}

function subsetBySceneIds(fixedScenes: FixedStoryboardSceneDraft[], sceneIds: string[]) {
  const sceneIdSet = new Set(sceneIds);
  return fixedScenes.filter((scene) => sceneIdSet.has(scene.sceneId));
}

function mergePromptScenes(params: {
  targetScenes: FixedStoryboardSceneDraft[];
  promptScenes: Map<string, LyricVideoPromptSceneResult>;
  retryScenes: LyricVideoPromptSceneResult[];
}) {
  const retryMap = buildPromptSceneMap(params.retryScenes);
  for (const [index, scene] of params.targetScenes.entries()) {
    const retryGenerated = findPromptScene({ promptScenes: retryMap, scene, index });
    if (!retryGenerated) continue;

    const existing = params.promptScenes.get(scene.sceneId);
    params.promptScenes.set(scene.sceneId, {
      ...existing,
      ...retryGenerated,
      scene_id: scene.sceneId,
      image_prompt: retryGenerated.image_prompt || existing?.image_prompt || '',
      video_prompt: retryGenerated.video_prompt || existing?.video_prompt || '',
      castIds: retryGenerated.castIds?.length ? retryGenerated.castIds : existing?.castIds,
      timeline_config: retryGenerated.timeline_config || existing?.timeline_config,
    });
  }
}

async function callStoryboardPromptAttempt(params: {
  songAnalysis: LyricVideoSongAnalysisResult;
  fixedScenes: FixedStoryboardSceneDraft[];
  project: any;
  model: string;
  cast?: any[];
  attemptLabel: string;
}) {
  const prompt = buildDebugStoryboardScenesPrompt({
    songAnalysis: params.songAnalysis,
    scenes: params.fixedScenes,
    project: params.project,
    storyPrompt: params.project?.storyPrompt,
    cast: params.cast,
  });
  const result = await callKieCodexResponses({
    text: prompt,
    model: params.model,
    reasoningEffort: 'medium',
  });
  const parsed = parseJsonLoose<any>(result.content, {});
  const repairScenes = normalizePromptScenesForRepair(parsed);
  logLyricStage('kie-storyboard-scenes', 'attempt-result', {
    attemptLabel: params.attemptLabel,
    model: params.model,
    fixedSceneCount: params.fixedScenes.length,
    returnedSceneCount: repairScenes.length,
  });
  return { result, repairScenes };
}

export async function generateStoryboardScenesWithKieClaude(params: {
  songAnalysis: LyricVideoSongAnalysisResult;
  fixedScenes: FixedStoryboardSceneDraft[];
  project: any;
  model?: string;
  cast?: any[];
}) {
  if (params.fixedScenes.length === 0) {
    throw createLyricVideoError('No fixed scenes available for storyboard prompt generation', {
      errorKind: 'input_missing',
      stage: 'prompt_generation',
      provider: 'kie_codex',
      model: params.model,
      diagnostics: { fixedSceneCount: params.fixedScenes.length },
    });
  }

  const model = params.model || DEFAULT_STORYBOARD_MODEL;
  const warnings: string[] = [];
  const retryAttempts: Array<{
    mode: 'full' | 'targeted';
    sceneIds?: string[];
    returnedSceneCount: number;
    actualModel?: string;
  }> = [];
  let retryMode = 'none';
  let firstAttempt: StoryboardPromptAttempt | undefined;
  let finalAttempt: StoryboardPromptAttempt | undefined;

  const initial = await callStoryboardPromptAttempt({
    songAnalysis: params.songAnalysis,
    project: params.project,
    fixedScenes: params.fixedScenes,
    model,
    cast: params.cast,
    attemptLabel: 'initial',
  });
  firstAttempt = initial.result;
  finalAttempt = initial.result;
  let promptScenes = buildPromptSceneMap(initial.repairScenes);

  if (completePromptSceneCount({ fixedScenes: params.fixedScenes, promptScenes }) === 0) {
    warnings.push('Prompt2 returned no valid scenes on the first attempt; retried the full prompt once.');
    retryMode = 'full';
    logLyricStage('kie-storyboard-scenes', 'full-retry', {
      model,
      fixedSceneCount: params.fixedScenes.length,
    });
    const fullRetry = await callStoryboardPromptAttempt({
      songAnalysis: params.songAnalysis,
      project: params.project,
      fixedScenes: params.fixedScenes,
      model,
      cast: params.cast,
      attemptLabel: 'full_retry',
    });
    finalAttempt = fullRetry.result;
    retryAttempts.push({
      mode: 'full',
      returnedSceneCount: fullRetry.repairScenes.length,
      actualModel: fullRetry.result.model,
    });
    promptScenes = buildPromptSceneMap(fullRetry.repairScenes);
    if (completePromptSceneCount({ fixedScenes: params.fixedScenes, promptScenes }) === 0) {
      throw createLyricVideoError('Storyboard prompt generation returned no valid scenes', {
        errorKind: 'provider_invalid_response',
        stage: 'prompt_generation',
        provider: 'kie_codex',
        model,
        diagnostics: {
          fixedSceneCount: params.fixedScenes.length,
          firstRawText: firstAttempt.content,
          firstRaw: firstAttempt.raw,
          retryRawText: fullRetry.result.content,
          retryRaw: fullRetry.result.raw,
          retryAttempts,
          warnings,
        },
      });
    }
  }

  let { missingSceneIds, incompleteSceneIds } = promptSceneIssues({
    fixedScenes: params.fixedScenes,
    promptScenes,
  });
  const initialMissingSceneIds = missingSceneIds;
  const initialIncompleteSceneIds = incompleteSceneIds;
  const retrySceneIds = Array.from(new Set([...missingSceneIds, ...incompleteSceneIds]));
  const retriedSceneIds: string[] = [];

  if (retrySceneIds.length > 0) {
    retryMode = retryMode === 'full' ? 'full+targeted' : 'targeted';
    warnings.push(
      `Prompt2 returned incomplete storyboard prompts for ${retrySceneIds.length} scene(s); retried only those scenes.`
    );
    logLyricStage('kie-storyboard-scenes', 'targeted-retry', {
      model,
      missingSceneIds,
      incompleteSceneIds,
    });
    const targetScenes = subsetBySceneIds(params.fixedScenes, retrySceneIds);
    const targetedRetry = await callStoryboardPromptAttempt({
      songAnalysis: params.songAnalysis,
      project: params.project,
      fixedScenes: targetScenes,
      model,
      cast: params.cast,
      attemptLabel: 'targeted_retry',
    });
    finalAttempt = targetedRetry.result;
    retriedSceneIds.push(...targetScenes.map((scene) => scene.sceneId));
    retryAttempts.push({
      mode: 'targeted',
      sceneIds: targetScenes.map((scene) => scene.sceneId),
      returnedSceneCount: targetedRetry.repairScenes.length,
      actualModel: targetedRetry.result.model,
    });
    mergePromptScenes({
      targetScenes,
      promptScenes,
      retryScenes: targetedRetry.repairScenes,
    });
    ({ missingSceneIds, incompleteSceneIds } = promptSceneIssues({
      fixedScenes: params.fixedScenes,
      promptScenes,
    }));
  }

  const fallbackSceneIds = Array.from(new Set([...missingSceneIds, ...incompleteSceneIds]));
  if (fallbackSceneIds.length > 0) {
    warnings.push(`Prompt2 still had ${fallbackSceneIds.length} scene gap(s) after retry; fallback prompts were used.`);
  }

  const scenes: SceneInput[] = params.fixedScenes.map((scene, index) => {
    const generated = findPromptScene({ promptScenes, scene, index });
    const fallback = fallbackPromptForFixedScene({
      scene,
      project: params.project,
      storyPrompt: params.project?.storyPrompt,
    });
    return {
      startMs: scene.startMs,
      endMs: scene.endMs,
      text: scene.text,
      prompt: generated?.image_prompt || fallback.imagePrompt,
      motionPrompt: generated?.video_prompt || fallback.videoPrompt,
      castIds: castIdsForGeneratedScene({ generated, scene, cast: params.cast }),
      linkedLineIds: scene.linkedLineIds,
      timelineConfig: generated?.timeline_config || buildSceneTimelineConfig(scene),
      negativePrompt: 'text, captions, subtitles, lyrics, watermark, logo, blurry, low quality',
    };
  });

  return {
    provider: 'kie_codex',
    model,
    actualModel: finalAttempt.model,
    scenes,
    fixedScenes: params.fixedScenes,
    rawText: finalAttempt.content,
    raw: finalAttempt.raw,
    firstRawText: firstAttempt.content,
    firstRaw: firstAttempt.raw,
    fixedSceneCount: params.fixedScenes.length,
    sceneCount: scenes.length,
    retryMode,
    missingSceneIds: initialMissingSceneIds,
    incompleteSceneIds: initialIncompleteSceneIds,
    retriedSceneIds,
    fallbackSceneIds,
    warnings,
    retryAttempts,
  };
}

export async function generateStoryboardWithKieClaude(params: {
  lines: any[];
  project: any;
  storyPrompt?: string;
  fixedScenes?: FixedStoryboardSceneDraft[];
  cast?: any[];
}): Promise<StoryboardScene[]> {
  const audioAnalysis = readAudioAnalysis(params.project);
  const fixedScenes = params.fixedScenes?.length
    ? params.fixedScenes
    : buildFixedStoryboardSceneDrafts({
        lines: params.lines,
        audioAnalysis,
      });
  const fallback = fixedScenes.map((scene) => {
    const fallbackPrompt = fallbackPromptForFixedScene({
      scene,
      project: params.project,
      storyPrompt: params.storyPrompt,
    });
    return {
      id: scene.dbId,
      startMs: scene.startMs,
      endMs: scene.endMs,
      text: scene.text,
      prompt: fallbackPrompt.imagePrompt,
      motionPrompt: fallbackPrompt.videoPrompt,
      castIds: castIdsForGeneratedScene({ scene, cast: params.cast }),
      linkedLineIds: scene.linkedLineIds,
      timelineConfig: buildSceneTimelineConfig(scene),
      negativePrompt: 'text, captions, subtitles, lyrics, watermark, logo, blurry, low quality',
      status: 'draft',
    };
  });
  const configs = await getAllConfigs();
  if (!configs.kie_api_key) return fallback;

  const prompt = buildStoryboardScenesPrompt({
    songAnalysis: {
      theme: params.storyPrompt || params.project.storyPrompt || params.project.title || 'emotional lyric video',
      characters: [],
      key_props: [],
      narrative_arc: [],
      story_acts: [],
      location_plan: [],
      emotion_arc: [],
      visual_style: params.project.artStyle || 'cinematic lyric video',
      color_palette: String(params.project.palette || '').split(',').map((color) => color.trim()).filter(Boolean),
      notes: audioAnalysisPromptSummary(params.project),
    },
    scenes: fixedScenes,
    project: params.project,
    storyPrompt: params.storyPrompt,
    cast: params.cast,
  });

  const result = await callKieCodexResponses({
    text: prompt,
    model: configs.kie_codex_model || DEFAULT_STORYBOARD_MODEL,
    reasoningEffort: 'medium',
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
      id: scene.dbId,
      startMs: scene.startMs,
      endMs: scene.endMs,
      text: scene.text,
      prompt: generated?.image_prompt || fallbackPrompt.imagePrompt,
      motionPrompt: generated?.video_prompt || fallbackPrompt.videoPrompt,
      castIds: castIdsForGeneratedScene({ generated, scene, cast: params.cast }),
      linkedLineIds: scene.linkedLineIds,
      timelineConfig: buildSceneTimelineConfig(scene),
      negativePrompt: 'text, captions, subtitles, lyrics, watermark, logo, blurry, low quality',
      status: 'draft',
    };
  }).filter((scene) => scene.prompt);
}

export async function generateStoryPromptWithKieClaude(params: {
  lines: any[];
  project: any;
}) {
  const lyrics = params.lines
    .map((line, index) => `${index + 1}. ${line.text}`)
    .join('\n');
  const prompt = `Write an English act-based visual story brief for a lyric video.
Use the lyrics, title, style, palette, and format to create a cinematic concept that an image/storyboard generator can later split into many scenes.
Return only JSON, no markdown.

JSON shape:
{
  "story_acts": [
    {
      "title": "Act 1",
      "description": "80-120 English words. A broad visual story segment, not a single shot."
    }
  ]
}

Requirements: 3-5 acts, consistent characters and setting, clear visual arc from beginning to ending, recurring motifs, emotionally matched to the lyrics, no text, no typography, no subtitles in the images.
Do not write scene prompts. Each act should cover a larger part of the song and guide many downstream scenes.

Project title: ${params.project.title}
Lyrics language: ${params.project.language || 'auto'}
Art style: ${params.project.artStyle}
Palette: ${params.project.palette}
Aspect ratio: ${params.project.aspectRatio}

Lyrics:
${lyrics}`;

  const configs = await getAllConfigs();
  const result = await callKieCodexResponses({
    text: prompt,
    model: configs.kie_codex_model || DEFAULT_STORYBOARD_MODEL,
    reasoningEffort: 'medium',
  });
  const parsed = parseJsonLoose<any>(result.content, {});
  const storyText = formatStoryActsText(normalizeSongAnalysis(parsed));
  return storyText || result.content.replace(/^["']|["']$/g, '').trim();
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
    throw createLyricVideoError('Kie API key is required. Add it in Admin Settings > AI.', {
      errorKind: 'provider_request_failed',
      provider: 'kie',
      diagnostics: { source: 'createKieProvider' },
    });
  }
  return new KieProvider({
    apiKey: configs.kie_api_key,
    customStorage: isStorageConfigured(),
    saveFiles: saveAIProviderFiles,
    uuid: getUuid,
  });
}

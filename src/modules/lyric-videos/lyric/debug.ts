import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GroqProvider, AIMediaType, AITaskStatus as ProviderTaskStatus, KIE_Z_IMAGE_MODEL, KieProvider } from '@/core/ai';
import { getUuid } from '@/lib/hash';
import { getAllConfigs } from '@/modules/config/service';
import { isStorageConfigured } from '@/modules/storage/service';
import { asrTimingDebugSummary, cleanAsrWordsForLyrics, refineAsrSegmentsWithWords, titleFromFilename } from './asr';
import { runLibrosaAnalysisForLocalFile, saveAIProviderFiles } from './audio';
import { parseJsonField } from './json';
import { buildFixedStoryboardSceneDrafts, preprocessLyricVideoForLlm } from './storyboard';
import {
  DEFAULT_TRANSCRIBE_MODEL,
  type AudioAnalysisResult,
  type DebugImageSceneInput,
  type FixedStoryboardSceneDraft,
  type LyricVideoLlmPreprocessResult,
  type LyricVideoPromptSceneResult,
} from './types';

function resolveKieImageModel(configs: Record<string, string>, model?: string) {
  return model || configs.kie_image_model || KIE_Z_IMAGE_MODEL;
}

export function normalizeDebugImageScenes(params: {
  scenes: DebugImageSceneInput[];
  sceneIds?: Array<number | string>;
  limit?: number;
}) {
  const selectedIds = Array.isArray(params.sceneIds) && params.sceneIds.length > 0
    ? new Set(params.sceneIds.map((id) => String(id)))
    : undefined;
  const limit = Number(params.limit || 0);

  const scenes = params.scenes
    .map((scene, index) => {
      const rawSceneId = scene.scene_id ?? scene.id ?? index + 1;
      const sceneId = Number(scene.scene_id ?? scene.id ?? index + 1);
      const start = Number(scene.start_s ?? 0);
      const end = Number(scene.end_s ?? start);
      return {
        scene_id: Number.isFinite(sceneId) ? sceneId : index + 1,
        raw_scene_id: String(rawSceneId),
        start_s: Number.isFinite(start) ? Math.max(0, Number(start.toFixed(3))) : 0,
        end_s: Number.isFinite(end) ? Math.max(0, Number(end.toFixed(3))) : 0,
        image_prompt: String(scene.image_prompt || scene.prompt || '').trim(),
      };
    })
    .filter((scene) => scene.image_prompt)
    .filter((scene) => !selectedIds || selectedIds.has(String(scene.scene_id)) || selectedIds.has(scene.raw_scene_id));

  const maxPanels = 25;
  if (limit > 0) return scenes.slice(0, Math.min(limit, maxPanels));
  return scenes.slice(0, maxPanels);
}

export function buildStoryboardGridImagePrompt(scenes: ReturnType<typeof normalizeDebugImageScenes>) {
  const panels = scenes.map((scene, index) => ({
    panel: index + 1,
    scene_id: scene.scene_id,
    start_s: scene.start_s,
    end_s: scene.end_s,
    image_prompt: scene.image_prompt,
  }));
  const panelLines = panels.map((panel) => `面板${panel.panel}：${panel.image_prompt}`);
  const compiledPrompt = [
    '一张包含精确5x5网格的图片，共25个大小相等的面板，面板之间没有间隙、没有边框、没有标签、没有文字。面板按从左到右、从上到下的顺序编号。未列出的面板全部渲染为纯白色空白，不含任何内容。',
    '',
    ...panelLines,
  ].join('\n');

  return {
    compiledPrompt,
    panelCount: panels.length,
    panels,
  };
}

export async function createKieImageProviderForDebug() {
  const configs = await getAllConfigs();
  if (!configs.kie_api_key) {
    throw new Error('Kie API key is required. Add it in Admin Settings > AI.');
  }
  return new KieProvider({ apiKey: configs.kie_api_key });
}

export async function queueStoryboardSceneImagesWithKieForDebug(params: {
  scenes: DebugImageSceneInput[];
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
  sceneIds?: Array<number | string>;
  limit?: number;
}) {
  if (!Array.isArray(params.scenes) || params.scenes.length === 0) {
    throw new Error('scenes is required for debug image generation');
  }

  const scenes = normalizeDebugImageScenes({
    scenes: params.scenes,
    sceneIds: params.sceneIds,
    limit: params.limit,
  });
  if (scenes.length === 0) {
    throw new Error('No scenes with image_prompt to generate');
  }

  const configs = await getAllConfigs();
  const model = resolveKieImageModel(configs, params.model);
  const aspectRatio = params.aspectRatio || '16:9';
  const resolution = params.resolution || '1K';
  const provider = await createKieImageProviderForDebug();
  const gridPrompt = buildStoryboardGridImagePrompt(scenes);
  console.info('[debug lyric-videos images/queue] compiled 5x5 grid prompt', {
    provider: 'kie',
    model,
    aspectRatio,
    resolution,
    panelCount: gridPrompt.panelCount,
    panels: gridPrompt.panels.map((panel) => ({
      panel: panel.panel,
      scene_id: panel.scene_id,
      start_s: panel.start_s,
      end_s: panel.end_s,
    })),
    compiledPrompt: gridPrompt.compiledPrompt,
  });
  const result = await provider.generate({
    params: {
      mediaType: AIMediaType.IMAGE,
      model,
      prompt: gridPrompt.compiledPrompt,
      options: {
        aspect_ratio: aspectRatio,
        resolution,
        output_format: params.outputFormat,
      },
    },
  });

  return {
    provider: 'kie',
    model,
    aspect_ratio: aspectRatio,
    resolution,
    providerTaskId: result.taskId,
    taskStatus: result.taskStatus,
    taskIds: [result.taskId],
    compiledPrompt: gridPrompt.compiledPrompt,
    panelCount: gridPrompt.panelCount,
    panels: gridPrompt.panels,
    raw: result.taskResult,
  };
}

export async function queryStoryboardSceneImagesWithKieForDebug(params: {
  taskIds: string[];
}) {
  const taskIds = Array.isArray(params.taskIds)
    ? params.taskIds.map((taskId) => String(taskId || '').trim()).filter(Boolean)
    : [];
  if (taskIds.length === 0) {
    throw new Error('taskIds is required for debug image query');
  }

  const provider = await createKieImageProviderForDebug();
  const results = [];

  for (const taskId of taskIds) {
    try {
      const result = await provider.query({ taskId, mediaType: AIMediaType.IMAGE });
      results.push({
        provider: 'kie',
        providerTaskId: taskId,
        taskStatus: result.taskStatus,
        imageUrl: result.taskInfo?.images?.[0]?.imageUrl,
        taskInfo: result.taskInfo,
        raw: result.taskResult,
      });
    } catch (error: any) {
      results.push({
        provider: 'kie',
        providerTaskId: taskId,
        taskStatus: ProviderTaskStatus.FAILED,
        error: error?.message || 'Query image generation failed',
      });
    }
  }

  return { provider: 'kie', results };
}

export async function analyzeUploadedAudioForDebug(params: {
  body: Buffer | Uint8Array;
  filename?: string;
	  contentType?: string;
	  language?: string;
	  prompt?: string;
	  transcribeModel?: string;
	}) {
  const configs = await getAllConfigs();
  const body = Buffer.from(params.body);
  const filename = params.filename || 'audio.mp3';
  const tmpDir = path.join(process.cwd(), '.next', 'lyric-video-debug', getUuid());
  const inputPath = path.join(tmpDir, filename.replace(/[^\w.-]+/g, '_') || 'audio.mp3');

  await mkdir(tmpDir, { recursive: true });
  await writeFile(inputPath, body);

  try {
    const [transcriptionResult, analysisResult] = await Promise.allSettled([
	      configs.groq_api_key
	        ? new GroqProvider({
	            apiKey: configs.groq_api_key,
	            baseUrl: configs.groq_base_url,
	            transcribeModel: DEFAULT_TRANSCRIBE_MODEL,
	          }).transcribeFile({
            body,
            filename,
            contentType: params.contentType,
            language: params.language && params.language !== 'auto' ? params.language : undefined,
            prompt: params.prompt,
          })
        : Promise.reject(new Error('Groq API key is required for debug Whisper transcription')),
      runLibrosaAnalysisForLocalFile(inputPath),
    ]);

    const transcription =
      transcriptionResult.status === 'fulfilled'
        ? {
            provider: 'groq',
            rawText: transcriptionResult.value.text,
            rawSegments: refineAsrSegmentsWithWords({
              segments: transcriptionResult.value.lines,
              words: transcriptionResult.value.words,
            }),
            words: cleanAsrWordsForLyrics(transcriptionResult.value.words),
            raw: transcriptionResult.value.raw,
          }
        : undefined;
    const audioAnalysis = analysisResult.status === 'fulfilled' ? analysisResult.value : undefined;

    let preprocess: LyricVideoLlmPreprocessResult | undefined;
    let fixedScenes: FixedStoryboardSceneDraft[] | undefined;
    let preprocessError: string | undefined;
    try {
      if (!transcription) {
        throw new Error('Whisper transcription is required before preprocessing');
      }
      preprocess = preprocessLyricVideoForLlm({
        song: titleFromFilename(filename),
        transcription,
        audioAnalysis,
      });
      fixedScenes = buildFixedStoryboardSceneDrafts({
        lines: preprocess.lines.map((line, index) => ({
          id: `line_${index + 1}`,
          startMs: Math.round(line.start_s * 1000),
          endMs: Math.round(line.end_s * 1000),
          text: line.text,
        })),
        audioAnalysis,
      });
    } catch (error: any) {
      preprocessError = error?.message || 'Preprocess failed';
    }

    const debugSummary = transcription
      ? asrTimingDebugSummary({
          raw: transcription.raw,
          cleanedWords: transcription.words,
          finalLines: transcription.rawSegments,
          fixedScenes,
        })
      : undefined;
    if (debugSummary) {
      console.info('[debug lyric-videos analyze] asr timing summary', debugSummary);
    }

    return {
      transcription,
      transcriptionError:
        transcriptionResult.status === 'rejected'
          ? transcriptionResult.reason?.message || 'Whisper transcription failed'
          : undefined,
      audioAnalysis,
      audioAnalysisError:
        analysisResult.status === 'rejected' ? analysisResult.reason?.message || 'Audio analysis failed' : undefined,
      preprocess,
      fixedScenes,
      debugSummary,
      preprocessError,
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

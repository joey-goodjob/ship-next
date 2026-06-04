import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ElevenLabsProvider, AIMediaType, AITaskStatus as ProviderTaskStatus, KIE_Z_IMAGE_MODEL, KieProvider } from '@/core/ai';
import { getUuid } from '@/lib/hash';
import { getAllConfigs } from '@/modules/config/service';
import { isStorageConfigured } from '@/modules/storage/service';
import sharp from 'sharp';
import { asrTimingDebugSummary, cleanAsrWordsForLyrics, groupWordsIntoLyricLines, refineAsrSegmentsWithWords, titleFromFilename } from './asr';
import { fetchBytes, runLibrosaAnalysisForLocalFile, saveAIProviderFiles, saveLocalPublicFile } from './audio';
import { parseJsonField } from './json';
import { buildFixedStoryboardSceneDrafts, preprocessLyricVideoForLlm } from './storyboard';
import {
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
  maxPanels?: number;
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
        scene_index: index + 1,
        scene_id: Number.isFinite(sceneId) ? sceneId : index + 1,
        raw_scene_id: String(rawSceneId),
        start_s: Number.isFinite(start) ? Math.max(0, Number(start.toFixed(3))) : 0,
        end_s: Number.isFinite(end) ? Math.max(0, Number(end.toFixed(3))) : 0,
        image_prompt: String(scene.image_prompt || scene.prompt || '').trim(),
      };
    })
    .filter((scene) => scene.image_prompt)
    .filter((scene) => !selectedIds || selectedIds.has(String(scene.scene_id)) || selectedIds.has(scene.raw_scene_id));

  const maxPanels = params.maxPanels
    ? Math.max(1, Math.floor(Number(params.maxPanels)))
    : scenes.length;
  if (limit > 0) return scenes.slice(0, Math.min(limit, maxPanels));
  return scenes.slice(0, maxPanels);
}

export function buildStoryboardGridImagePrompt(
  scenes: ReturnType<typeof normalizeDebugImageScenes>,
  gridSize = 5,
  aspectRatio = '16:9'
) {
  const normalizedGridSize = Math.max(1, Math.min(5, Math.floor(Number(gridSize) || 5)));
  const totalPanels = normalizedGridSize * normalizedGridSize;
  const normalizedAspectRatio = aspectRatio === '9:16' ? '9:16' : '16:9';
  const frameOrientation = normalizedAspectRatio === '9:16' ? 'vertical portrait' : 'landscape';
  const expectedPanel = normalizedAspectRatio === '9:16'
    ? 'Each panel must be a 9:16 vertical frame, approximately 540x960 when cropped from a 4K 4x4 grid.'
    : 'Each panel must be a 16:9 landscape frame, approximately 960x540 when cropped from a 4K 4x4 grid.';
  const globalStyle = 'Global visual style for all panels: cinematic realistic live-action lyric video stills, photorealistic, natural human proportions, consistent art direction, consistent color grading, consistent lighting language, same visual universe across every panel, no mixed illustration styles, no anime, no cartoon, no 3D render, no text, no subtitles, no logos.';
  const panels = scenes.map((scene, index) => ({
    panel: index + 1,
    scene_index: scene.scene_index,
    scene_id: scene.scene_id,
    start_s: scene.start_s,
    end_s: scene.end_s,
    image_prompt: scene.image_prompt,
  }));
  const panelLines = panels.map((panel) => `Panel ${panel.panel}: ${panel.image_prompt}`);
  const compiledPrompt = [
    globalStyle,
    `Create one exact ${normalizedGridSize}x${normalizedGridSize} storyboard grid, ${totalPanels} equal panels, no gaps, no borders, no labels.`,
    expectedPanel,
    `Panels are ordered left to right, top to bottom. Every panel is a ${frameOrientation} ${normalizedAspectRatio} frame. Empty unused panels must be pure white blank panels with no content.`,
    '',
    ...panelLines,
  ].filter(Boolean).join('\n');

  return {
    compiledPrompt,
    gridSize: normalizedGridSize,
    aspectRatio: normalizedAspectRatio,
    totalPanels,
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
  gridSize?: number;
}) {
  if (!Array.isArray(params.scenes) || params.scenes.length === 0) {
    throw new Error('scenes is required for debug image generation');
  }

  const gridSize = Math.max(1, Math.min(5, Math.floor(Number(params.gridSize || 5))));
  const batchSize = gridSize * gridSize;
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
  const aspectRatio = params.aspectRatio === '9:16' ? '9:16' : '16:9';
  const resolution = params.resolution || '4K';
  const provider = await createKieImageProviderForDebug();
  const sceneBatches = [];
  for (let start = 0; start < scenes.length; start += batchSize) {
    sceneBatches.push(scenes.slice(start, start + batchSize));
  }

  const batches = [];
  const taskIds = [];
  const rawResults = [];
  const allPanels = [];
  for (const [batchIndex, batchScenes] of sceneBatches.entries()) {
    const sceneOffset = batchIndex * batchSize;
    const gridPrompt = buildStoryboardGridImagePrompt(batchScenes, gridSize, aspectRatio);
    const panels = gridPrompt.panels.map((panel) => ({
      ...panel,
      batchIndex,
      sceneOffset,
      globalPanel: sceneOffset + panel.panel,
    }));
    console.info(`[debug lyric-videos images/queue] compiled batch ${batchIndex + 1}/${sceneBatches.length} ${gridPrompt.gridSize}x${gridPrompt.gridSize} grid prompt`, {
      provider: 'kie',
      model,
      aspectRatio,
      resolution,
      gridSize: gridPrompt.gridSize,
      gridAspectRatio: gridPrompt.aspectRatio,
      totalPanels: gridPrompt.totalPanels,
      sceneOffset,
      panelCount: gridPrompt.panelCount,
      panels: panels.map((panel) => ({
        panel: panel.panel,
        globalPanel: panel.globalPanel,
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
    taskIds.push(result.taskId);
    rawResults.push(result.taskResult);
    allPanels.push(...panels);
    batches.push({
      batchIndex,
      batchNumber: batchIndex + 1,
      sceneOffset,
      providerTaskId: result.taskId,
      taskId: result.taskId,
      taskStatus: result.taskStatus,
      compiledPrompt: gridPrompt.compiledPrompt,
      gridSize: gridPrompt.gridSize,
      gridAspectRatio: gridPrompt.aspectRatio,
      totalPanels: gridPrompt.totalPanels,
      panelCount: gridPrompt.panelCount,
      panels,
      raw: result.taskResult,
    });
  }

  return {
    provider: 'kie',
    model,
    aspect_ratio: aspectRatio,
    resolution,
    providerTaskId: taskIds[0],
    taskStatus: batches[0]?.taskStatus,
    taskIds,
    batchSize,
    batchCount: batches.length,
    sceneCount: scenes.length,
    gridSize,
    gridAspectRatio: aspectRatio,
    totalPanels: batchSize,
    panelCount: scenes.length,
    panels: allPanels,
    batches,
    compiledPrompt: batches[0]?.compiledPrompt,
    raw: rawResults,
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

function sanitizeDebugPathPart(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'default';
}

export async function splitStoryboardGridImageForDebug(params: {
  taskIds: string[];
  fixtureKey?: string;
  gridSize?: number;
  aspectRatio?: string;
  panels?: Array<{
    panel?: number;
    globalPanel?: number;
    batchIndex?: number;
    sceneOffset?: number;
    scene_index?: number;
    scene_id?: number | string;
    start_s?: number;
    end_s?: number;
    image_prompt?: string;
  }>;
  batches?: Array<{
    batchIndex?: number;
    batchNumber?: number;
    sceneOffset?: number;
    providerTaskId?: string;
    taskId?: string;
    panelCount?: number;
    panels?: Array<{
      panel?: number;
      globalPanel?: number;
      batchIndex?: number;
      sceneOffset?: number;
      scene_index?: number;
      scene_id?: number | string;
      start_s?: number;
      end_s?: number;
      image_prompt?: string;
    }>;
  }>;
}) {
  const taskIds = Array.isArray(params.taskIds)
    ? params.taskIds.map((taskId) => String(taskId || '').trim()).filter(Boolean)
    : [];
  if (taskIds.length === 0) {
    throw new Error('taskIds is required for debug image split');
  }

  const normalizedGridSize = Math.max(1, Math.min(5, Math.floor(Number(params.gridSize || 4) || 4)));
  const totalPanels = normalizedGridSize * normalizedGridSize;
  const aspectRatio = params.aspectRatio === '9:16' ? '9:16' : '16:9';
  const fixtureKey = sanitizeDebugPathPart(params.fixtureKey);
  const queryData = await queryStoryboardSceneImagesWithKieForDebug({ taskIds });
  const splitResults = [];
  const sceneImages = [];

  for (const [resultIndex, queryResult] of queryData.results.entries()) {
    const batch = params.batches?.find((candidate) => {
      const batchTaskId = String(candidate.providerTaskId || candidate.taskId || '').trim();
      return batchTaskId && batchTaskId === queryResult.providerTaskId;
    }) || params.batches?.[resultIndex];
    const batchIndex = Number.isFinite(Number(batch?.batchIndex)) ? Number(batch?.batchIndex) : resultIndex;
    const sceneOffset = Number.isFinite(Number(batch?.sceneOffset)) ? Number(batch?.sceneOffset) : batchIndex * totalPanels;
    const batchPanels = Array.isArray(batch?.panels) && batch.panels.length > 0
      ? batch.panels
      : params.panels?.filter((panel) => {
          if (Number.isFinite(Number(panel.batchIndex))) return Number(panel.batchIndex) === batchIndex;
          const globalPanel = Number(panel.globalPanel);
          return Number.isFinite(globalPanel) && globalPanel > sceneOffset && globalPanel <= sceneOffset + totalPanels;
        });

    if (!queryResult.imageUrl) {
      splitResults.push({
        provider: queryResult.provider,
        providerTaskId: queryResult.providerTaskId,
        batchIndex,
        batchNumber: batchIndex + 1,
        sceneOffset,
        taskStatus: queryResult.taskStatus,
        error: 'Image URL is not ready. Re-run image query/split after the Kie task succeeds.',
      });
      continue;
    }

    const imageBuffer = await fetchBytes(queryResult.imageUrl);
    const source = sharp(imageBuffer);
    const metadata = await source.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Could not read generated grid image dimensions');
    }

    const splitDir = `debug/lyric-videos/${fixtureKey}/${sanitizeDebugPathPart(queryResult.providerTaskId)}/batch-${String(batchIndex + 1).padStart(2, '0')}`;
    const panels = [];
    for (let index = 0; index < totalPanels; index += 1) {
      const row = Math.floor(index / normalizedGridSize);
      const col = index % normalizedGridSize;
      const left = Math.round((col * metadata.width) / normalizedGridSize);
      const top = Math.round((row * metadata.height) / normalizedGridSize);
      const right = Math.round(((col + 1) * metadata.width) / normalizedGridSize);
      const bottom = Math.round(((row + 1) * metadata.height) / normalizedGridSize);
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);
      const panelNumber = index + 1;
      const panelMeta = batchPanels?.find((panel) => Number(panel.panel) === panelNumber);
      const cropped = await sharp(imageBuffer)
        .extract({ left, top, width, height })
        .jpeg({ quality: 95 })
        .toBuffer();
      const imageUrl = await saveLocalPublicFile({
        body: cropped,
        dir: splitDir,
        filename: `panel-${String(panelNumber).padStart(2, '0')}.jpg`,
      });

      panels.push({
        panel: panelNumber,
        globalPanel: sceneOffset + panelNumber,
        batchIndex,
        batchNumber: batchIndex + 1,
        sceneOffset,
        scene_index: panelMeta?.scene_index,
        scene_id: panelMeta?.scene_id,
        start_s: panelMeta?.start_s,
        end_s: panelMeta?.end_s,
        image_prompt: panelMeta?.image_prompt,
        imageUrl,
        width,
        height,
        crop: { left, top, width, height },
      });
      if (panelMeta?.scene_id !== undefined) {
        sceneImages.push({
          scene_id: panelMeta.scene_id,
          scene_index: panelMeta.scene_index,
          batchIndex,
          batchNumber: batchIndex + 1,
          panel: panelNumber,
          globalPanel: sceneOffset + panelNumber,
          start_s: panelMeta.start_s,
          end_s: panelMeta.end_s,
          image_prompt: panelMeta.image_prompt,
          imageUrl,
          width,
          height,
        });
      }
    }

    splitResults.push({
      provider: queryResult.provider,
      providerTaskId: queryResult.providerTaskId,
      batchIndex,
      batchNumber: batchIndex + 1,
      sceneOffset,
      taskStatus: queryResult.taskStatus,
      sourceImageUrl: queryResult.imageUrl,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      gridSize: normalizedGridSize,
      totalPanels,
      aspect_ratio: aspectRatio,
      panels,
    });
  }

  return {
    provider: 'kie',
    gridSize: normalizedGridSize,
    batchSize: totalPanels,
    batchCount: taskIds.length,
    totalPanels,
    aspect_ratio: aspectRatio,
    sceneCount: sceneImages.length,
    sceneImages: sceneImages.sort((a, b) => Number(a.globalPanel || 0) - Number(b.globalPanel || 0)),
    results: splitResults,
  };
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
      configs.elevenlabs_api_key
        ? new ElevenLabsProvider({
            apiKey: configs.elevenlabs_api_key,
            sttModel: params.transcribeModel || configs.elevenlabs_stt_model || 'scribe_v2',
          }).transcribeFile({
            body,
            filename,
            contentType: params.contentType,
            language: params.language && params.language !== 'auto' ? params.language : undefined,
            prompt: params.prompt,
          })
        : Promise.reject(new Error('ELEVENLABS_API_KEY is required for debug ElevenLabs transcription')),
      runLibrosaAnalysisForLocalFile(inputPath),
    ]);

    const transcription =
      transcriptionResult.status === 'fulfilled'
        ? (() => {
            const words = cleanAsrWordsForLyrics(transcriptionResult.value.words);
            const refinedSegments = refineAsrSegmentsWithWords({
              segments: transcriptionResult.value.lines,
              words,
            });
            return {
              provider: 'elevenlabs',
              rawText: transcriptionResult.value.text,
              rawSegments: refinedSegments.length > 0 ? refinedSegments : groupWordsIntoLyricLines(words),
              words,
              raw: transcriptionResult.value.raw,
            };
          })()
        : undefined;
    const audioAnalysis = analysisResult.status === 'fulfilled' ? analysisResult.value : undefined;

    let preprocess: LyricVideoLlmPreprocessResult | undefined;
    let fixedScenes: FixedStoryboardSceneDraft[] | undefined;
    let preprocessError: string | undefined;
    try {
      if (!transcription) {
        throw new Error('ElevenLabs transcription is required before preprocessing');
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
        words: transcription.words,
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
          ? transcriptionResult.reason?.message || 'ElevenLabs transcription failed'
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

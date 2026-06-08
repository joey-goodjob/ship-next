import {
  AIMediaType,
  AIProvider,
  KIE_Z_IMAGE_MODEL,
  WaveSpeedProvider,
  WAVESPEED_GPT_IMAGE_2_MODEL,
} from '@/core/ai';
import { getUuid } from '@/lib/hash';
import { getAllConfigs } from '@/modules/config/service';
import { isStorageConfigured } from '@/modules/storage/service';
import { saveAIProviderFiles } from './audio';
import { createLyricVideoError } from './diagnostics';
import { parseJsonField } from './json';
import { createKieProvider } from './llm';

export type LyricVideoImageProviderName = 'kie' | 'wavespeed';

const WAVESPEED_ASPECT_RATIOS = new Set([
  '1:1',
  '1:2',
  '2:1',
  '1:3',
  '3:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '9:21',
  '21:9',
]);

export type LyricVideoImageProviderSelection = {
  providerName: LyricVideoImageProviderName;
  provider: AIProvider & {
    query: NonNullable<AIProvider['query']>;
  };
  model: string;
  mediaType: AIMediaType.IMAGE;
  fallbackReason?: string;
  normalizeOptions: (options: Record<string, unknown>) => Record<string, unknown>;
};

function normalizeConfiguredProvider(configs: Record<string, string>): LyricVideoImageProviderName {
  return String(configs.lyric_video_image_provider || 'kie').trim().toLowerCase() === 'wavespeed'
    ? 'wavespeed'
    : 'kie';
}

export function configuredLyricVideoImageProviderName(configs: Record<string, string>): LyricVideoImageProviderName {
  return normalizeConfiguredProvider(configs);
}

function normalizeWaveSpeedAspectRatio(value: unknown) {
  const aspectRatio = String(value || '').trim();
  if (WAVESPEED_ASPECT_RATIOS.has(aspectRatio)) return aspectRatio;
  if (aspectRatio === 'portrait') return '9:16';
  if (aspectRatio === 'landscape') return '16:9';
  return '16:9';
}

function normalizeWaveSpeedResolution(value: unknown) {
  const resolution = String(value || '').trim().toLowerCase();
  if (resolution === '4k' || resolution === '4K'.toLowerCase()) return '4k';
  if (resolution === '2k' || resolution === '2K'.toLowerCase()) return '2k';
  if (resolution === '1k' || resolution === '1K'.toLowerCase() || resolution === '1080p') return '1k';
  return '1k';
}

function normalizeWaveSpeedOutputFormat(value: unknown) {
  const format = String(value || '').trim().toLowerCase();
  if (format === 'jpg' || format === 'jpeg') return 'jpeg';
  if (format === 'webp') return 'webp';
  return 'png';
}

function normalizeWaveSpeedQuality(value: unknown, configs: Record<string, string>) {
  const quality = String(value || configs.wavespeed_image_quality || 'medium').trim().toLowerCase();
  return ['low', 'medium', 'high'].includes(quality) ? quality : 'medium';
}

function normalizeKieOptions(options: Record<string, unknown>) {
  return options;
}

function normalizeWaveSpeedOptions(options: Record<string, unknown>, configs: Record<string, string>) {
  return {
    aspect_ratio: normalizeWaveSpeedAspectRatio(options.aspect_ratio),
    resolution: normalizeWaveSpeedResolution(options.resolution),
    quality: normalizeWaveSpeedQuality(options.quality, configs),
    output_format: normalizeWaveSpeedOutputFormat(options.output_format),
    enable_sync_mode: false,
    enable_base64_output: false,
  };
}

export function lyricVideoImageProviderFromGenerationParams(value: unknown): LyricVideoImageProviderName {
  const parsed = value && typeof value === 'object'
    ? value as Record<string, any>
    : parseJsonField<Record<string, any>>(value, {});
  return parsed.provider === 'wavespeed' || parsed.providerName === 'wavespeed' ? 'wavespeed' : 'kie';
}

export async function createLyricVideoImageProviderSelection(params: {
  configs?: Record<string, string>;
  model?: string;
  needsReferenceImage?: boolean;
  defaultKieModel?: string;
  defaultKieCharacterModel?: string;
}): Promise<LyricVideoImageProviderSelection> {
  const configs = params.configs || await getAllConfigs();
  const configuredProvider = normalizeConfiguredProvider(configs);
  const shouldUseKie = configuredProvider === 'kie' || Boolean(params.needsReferenceImage);

  if (shouldUseKie) {
    const fallbackReason = configuredProvider === 'wavespeed' && params.needsReferenceImage
      ? 'WaveSpeed GPT Image 2 text-to-image does not support reference images; using Kie for this scene.'
      : undefined;
    return {
      providerName: 'kie',
      provider: await createKieProvider(),
      model: params.model || params.defaultKieCharacterModel || params.defaultKieModel || configs.kie_image_model || KIE_Z_IMAGE_MODEL,
      mediaType: AIMediaType.IMAGE,
      fallbackReason,
      normalizeOptions: normalizeKieOptions,
    };
  }

  if (!configs.wavespeed_api_key) {
    throw createLyricVideoError('WaveSpeed API key is required. Add it in Admin Settings > AI.', {
      errorKind: 'provider_request_failed',
      provider: 'wavespeed',
      model: configs.wavespeed_image_model || WAVESPEED_GPT_IMAGE_2_MODEL,
      diagnostics: { source: 'createLyricVideoImageProviderSelection' },
    });
  }

  return {
    providerName: 'wavespeed',
    provider: new WaveSpeedProvider({
      apiKey: configs.wavespeed_api_key,
      baseUrl: configs.wavespeed_base_url,
      imageModel: configs.wavespeed_image_model || WAVESPEED_GPT_IMAGE_2_MODEL,
      customStorage: isStorageConfigured(),
      saveFiles: saveAIProviderFiles,
      uuid: getUuid,
    }),
    model: configs.wavespeed_image_model || WAVESPEED_GPT_IMAGE_2_MODEL,
    mediaType: AIMediaType.IMAGE,
    normalizeOptions: (options) => normalizeWaveSpeedOptions(options, configs),
  };
}

export async function createLyricVideoImageQueryProvider(params: {
  providerName: LyricVideoImageProviderName;
  configs?: Record<string, string>;
}) {
  const configs = params.configs || await getAllConfigs();
  if (params.providerName === 'wavespeed') {
    if (!configs.wavespeed_api_key) {
      throw createLyricVideoError('WaveSpeed API key is required. Add it in Admin Settings > AI.', {
        errorKind: 'provider_request_failed',
        provider: 'wavespeed',
        diagnostics: { source: 'createLyricVideoImageQueryProvider' },
      });
    }
    return new WaveSpeedProvider({
      apiKey: configs.wavespeed_api_key,
      baseUrl: configs.wavespeed_base_url,
      imageModel: configs.wavespeed_image_model || WAVESPEED_GPT_IMAGE_2_MODEL,
      customStorage: isStorageConfigured(),
      saveFiles: saveAIProviderFiles,
      uuid: getUuid,
    });
  }

  return createKieProvider();
}

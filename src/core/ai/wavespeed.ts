import {
  AIConfigs,
  AIFile,
  AIGenerateParams,
  AIImage,
  AIMediaType,
  AIProvider,
  AITaskResult,
  AITaskStatus,
  SaveFilesFunction,
  UuidFunction,
} from './types';

const defaultUuid: UuidFunction = () => crypto.randomUUID();

export const WAVESPEED_GPT_IMAGE_2_MODEL = 'openai/gpt-image-2/text-to-image';
export const WAVESPEED_DEFAULT_BASE_URL = 'https://api.wavespeed.ai/api/v3';

const WAVESPEED_IMAGE_OPTIONS = [
  'aspect_ratio',
  'resolution',
  'quality',
  'output_format',
  'enable_sync_mode',
  'enable_base64_output',
];

type WaveSpeedResponse = Record<string, any>;

export interface WaveSpeedConfigs extends AIConfigs {
  apiKey: string;
  baseUrl?: string;
  imageModel?: string;
  customStorage?: boolean;
  saveFiles?: SaveFilesFunction;
  uuid?: UuidFunction;
}

export class WaveSpeedProvider implements AIProvider {
  readonly name = 'wavespeed';
  configs: WaveSpeedConfigs;
  private baseUrl: string;

  constructor(configs: WaveSpeedConfigs) {
    this.configs = configs;
    this.baseUrl = (configs.baseUrl || WAVESPEED_DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  private getUuid(): string {
    return (this.configs.uuid || defaultUuid)();
  }

  private async trySaveFiles(files: AIFile[]): Promise<AIFile[] | undefined> {
    if (!this.configs.saveFiles) return undefined;
    try {
      return await this.configs.saveFiles(files);
    } catch (error) {
      console.error('save files failed:', error);
      return undefined;
    }
  }

  async generate({ params }: { params: AIGenerateParams }): Promise<AITaskResult> {
    if (params.mediaType !== AIMediaType.IMAGE) {
      throw new Error(`mediaType not supported: ${params.mediaType}`);
    }
    if (!params.prompt) {
      throw new Error('prompt is required');
    }

    const model = params.model || this.configs.imageModel || WAVESPEED_GPT_IMAGE_2_MODEL;
    const apiUrl = `${this.baseUrl}/${model.replace(/^\/+/, '')}`;
    const payload = this.formatImagePayload(params);
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error(`request failed with status: ${resp.status}`);
    }

    const raw = await resp.json();
    const data = this.unwrapResponse(raw, 'generate image');
    const taskId = this.extractTaskId(data);
    if (!taskId) {
      throw new Error('generate image failed: no task id');
    }

    return {
      taskStatus: this.mapStatus(String(data.status || 'created')),
      taskId,
      taskInfo: {
        images: this.extractImages(data),
        status: data.status,
        errorCode: data.error_code || data.errorCode,
        errorMessage: data.error || data.message || data.errorMessage,
        createTime: data.created_at ? new Date(data.created_at) : undefined,
      },
      taskResult: data,
    };
  }

  async query({ taskId, mediaType }: { taskId: string; mediaType?: AIMediaType }): Promise<AITaskResult> {
    if (mediaType && mediaType !== AIMediaType.IMAGE) {
      throw new Error(`mediaType not supported: ${mediaType}`);
    }

    const apiUrl = `${this.baseUrl}/predictions/${encodeURIComponent(taskId)}/result`;
    const resp = await fetch(apiUrl, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!resp.ok) {
      throw new Error(`request failed with status: ${resp.status}`);
    }

    const raw = await resp.json();
    const data = this.unwrapResponse(raw, 'query image');
    const taskStatus = this.mapStatus(String(data.status || 'created'));
    let images = this.extractImages(data);

    if (taskStatus === AITaskStatus.SUCCESS && images && images.length > 0 && this.configs.customStorage) {
      const filesToSave: AIFile[] = [];
      images.forEach((image, index) => {
        if (!image.imageUrl) return;
        const format = this.outputFormatFromUrl(image.imageUrl, data.output_format);
        filesToSave.push({
          url: image.imageUrl,
          contentType: this.contentTypeForFormat(format),
          key: `wavespeed/image/${this.getUuid()}.${format === 'jpeg' ? 'jpg' : format}`,
          index,
          type: 'image',
        });
      });

      if (filesToSave.length > 0) {
        const uploadedFiles = await this.trySaveFiles(filesToSave);
        if (uploadedFiles) {
          images = images.map((image, index) => {
            const uploaded = uploadedFiles.find((file) => file.index === index);
            return uploaded?.url ? { ...image, imageUrl: uploaded.url } : image;
          });
        }
      }
    }

    return {
      taskId: this.extractTaskId(data) || taskId,
      taskStatus,
      taskInfo: {
        images,
        status: data.status,
        errorCode: data.error_code || data.errorCode,
        errorMessage: data.error || data.message || data.errorMessage,
        createTime: data.created_at ? new Date(data.created_at) : undefined,
      },
      taskResult: data,
    };
  }

  private headers() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.configs.apiKey}`,
    };
  }

  private formatImagePayload(params: AIGenerateParams) {
    const payload: Record<string, unknown> = {
      prompt: params.prompt,
      enable_sync_mode: false,
      enable_base64_output: false,
    };
    const options = params.options || {};
    WAVESPEED_IMAGE_OPTIONS.forEach((key) => {
      if (options[key] !== undefined && options[key] !== null && options[key] !== '') {
        payload[key] = options[key];
      }
    });
    return payload;
  }

  private unwrapResponse(raw: WaveSpeedResponse, action: string): WaveSpeedResponse {
    const code = raw?.code;
    if (code !== undefined && code !== 200) {
      throw new Error(`${action} failed: ${raw?.message || raw?.msg || code}`);
    }
    return raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  }

  private extractTaskId(data: WaveSpeedResponse): string {
    return String(data?.id || data?.request_id || data?.requestId || data?.taskId || '').trim();
  }

  private extractImages(data: WaveSpeedResponse): AIImage[] | undefined {
    const outputs = Array.isArray(data?.outputs)
      ? data.outputs
      : Array.isArray(data?.output)
        ? data.output
        : typeof data?.output === 'string'
          ? [data.output]
          : [];
    const urls = outputs.filter((output: unknown): output is string => typeof output === 'string' && output.length > 0);
    if (urls.length === 0) return undefined;
    return urls.map((url) => ({
      id: '',
      createTime: data.created_at ? new Date(data.created_at) : new Date(),
      imageUrl: url,
    }));
  }

  private outputFormatFromUrl(url: string, format?: unknown): 'png' | 'jpeg' | 'webp' {
    const normalized = String(format || '').trim().toLowerCase();
    if (normalized === 'jpg' || normalized === 'jpeg') return 'jpeg';
    if (normalized === 'webp') return 'webp';
    if (normalized === 'png') return 'png';
    const path = url.split('?')[0]?.toLowerCase() || '';
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'jpeg';
    if (path.endsWith('.webp')) return 'webp';
    return 'png';
  }

  private contentTypeForFormat(format: 'png' | 'jpeg' | 'webp') {
    if (format === 'jpeg') return 'image/jpeg';
    if (format === 'webp') return 'image/webp';
    return 'image/png';
  }

  private mapStatus(status: string): AITaskStatus {
    switch (status) {
      case 'created':
        return AITaskStatus.PENDING;
      case 'processing':
        return AITaskStatus.PROCESSING;
      case 'completed':
        return AITaskStatus.SUCCESS;
      case 'failed':
        return AITaskStatus.FAILED;
      default:
        throw new Error(`unknown status: ${status}`);
    }
  }
}

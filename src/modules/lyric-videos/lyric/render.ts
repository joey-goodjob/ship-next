import { and, eq } from 'drizzle-orm';
import { envConfigs } from '@/config';
import { db } from '@/core/db';
import { lyricVideoExport, lyricVideoProject } from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { buildCaptionChunks, type CaptionWord } from '@/lib/lyric-caption-chunks';
import { logLyricStage } from '@/lib/lyric-video-log';
import { buildLyricVideoExportFingerprint, withExportFreshnessSettings } from '@/lib/lyric-video-export-freshness';
import { createTask } from '@/modules/ai-tasks/service';
import { createMediaJob } from './media-jobs';
import { safeJson } from './json';
import { getProjectDetails } from './project';
import { LYRIC_VIDEO_DEFAULT_STYLE, type LyricLineInput } from './types';

/**
 * 导出模块：把已生成好的歌词、scene 图片和音频渲染成 MP4。
 *
 * 这不是一键生成 `/generate` 的必经步骤；它通常由预览页上的导出按钮触发。
 * 成功时写 `lyric_video_export.videoUrl`，并把 `lyric_video_project.renderUrl`
 * 更新成最终视频地址。
 */

export function getDimensions(aspectRatio?: string) {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

export function assTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const centiseconds = Math.floor((ms % 1000) / 10);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

export function escapeAssText(text: string) {
  return text.replace(/[{}]/g, '').replace(/\n/g, '\\N');
}

export function cssHexToAss(hex: string, fallback: string) {
  const clean = (hex || fallback).replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return cssHexToAss(fallback, '#ffffff');
  const rr = clean.slice(0, 2);
  const gg = clean.slice(2, 4);
  const bb = clean.slice(4, 6);
  return `&H00${bb}${gg}${rr}`;
}

export function normalizeCaptionStyle(style?: unknown) {
  return {
    ...LYRIC_VIDEO_DEFAULT_STYLE,
    ...(style && typeof style === 'object' ? style : {}),
  } as typeof LYRIC_VIDEO_DEFAULT_STYLE & Record<string, unknown>;
}

export function captionsAreEnabled(style?: unknown) {
  return normalizeCaptionStyle(style).captionsEnabled !== false;
}

export type ExportWatermark = {
  enabled: boolean;
  text?: string | null;
};

function defaultWatermarkText() {
  const appName = String(envConfigs.app_name || 'LyricVideoMaker').trim() || 'LyricVideoMaker';
  return appName.endsWith('.app') ? appName : `${appName}.app`;
}

export function normalizeExportWatermark(watermark?: ExportWatermark | null): ExportWatermark {
  const text = String(watermark?.text || defaultWatermarkText()).trim() || defaultWatermarkText();
  return {
    enabled: Boolean(watermark?.enabled),
    text,
  };
}

export function buildExportSettings(params: {
  settings?: unknown;
  watermark?: ExportWatermark | null;
}): Record<string, unknown> & { watermark: ExportWatermark } {
  const base =
    params.settings && typeof params.settings === 'object' && !Array.isArray(params.settings)
      ? { ...(params.settings as Record<string, unknown>) }
      : {};
  return {
    ...base,
    watermark: normalizeExportWatermark(params.watermark),
  };
}

export function escapeDrawtextText(text: string) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

export function buildWatermarkDrawtextFilter(params: {
  watermark?: ExportWatermark | null;
  width: number;
  height: number;
}) {
  const watermark = normalizeExportWatermark(params.watermark);
  if (!watermark.enabled) return null;

  const shortEdge = Math.min(params.width, params.height);
  const fontSize = Math.max(24, Math.round(shortEdge * 0.032));
  const padding = Math.max(24, Math.round(shortEdge * 0.05));
  const text = escapeDrawtextText(watermark.text || defaultWatermarkText());

  return [
    `drawtext=text='${text}'`,
    `x=w-tw-${padding}`,
    `y=h-th-${padding}`,
    `fontsize=${fontSize}`,
    'fontcolor=white@0.72',
    'shadowcolor=black@0.55',
    'shadowx=2',
    'shadowy=2',
    'expansion=none',
  ].join(':');
}

export function buildAss(params: {
  lines: LyricLineInput[];
  words?: CaptionWord[];
  scenes?: Array<{ startMs?: number; endMs?: number }>;
  width: number;
  height: number;
  style?: any;
}) {
  const style = normalizeCaptionStyle(params.style);
  const alignment = style.position === 'top' ? 8 : style.position === 'center' ? 5 : 2;
  const marginV = style.position === 'bottom' ? Math.round(params.height * 0.08) : Math.round(params.height * 0.08);
  const sceneRanges = (params.scenes || [])
    .filter((scene) => Number.isFinite(Number(scene.startMs)) && Number.isFinite(Number(scene.endMs)) && Number(scene.endMs) > Number(scene.startMs))
    .sort((a, b) => Number(a.startMs || 0) - Number(b.startMs || 0));
  const wordCaptionChunks =
    params.words?.length && sceneRanges.length > 0
      ? sceneRanges.flatMap((scene) =>
          buildCaptionChunks(params.words || [], {
            rangeStartMs: Number(scene.startMs || 0),
            rangeEndMs: Number(scene.endMs || 0),
            wordsPerGroup: style.showWholeVerse ? undefined : Number(style.wordsPerGroup) || 3,
          })
        )
      : buildCaptionChunks(params.words || [], { wordsPerGroup: style.showWholeVerse ? undefined : Number(style.wordsPerGroup) || 3 });
  const captionLines =
    wordCaptionChunks.length > 0
      ? wordCaptionChunks.map((chunk) => ({
          startMs: chunk.startMs,
          endMs: chunk.endMs,
          text: chunk.text,
        }))
      : params.lines.map((line) => ({
          startMs: line.startMs || 0,
          endMs: line.endMs || (line.startMs || 0) + 3500,
          text: line.text,
        }));

  const assTextTransform = (text: string) => {
    if (style.fontCase === 'uppercase') return text.toUpperCase();
    if (style.fontCase === 'lowercase') return text.toLowerCase();
    if (style.fontCase === 'capitalize') {
      return text
        .toLowerCase()
        .replace(/\p{L}[\p{L}\p{M}'-]*/gu, (word) => word.charAt(0).toUpperCase() + word.slice(1));
    }
    return text;
  };
  const events = captionLines
    .map(
      (line) =>
        `Dialogue: 0,${assTime(line.startMs || 0)},${assTime(line.endMs || (line.startMs || 0) + 3500)},Default,,0,0,0,,${escapeAssText(assTextTransform(line.text))}`
    )
    .join('\n');
  const outline = Math.max(0, Math.round(Number(style.strokeWidth) || 0));
  const shadow = style.shadowEnabled === false ? 0 : Math.max(0, Math.round(Number(style.shadowBlur) || 0) > 0 ? 1 : 0);
  const italic = style.italic ? -1 : 0;
  const underline = style.underline ? -1 : 0;
  const spacing = Math.max(-4, Math.min(12, Math.round(Number(style.letterSpacing) || 0)));

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${params.width}
PlayResY: ${params.height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontFamily || 'Inter'},${Number(style.fontSize) || 56},${cssHexToAss(style.textColor, '#ffffff')},&H000000FF,${cssHexToAss(style.strokeColor || style.shadowColor, '#000000')},&H99000000,-1,${italic},${underline},0,100,100,${spacing},${Number(style.rotation) || 0},1,${outline},${shadow},${alignment},80,80,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
  `;
}

export function calculateStaticVideoExportCostCredits(_params: { audioDurationMs?: number | null }) {
  return 0;
}

function assertScenesReadyForExport(scenes: any[]) {
  if (scenes.some((scene) => scene.videoStatus === 'processing')) {
    throw new Error('Scene video generation is still processing. Please wait before exporting.');
  }
  if (!scenes.some((scene) => scene.videoUrl || scene.imageUrl)) {
    throw new Error('Generate at least one scene image or video before export');
  }
}

export async function queueExport(params: {
  userId: string;
  projectId: string;
  settings?: unknown;
  watermark?: ExportWatermark;
}) {
  // 导出入口：创建视频类 `ai_task`、`lyric_video_export` 和 `lyric_video_media_job`。
  // 真正的 ffmpeg 渲染只由 Railway media-worker 执行，Vercel 只负责入队和查询状态。
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');
  if (details.lines.length === 0) throw new Error('Add lyrics before export');
  if (details.scenes.length === 0) throw new Error('Generate scenes before export');
  if (!details.project.audioUrl) throw new Error('Upload audio before export');
  assertScenesReadyForExport(details.scenes);

  const costCredits = calculateStaticVideoExportCostCredits({ audioDurationMs: details.project.audioDurationMs });
  const watermark = normalizeExportWatermark(params.watermark);
  const exportFingerprint = buildLyricVideoExportFingerprint({
    project: details.project,
    lines: details.lines,
    words: details.words,
    scenes: details.scenes,
  });
  const exportSettings = withExportFreshnessSettings({
    settings: buildExportSettings({ settings: params.settings, watermark }),
    fingerprint: exportFingerprint,
  });
  const task = await createTask({
    userId: params.userId,
    mediaType: 'video',
    provider: 'ffmpeg',
    model: 'static-lyric-video-1080p',
    prompt: details.project.title,
    costCredits,
    options: { projectId: params.projectId, stage: 'render', settings: exportSettings },
  });

  const [exportJob] = await db()
    .insert(lyricVideoExport)
    .values({
      id: getUuid(),
      projectId: params.projectId,
      userId: params.userId,
      status: 'queued',
      format: 'mp4',
      resolution: details.project.resolution,
      aspectRatio: details.project.aspectRatio,
      taskId: task.id,
      settings: safeJson(exportSettings),
      costCredits,
    })
    .returning();

  const mediaJob = await createMediaJob({
    kind: 'video_export',
    projectId: params.projectId,
    userId: params.userId,
    exportId: exportJob.id,
    input: {
      exportId: exportJob.id,
      taskId: task.id,
      settings: exportSettings,
      projectId: params.projectId,
    },
  });

  logLyricStage('export-video', 'db-inserted', {
    projectId: params.projectId,
    userId: params.userId,
    exportId: exportJob.id,
    mediaJobId: mediaJob.id,
    taskId: task.id,
    status: exportJob.status,
    format: exportJob.format,
    resolution: exportJob.resolution,
    aspectRatio: exportJob.aspectRatio,
    lineCount: details.lines.length,
    sceneCount: details.scenes.length,
    costCredits,
    watermarkEnabled: watermark.enabled,
  });

  await db()
    .update(lyricVideoProject)
    .set({ renderStatus: 'queued', renderTaskId: task.id, pipelineStage: 'export_queued', pipelineError: null })
    .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));

  return exportJob;
}

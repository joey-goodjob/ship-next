import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { and, eq } from 'drizzle-orm';
import { envConfigs } from '@/config';
import { db } from '@/core/db';
import { lyricVideoExport, lyricVideoProject } from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { buildCaptionChunks, type CaptionWord } from '@/lib/lyric-caption-chunks';
import { logLyricStage, logLyricStageError } from '@/lib/lyric-video-log';
import { createTask, updateTask, AITaskStatus } from '@/modules/ai-tasks/service';
import { fetchBytes, saveGeneratedFile } from './audio';
import { safeJson } from './json';
import { getProjectDetails } from './project';
import { LYRIC_VIDEO_DEFAULT_STYLE, type LyricLineInput } from './types';

const execFileAsync = promisify(execFile);

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

function normalizeCaptionStyle(style?: unknown) {
  return {
    ...LYRIC_VIDEO_DEFAULT_STYLE,
    ...(style && typeof style === 'object' ? style : {}),
  } as typeof LYRIC_VIDEO_DEFAULT_STYLE & Record<string, unknown>;
}

function captionsAreEnabled(style?: unknown) {
  return normalizeCaptionStyle(style).captionsEnabled !== false;
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
          })
        )
      : buildCaptionChunks(params.words || []);
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

  const events = captionLines
    .map(
      (line) =>
        `Dialogue: 0,${assTime(line.startMs || 0)},${assTime(line.endMs || (line.startMs || 0) + 3500)},Default,,0,0,0,,${escapeAssText(line.text)}`
    )
    .join('\n');

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${params.width}
PlayResY: ${params.height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontFamily || 'Inter'},${Number(style.fontSize) || 56},${cssHexToAss(style.textColor, '#ffffff')},&H000000FF,${cssHexToAss(style.shadowColor, '#000000')},&H99000000,-1,0,0,0,100,100,0,0,1,3,1,${alignment},80,80,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}

export async function queueExport(params: {
  userId: string;
  projectId: string;
  settings?: unknown;
}) {
  const details = await getProjectDetails({ userId: params.userId, id: params.projectId });
  if (!details) throw new Error('Project not found');
  if (details.lines.length === 0) throw new Error('Add lyrics before export');
  if (details.scenes.length === 0) throw new Error('Generate scenes before export');
  if (!details.project.audioUrl) throw new Error('Upload audio before export');
  if (!details.scenes.some((scene: any) => scene.imageUrl)) throw new Error('Generate at least one scene image before export');

  const costCredits = Math.max(20, Math.ceil((details.project.audioDurationMs || 60000) / 1000 / 10) * 5);
  const task = await createTask({
    userId: params.userId,
    mediaType: 'video',
    provider: 'ffmpeg',
    model: 'static-lyric-video-1080p',
    prompt: details.project.title,
    costCredits,
    options: { projectId: params.projectId, stage: 'render', settings: params.settings },
  });

  const [exportJob] = await db()
    .insert(lyricVideoExport)
    .values({
      id: getUuid(),
      projectId: params.projectId,
      userId: params.userId,
      status: 'processing',
      format: 'mp4',
      resolution: details.project.resolution,
      aspectRatio: details.project.aspectRatio,
      taskId: task.id,
      settings: safeJson(params.settings || LYRIC_VIDEO_DEFAULT_STYLE),
      costCredits,
    })
    .returning();

  logLyricStage('export-video', 'db-inserted', {
    projectId: params.projectId,
    userId: params.userId,
    exportId: exportJob.id,
    taskId: task.id,
    status: exportJob.status,
    format: exportJob.format,
    resolution: exportJob.resolution,
    aspectRatio: exportJob.aspectRatio,
    lineCount: details.lines.length,
    sceneCount: details.scenes.length,
    costCredits,
  });

  await db()
    .update(lyricVideoProject)
    .set({ renderStatus: 'processing', renderTaskId: task.id, pipelineStage: 'rendering', pipelineError: null })
    .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId)));

  try {
    logLyricStage('export-video', 'render-start', {
      projectId: params.projectId,
      userId: params.userId,
      exportId: exportJob.id,
      taskId: task.id,
    });
    const rendered = await renderStaticVideo({
      project: details.project,
      lines: details.lines,
      words: details.words,
      scenes: details.scenes,
      settings: params.settings,
      exportId: exportJob.id,
    });

    await Promise.all([
      updateTask({ taskId: task.id, status: AITaskStatus.SUCCESS, taskResult: rendered }),
      db()
        .update(lyricVideoExport)
        .set({ status: 'success', videoUrl: rendered.url, storageKey: rendered.storageKey })
        .where(and(eq(lyricVideoExport.id, exportJob.id), eq(lyricVideoExport.userId, params.userId))),
      db()
        .update(lyricVideoProject)
        .set({ renderStatus: 'ready', renderUrl: rendered.url, pipelineStage: 'export_ready', pipelineError: null })
        .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
    ]);

    logLyricStage('export-video', 'success', {
      projectId: params.projectId,
      userId: params.userId,
      exportId: exportJob.id,
      taskId: task.id,
      status: 'success',
      videoUrl: rendered.url,
      storageKey: rendered.storageKey,
      hasVideoUrl: Boolean(rendered.url),
      pipelineStage: 'export_ready',
      renderStatus: 'ready',
    });

    return { ...exportJob, status: 'success', videoUrl: rendered.url, storageKey: rendered.storageKey };
  } catch (error: any) {
    logLyricStageError('export-video', 'fail', error, {
      projectId: params.projectId,
      userId: params.userId,
      exportId: exportJob.id,
      taskId: task.id,
    });
    await Promise.all([
      updateTask({ taskId: task.id, status: AITaskStatus.FAILED, taskResult: { error: error?.message } }),
      db()
        .update(lyricVideoExport)
        .set({ status: 'failed', error: error?.message || 'Export failed' })
        .where(and(eq(lyricVideoExport.id, exportJob.id), eq(lyricVideoExport.userId, params.userId))),
      db()
        .update(lyricVideoProject)
        .set({ renderStatus: 'failed', pipelineStage: 'export_failed', pipelineError: error?.message || 'Export failed' })
        .where(and(eq(lyricVideoProject.id, params.projectId), eq(lyricVideoProject.userId, params.userId))),
    ]);
    throw error;
  }
}

export async function renderStaticVideo(params: {
  project: any;
  lines: any[];
  words?: any[];
  scenes: any[];
  settings?: unknown;
  exportId: string;
}) {
  const { width, height } = getDimensions(params.project.aspectRatio);
  const tmpDir = path.join(process.cwd(), '.next', 'lyric-video-renders', params.exportId);
  await mkdir(tmpDir, { recursive: true });

  try {
    const audioPath = path.join(tmpDir, 'audio');
    await writeFile(audioPath, await fetchBytes(params.project.audioUrl));

    const scenesWithImages = params.scenes.filter((scene) => scene.imageUrl);
    const concatLines: string[] = [];
    for (let index = 0; index < scenesWithImages.length; index += 1) {
      const scene = scenesWithImages[index];
      const imagePath = path.join(tmpDir, `scene-${index}.png`);
      await writeFile(imagePath, await fetchBytes(scene.imageUrl));
      concatLines.push(`file '${imagePath.replace(/'/g, "'\\''")}'`);
      concatLines.push(`duration ${Math.max(1, ((scene.endMs || scene.startMs + 4000) - (scene.startMs || 0)) / 1000)}`);
    }
    const lastImage = path.join(tmpDir, `scene-${scenesWithImages.length - 1}.png`);
    concatLines.push(`file '${lastImage.replace(/'/g, "'\\''")}'`);

    const concatPath = path.join(tmpDir, 'images.txt');
    const assPath = path.join(tmpDir, 'subtitles.ass');
    const outputPath = path.join(tmpDir, 'output.mp4');
    const captionStyle = normalizeCaptionStyle(params.settings);
    const subtitlesEnabled = captionsAreEnabled(captionStyle);
    await writeFile(concatPath, concatLines.join('\n'));
    if (subtitlesEnabled) {
      await writeFile(
        assPath,
        buildAss({
          lines: params.lines,
          words: params.words,
          scenes: params.scenes,
          width,
          height,
          style: captionStyle,
        })
      );
    }

    const videoFilter = [
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`,
      subtitlesEnabled ? `subtitles=${assPath}` : null,
    ]
      .filter(Boolean)
      .join(',');

    await execFileAsync(envConfigs.ffmpeg_path || 'ffmpeg', [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatPath,
      '-i',
      audioPath,
      '-vf',
      videoFilter,
      '-shortest',
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      outputPath,
    ]);

    const body = await readFile(outputPath);
    return saveGeneratedFile({
      body,
      key: `renders/${params.exportId}.mp4`,
      contentType: 'video/mp4',
      localDir: 'renders',
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

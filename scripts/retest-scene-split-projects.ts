import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_SOURCE_PROJECT_IDS = [
  '3ea93338-7167-46ff-b3d8-7add92dd5028',
  'c0017b65-49a6-499c-91de-03a2cb8d7b4a',
];

function loadEnv(filePath: string) {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  return true;
}

function loadDefaultEnv() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const envFile = process.env.ENV_FILE;
  const filesToTry = envFile
    ? [envFile]
    : [`.env.${nodeEnv}.local`, `.env.${nodeEnv}`, '.env.local', '.env'];

  for (const file of filesToTry) {
    loadEnv(resolve(file));
  }
}

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function sourceProjectIds() {
  const raw = argValue('source-projects') || process.env.LYRIC_VIDEO_RETEST_SOURCE_PROJECTS || DEFAULT_SOURCE_PROJECT_IDS.join(',');
  return raw.split(',').map((id) => id.trim()).filter(Boolean);
}

function rebuildProjectIds() {
  const raw = argValue('rebuild-projects') || process.env.LYRIC_VIDEO_RETEST_REBUILD_PROJECTS || '';
  return raw.split(',').map((id) => id.trim()).filter(Boolean);
}

function sceneDurationMs(scene: { startMs?: number; endMs?: number }) {
  return Math.max(0, Number(scene.endMs || 0) - Number(scene.startMs || 0));
}

function summarizeSceneDurations(scenes: Array<{ startMs?: number; endMs?: number }>) {
  const durations = scenes.map(sceneDurationMs);
  return {
    count: scenes.length,
    minMs: durations.length ? Math.min(...durations) : 0,
    maxMs: durations.length ? Math.max(...durations) : 0,
    lt1500: durations.filter((duration) => duration < 1500).length,
    b1500_2999: durations.filter((duration) => duration >= 1500 && duration < 3000).length,
    b3000_6500: durations.filter((duration) => duration >= 3000 && duration <= 6500).length,
    gt6500: durations.filter((duration) => duration > 6500).length,
  };
}

async function main() {
  loadDefaultEnv();

  const [
    { db, closeDb },
    { envConfigs },
    { lyricVideoProject },
    { inArray },
    service,
  ] = await Promise.all([
    import('../src/core/db'),
    import('../src/config'),
    import('../src/config/db/schema'),
    import('drizzle-orm'),
    import('../src/modules/lyric-videos/service'),
  ]);

  const ids = sourceProjectIds();
  const rows = await db()
    .select()
    .from(lyricVideoProject)
    .where(inArray(lyricVideoProject.id, ids));
  const rowsById = new Map(rows.map((row: any) => [row.id, row]));
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const results: unknown[] = [];
  const rebuildIds = rebuildProjectIds();

  if (rebuildIds.length > 0) {
    const rebuildRows = await db()
      .select()
      .from(lyricVideoProject)
      .where(inArray(lyricVideoProject.id, rebuildIds));
    const rebuildRowsById = new Map(rebuildRows.map((row: any) => [row.id, row]));

    for (const projectId of rebuildIds) {
      const project = rebuildRowsById.get(projectId) as any;
      if (!project) {
        throw new Error(`Retest project not found: ${projectId}`);
      }

      await service.replaceLyricsSceneSkeleton({
        userId: project.userId,
        projectId: project.id,
        runId: project.activeRunId || undefined,
      });
      const details = await service.getProjectDetails({ userId: project.userId, id: project.id });
      const result = {
        retestProjectId: project.id,
        retestTitle: project.title,
        retestPreviewUrl: `${baseUrl}/lyric-videos/${project.id}/preview`,
        retest: {
          lineCount: details?.lines.length || 0,
          wordCount: details?.words.length || 0,
          sceneDistribution: summarizeSceneDurations(details?.scenes || []),
          generationStatus: details?.project.generationStatus,
          pipelineStage: details?.project.pipelineStage,
        },
      };
      results.push(result);
      console.info('[retest-scene-split-projects] rebuilt:', JSON.stringify(result, null, 2));
    }

    await closeDb({
      database_provider: envConfigs.database_provider === 'postgres' ? 'postgresql' : envConfigs.database_provider,
      database_url: envConfigs.database_url,
      database_auth_token: envConfigs.database_auth_token,
      db_schema: envConfigs.db_schema,
      db_singleton_enabled: envConfigs.db_singleton_enabled,
      db_max_connections: envConfigs.db_max_connections,
    });
    console.info('[retest-scene-split-projects] rebuild completed:', JSON.stringify(results, null, 2));
    return;
  }

  for (const sourceId of ids) {
    const source = rowsById.get(sourceId) as any;
    if (!source) {
      throw new Error(`Source project not found: ${sourceId}`);
    }

    const sourceDetails = await service.getProjectDetails({ userId: source.userId, id: source.id });
    const sourceDistribution = summarizeSceneDurations(sourceDetails?.scenes || []);
    const project = await service.createProject({
      userId: source.userId,
      title: `Scene Split Retest - ${source.title}`,
      audioUrl: source.audioUrl,
      audioStorageKey: source.audioStorageKey,
      originalAudioUrl: source.originalAudioUrl || source.audioUrl,
      originalAudioStorageKey: source.originalAudioStorageKey || source.audioStorageKey,
      audioFilename: source.audioFilename,
      audioDurationMs: source.audioDurationMs,
      audioMimeType: source.audioMimeType,
      audioSizeBytes: source.audioSizeBytes,
      audioChecksum: source.audioChecksum,
      trimStartMs: source.trimStartMs,
      trimEndMs: source.trimEndMs,
      processedAudioUrl: source.processedAudioUrl,
      processedAudioStorageKey: source.processedAudioStorageKey,
      language: source.language,
      storyPrompt: source.storyPrompt,
      palette: source.palette,
      artStyle: source.artStyle,
      aspectRatio: source.aspectRatio,
      resolution: source.resolution,
    });

    await service.startGenerationRun({
      userId: source.userId,
      projectId: project.id,
      idempotencyKey: `scene-split-retest-${source.id}-${Date.now()}`,
      input: {
        wait: true,
        transcribeModel: 'scribe_v2',
        debug: {
          stopAfter: 'asr_words',
        },
      },
    });

    const details = await service.getProjectDetails({ userId: source.userId, id: project.id });
    const newDistribution = summarizeSceneDurations(details?.scenes || []);
    const result = {
      sourceProjectId: source.id,
      sourceTitle: source.title,
      source: {
        lineCount: sourceDetails?.lines.length || 0,
        wordCount: sourceDetails?.words.length || 0,
        sceneDistribution: sourceDistribution,
      },
      retestProjectId: project.id,
      retestPreviewUrl: `${baseUrl}/lyric-videos/${project.id}/preview`,
      retest: {
        lineCount: details?.lines.length || 0,
        wordCount: details?.words.length || 0,
        sceneDistribution: newDistribution,
        generationStatus: details?.project.generationStatus,
        pipelineStage: details?.project.pipelineStage,
      },
    };
    results.push(result);
    console.info('[retest-scene-split-projects] result:', JSON.stringify(result, null, 2));
  }

  await closeDb({
    database_provider: envConfigs.database_provider === 'postgres' ? 'postgresql' : envConfigs.database_provider,
    database_url: envConfigs.database_url,
    database_auth_token: envConfigs.database_auth_token,
    db_schema: envConfigs.db_schema,
    db_singleton_enabled: envConfigs.db_singleton_enabled,
    db_max_connections: envConfigs.db_max_connections,
  });
  console.info('[retest-scene-split-projects] completed:', JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error('[retest-scene-split-projects] failed:', error);
  process.exitCode = 1;
});

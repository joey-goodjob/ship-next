import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function readWorkspaceFile(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function extractBetween(source: string, startPattern: RegExp, endPattern: RegExp, label: string) {
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `${label} start should exist`);
  const rest = source.slice(start);
  const end = rest.search(endPattern);
  assert.notEqual(end, -1, `${label} end should exist`);
  return rest.slice(0, end);
}

const projectSource = readWorkspaceFile("src/modules/lyric-videos/lyric/project.ts");
const workerSource = readWorkspaceFile("src/workers/media-worker.ts");

const listProjectsSource = extractBetween(
  projectSource,
  /export async function listProjects\(userId: string\)/,
  /export async function getProject\(/,
  "listProjects",
);

assert.match(
  listProjectsSource,
  /\.select\(\s*\{/,
  "listProjects should use an explicit projection instead of select()",
);

for (const field of [
  "id",
  "userId",
  "title",
  "status",
  "audioFilename",
  "audioDurationMs",
  "pipelineStage",
  "lyricsStatus",
  "scenesStatus",
  "renderStatus",
  "aspectRatio",
  "resolution",
  "createdAt",
  "updatedAt",
] as const) {
  assert.match(
    listProjectsSource,
    new RegExp(`${field}:\\s*lyricVideoProject\\.${field}\\b`),
    `listProjects should include lightweight field ${field}`,
  );
}

for (const field of [
  "audioUrl",
  "audioStorageKey",
  "originalAudioUrl",
  "originalAudioStorageKey",
  "processedAudioUrl",
  "processedAudioStorageKey",
  "transcriptionRaw",
  "storyPrompt",
  "previewConfig",
] as const) {
  assert.doesNotMatch(
    listProjectsSource,
    new RegExp(`${field}:\\s*lyricVideoProject\\.${field}\\b`),
    `listProjects should not return heavy or list-unused field ${field}`,
  );
}

assert.match(
  workerSource,
  /Number\(process\.env\.MEDIA_WORKER_POLL_INTERVAL_MS\)\s*\|\|\s*30_000/,
  "media worker should default idle polling to 30 seconds while still respecting MEDIA_WORKER_POLL_INTERVAL_MS",
);

console.log("Supabase egress guard checks passed");

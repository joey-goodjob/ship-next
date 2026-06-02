import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type DebugFixtureStage = 'analyze' | 'prompt1' | 'prompt2' | 'image-queue' | 'image-query';

type DebugFixtureInfo = {
  key: string;
  stage: DebugFixtureStage;
  cacheHit: boolean;
  path: string;
};

type DebugFixtureOptions = {
  fixtureKey?: unknown;
  cache?: unknown;
  refreshCache?: unknown;
  stage: DebugFixtureStage;
  filename: string;
};

const FIXTURE_ROOT = path.join(process.cwd(), 'debug', 'fixtures');

export function debugBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

export function debugFixtureName(stage: DebugFixtureStage, parts: unknown[] = []) {
  const suffix = parts.map((part) => sanitizePathPart(part)).filter(Boolean).join('-');
  return suffix ? `${stage}-${suffix}.json` : `${stage}.json`;
}

export async function withDebugFixture<T extends Record<string, unknown>>(
  options: DebugFixtureOptions,
  producer: () => Promise<T>
): Promise<T & { debugFixture?: DebugFixtureInfo }> {
  const shouldCache = debugBoolean(options.cache);
  if (!shouldCache) return producer();

  const key = sanitizePathPart(options.fixtureKey);
  if (!key) {
    throw new Error('fixtureKey is required when cache is true');
  }

  const filename = sanitizeFilename(options.filename);
  const fixtureDir = path.join(FIXTURE_ROOT, key);
  const fixturePath = path.join(fixtureDir, filename);
  const relativePath = path.relative(process.cwd(), fixturePath).split(path.sep).join('/');

  const info = (cacheHit: boolean): DebugFixtureInfo => ({
    key,
    stage: options.stage,
    cacheHit,
    path: relativePath,
  });

  if (!debugBoolean(options.refreshCache)) {
    try {
      const cached = JSON.parse(await readFile(fixturePath, 'utf-8')) as T;
      return { ...cached, debugFixture: info(true) };
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw new Error(`Read debug fixture failed: ${error?.message || error}`);
      }
    }
  }

  const data = await producer();
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(fixturePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  return { ...data, debugFixture: info(false) };
}

export async function readDebugFixture<T = any>(fixtureKey: unknown, filename: string): Promise<T | null> {
  const key = sanitizePathPart(fixtureKey);
  if (!key) return null;

  try {
    const fixturePath = path.join(FIXTURE_ROOT, key, sanitizeFilename(filename));
    return JSON.parse(await readFile(fixturePath, 'utf-8')) as T;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`Read debug fixture failed: ${error?.message || error}`);
  }
}

function sanitizePathPart(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function sanitizeFilename(value: unknown) {
  const filename = sanitizePathPart(value);
  if (!filename || filename === '.' || filename === '..') {
    throw new Error('Invalid debug fixture filename');
  }
  return filename.endsWith('.json') ? filename : `${filename}.json`;
}

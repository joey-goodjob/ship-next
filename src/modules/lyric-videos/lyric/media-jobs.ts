import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/core/db';
import { lyricVideoMediaJob, type LyricVideoMediaJob, type NewLyricVideoMediaJob } from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { safeJson } from './json';

export const MEDIA_JOB_KINDS = ['video_export', 'audio_analysis', 'audio_trim'] as const;
export const MEDIA_JOB_STATUSES = ['queued', 'processing', 'ready', 'failed'] as const;

export type MediaJobKind = (typeof MEDIA_JOB_KINDS)[number];
export type MediaJobStatus = (typeof MEDIA_JOB_STATUSES)[number];

export function isSupportedMediaJobKind(kind: string): kind is MediaJobKind {
  return MEDIA_JOB_KINDS.includes(kind as MediaJobKind);
}

export function assertSupportedMediaJobKind(kind: string): MediaJobKind {
  if (isSupportedMediaJobKind(kind)) return kind;
  throw new Error(`Unsupported media job kind: ${kind}`);
}

export async function createMediaJob(params: {
  kind: MediaJobKind;
  projectId: string;
  userId: string;
  exportId?: string | null;
  runId?: string | null;
  stepId?: string | null;
  input?: unknown;
}) {
  const data: NewLyricVideoMediaJob = {
    id: getUuid(),
    kind: assertSupportedMediaJobKind(params.kind),
    status: 'queued',
    projectId: params.projectId,
    userId: params.userId,
    exportId: params.exportId || undefined,
    runId: params.runId || undefined,
    stepId: params.stepId || undefined,
    inputJson: params.input === undefined ? undefined : safeJson(params.input),
    attemptCount: 0,
  };

  const [job] = await db().insert(lyricVideoMediaJob).values(data).returning();
  return job;
}

export async function getMediaJobById(params: {
  jobId: string;
  userId?: string;
}) {
  const where = params.userId
    ? and(eq(lyricVideoMediaJob.id, params.jobId), eq(lyricVideoMediaJob.userId, params.userId))
    : eq(lyricVideoMediaJob.id, params.jobId);
  const [job] = await db().select().from(lyricVideoMediaJob).where(where).limit(1);
  return job || null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForMediaJob(params: {
  jobId: string;
  userId?: string;
  timeoutMs: number;
  pollIntervalMs?: number;
}) {
  const startedAt = Date.now();
  const pollIntervalMs = Math.max(250, params.pollIntervalMs || 1000);

  while (Date.now() - startedAt <= params.timeoutMs) {
    const job = await getMediaJobById({ jobId: params.jobId, userId: params.userId });
    if (!job) return null;
    if (job.status === 'ready' || job.status === 'failed') return job;
    await sleep(pollIntervalMs);
  }

  return getMediaJobById({ jobId: params.jobId, userId: params.userId });
}

export async function claimNextMediaJob(params: {
  workerId: string;
  kinds?: MediaJobKind[];
}): Promise<LyricVideoMediaJob | null> {
  const kinds = params.kinds?.length ? params.kinds.map(assertSupportedMediaJobKind) : [...MEDIA_JOB_KINDS];
  const [candidate] = await db()
    .select()
    .from(lyricVideoMediaJob)
    .where(and(inArray(lyricVideoMediaJob.kind, kinds), eq(lyricVideoMediaJob.status, 'queued')))
    .orderBy(asc(lyricVideoMediaJob.createdAt))
    .limit(1);

  if (!candidate) return null;

  const [claimed] = await db()
    .update(lyricVideoMediaJob)
    .set({
      status: 'processing',
      lockedAt: new Date(),
      lockedBy: params.workerId,
      startedAt: candidate.startedAt || new Date(),
      attemptCount: (candidate.attemptCount || 0) + 1,
      error: null,
    })
    .where(and(eq(lyricVideoMediaJob.id, candidate.id), eq(lyricVideoMediaJob.status, 'queued')))
    .returning();

  return claimed || null;
}

export async function markMediaJobReady(params: {
  jobId: string;
  output?: unknown;
}) {
  const [job] = await db()
    .update(lyricVideoMediaJob)
    .set({
      status: 'ready',
      outputJson: params.output === undefined ? undefined : safeJson(params.output),
      error: null,
      lockedAt: null,
      lockedBy: null,
      completedAt: new Date(),
    })
    .where(eq(lyricVideoMediaJob.id, params.jobId))
    .returning();

  return job || null;
}

export async function markMediaJobFailed(params: {
  jobId: string;
  error: unknown;
  output?: unknown;
}) {
  const message = params.error instanceof Error ? params.error.message : String(params.error || 'Media job failed');
  const [job] = await db()
    .update(lyricVideoMediaJob)
    .set({
      status: 'failed',
      outputJson: params.output === undefined ? undefined : safeJson(params.output),
      error: message,
      lockedAt: null,
      lockedBy: null,
      completedAt: new Date(),
    })
    .where(eq(lyricVideoMediaJob.id, params.jobId))
    .returning();

  return job || null;
}

import { and, asc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/core/db';
import { lyricVideoMediaJob, type LyricVideoMediaJob, type NewLyricVideoMediaJob } from '@/config/db/schema';
import { getUuid } from '@/lib/hash';
import { safeJson } from './json';

export const MEDIA_JOB_KINDS = ['video_export', 'audio_analysis', 'audio_trim'] as const;
export const MEDIA_JOB_STATUSES = ['queued', 'processing', 'ready', 'failed'] as const;

export type MediaJobKind = (typeof MEDIA_JOB_KINDS)[number];
export type MediaJobStatus = (typeof MEDIA_JOB_STATUSES)[number];
export type MediaJobRecoveryAction = 'ignore' | 'requeue' | 'fail';

type RecoverableMediaJob = {
  status: string;
  lockedAt?: Date | string | number | null;
  attemptCount?: number | null;
};

export function isSupportedMediaJobKind(kind: string): kind is MediaJobKind {
  return MEDIA_JOB_KINDS.includes(kind as MediaJobKind);
}

export function assertSupportedMediaJobKind(kind: string): MediaJobKind {
  if (isSupportedMediaJobKind(kind)) return kind;
  throw new Error(`Unsupported media job kind: ${kind}`);
}

function dateFromValue(value: Date | string | number | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getMediaJobRecoveryAction(params: {
  job: RecoverableMediaJob;
  staleCutoff: Date;
  maxAttempts: number;
}): MediaJobRecoveryAction {
  if (params.job.status !== 'processing') return 'ignore';
  const lockedAt = dateFromValue(params.job.lockedAt);
  if (lockedAt && lockedAt.getTime() >= params.staleCutoff.getTime()) return 'ignore';
  return Number(params.job.attemptCount || 0) >= Math.max(1, params.maxAttempts) ? 'fail' : 'requeue';
}

export async function heartbeatMediaJob(params: {
  jobId: string;
  workerId: string;
}) {
  const [job] = await db()
    .update(lyricVideoMediaJob)
    .set({ lockedAt: new Date() })
    .where(
      and(
        eq(lyricVideoMediaJob.id, params.jobId),
        eq(lyricVideoMediaJob.status, 'processing'),
        eq(lyricVideoMediaJob.lockedBy, params.workerId)
      )
    )
    .returning();

  return job || null;
}

export async function runWithMediaJobHeartbeat<T>(params: {
  jobId: string;
  workerId: string;
  heartbeatMs: number;
  heartbeat?: typeof heartbeatMediaJob;
  run: () => Promise<T>;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}) {
  const heartbeat = params.heartbeat || heartbeatMediaJob;
  const setIntervalFn = params.setIntervalFn || setInterval;
  const clearIntervalFn = params.clearIntervalFn || clearInterval;
  const timer = setIntervalFn(() => {
    void heartbeat({ jobId: params.jobId, workerId: params.workerId });
  }, Math.max(1000, params.heartbeatMs));

  try {
    return await params.run();
  } finally {
    clearIntervalFn(timer);
  }
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

function staleProcessingWhere(staleCutoff: Date) {
  return and(
    eq(lyricVideoMediaJob.status, 'processing'),
    or(isNull(lyricVideoMediaJob.lockedAt), lt(lyricVideoMediaJob.lockedAt, staleCutoff))
  );
}

export async function recoverStaleMediaJobs(params: {
  workerId: string;
  staleAfterMs: number;
  maxAttempts: number;
  limit?: number;
  kinds?: MediaJobKind[];
}) {
  const staleCutoff = new Date(Date.now() - Math.max(1000, params.staleAfterMs));
  const maxAttempts = Math.max(1, Math.floor(params.maxAttempts || 3));
  const limit = Math.max(1, Math.floor(params.limit || 10));
  const kinds = params.kinds?.length ? params.kinds.map(assertSupportedMediaJobKind) : [...MEDIA_JOB_KINDS];
  const candidates = await db()
    .select()
    .from(lyricVideoMediaJob)
    .where(and(inArray(lyricVideoMediaJob.kind, kinds), staleProcessingWhere(staleCutoff)))
    .orderBy(asc(lyricVideoMediaJob.createdAt))
    .limit(limit);

  const requeued: LyricVideoMediaJob[] = [];
  const failed: LyricVideoMediaJob[] = [];

  for (const candidate of candidates) {
    const action = getMediaJobRecoveryAction({ job: candidate, staleCutoff, maxAttempts });
    if (action === 'requeue') {
      const [job] = await db()
        .update(lyricVideoMediaJob)
        .set({
          status: 'queued',
          lockedAt: null,
          lockedBy: null,
          error: `Recovered stale lock from ${candidate.lockedBy || 'unknown worker'}`,
        })
        .where(and(eq(lyricVideoMediaJob.id, candidate.id), staleProcessingWhere(staleCutoff)))
        .returning();
      if (job) requeued.push(job);
      continue;
    }

    if (action === 'fail') {
      const message = `Media job timed out after ${candidate.attemptCount || 0} attempt(s)`;
      const [job] = await db()
        .update(lyricVideoMediaJob)
        .set({
          status: 'failed',
          error: message,
          lockedAt: null,
          lockedBy: null,
          completedAt: new Date(),
        })
        .where(and(eq(lyricVideoMediaJob.id, candidate.id), staleProcessingWhere(staleCutoff)))
        .returning();
      if (job) failed.push(job);
    }
  }

  return { requeued, failed };
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

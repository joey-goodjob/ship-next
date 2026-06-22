import assert from 'node:assert/strict';
import {
  getMediaJobRecoveryAction,
  runWithMediaJobHeartbeat,
  type MediaJobStatus,
} from '../src/modules/lyric-videos/lyric/media-jobs';

const now = new Date('2026-06-22T12:00:00.000Z');
const staleCutoff = new Date(now.getTime() - 5 * 60_000);

function recoveryAction(params: {
  status: MediaJobStatus;
  lockedAt?: Date | null;
  attemptCount?: number;
}) {
  return getMediaJobRecoveryAction({
    job: {
      status: params.status,
      lockedAt: params.lockedAt ?? null,
      attemptCount: params.attemptCount ?? 1,
    },
    staleCutoff,
    maxAttempts: 3,
  });
}

assert.equal(
  recoveryAction({
    status: 'processing',
    lockedAt: new Date(staleCutoff.getTime() - 1),
    attemptCount: 1,
  }),
  'requeue',
  'stale processing jobs below max attempts should be requeued',
);

assert.equal(
  recoveryAction({
    status: 'processing',
    lockedAt: new Date(staleCutoff.getTime()),
    attemptCount: 1,
  }),
  'ignore',
  'processing jobs at the stale cutoff should still be considered active',
);

assert.equal(
  recoveryAction({
    status: 'processing',
    lockedAt: new Date(staleCutoff.getTime() - 1),
    attemptCount: 3,
  }),
  'fail',
  'stale processing jobs at max attempts should fail permanently',
);

for (const status of ['queued', 'ready', 'failed'] as const) {
  assert.equal(
    recoveryAction({
      status,
      lockedAt: new Date(staleCutoff.getTime() - 1),
      attemptCount: 3,
    }),
    'ignore',
    `${status} jobs should not be recovered as stale processing jobs`,
  );
}

assert.equal(
  recoveryAction({
    status: 'processing',
    lockedAt: null,
    attemptCount: 1,
  }),
  'requeue',
  'processing jobs without a lock timestamp should be treated as stale',
);

async function assertHeartbeatTimerClears(params: {
  name: string;
  run: () => Promise<unknown>;
  expectReject?: boolean;
}) {
  let started = 0;
  let cleared = 0;
  const timer = { id: params.name };

  const execution = runWithMediaJobHeartbeat({
    jobId: 'job-1',
    workerId: 'worker-1',
    heartbeatMs: 1000,
    heartbeat: async () => null,
    run: params.run,
    setIntervalFn: (() => {
      started += 1;
      return timer;
    }) as unknown as typeof setInterval,
    clearIntervalFn: ((value: unknown) => {
      assert.equal(value, timer, `${params.name} should clear the heartbeat timer it started`);
      cleared += 1;
    }) as typeof clearInterval,
  });

  if (params.expectReject) {
    await assert.rejects(execution, /boom/, `${params.name} should rethrow the job failure`);
  } else {
    assert.equal(await execution, 'ok', `${params.name} should return the job result`);
  }

  assert.equal(started, 1, `${params.name} should start one heartbeat timer`);
  assert.equal(cleared, 1, `${params.name} should clear one heartbeat timer`);
}

async function main() {
  await assertHeartbeatTimerClears({
    name: 'successful job',
    run: async () => 'ok',
  });
  await assertHeartbeatTimerClears({
    name: 'failed job',
    run: async () => {
      throw new Error('boom');
    },
    expectReject: true,
  });

  console.log('media job recovery helpers ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

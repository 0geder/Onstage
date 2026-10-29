import { config } from './config';
import { prisma } from './prisma';

/**
 * Cross-replica mutual exclusion for scheduled jobs.
 *
 * Every replica runs the same cron schedule, so without this two replicas fire
 * the same job at the same minute and double-ingest or double-queue. A
 * Postgres advisory lock is the arbiter.
 *
 * The lock is transaction-scoped on purpose. Prisma pools connections, so a
 * session lock taken with one query could be released (or never released) on
 * a different pooled connection than the one that took it. An interactive
 * transaction pins a single connection for its lifetime: the lock is taken on
 * it and Postgres drops it when the transaction ends — on commit, on rollback,
 * or when the connection dies with the process. The job's own queries use the
 * normal pool; the transaction only holds the lock, so it never writes and
 * holds no snapshot between statements.
 *
 * Cost: one pooled connection per running job.
 */

/** Arbitrary constant namespacing Onstage's advisory locks from anyone else's. */
const LOCK_CLASS = 0x0575;

export type LockedRun<T> = { ran: true; result: T } | { ran: false };

export async function withJobLock<T>(name: string, task: () => Promise<T>): Promise<LockedRun<T>> {
  return prisma.$transaction(
    async (tx): Promise<LockedRun<T>> => {
      const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${LOCK_CLASS}::int, hashtext(${name})) AS locked
      `;
      if (!row?.locked) return { ran: false };
      return { ran: true, result: await task() };
    },
    {
      maxWait: 10_000,
      // Past this the transaction is rolled back and the lock released, so it
      // must exceed the slowest job's runtime (the cold ingestion sweep).
      timeout: config.jobLockMaxMs,
    },
  );
}

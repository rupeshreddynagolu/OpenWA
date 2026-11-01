import { randomUUID } from 'crypto';
import { Sidequest, type JobClassType } from 'sidequest';
import type { DataSource } from 'typeorm';
import type { QueueJobOptions } from './sidequest-jobs';

/** Sidequest's job table (created by Sidequest's own migrations on start). */
export const SIDEQUEST_JOBS_TABLE = 'sidequest_jobs';

type SidequestState = 'waiting' | 'claimed' | 'running' | 'completed' | 'failed' | 'canceled';

/** BullMQ's name for a Sidequest state, as getJob().getState() reports it. A canceled job is finished, like a failed one. */
export function bullStateOf(state: string): string {
  switch (state as SidequestState) {
    case 'waiting':
      return 'waiting';
    case 'claimed':
    case 'running':
      return 'active';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'canceled':
      return 'failed';
    default:
      return 'unknown';
  }
}

/** Sidequest builder settings for BullMQ's attempts/backoff/delay options. Exported for the spec. */
export function sidequestRetryOf(opts: QueueJobOptions): {
  maxAttempts: number;
  retryDelay?: number;
  backoffStrategy?: 'exponential' | 'fixed';
  availableAt?: Date;
} {
  const backoff = opts.backoff;
  return {
    maxAttempts: Math.max(1, opts.attempts ?? 1),
    // A bare number is BullMQ's fixed backoff in ms; an object names its type.
    ...(typeof backoff === 'number'
      ? { retryDelay: backoff, backoffStrategy: 'fixed' as const }
      : backoff
        ? {
            retryDelay: backoff.delay ?? 1000,
            backoffStrategy: backoff.type === 'fixed' ? ('fixed' as const) : ('exponential' as const),
          }
        : {}),
    ...(opts.delay && opts.delay > 0 ? { availableAt: new Date(Date.now() + opts.delay) } : {}),
  };
}

const isDuplicatedJobError = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'DuplicatedJobError' || error.constructor?.name === 'DuplicatedJobError');

/**
 * The subset of BullMQ's Queue that OpenWA calls, backed by Sidequest (fork addition). Bound to BullMQ's own
 * injection token for the queue, so webhook-delivery, ingress-enqueue, the processors, metrics and infra-status use
 * it unchanged.
 *
 * BullMQ identifies a job by the caller's jobId; Sidequest numbers its jobs. The jobId is therefore the job's first
 * argument, which getJob/remove look up, and add() reuses a live job holding it as BullMQ ignores a duplicate jobId.
 */
export class SidequestQueueAdapter {
  constructor(
    readonly name: string,
    private readonly jobClass: JobClassType,
    private readonly dataSource: DataSource,
    private readonly ready: Promise<void>,
    private readonly defaults: QueueJobOptions = {},
  ) {}

  waitUntilReady(): Promise<void> {
    return this.ready;
  }

  async add(name: string, data: unknown, opts: QueueJobOptions = {}): Promise<{ id: string; name: string }> {
    await this.ready;
    const merged: QueueJobOptions = { ...this.defaults, ...opts };
    const jobId = merged.jobId ?? randomUUID();
    if (await this.findJob(jobId, true)) return { id: jobId, name };
    const retry = sidequestRetryOf(merged);
    let builder = Sidequest.build(this.jobClass)
      .queue(this.name)
      .maxAttempts(retry.maxAttempts)
      .unique({ withArgs: true });
    if (retry.retryDelay !== undefined) builder = builder.retryDelay(retry.retryDelay);
    if (retry.backoffStrategy) builder = builder.backoffStrategy(retry.backoffStrategy);
    if (retry.availableAt) builder = builder.availableAt(retry.availableAt);
    try {
      await (builder.enqueue as (...args: unknown[]) => Promise<unknown>)(jobId, name, data, { ...merged, jobId });
    } catch (error) {
      // Another add() of the same job won the race; BullMQ treats that as a no-op too.
      if (!isDuplicatedJobError(error)) throw error;
    }
    return { id: jobId, name };
  }

  async getJob(jobId: string): Promise<{ id: string; getState(): Promise<string> } | undefined> {
    await this.ready;
    const row = await this.findJob(jobId, false);
    if (!row) return undefined;
    return { id: jobId, getState: () => Promise.resolve(bullStateOf(row.state)) };
  }

  /** Remove a job that is not running, as BullMQ's remove() refuses a locked one. */
  async remove(jobId: string): Promise<void> {
    await this.ready;
    await this.dataSource.query(
      `DELETE FROM "${SIDEQUEST_JOBS_TABLE}" WHERE "queue" = ? AND JSON_UNQUOTE(JSON_EXTRACT("args", '$[0]')) = ? AND "state" NOT IN ('claimed', 'running')`,
      [this.name, jobId],
    );
  }

  /**
   * Job counts under BullMQ's state names. A job waiting for a later time counts as `wait`: telling it apart would
   * compare Sidequest's stored time with the server clock, and the two connections need not share a zone.
   */
  async getJobCounts(...types: string[]): Promise<Record<string, number>> {
    await this.ready;
    const rows = await this.dataSource.query<Array<{ state: string; n: number | string }>>(
      `SELECT "state", COUNT(*) AS "n" FROM "${SIDEQUEST_JOBS_TABLE}" WHERE "queue" = ? GROUP BY "state"`,
      [this.name],
    );
    const by = (states: string[]): number =>
      rows.filter(r => states.includes(r.state)).reduce((sum, r) => sum + Number(r.n), 0);
    const all: Record<string, number> = {
      wait: by(['waiting']),
      waiting: by(['waiting']),
      active: by(['claimed', 'running']),
      delayed: 0,
      prioritized: 0,
      paused: 0,
      'waiting-children': 0,
      completed: by(['completed']),
      failed: by(['failed', 'canceled']),
    };
    const wanted = types.length > 0 ? types : Object.keys(all);
    return Object.fromEntries(wanted.map(type => [type, all[type] ?? 0]));
  }

  /** Sidequest's lifecycle is the module's (SidequestQueueModule stops it at shutdown). */
  close(): Promise<void> {
    return Promise.resolve();
  }

  private async findJob(jobId: string, aliveOnly: boolean): Promise<{ id: number; state: string } | undefined> {
    const rows = await this.dataSource.query<Array<{ id: number; state: string }>>(
      `SELECT "id", "state" FROM "${SIDEQUEST_JOBS_TABLE}" WHERE "queue" = ? AND JSON_UNQUOTE(JSON_EXTRACT("args", '$[0]')) = ?` +
        (aliveOnly ? ` AND "state" IN ('waiting', 'claimed', 'running')` : '') +
        ` ORDER BY "id" DESC LIMIT 1`,
      [this.name, jobId],
    );
    return rows[0];
  }
}

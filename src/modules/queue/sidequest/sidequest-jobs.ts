import { Job as SidequestJob } from 'sidequest';
import { DelayedError, type Job as BullJob } from 'bullmq';
import { QUEUE_NAMES } from '../queue-names';

/**
 * Sidequest jobs that run OpenWA's existing BullMQ processors (fork addition).
 *
 * Sidequest runs inline in this process (fork: false, runner: 'inline'), loading a job class by importing the file it
 * was defined in. Node returns the module instance already loaded, so the registry below is the one
 * SidequestQueueModule filled at start-up, and a job reaches the Nest-managed processor with its injected services.
 */

/** The BullMQ job options OpenWA passes to add(), as stored in a Sidequest job's arguments. */
export interface QueueJobOptions {
  jobId?: string;
  attempts?: number;
  backoff?: { type?: string; delay?: number } | number;
  delay?: number;
}

/** What a processor needs from a job. The two processors read only these members. */
export interface ProcessorLike {
  process(job: BullJob, token?: string): Promise<unknown>;
}

const processors = new Map<string, ProcessorLike>();

export function registerQueueProcessor(queue: string, processor: ProcessorLike): void {
  processors.set(queue, processor);
}

export function unregisterQueueProcessors(): void {
  processors.clear();
}

/** The shortest snooze: a job snoozed to "now" is claimed straight back and would spin. */
const MIN_SNOOZE_MS = 1000;

/**
 * Run one Sidequest job through the queue's processor as a BullMQ-shaped job.
 *
 * - attemptsMade is the attempts before this one. Sidequest gives a snooze its attempt back (SnoozeTransition), as
 *   BullMQ does for moveToDelayed, so it counts real attempts only. attemptsStarted is one more: Sidequest keeps no
 *   count of snoozes, so a processor that grows a delay from the gap between the two sees no gap (a fixed delay).
 * - moveToDelayed + DelayedError, how a processor postpones a job without spending an attempt, becomes a snooze.
 * - Any other error lets Sidequest retry the job with its backoff, or fail it on the last attempt.
 */
export async function runQueueJob(
  job: SidequestJob,
  queue: string,
  jobId: string,
  name: string,
  data: unknown,
  opts: QueueJobOptions,
): Promise<unknown> {
  const processor = processors.get(queue);
  if (!processor) throw new Error(`No processor registered for queue ${queue}`);
  let delayedUntil: number | undefined;
  const bullJob = {
    id: jobId,
    name,
    data,
    opts,
    attemptsMade: Math.max(0, job.attempt - 1),
    attemptsStarted: Math.max(1, job.attempt),
    timestamp: new Date(job.inserted_at).getTime(),
    moveToDelayed: (timestamp: number): Promise<void> => {
      delayedUntil = timestamp;
      return Promise.resolve();
    },
  } as unknown as BullJob;
  try {
    return await processor.process(bullJob);
  } catch (error) {
    if (error instanceof DelayedError) {
      return job.snooze(Math.max(MIN_SNOOZE_MS, (delayedUntil ?? 0) - Date.now()));
    }
    throw error;
  }
}

export class WebhookSidequestJob extends SidequestJob {
  run(jobId: string, name: string, data: unknown, opts: QueueJobOptions): Promise<unknown> {
    return runQueueJob(this, QUEUE_NAMES.WEBHOOK, jobId, name, data, opts);
  }
}

export class IngressSidequestJob extends SidequestJob {
  run(jobId: string, name: string, data: unknown, opts: QueueJobOptions): Promise<unknown> {
    return runQueueJob(this, QUEUE_NAMES.INGRESS, jobId, name, data, opts);
  }
}

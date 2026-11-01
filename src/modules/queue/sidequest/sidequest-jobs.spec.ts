import { DelayedError, type Job as BullJob } from 'bullmq';
import type { Job as SidequestJob } from 'sidequest';
import { registerQueueProcessor, runQueueJob, unregisterQueueProcessors } from './sidequest-jobs';

describe('runQueueJob', () => {
  const sidequestJob = (attempt: number) => {
    const snooze = jest.fn((delay: number) => ({ type: 'snooze', delay }));
    const job = { attempt, inserted_at: new Date('2026-11-01T00:00:00Z'), snooze } as unknown as SidequestJob;
    return { job, snooze };
  };

  afterEach(() => unregisterQueueProcessors());

  it('hands the processor a BullMQ-shaped job with the attempts made before this one', async () => {
    let seen: BullJob | undefined;
    registerQueueProcessor('q', {
      process: (job: BullJob) => {
        seen = job;
        return Promise.resolve({ ok: true });
      },
    });
    const { job } = sidequestJob(3);
    await expect(runQueueJob(job, 'q', 'delivery-1', 'webhook-w1', { a: 1 }, { attempts: 5 })).resolves.toEqual({
      ok: true,
    });
    expect(seen).toMatchObject({
      id: 'delivery-1',
      name: 'webhook-w1',
      data: { a: 1 },
      opts: { attempts: 5 },
      attemptsMade: 2,
      attemptsStarted: 3,
    });
  });

  it('turns moveToDelayed + DelayedError into a snooze, which gives the attempt back', async () => {
    registerQueueProcessor('q', {
      process: async (job: BullJob) => {
        await job.moveToDelayed(Date.now() + 30_000);
        throw new DelayedError();
      },
    });
    const { job, snooze } = sidequestJob(1);
    const result = await runQueueJob(job, 'q', 'd', 'n', {}, {});
    expect(snooze).toHaveBeenCalledTimes(1);
    const delay = snooze.mock.calls[0][0];
    expect(delay).toBeGreaterThan(29_000);
    expect(delay).toBeLessThanOrEqual(30_000);
    expect(result).toEqual({ type: 'snooze', delay });
  });

  it('never snoozes for less than a second, so a job delayed to now does not spin', async () => {
    registerQueueProcessor('q', {
      process: async (job: BullJob) => {
        await job.moveToDelayed(Date.now() - 5_000);
        throw new DelayedError();
      },
    });
    const { job, snooze } = sidequestJob(1);
    await runQueueJob(job, 'q', 'd', 'n', {}, {});
    expect(snooze).toHaveBeenCalledWith(1000);
  });

  it('rethrows any other error so Sidequest retries the job', async () => {
    registerQueueProcessor('q', { process: () => Promise.reject(new Error('receiver down')) });
    const { job, snooze } = sidequestJob(1);
    await expect(runQueueJob(job, 'q', 'd', 'n', {}, {})).rejects.toThrow('receiver down');
    expect(snooze).not.toHaveBeenCalled();
  });

  it('fails (and so retries) a job whose processor is not registered yet', async () => {
    const { job } = sidequestJob(1);
    await expect(runQueueJob(job, 'missing', 'd', 'n', {}, {})).rejects.toThrow(/No processor registered/);
  });
});

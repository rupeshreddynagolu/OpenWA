import type { DataSource } from 'typeorm';
import { bullStateOf, SidequestQueueAdapter, sidequestRetryOf } from './sidequest-queue.adapter';

describe('bullStateOf', () => {
  it.each([
    ['waiting', 'waiting'],
    ['claimed', 'active'],
    ['running', 'active'],
    ['completed', 'completed'],
    ['failed', 'failed'],
    ['canceled', 'failed'],
    ['something-new', 'unknown'],
  ])('maps Sidequest %s to BullMQ %s', (state, expected) => {
    expect(bullStateOf(state)).toBe(expected);
  });
});

describe('sidequestRetryOf', () => {
  it('maps attempts and an exponential backoff', () => {
    expect(sidequestRetryOf({ attempts: 4, backoff: { type: 'exponential', delay: 5000 } })).toEqual({
      maxAttempts: 4,
      retryDelay: 5000,
      backoffStrategy: 'exponential',
    });
  });

  it('maps a fixed backoff, object or bare number', () => {
    expect(sidequestRetryOf({ backoff: { type: 'fixed', delay: 200 } })).toMatchObject({
      retryDelay: 200,
      backoffStrategy: 'fixed',
    });
    expect(sidequestRetryOf({ backoff: 750 })).toMatchObject({ retryDelay: 750, backoffStrategy: 'fixed' });
  });

  it('runs a job once when no attempts are given, as BullMQ does', () => {
    expect(sidequestRetryOf({})).toEqual({ maxAttempts: 1 });
    expect(sidequestRetryOf({ attempts: 0 }).maxAttempts).toBe(1);
  });

  it('turns a delay into an availability time', () => {
    const before = Date.now();
    const { availableAt } = sidequestRetryOf({ delay: 10_000 });
    expect(availableAt!.getTime()).toBeGreaterThanOrEqual(before + 10_000);
    expect(availableAt!.getTime()).toBeLessThanOrEqual(Date.now() + 10_000);
  });
});

describe('SidequestQueueAdapter lookups', () => {
  const adapter = (rows: unknown[]) => {
    const query = jest.fn(() => Promise.resolve(rows));
    const dataSource = { query } as unknown as DataSource;
    return {
      adapter: new SidequestQueueAdapter('webhook-queue', class {} as never, dataSource, Promise.resolve()),
      query,
    };
  };

  it('finds a job by the jobId held in its first argument and reports its BullMQ state', async () => {
    const { adapter: queue, query } = adapter([{ id: 7, state: 'running' }]);
    const job = await queue.getJob('delivery-9');
    expect(job?.id).toBe('delivery-9');
    await expect(job!.getState()).resolves.toBe('active');
    expect(query).toHaveBeenCalledWith(expect.stringContaining(`JSON_EXTRACT("args", '$[0]')`), [
      'webhook-queue',
      'delivery-9',
    ]);
  });

  it('answers undefined for an unknown jobId', async () => {
    const { adapter: queue } = adapter([]);
    await expect(queue.getJob('nope')).resolves.toBeUndefined();
  });

  it('counts jobs under BullMQ state names, scoped to its queue', async () => {
    const { adapter: queue, query } = adapter([
      { state: 'waiting', n: '3' },
      { state: 'running', n: 1 },
      { state: 'claimed', n: 1 },
      { state: 'completed', n: 10 },
      { state: 'failed', n: 2 },
      { state: 'canceled', n: 1 },
    ]);
    await expect(queue.getJobCounts('wait', 'active', 'delayed', 'completed', 'failed')).resolves.toEqual({
      wait: 3,
      active: 2,
      delayed: 0,
      completed: 10,
      failed: 3,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('GROUP BY "state"'), ['webhook-queue']);
  });

  it('removes only a job that is not running', async () => {
    const { adapter: queue, query } = adapter([]);
    await queue.remove('job-1');
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM .* "state" NOT IN \('claimed', 'running'\)/),
      ['webhook-queue', 'job-1'],
    );
  });
});

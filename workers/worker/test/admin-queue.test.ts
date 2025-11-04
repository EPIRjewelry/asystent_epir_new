import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdminExecutionQueue } from '../src/admin-queue';

function now() { return Date.now(); }

describe('AdminExecutionQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throttles to 2 requests per second', async () => {
    const q = new AdminExecutionQueue({ requestsPerSecond: 2, maxRetries: 0 });
    const starts: number[] = [];

    const tasks = Array.from({ length: 5 }, (_, i) => () => {
      starts.push(now());
      return Promise.resolve(i);
    });

    const promises = tasks.map((fn) => q.enqueueAdminCall(fn));

    // Let the queue process: advance time in steps until all resolve
    // Initially, two should start immediately at t=0, the others will be delayed
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(0);
    // After first second, allow next two
    await vi.advanceTimersByTimeAsync(1000);
    // After second second, allow last one
    await vi.advanceTimersByTimeAsync(1000);

    const results = await Promise.all(promises);
    expect(results).toEqual([0,1,2,3,4]);

    // Verify no more than 2 starts within any 1s window by simple grouping
    // We expect something like [0,0,1000,1000,2000] with fake timers
    expect(starts.length).toBe(5);
    const grouped: Record<number, number> = {};
    for (const t of starts) {
      grouped[t] = (grouped[t] ?? 0) + 1;
    }
    // At most 2 launches per timestamp bucket
    for (const count of Object.values(grouped)) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('retries retryable errors with backoff', async () => {
    const q = new AdminExecutionQueue({ requestsPerSecond: 2, maxRetries: 2, baseBackoffMs: 100, jitterMs: 0 });
    let attempt = 0;

    const fn = vi.fn(async () => {
      attempt += 1;
      if (attempt < 2) {
        const err: any = new Error('Throttle');
        err.status = 429;
        throw err;
      }
      return 'ok';
    });

    const p = q.enqueueAdminCall(fn);

    // First run fails at t=0, then queued backoff 100ms, second run succeeds at t=100
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);

    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

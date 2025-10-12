import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiterDO } from '../../src/rate-limiter';

// Type for rate limiter response
interface RateLimiterResponse {
  allowed: boolean;
  tokens: number;
  maxTokens: number;
  retryAfterMs?: number;
}

// Mock DurableObjectState
class MockDurableObjectState {
  async blockConcurrencyWhile(callback: () => Promise<void>): Promise<void> {
    await callback();
  }
}

describe('RateLimiterDO', () => {
  let limiter: RateLimiterDO;

  beforeEach(() => {
    const state = new MockDurableObjectState() as any;
    limiter = new RateLimiterDO(state);
  });

  it('should allow requests within limit', async () => {
    const req = new Request('https://test.com/consume', {
      method: 'POST',
      body: JSON.stringify({ tokens: 1 })
    });

    const response = await limiter.fetch(req);
    const result = await response.json() as RateLimiterResponse;

    expect(result.allowed).toBe(true);
    expect(result.tokens).toBeLessThan(40); // Started with 40, consumed 1
  });

  it('should deny requests when tokens exhausted', async () => {
    // Consume all tokens at once
    const req = new Request('https://test.com/consume', {
      method: 'POST',
      body: JSON.stringify({ tokens: 40 })
    });
    await limiter.fetch(req);

    // Next request should be denied (no tokens left)
    const req2 = new Request('https://test.com/consume', {
      method: 'POST',
      body: JSON.stringify({ tokens: 1 })
    });

    const response = await limiter.fetch(req2);
    const result = await response.json() as RateLimiterResponse;

    expect(response.status).toBe(429);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('should refill tokens over time', async () => {
    // Consume some tokens
    await limiter.fetch(new Request('https://test.com/consume', {
      method: 'POST',
      body: JSON.stringify({ tokens: 10 })
    }));

    // Wait for refill (100ms should refill ~4 tokens at 2 per 50ms)
    await new Promise(resolve => setTimeout(resolve, 100));

    const checkReq = new Request('https://test.com/check');
    const response = await limiter.fetch(checkReq);
    const result = await response.json() as RateLimiterResponse;

    // Should have refilled some tokens
    expect(result.tokens).toBeGreaterThan(30);
  });

  it('should reset bucket', async () => {
    // Consume all tokens
    for (let i = 0; i < 40; i++) {
      await limiter.fetch(new Request('https://test.com/consume', {
        method: 'POST',
        body: JSON.stringify({ tokens: 1 })
      }));
    }

    // Reset
    const resetReq = new Request('https://test.com/reset');
    await limiter.fetch(resetReq);

    // Check tokens restored
    const checkReq = new Request('https://test.com/check');
    const response = await limiter.fetch(checkReq);
    const result = await response.json() as RateLimiterResponse;

    expect(result.tokens).toBe(40);
  });

  it('should handle multiple token consumption', async () => {
    const req = new Request('https://test.com/consume', {
      method: 'POST',
      body: JSON.stringify({ tokens: 5 })
    });

    const response = await limiter.fetch(req);
    const result = await response.json() as RateLimiterResponse;

    expect(result.allowed).toBe(true);
    expect(result.tokens).toBe(35); // 40 - 5
  });
});

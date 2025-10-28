import { describe, it, expect, vi } from 'vitest';
import { embedTextSafe, searchSafe, upsertDocumentsSafe } from '../src/mcp/shims';

describe('MCP shims - normalized error handling', () => {
  it('embedTextSafe returns vector on success', async () => {
    const mockEnv = { AI: { run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] }) } } as any;
    const res = await embedTextSafe(mockEnv, 'hello');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.vector).toBeInstanceOf(Float32Array);
      expect(res.vector.length).toBe(3);
    }
  });

  it('embedTextSafe returns error when AI missing', async () => {
    const mockEnv = {} as any;
    const res = await embedTextSafe(mockEnv, 'hello');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/No embedding provider/);
  });

  it('searchSafe returns results when VECTOR_INDEX and AI available', async () => {
    const mockEnv = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] }) },
      VECTOR_INDEX: { query: vi.fn().mockResolvedValue({ matches: [{ id: 'd1', score: 0.9, metadata: { text: 't' } }], count: 1 }) }
    } as any;
    const res = await searchSafe(mockEnv, 'q', 5);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.results).toHaveLength(1);
      expect(res.results[0].id).toBe('d1');
    }
  });

  it('searchSafe errors when VECTOR_INDEX missing', async () => {
    const mockEnv = { AI: { run: vi.fn() } } as any;
    const res = await searchSafe(mockEnv, 'q');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/VECTOR_INDEX binding not available/);
  });

  it('upsertDocumentsSafe upserts and returns mutationId', async () => {
    const mockEnv = {
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] }) },
      VECTOR_INDEX: { upsert: vi.fn().mockResolvedValue({ mutationId: 'm1' }) }
    } as any;
    const docs = [{ id: 'doc1', text: 'txt', metadata: { a: 1 } }];
    const res = await upsertDocumentsSafe(mockEnv, docs);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.mutationId).toBe('m1');
    expect(mockEnv.AI.run).toHaveBeenCalledTimes(1);
    expect(mockEnv.VECTOR_INDEX.upsert).toHaveBeenCalledTimes(1);
  });

  it('upsertDocumentsSafe returns ok for empty docs', async () => {
    const mockEnv = {} as any;
    const res = await upsertDocumentsSafe(mockEnv, []);
    expect(res.ok).toBe(true);
  });

  it('upsertDocumentsSafe errors when VECTOR_INDEX missing', async () => {
    const mockEnv = { AI: { run: vi.fn() } } as any;
    const res = await upsertDocumentsSafe(mockEnv, [{ id: 'd', text: 't' }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/VECTOR_INDEX binding not available/);
  });
});

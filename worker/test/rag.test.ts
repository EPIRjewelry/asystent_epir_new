import { describe, it, expect, vi } from 'vitest';
import {
  searchShopPoliciesAndFaqs,
  formatRagContextForPrompt,
  hasHighConfidenceResults,
  type VectorizeIndex,
} from '../src/rag';

interface WorkersAI {
  run: (model: string, args: Record<string, unknown>) => Promise<any>;
}

describe('RAG Module', () => {
  describe('searchShopPoliciesAndFaqs', () => {
    it('should return results when embeddings and vectorize work', async () => {
      const mockAI: WorkersAI = {
        run: vi.fn().mockResolvedValue({
          data: [[0.1, 0.2, 0.3]], // Mock embedding
        }),
      };

      const mockVectorIndex: VectorizeIndex = {
        query: vi.fn().mockResolvedValue({
          matches: [
            {
              id: 'doc1',
              score: 0.95,
              metadata: { text: 'Sample policy text' },
            },
          ],
          count: 1,
        }),
      };

      const result = await searchShopPoliciesAndFaqs('test query', mockVectorIndex, mockAI);

      expect(result.query).toBe('test query');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].text).toBe('Sample policy text');
      expect(result.results[0].score).toBe(0.95);
      expect(mockAI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', {
        text: ['test query'],
      });
      expect(mockVectorIndex.query).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const mockAI: WorkersAI = {
        run: vi.fn().mockRejectedValue(new Error('AI error')),
      };
      
      const mockVectorIndex: VectorizeIndex = {
        query: vi.fn().mockResolvedValue({ matches: [], count: 0 }),
      };

      const result = await searchShopPoliciesAndFaqs('test query', mockVectorIndex, mockAI);

      expect(result.query).toBe('test query');
      expect(result.results).toEqual([]);
    });

    it('should format multiple results correctly', async () => {
      const mockAI: WorkersAI = {
        run: vi.fn().mockResolvedValue({
          data: [[0.1, 0.2, 0.3]],
        }),
      };

      const mockVectorIndex: VectorizeIndex = {
        query: vi.fn().mockResolvedValue({
          matches: [
            {
              id: 'doc1',
              score: 0.92,
              metadata: { text: 'Policy 1', type: 'shipping' },
            },
            {
              id: 'doc2',
              score: 0.85,
              metadata: { text: 'Policy 2', type: 'returns' },
            },
          ],
          count: 2,
        }),
      };

      const result = await searchShopPoliciesAndFaqs('test query', mockVectorIndex, mockAI, 2);

      expect(result.results).toHaveLength(2);
      expect(result.results[0].text).toBe('Policy 1');
      expect(result.results[1].text).toBe('Policy 2');
    });
  });

  describe('formatRagContextForPrompt', () => {
    it('should return empty string for empty results', () => {
      const context = {
        query: 'test query',
        results: [],
      };

      const formatted = formatRagContextForPrompt(context);

      expect(formatted).toBe('');
    });

    it('should format single document correctly', () => {
      const context = {
        query: 'test query',
        results: [
          {
            id: 'doc1',
            text: 'Sample policy text',
            score: 0.95,
            metadata: { type: 'policy' },
          },
        ],
      };

      const formatted = formatRagContextForPrompt(context);

      expect(formatted).toContain('Context (retrieved documents for query: "test query")');
      expect(formatted).toContain('[Doc 1]');
      expect(formatted).toContain('95.0%');
      expect(formatted).toContain('Sample policy text');
      expect(formatted).toContain('{"type":"policy"}');
    });

    it('should format multiple documents correctly', () => {
      const context = {
        query: 'shipping policy',
        results: [
          {
            id: 'doc1',
            text: 'Shipping takes 3-5 days',
            score: 0.92,
          },
          {
            id: 'doc2',
            text: 'Free shipping over 500 PLN',
            score: 0.85,
          },
        ],
      };

      const formatted = formatRagContextForPrompt(context);

      expect(formatted).toContain('[Doc 1]');
      expect(formatted).toContain('92.0%');
      expect(formatted).toContain('[Doc 2]');
      expect(formatted).toContain('85.0%');
      expect(formatted).toContain('Shipping takes 3-5 days');
      expect(formatted).toContain('Free shipping over 500 PLN');
    });

    it('should include instruction to use context', () => {
      const context = {
        query: 'test',
        results: [{ id: 'doc1', text: 'text', score: 0.8 }],
      };

      const formatted = formatRagContextForPrompt(context);

      expect(formatted).toContain('Odpowiedz używając powyższego kontekstu');
      expect(formatted).toContain('Jeśli brak wystarczających informacji, powiedz to wprost');
    });
  });

  describe('hasHighConfidenceResults', () => {
    it('should return false for empty results', () => {
      const context = { query: 'test', results: [] };
      expect(hasHighConfidenceResults(context)).toBe(false);
    });

    it('should return false when no results meet threshold', () => {
      const context = {
        query: 'test',
        results: [
          { id: 'doc1', text: 'text1', score: 0.5 },
          { id: 'doc2', text: 'text2', score: 0.6 },
        ],
      };
      expect(hasHighConfidenceResults(context)).toBe(false);
    });

    it('should return true when at least one result meets default threshold (0.7)', () => {
      const context = {
        query: 'test',
        results: [
          { id: 'doc1', text: 'text1', score: 0.65 },
          { id: 'doc2', text: 'text2', score: 0.75 },
        ],
      };
      expect(hasHighConfidenceResults(context)).toBe(true);
    });

    it('should respect custom threshold', () => {
      const context = {
        query: 'test',
        results: [{ id: 'doc1', text: 'text1', score: 0.8 }],
      };
      expect(hasHighConfidenceResults(context, 0.9)).toBe(false);
      expect(hasHighConfidenceResults(context, 0.75)).toBe(true);
    });

    it('should return true for perfect match (score = 1.0)', () => {
      const context = {
        query: 'test',
        results: [{ id: 'doc1', text: 'text1', score: 1.0 }],
      };
      expect(hasHighConfidenceResults(context, 0.99)).toBe(true);
    });
  });
});

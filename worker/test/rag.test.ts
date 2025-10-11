import { describe, it, expect, vi } from 'vitest';
import {
  searchShopPoliciesAndFaqs,
  searchShopPoliciesAndFaqsWithMCP,
  searchProductCatalogWithMCP,
  formatRagContextForPrompt,
  formatMcpProductsForPrompt,
  hasHighConfidenceResults,
  type VectorizeIndex,
} from '../src/rag';
import * as mcp from '../src/mcp';

// Mock MCP module
vi.mock('../src/mcp', async () => {
  const actual = await vi.importActual('../src/mcp');
  return {
    ...actual,
    mcpSearchPoliciesAndFaqs: vi.fn(),
    mcpCatalogSearch: vi.fn(),
  };
});

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

  describe('formatMcpProductsForPrompt', () => {
    it('should return empty string for no products', () => {
      const formatted = formatMcpProductsForPrompt([], 'test');
      expect(formatted).toBe('');
    });

    it('should format single product', () => {
      const products = [
        {
          name: 'Pierścionek zaręczynowy',
          price: '2500 PLN',
          url: 'https://shop.com/ring',
          description: 'Luksusowy pierścionek',
        },
      ];

      const formatted = formatMcpProductsForPrompt(products, 'pierścionek');

      expect(formatted).toContain('Produkty znalezione');
      expect(formatted).toContain('Pierścionek zaręczynowy');
      expect(formatted).toContain('2500 PLN');
      expect(formatted).toContain('https://shop.com/ring');
      expect(formatted).toContain('Luksusowy pierścionek');
    });

    it('should format multiple products', () => {
      const products = [
        { name: 'Product 1', price: '100 PLN', url: 'https://shop.com/p1' },
        { name: 'Product 2', price: '200 PLN', url: 'https://shop.com/p2' },
      ];

      const formatted = formatMcpProductsForPrompt(products, 'test');

      expect(formatted).toContain('[Produkt 1]');
      expect(formatted).toContain('[Produkt 2]');
      expect(formatted).toContain('Product 1');
      expect(formatted).toContain('Product 2');
    });
  });

  describe('searchShopPoliciesAndFaqsWithMCP', () => {
    it('should use MCP when shop domain is available', async () => {
      const mockFaqs = [
        { question: 'Q1', answer: 'A1', category: 'shipping' },
        { question: 'Q2', answer: 'A2' },
      ];

      vi.mocked(mcp.mcpSearchPoliciesAndFaqs).mockResolvedValue(mockFaqs);

      const result = await searchShopPoliciesAndFaqsWithMCP(
        'test query',
        'test.myshopify.com',
        undefined,
        undefined,
        3
      );

      expect(result.query).toBe('test query');
      expect(result.results).toHaveLength(2);
      expect(result.results[0].text).toContain('Q1');
      expect(result.results[0].text).toContain('A1');
      expect(result.results[0].score).toBe(0.95);
      expect(result.results[0].metadata?.source).toBe('mcp');
      expect(mcp.mcpSearchPoliciesAndFaqs).toHaveBeenCalledWith(
        'test.myshopify.com',
        'test query'
      );
    });

    it('should fallback to Vectorize when MCP fails', async () => {
      vi.mocked(mcp.mcpSearchPoliciesAndFaqs).mockResolvedValue(null);

      const mockAI = {
        run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] }),
      };

      const mockVectorIndex: VectorizeIndex = {
        query: vi.fn().mockResolvedValue({
          matches: [{ id: 'doc1', score: 0.9, metadata: { text: 'Vectorize result' } }],
          count: 1,
        }),
      };

      const result = await searchShopPoliciesAndFaqsWithMCP(
        'test query',
        'test.myshopify.com',
        mockVectorIndex,
        mockAI,
        3
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0].text).toBe('Vectorize result');
      expect(mockAI.run).toHaveBeenCalled();
      expect(mockVectorIndex.query).toHaveBeenCalled();
    });

    it('should return empty results when both MCP and Vectorize unavailable', async () => {
      vi.mocked(mcp.mcpSearchPoliciesAndFaqs).mockResolvedValue(null);

      const result = await searchShopPoliciesAndFaqsWithMCP(
        'test query',
        undefined,
        undefined,
        undefined,
        3
      );

      expect(result.query).toBe('test query');
      expect(result.results).toEqual([]);
    });

    it('should limit results to topK', async () => {
      const mockFaqs = [
        { question: 'Q1', answer: 'A1' },
        { question: 'Q2', answer: 'A2' },
        { question: 'Q3', answer: 'A3' },
        { question: 'Q4', answer: 'A4' },
      ];

      vi.mocked(mcp.mcpSearchPoliciesAndFaqs).mockResolvedValue(mockFaqs);

      const result = await searchShopPoliciesAndFaqsWithMCP(
        'test query',
        'test.myshopify.com',
        undefined,
        undefined,
        2
      );

      expect(result.results).toHaveLength(2);
    });
  });

  describe('searchProductCatalogWithMCP', () => {
    it('should return formatted products when shop domain available', async () => {
      const mockProducts = [
        {
          name: 'Ring',
          price: '1000 PLN',
          url: 'https://shop.com/ring',
          description: 'Beautiful ring',
        },
      ];

      vi.mocked(mcp.mcpCatalogSearch).mockResolvedValue(mockProducts);

      const result = await searchProductCatalogWithMCP('ring', 'test.myshopify.com', 'fair trade luxury');

      expect(result).toContain('Ring');
      expect(result).toContain('1000 PLN');
      expect(result).toContain('https://shop.com/ring');
      expect(mcp.mcpCatalogSearch).toHaveBeenCalledWith(
        'test.myshopify.com',
        'ring',
        'fair trade luxury'
      );
    });

    it('should return empty string when no shop domain', async () => {
      const result = await searchProductCatalogWithMCP('ring', undefined);

      expect(result).toBe('');
      // mcpCatalogSearch should not be called when shopDomain is undefined
    });

    it('should return empty string when MCP fails', async () => {
      vi.mocked(mcp.mcpCatalogSearch).mockResolvedValue(null);

      const result = await searchProductCatalogWithMCP('ring', 'test.myshopify.com');

      expect(result).toBe('');
    });

    it('should return empty string when no products found', async () => {
      vi.mocked(mcp.mcpCatalogSearch).mockResolvedValue([]);

      const result = await searchProductCatalogWithMCP('ring', 'test.myshopify.com');

      expect(result).toBe('');
    });
  });

  // COMMENTED OUT: embedText, search, upsertDocuments functions don't exist in current implementation
  // These are legacy tests for functionality that was removed or not yet implemented
  /*
  describe('embedText', () => {
    it('should generate embeddings using Workers AI', async () => {
      const { embedText } = await import('../src/rag');
      
      const mockEnv = {
        AI: {
          run: vi.fn().mockResolvedValue({
            data: [[0.1, 0.2, 0.3, 0.4]],
          }),
        },
      };

      const result = await embedText(mockEnv as any, 'test text');

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBeGreaterThan(0);
      expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', {
        text: ['test text'],
      });
    });

    it('should convert number array to Float32Array', async () => {
      const { embedText } = await import('../src/rag');
      
      const mockEnv = {
        AI: {
          run: vi.fn().mockResolvedValue({
            data: [[0.1, 0.2, 0.3]],
          }),
        },
      };

      const result = await embedText(mockEnv as any, 'test');

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(3);
      // Float32Array precision is not exact, so we check approximate values
      expect(Array.from(result)[0]).toBeCloseTo(0.1, 1);
      expect(Array.from(result)[1]).toBeCloseTo(0.2, 1);
      expect(Array.from(result)[2]).toBeCloseTo(0.3, 1);
    });

    it('should throw error when no embedding provider configured', async () => {
      const { embedText } = await import('../src/rag');
      
      const mockEnv = {};

      await expect(embedText(mockEnv as any, 'test')).rejects.toThrow(
        'No embedding provider configured'
      );
    });

    it('should handle errors gracefully', async () => {
      const { embedText } = await import('../src/rag');
      
      const mockEnv = {
        AI: {
          run: vi.fn().mockRejectedValue(new Error('AI error')),
        },
      };

      await expect(embedText(mockEnv as any, 'test')).rejects.toThrow('AI error');
    });
  });

  describe('search', () => {
    it('should perform semantic search and return ranked results', async () => {
      const { search } = await import('../src/rag');
      
      const mockEnv = {
        AI: {
          run: vi.fn().mockResolvedValue({
            data: [Float32Array.from([0.1, 0.2, 0.3])],
          }),
        },
        VECTOR_INDEX: {
          query: vi.fn().mockResolvedValue({
            matches: [
              {
                id: 'doc1',
                score: 0.95,
                metadata: { source: 'products', text: 'Sample product' },
              },
              {
                id: 'doc2',
                score: 0.88,
                metadata: { source: 'faq', text: 'Sample FAQ' },
              },
            ],
            count: 2,
          }),
        },
      };

      const results = await search(mockEnv as any, 'test query', 5);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('doc1');
      expect(results[0].source).toBe('products');
      expect(results[0].text).toBe('Sample product');
      expect(results[0].score).toBe(0.95);
      expect(results[1].id).toBe('doc2');
      expect(results[1].score).toBe(0.88);
      expect(mockEnv.VECTOR_INDEX.query).toHaveBeenCalled();
    });

    it('should throw error when VECTOR_INDEX not available', async () => {
      const { search } = await import('../src/rag');
      
      const mockEnv = {
        AI: {
          run: vi.fn().mockResolvedValue({
            data: [[0.1, 0.2]],
          }),
        },
      };

      await expect(search(mockEnv as any, 'test query')).rejects.toThrow(
        'VECTOR_INDEX binding not available'
      );
    });

    it('should respect topK parameter', async () => {
      const { search } = await import('../src/rag');
      
      const mockEnv = {
        AI: {
          run: vi.fn().mockResolvedValue({
            data: [[0.1, 0.2]],
          }),
        },
        VECTOR_INDEX: {
          query: vi.fn().mockResolvedValue({
            matches: [],
            count: 0,
          }),
        },
      };

      await search(mockEnv as any, 'test', 10);

      expect(mockEnv.VECTOR_INDEX.query).toHaveBeenCalledWith(
        expect.any(Float32Array),
        { topK: 10 }
      );
    });
  });

  describe('upsertDocuments', () => {
    it('should upsert documents with embeddings to vector index', async () => {
      const { upsertDocuments } = await import('../src/rag');
      
      const mockEnv = {
        AI: {
          run: vi.fn().mockResolvedValue({
            data: [[0.1, 0.2, 0.3]],
          }),
        },
        VECTOR_INDEX: {
          upsert: vi.fn().mockResolvedValue({ mutationId: 'test-mutation' }),
        },
      };

      const docs = [
        {
          id: 'doc1',
          source: 'products',
          text: 'Sample product description',
          metadata: { title: 'Product 1' },
        },
        {
          id: 'doc2',
          source: 'faq',
          text: 'Sample FAQ answer',
          metadata: { category: 'general' },
        },
      ];

      await upsertDocuments(mockEnv as any, docs);

      expect(mockEnv.AI.run).toHaveBeenCalledTimes(2);
      expect(mockEnv.VECTOR_INDEX.upsert).toHaveBeenCalledTimes(1);
      expect(mockEnv.VECTOR_INDEX.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'doc1',
            values: expect.any(Float32Array),
            metadata: expect.objectContaining({
              source: 'products',
              title: 'Product 1',
            }),
          }),
          expect.objectContaining({
            id: 'doc2',
            values: expect.any(Float32Array),
            metadata: expect.objectContaining({
              source: 'faq',
              category: 'general',
            }),
          }),
        ])
      );
    });

    it('should handle empty document array', async () => {
      const { upsertDocuments } = await import('../src/rag');
      
      const mockEnv = {
        AI: { run: vi.fn() },
        VECTOR_INDEX: { upsert: vi.fn() },
      };

      await upsertDocuments(mockEnv as any, []);

      expect(mockEnv.AI.run).not.toHaveBeenCalled();
      expect(mockEnv.VECTOR_INDEX.upsert).not.toHaveBeenCalled();
    });

    it('should throw error when VECTOR_INDEX not available', async () => {
      const { upsertDocuments } = await import('../src/rag');
      
      const mockEnv = {
        AI: {
          run: vi.fn().mockResolvedValue({ data: [[0.1]] }),
        },
      };

      const docs = [{ id: 'doc1', source: 'test', text: 'test' }];

      await expect(upsertDocuments(mockEnv as any, docs)).rejects.toThrow(
        'VECTOR_INDEX binding not available'
      );
    });

    it('should batch upserts for large document sets', async () => {
      const { upsertDocuments } = await import('../src/rag');
      
      const mockEnv = {
        AI: {
          run: vi.fn().mockResolvedValue({
            data: [[0.1, 0.2]],
          }),
        },
        VECTOR_INDEX: {
          upsert: vi.fn().mockResolvedValue({ mutationId: 'test' }),
        },
      };

      // Create 150 documents (should be split into 2 batches)
      const docs = Array.from({ length: 150 }, (_, i) => ({
        id: `doc${i}`,
        source: 'test',
        text: `Document ${i}`,
      }));

      await upsertDocuments(mockEnv as any, docs);

      // Should have called upsert twice (100 + 50)
      expect(mockEnv.VECTOR_INDEX.upsert).toHaveBeenCalledTimes(2);
      expect(mockEnv.AI.run).toHaveBeenCalledTimes(150);
    });
  });
  */
});

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
      expect(mockAI.run).toHaveBeenCalledWith('@cf/baai/bge-large-en-v1.5', {
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
    it('should use Vectorize when shop domain is available', async () => {
      const mockAI = {
        run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] }),
      };

      const mockVectorIndex: VectorizeIndex = {
        query: vi.fn().mockResolvedValue({
          matches: [
            { id: 'doc1', score: 0.9, metadata: { text: 'Policy text 1', title: 'Q1' } },
            { id: 'doc2', score: 0.8, metadata: { text: 'Policy text 2', title: 'Q2' } },
          ],
          count: 2,
        }),
      };

      const result = await searchShopPoliciesAndFaqsWithMCP(
        'test query',
        'test.myshopify.com',
        mockVectorIndex,
        mockAI,
        3
      );

      expect(result.query).toBe('test query');
      expect(result.results).toHaveLength(2);
      expect(result.results[0].text).toBe('Policy text 1');
      expect(result.results[0].score).toBe(0.9);
      expect(mockAI.run).toHaveBeenCalledWith('@cf/baai/bge-large-en-v1.5', {
        text: ['test query'],
      });
    });

    it('should use Vectorize even without MCP', async () => {
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

    it('should return empty results when Vectorize unavailable', async () => {
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
      const mockAI = {
        run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] }),
      };

      const mockVectorIndex: VectorizeIndex = {
        query: vi.fn().mockImplementation((vector, opts) => {
          // Simulate topK limiting by returning only opts.topK results
          const allMatches = [
            { id: 'doc1', score: 0.9, metadata: { text: 'Text 1' } },
            { id: 'doc2', score: 0.8, metadata: { text: 'Text 2' } },
            { id: 'doc3', score: 0.7, metadata: { text: 'Text 3' } },
            { id: 'doc4', score: 0.6, metadata: { text: 'Text 4' } },
          ];
          const topK = opts?.topK || allMatches.length;
          return Promise.resolve({
            matches: allMatches.slice(0, topK),
            count: allMatches.length,
          });
        }),
      };

      const result = await searchShopPoliciesAndFaqsWithMCP(
        'test query',
        'test.myshopify.com',
        mockVectorIndex,
        mockAI,
        2
      );

      expect(result.results).toHaveLength(2);
      expect(mockVectorIndex.query).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        { topK: 2 }
      );
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
          id: 'prod-1',
          image: '',
        },
      ];

      vi.mocked(mcp.mcpCatalogSearch).mockResolvedValue(mockProducts);

      const mockEnv = {}; // env parameter now required
      const result = await searchProductCatalogWithMCP('ring', 'test.myshopify.com', mockEnv, 'fair trade luxury');

      expect(result).toContain('Ring');
      expect(result).toContain('1000 PLN');
      expect(result).toContain('https://shop.com/ring');
      expect(mcp.mcpCatalogSearch).toHaveBeenCalledWith(
        'test.myshopify.com',
        'ring',
        mockEnv,
        'fair trade luxury'
      );
    });

    it('should return empty string when no shop domain', async () => {
      const mockEnv = {};
      const result = await searchProductCatalogWithMCP('ring', undefined, mockEnv);

      expect(result).toBe('');
      // mcpCatalogSearch should not be called when shopDomain is undefined
    });

    it('should return empty string when MCP fails', async () => {
      vi.mocked(mcp.mcpCatalogSearch).mockResolvedValue(null);

      const mockEnv = {};
      const result = await searchProductCatalogWithMCP('ring', 'test.myshopify.com', mockEnv);

      expect(result).toBe('');
    });

    it('should return empty string when no products found', async () => {
      vi.mocked(mcp.mcpCatalogSearch).mockResolvedValue([]);

      const mockEnv = {};
      const result = await searchProductCatalogWithMCP('ring', 'test.myshopify.com', mockEnv);

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
      expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-large-en-v1.5', {
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

  describe('searchProductsAndCartWithMCP', () => {
    it('should use MCP as primary source for product queries', async () => {
      const { searchProductsAndCartWithMCP } = await import('../src/rag');
      const mockEnv = {
        SHOP_DOMAIN: 'test-shop.myshopify.com',
        SHOPIFY_ADMIN_TOKEN: 'test_token',
        WORKER_ORIGIN: 'http://localhost:8787',
      };

      // Mock fetch for MCP call to return product results
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            result: {
              content: [
                { type: 'text', text: 'Znalezione produkty:\n- Luxury Ring - 299 PLN' }
              ]
            },
            id: 1
          }),
          { status: 200 }
        )
      );

      const result = await searchProductsAndCartWithMCP('ring', mockEnv.SHOP_DOMAIN, mockEnv as any, null, 'search');

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result).toContain('Luxury Ring');
    });

    it('should handle cart intent with cart_id', async () => {
      const { searchProductsAndCartWithMCP } = await import('../src/rag');
      const mockEnv = {
        SHOP_DOMAIN: 'test-shop.myshopify.com',
        SHOPIFY_ADMIN_TOKEN: 'test_token',
        WORKER_ORIGIN: 'http://localhost:8787',
      };

      // Mock fetch for get_cart MCP call
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            result: {
              content: [
                { type: 'text', text: 'Twój koszyk zawiera: Ring x1 - 299 PLN' }
              ]
            },
            id: 1
          }),
          { status: 200 }
        )
      );

      const result = await searchProductsAndCartWithMCP(
        'pokaż koszyk',
        mockEnv.SHOP_DOMAIN,
        mockEnv as any,
        'cart123',
        'cart'
      );

      expect(result).toBeTruthy();
      expect(result).toContain('koszyk');
    });

    it('should handle order intent', async () => {
      const { searchProductsAndCartWithMCP } = await import('../src/rag');
      const mockEnv = {
        SHOP_DOMAIN: 'test-shop.myshopify.com',
        SHOPIFY_ADMIN_TOKEN: 'test_token',
        WORKER_ORIGIN: 'http://localhost:8787',
      };

      // Mock fetch for get_most_recent_order_status MCP call
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            result: {
              content: [
                { type: 'text', text: 'Twoje ostatnie zamówienie: #1001, Status: Wysłane' }
              ]
            },
            id: 1
          }),
          { status: 200 }
        )
      );

      const result = await searchProductsAndCartWithMCP(
        'status zamówienia',
        mockEnv.SHOP_DOMAIN,
        mockEnv as any,
        null,
        'order'
      );

      expect(result).toBeTruthy();
      expect(result).toContain('zamówienie');
    });
  });
});

/**
 * GraphQL Integration Tests
 * Run with: npm test -- graphql.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch for testing
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('GraphQL Integration', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Storefront API', () => {
    it('should successfully fetch products from Storefront API', async () => {
      const mockResponse = {
        data: {
          products: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/Product/1',
                  title: 'Silver Ring',
                  description: 'Beautiful silver ring',
                  productType: 'Ring',
                  vendor: 'EPIR',
                  tags: ['silver', 'jewelry'],
                  variants: {
                    edges: [
                      {
                        node: {
                          id: 'gid://shopify/ProductVariant/1',
                          title: 'Default',
                          price: { amount: '99.99', currencyCode: 'PLN' }
                        }
                      }
                    ]
                  }
                }
              }
            ]
          }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      // Import after setting up mock
      const { callStorefrontAPI } = await import('../src/graphql');

      const query = `{
        products(first: 1) {
          edges {
            node {
              id
              title
            }
          }
        }
      }`;

      const result = await callStorefrontAPI<any>(
        'test-shop.myshopify.com',
        'test-token',
        query
      );

      expect(result).toBeDefined();
      expect(result.products.edges).toHaveLength(1);
      expect(result.products.edges[0].node.title).toBe('Silver Ring');
    });

    it('should handle GraphQL errors properly', async () => {
      const mockErrorResponse = {
        errors: [
          {
            message: "Field 'invalid' doesn't exist on type 'Product'",
            locations: [{ line: 5, column: 10 }],
            path: ['products', 'invalid']
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockErrorResponse,
      });

      const { callStorefrontAPI } = await import('../src/graphql');

      const query = `{ products(first: 1) { edges { node { invalid } } } }`;

      await expect(
        callStorefrontAPI('test-shop.myshopify.com', 'test-token', query)
      ).rejects.toThrow("Field 'invalid' doesn't exist on type 'Product'");
    });

    it('should retry on 429 rate limit', async () => {
      // First attempt: 429
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      // Second attempt: success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { shop: { name: 'Test Shop' } } }),
      });

      const { executeGraphQL } = await import('../src/graphql');

      const result = await executeGraphQL(
        'https://test-shop.myshopify.com/api/2024-10/graphql.json',
        { 'X-Shopify-Storefront-Access-Token': 'test-token' },
        '{ shop { name } }'
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ shop: { name: 'Test Shop' } });
    });

    it('should not retry on 401 auth error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const { executeGraphQL } = await import('../src/graphql');

      await expect(
        executeGraphQL(
          'https://test-shop.myshopify.com/api/2024-10/graphql.json',
          { 'X-Shopify-Storefront-Access-Token': 'invalid-token' },
          '{ shop { name } }'
        )
      ).rejects.toThrow('Authentication error (401)');

      expect(mockFetch).toHaveBeenCalledTimes(1); // No retry
    });
  });

  describe('Admin API', () => {
    it('should fetch products with metafields from Admin API', async () => {
      const mockResponse = {
        data: {
          products: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/Product/1',
                  title: 'Silver Ring',
                  metafields: {
                    edges: [
                      {
                        node: {
                          namespace: 'custom',
                          key: 'stones',
                          value: 'Cubic Zirconia',
                          type: 'single_line_text_field'
                        }
                      }
                    ]
                  }
                }
              }
            ]
          }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const { callAdminAPI } = await import('../src/graphql');

      const query = `{
        products(first: 1) {
          edges {
            node {
              id
              title
              metafields(first: 10) {
                edges {
                  node {
                    namespace
                    key
                    value
                  }
                }
              }
            }
          }
        }
      }`;

      const result = await callAdminAPI<any>(
        'test-shop.myshopify.com',
        'test-admin-token',
        query
      );

      expect(result.products.edges[0].node.metafields.edges).toHaveLength(1);
      expect(result.products.edges[0].node.metafields.edges[0].node.key).toBe('stones');
    });
  });

  describe('Rate Limiting', () => {
    it('should wait between requests', async () => {
      const startTime = Date.now();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { shop: { name: 'Test' } } }),
      });

      const { executeGraphQL } = await import('../src/graphql');

      await executeGraphQL(
        'https://test.myshopify.com/api/2024-10/graphql.json',
        { 'X-Shopify-Storefront-Access-Token': 'token' },
        '{ shop { name } }'
      );

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(90); // 100ms rate limit delay (with buffer for timing variance)
    });
  });

  describe('Error Messages', () => {
    it('should provide detailed error for missing data field', async () => {
      // Mock multiple retry attempts
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ errors: [] }), // No data, no errors
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ errors: [] }), // Retry 1
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ errors: [] }), // Retry 2
        });

      const { executeGraphQL } = await import('../src/graphql');

      await expect(
        executeGraphQL(
          'https://test.myshopify.com/api/2024-10/graphql.json',
          { 'X-Shopify-Storefront-Access-Token': 'token' },
          '{ shop { name } }'
        )
      ).rejects.toThrow('GraphQL response missing data field');
    });
  });
});

describe('Product Fetch for RAG', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should fetch products with Admin API and fallback to Storefront', async () => {
    // First call (Admin API) fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    // Second call (Storefront API) succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          products: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/Product/1',
                  title: 'Silver Ring',
                  description: 'Beautiful ring',
                  variants: {
                    edges: [
                      {
                        node: {
                          price: { amount: '99.99', currencyCode: 'PLN' }
                        }
                      }
                    ]
                  }
                }
              }
            ]
          }
        }
      }),
    });

    const { fetchProductsForRAG } = await import('../src/graphql');

    const products = await fetchProductsForRAG(
      'test-shop.myshopify.com',
      'admin-token',
      'storefront-token',
      'silver ring'
    );

    expect(products).toHaveLength(1);
    expect(products[0].title).toBe('Silver Ring');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

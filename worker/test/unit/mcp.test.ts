import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchProductCatalog, getShopPolicies } from '../../src/mcp';
import { handleMcpRequest } from '../../src/mcp_server';
import { callMcpTool } from '../../src/rag';

// Mock fetch for testing
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;

const env = {
  SHOP_DOMAIN: 'test-shop.myshopify.com',
  SHOPIFY_ADMIN_TOKEN: 'test_admin_token',
  SHOPIFY_STOREFRONT_TOKEN: 'test_storefront_token',
  WORKER_ORIGIN: 'https://test-worker.workers.dev',
} as any;

describe('MCP Tools', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('searchProductCatalog', () => {
    it('should return formatted products from Shopify Storefront API', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              products: {
                edges: [
                  {
                    node: {
                      id: 'gid://shopify/Product/1',
                      title: 'Gold Ring',
                      handle: 'gold-ring',
                      descriptionHtml: '<p>Beautiful gold ring</p>',
                      priceRange: {
                        minVariantPrice: { amount: '100.00', currencyCode: 'USD' },
                      },
                      onlineStoreUrl: 'https://test-shop.myshopify.com/products/gold-ring',
                    },
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const result = await searchProductCatalog({ query: 'ring' }, env);

      expect(result).toEqual({
        products: [
          {
            id: 'gid://shopify/Product/1',
            title: 'Gold Ring',
            description: 'Beautiful gold ring',
            price: '100.00',
            currency: 'USD',
            url: 'https://test-shop.myshopify.com/products/gold-ring',
          },
        ],
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-shop.myshopify.com/api/2025-10/graphql.json',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Shopify-Storefront-Access-Token': 'test_storefront_token',
          }),
        })
      );
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(searchProductCatalog({ query: 'ring' }, env)).rejects.toThrow('Network error');
    });

    it('should handle invalid response', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Invalid JSON', { status: 200 })
      );

      await expect(searchProductCatalog({ query: 'ring' }, env)).rejects.toThrow();
    });
  });

  describe('getShopPolicies', () => {
    it('should return formatted policies from Shopify Admin API', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              shop: {
                privacyPolicy: { body: 'Privacy policy content' },
                refundPolicy: { body: 'Refund policy content' },
                termsOfService: { body: 'Terms of service content' },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const result = await getShopPolicies({ policy_types: ['privacyPolicy', 'refundPolicy', 'termsOfService'] }, env);

      expect(result).toEqual({
        policies: [
          { type: 'privacyPolicy', body: 'Privacy policy content' },
          { type: 'refundPolicy', body: 'Refund policy content' },
          { type: 'termsOfService', body: 'Terms of service content' },
        ],
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-shop.myshopify.com/admin/api/2025-10/graphql.json',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Shopify-Access-Token': 'test_admin_token',
          }),
        })
      );
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(getShopPolicies({ policy_types: ['privacyPolicy'] }, env)).rejects.toThrow('Network error');
    });
  });

  describe('handleMcpRequest', () => {
  it('should handle tools/call request for search_shop_catalog', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              products: {
                edges: [
                  {
                    node: {
                      id: 'gid://shopify/Product/1',
                      title: 'Gold Ring',
                      handle: 'gold-ring',
                      descriptionHtml: '<p>Beautiful gold ring</p>',
                      priceRange: {
                        minVariantPrice: { amount: '100.00', currencyCode: 'USD' },
                      },
                      onlineStoreUrl: 'https://test-shop.myshopify.com/products/gold-ring',
                    },
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const request = new Request('https://test.com/mcp/tools/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
            method: 'tools/call',
            params: { name: 'search_shop_catalog', arguments: { query: 'ring' } },
          id: 1,
        }),
      });

      const response = await handleMcpRequest(request, env);
      const result = await response.json();

      expect(result).toEqual({
        jsonrpc: '2.0',
        result: {
          products: [
            {
              id: 'gid://shopify/Product/1',
              title: 'Gold Ring',
              description: 'Beautiful gold ring',
              price: '100.00',
              currency: 'USD',
              url: 'https://test-shop.myshopify.com/products/gold-ring',
            },
          ],
        },
        id: 1,
      });
    });

    it('should return error for invalid method', async () => {
      const request = new Request('https://test.com/mcp/tools/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'invalid_method',
          params: {},
          id: 1,
        }),
      });

      const response = await handleMcpRequest(request, env);
      const result = await response.json();

      expect(result).toEqual({
        jsonrpc: '2.0',
        error: { code: -32601, message: 'Method not found: invalid_method' },
        id: 1,
      });
    });

    it('should return error for missing arguments', async () => {
      const request = new Request('https://test.com/mcp/tools/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: 'search_shop_catalog' }, // missing arguments
          id: 1,
        }),
      });

      const response = await handleMcpRequest(request, env);
      const result = await response.json();

      expect((result as any).error.code).toBe(-32602); // Invalid params
    });
  });

  describe('callMcpTool', () => {
    it('should call Worker MCP endpoint and return result', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            result: { products: [{ id: '1', title: 'Test' }] },
            id: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

  const result = await callMcpTool(env, 'search_shop_catalog', { query: 'test' });

      expect(result).toEqual({ products: [{ id: '1', title: 'Test' }] });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-worker.workers.dev/mcp/tools/call',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const callArgs = mockFetch.mock.calls[0][1] as any;
      const body = JSON.parse(callArgs.body);
      expect(body).toEqual({
        jsonrpc: '2.0',
        method: 'tools/call',
  params: { name: 'search_shop_catalog', arguments: { query: 'test' } },
        id: expect.any(Number),
      });
    });

    it('should retry on 429 status up to 3 times', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('Rate limited', { status: 429 }))
        .mockResolvedValueOnce(new Response('Rate limited', { status: 429 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              result: { success: true },
              id: 1,
            }),
            { status: 200 }
          )
        );

      const result = await callMcpTool(env, 'test_tool', {});

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should return error response', async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32601, message: 'Method not found' },
              id: 1,
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32601, message: 'Method not found' },
              id: 1,
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32601, message: 'Method not found' },
              id: 1,
            }),
            { status: 200 }
          )
        );

      const result = await callMcpTool(env, 'invalid_tool', {});

      expect(result).toBeNull();
    });
  });
});
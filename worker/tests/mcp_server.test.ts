import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleMcpRequest } from '../src/mcp_server';

const env = {
  SHOP_DOMAIN: 'test-shop.myshopify.com',
  SHOPIFY_ADMIN_TOKEN: 'test_admin_token',
  SHOPIFY_APP_SECRET: 'test_app_secret'
} as any;

describe('MCP Server', () => {
  beforeEach(() => {
    // Mock fetch for Shopify GraphQL
    global.fetch = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (typeof url === 'string' && url.includes('/admin/api/')) {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        if (String(body?.query || '').includes('products(first: 10')) {
          return new Response(
            JSON.stringify({
              data: {
                products: {
                  edges: [
                    { node: { id: 'gid://shopify/Product/1', title: 'Ring', handle: 'ring' } }
                  ]
                }
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (String(body?.query || '').includes('product(id: $id)')) {
          return new Response(
            JSON.stringify({
              data: {
                product: { id: 'gid://shopify/Product/1', title: 'Ring', handle: 'ring' }
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ data: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Default fallback for other fetches (e.g., Groq) - simple success
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as any;
  });

  it('returns result for search_products', async () => {
    const req = new Request('https://example.com/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'search_products', arguments: { query: 'ring' } },
        id: 1
      })
    });
    const res = await handleMcpRequest(req, env);
    expect(res.status).toBe(200);
    const json = await res.json();
    // result may be array or object depending on implementation; assert existence
    expect(json).toHaveProperty('result');
    const result = json.result;
    expect(result).toBeTruthy();
    // If it's an array of products, expect at least one
    if (Array.isArray(result)) {
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('title');
    }
  });

  it('returns result for get_product', async () => {
    const req = new Request('https://example.com/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'get_product', arguments: { id: 'gid://shopify/Product/1' } },
        id: 2
      })
    });
    const res = await handleMcpRequest(req, env);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('result');
    const result = json.result;
    expect(result).toBeTruthy();
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('title');
  });

  it('returns error for unknown tool', async () => {
    const req = new Request('https://example.com/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'unknown_tool', arguments: {} },
        id: 'x'
      })
    });
    const res = await handleMcpRequest(req, env);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('error');
    expect(json.error.message).toContain('Unknown tool');
  });
});
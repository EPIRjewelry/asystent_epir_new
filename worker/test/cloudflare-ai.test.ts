import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectMcpIntent, fetchMcpContextIfNeeded } from '../src/cloudflare-ai';

describe('Cloudflare AI - MCP Context Integration', () => {
  describe('detectMcpIntent', () => {
    it('detects cart-related queries in Polish', () => {
      expect(detectMcpIntent('dodaj do koszyka')).toBe('cart');
      expect(detectMcpIntent('pokaż mój koszyk')).toBe('cart');
      expect(detectMcpIntent('co mam w koszyku')).toBe('cart');
      expect(detectMcpIntent('usuń z koszyka')).toBe('cart');
      expect(detectMcpIntent('aktualizuj koszyk')).toBe('cart');
    });

    it('detects cart-related queries in English', () => {
      expect(detectMcpIntent('add to cart')).toBe('cart');
      expect(detectMcpIntent('show my cart')).toBe('cart');
      expect(detectMcpIntent('what is in my cart')).toBe('cart');
      expect(detectMcpIntent('update cart')).toBe('cart');
    });

    it('detects order-related queries in Polish', () => {
      expect(detectMcpIntent('status mojego zamówienia')).toBe('order');
      expect(detectMcpIntent('gdzie jest moja paczka')).toBe('order');
      expect(detectMcpIntent('kiedy dostanę zamówienie')).toBe('order');
      expect(detectMcpIntent('ostatnie zamówienie')).toBe('order');
      expect(detectMcpIntent('śledzenie przesyłki')).toBe('order');
    });

    it('detects order-related queries in English', () => {
      expect(detectMcpIntent('order status')).toBe('order');
      expect(detectMcpIntent('where is my package')).toBe('order');
      expect(detectMcpIntent('track my order')).toBe('order');
      expect(detectMcpIntent('recent order')).toBe('order');
    });

    it('returns null for non-cart/order queries', () => {
      expect(detectMcpIntent('pokaż mi pierścionki')).toBeNull();
      expect(detectMcpIntent('jaka jest cena')).toBeNull();
      expect(detectMcpIntent('show me rings')).toBeNull();
      expect(detectMcpIntent('hello')).toBeNull();
    });

    it('is case-insensitive', () => {
      expect(detectMcpIntent('DODAJ DO KOSZYKA')).toBe('cart');
      expect(detectMcpIntent('STATUS ZAMÓWIENIA')).toBe('order');
    });
  });

  describe('fetchMcpContextIfNeeded', () => {
    let mockEnv: any;

    beforeEach(() => {
      mockEnv = {
        SHOP_DOMAIN: 'test-shop.myshopify.com',
        SHOPIFY_ADMIN_TOKEN: 'test_token',
        SHOPIFY_STOREFRONT_TOKEN: 'test_storefront_token',
      };

      // Mock fetch
      globalThis.fetch = vi.fn();
    });

    it('fetches cart context when intent is cart and cartId exists', async () => {
      // Mock MCP call failure, then GraphQL success
      (globalThis.fetch as any)
        .mockResolvedValueOnce(new Response(null, { status: 500 }))  // MCP fails
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: {
                cart: {
                  id: 'gid://shopify/Cart/123',
                  lines: { edges: [{ node: { quantity: 2, merchandise: { product: { title: 'Ring' } } } }] },
                  cost: { totalAmount: { amount: '2000.00', currencyCode: 'PLN' } }
                }
              }
            }),
            { status: 200 }
          )
        );

      const context = await fetchMcpContextIfNeeded('pokaż mój koszyk', 'gid://shopify/Cart/123', mockEnv);

      expect(context).toContain('Koszyk');
      expect(context).toContain('Ring');
      expect(context).toContain('2000.00 PLN');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/api/'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Shopify-Access-Token': 'test_token',
          }),
        })
      );
    });

    it('returns empty string when intent is cart but no cartId', async () => {
      const context = await fetchMcpContextIfNeeded('pokaż mój koszyk', null, mockEnv);

      expect(context).toBe('');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('fetches most recent order when intent is order', async () => {
      // Mock MCP call failure, then GraphQL success
      (globalThis.fetch as any)
        .mockResolvedValueOnce(new Response(null, { status: 500 }))  // MCP fails
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: {
                orders: {
                  edges: [
                    {
                      node: {
                        id: 'gid://shopify/Order/456',
                        name: '#1001',
                        displayFulfillmentStatus: 'FULFILLED',
                        totalPriceSet: { shopMoney: { amount: '3000.00', currencyCode: 'PLN' } }
                      }
                    }
                  ]
                }
              }
            }),
            { status: 200 }
          )
        );

      const context = await fetchMcpContextIfNeeded('status zamówienia', null, mockEnv);

      expect(context).toContain('Ostatnie zamówienie');
      expect(context).toContain('#1001');
      expect(context).toContain('FULFILLED');
    });

    it('returns empty string when no MCP intent detected', async () => {
      const context = await fetchMcpContextIfNeeded('pokaż pierścionki', 'cart-123', mockEnv);

      expect(context).toBe('');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('handles MCP fetch errors gracefully', async () => {
      (globalThis.fetch as any).mockRejectedValue(new Error('Network error'));

      const context = await fetchMcpContextIfNeeded('pokaż mój koszyk', 'gid://shopify/Cart/123', mockEnv);

      expect(context).toBe('');
    });

    it('handles GraphQL errors gracefully', async () => {
      // First call: MCP server call fails
      // Second call: GraphQL returns error
      (globalThis.fetch as any)
        .mockResolvedValueOnce(
          new Response(null, { status: 500 })  // MCP fails
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              errors: [{ message: 'Cart not found' }]
            }),
            { status: 200 }
          )
        );

      const context = await fetchMcpContextIfNeeded('pokaż mój koszyk', 'gid://shopify/Cart/123', mockEnv);

      expect(context).toBe('');
    });
  });
});

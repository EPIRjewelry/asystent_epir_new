import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectMcpIntent, fetchMcpContextIfNeeded } from '../src/index';

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
    let mockGetCart: any;
    let mockGetMostRecentOrderStatus: any;

    beforeEach(() => {
      mockEnv = {
        SHOP_DOMAIN: 'test-shop.myshopify.com',
        SHOPIFY_ADMIN_TOKEN: 'test_token',
        SHOPIFY_STOREFRONT_TOKEN: 'test_storefront_token',
      };

      // Mock narzędzi MCP
      mockGetCart = vi.fn();
      mockGetMostRecentOrderStatus = vi.fn();

      // Mock fetch
      globalThis.fetch = vi.fn();
    });

    it('fetches cart context when intent is cart and cartId exists', async () => {
      // Mock MCP getCart response
      const mockCartData = JSON.stringify({
        id: 'gid://shopify/Cart/123',
        lines: { edges: [{ node: { quantity: 2, merchandise: { product: { title: 'Ring' } } } }] },
        cost: { totalAmount: { amount: '2000.00', currencyCode: 'PLN' } }
      });
      mockGetCart.mockResolvedValue(mockCartData);

      const intent = detectMcpIntent('pokaż mój koszyk');
      const context = await fetchMcpContextIfNeeded(intent, 'gid://shopify/Cart/123', mockEnv, mockGetCart, mockGetMostRecentOrderStatus);

      expect(context).toContain('Kontekst Koszyka');
      expect(context).toContain('Ring');
      expect(context).toContain('2000.00 PLN');
      expect(mockGetCart).toHaveBeenCalledWith('gid://shopify/Cart/123', mockEnv);
    });

    it('returns null when intent is cart but no cartId', async () => {
      const intent = detectMcpIntent('pokaż mój koszyk');
      const context = await fetchMcpContextIfNeeded(intent, null, mockEnv, mockGetCart, mockGetMostRecentOrderStatus);

      expect(context).toBeNull();
      expect(mockGetCart).not.toHaveBeenCalled();
    });

    it('fetches most recent order when intent is order', async () => {
      // Mock MCP getMostRecentOrderStatus response
      const mockOrderData = JSON.stringify({
        id: 'gid://shopify/Order/456',
        name: '#1001',
        displayFulfillmentStatus: 'FULFILLED',
        totalPriceSet: { shopMoney: { amount: '3000.00', currencyCode: 'PLN' } }
      });
      mockGetMostRecentOrderStatus.mockResolvedValue(mockOrderData);

      const intent = detectMcpIntent('status zamówienia');
      const context = await fetchMcpContextIfNeeded(intent, null, mockEnv, mockGetCart, mockGetMostRecentOrderStatus);

      expect(context).toContain('Kontekst Zamówienia');
      expect(context).toContain('#1001');
      expect(context).toContain('FULFILLED');
      expect(mockGetMostRecentOrderStatus).toHaveBeenCalledWith(mockEnv);
    });

    it('returns null when no MCP intent detected', async () => {
      const intent = detectMcpIntent('pokaż pierścionki');
      const context = await fetchMcpContextIfNeeded(intent, 'cart-123', mockEnv, mockGetCart, mockGetMostRecentOrderStatus);

      expect(context).toBeNull();
      expect(mockGetCart).not.toHaveBeenCalled();
      expect(mockGetMostRecentOrderStatus).not.toHaveBeenCalled();
    });

    it('handles MCP fetch errors gracefully', async () => {
      mockGetCart.mockRejectedValue(new Error('Network error'));

      const intent = detectMcpIntent('pokaż mój koszyk');
      const context = await fetchMcpContextIfNeeded(intent, 'gid://shopify/Cart/123', mockEnv, mockGetCart, mockGetMostRecentOrderStatus);

      expect(context).toContain('Błąd pobierania kontekstu');
    });

    it('handles JSON parsing errors gracefully', async () => {
      // Mock zwraca niepoprawny JSON
      mockGetCart.mockResolvedValue('invalid json {');

      const intent = detectMcpIntent('pokaż mój koszyk');
      const context = await fetchMcpContextIfNeeded(intent, 'gid://shopify/Cart/123', mockEnv, mockGetCart, mockGetMostRecentOrderStatus);

      expect(context).toContain('Kontekst Koszyka (surowy)');
      expect(context).toContain('invalid json {');
    });
  });
});

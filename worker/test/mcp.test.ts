import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mcpCall,
  mcpCatalogSearch,
  mcpSearchPoliciesAndFaqs,
  mcpGetCart,
  mcpUpdateCart,
  isProductQuery,
  isCartQuery,
} from '../src/mcp';

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;

describe('MCP Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mcpCall', () => {
    it('should make successful JSON-RPC call', async () => {
      const mockResult = { products: [{ name: 'Test Product' }] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', result: mockResult, id: 1 }),
      });

      const result = await mcpCall('test.myshopify.com', 'search_shop_catalog', { query: 'ring' });

      expect(result).toEqual(mockResult);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.myshopify.com/api/mcp',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should return null on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await mcpCall('test.myshopify.com', 'test_tool', {});

      expect(result).toBeNull();
    });

    it('should return null on JSON-RPC error', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid Request' },
          id: 1,
        }),
      });

      const result = await mcpCall('test.myshopify.com', 'test_tool', {});

      expect(result).toBeNull();
    });

    it('should handle network exceptions', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await mcpCall('test.myshopify.com', 'test_tool', {});

      expect(result).toBeNull();
    });
  });

  describe('mcpCatalogSearch', () => {
    it('should return formatted products', async () => {
      const mockProducts = [
        {
          name: 'Pierścionek zaręczynowy',
          price: '2500 PLN',
          url: 'https://shop.com/products/ring-1',
          image: 'https://cdn.com/image.jpg',
          description: 'Luksusowy pierścionek z brylantem',
          id: 'prod-123',
        },
        {
          title: 'Naszyjnik złoty',
          price: '1800 PLN',
          url: 'https://shop.com/products/necklace-1',
          featured_image: 'https://cdn.com/neck.jpg',
          product_id: 'prod-456',
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: { products: mockProducts },
          id: 1,
        }),
      });

      const result = await mcpCatalogSearch('test.myshopify.com', 'pierścionek');

      expect(result).toHaveLength(2);
      expect(result![0].name).toBe('Pierścionek zaręczynowy');
      expect(result![0].price).toBe('2500 PLN');
      expect(result![0].image).toBe('https://cdn.com/image.jpg');
      expect(result![1].name).toBe('Naszyjnik złoty');
      expect(result![1].image).toBe('https://cdn.com/neck.jpg');
    });

    it('should return null when no products in response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: {},
          id: 1,
        }),
      });

      const result = await mcpCatalogSearch('test.myshopify.com', 'test');

      expect(result).toBeNull();
    });

    it('should pass context parameter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: { products: [] },
          id: 1,
        }),
      });

      await mcpCatalogSearch('test.myshopify.com', 'ring', 'fair trade');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.params.arguments.context).toBe('fair trade');
    });
  });

  describe('mcpSearchPoliciesAndFaqs', () => {
    it('should return formatted FAQs', async () => {
      const mockFaqs = [
        {
          question: 'Jaka jest polityka zwrotów?',
          answer: 'Zwroty w ciągu 30 dni',
          category: 'shipping',
        },
        {
          question: 'Jak długa dostawa?',
          answer: '3-5 dni roboczych',
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: { faqs: mockFaqs },
          id: 1,
        }),
      });

      const result = await mcpSearchPoliciesAndFaqs('test.myshopify.com', 'zwroty');

      expect(result).toHaveLength(2);
      expect(result![0].question).toBe('Jaka jest polityka zwrotów?');
      expect(result![0].answer).toBe('Zwroty w ciągu 30 dni');
      expect(result![0].category).toBe('shipping');
      expect(result![1].category).toBe('');
    });

    it('should return null when no FAQs in response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: {},
          id: 1,
        }),
      });

      const result = await mcpSearchPoliciesAndFaqs('test.myshopify.com', 'test');

      expect(result).toBeNull();
    });
  });

  describe('mcpGetCart', () => {
    it('should return formatted cart', async () => {
      const mockCart = {
        id: 'cart-123',
        items: [
          { id: 'item-1', product_id: 'prod-1', quantity: 2, price: '100' },
        ],
        total: '200',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: { cart: mockCart },
          id: 1,
        }),
      });

      const result = await mcpGetCart('test.myshopify.com', 'cart-123');

      expect(result).toEqual(mockCart);
      expect(result!.items).toHaveLength(1);
      expect(result!.total).toBe('200');
    });

    it('should return null on error', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: {},
          id: 1,
        }),
      });

      const result = await mcpGetCart('test.myshopify.com', 'cart-123');

      expect(result).toBeNull();
    });
  });

  describe('mcpUpdateCart', () => {
    it('should add item to cart', async () => {
      const mockCart = {
        id: 'cart-123',
        items: [
          { id: 'item-1', product_id: 'prod-1', quantity: 1, price: '100' },
        ],
        total: '100',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: { cart: mockCart },
          id: 1,
        }),
      });

      const result = await mcpUpdateCart('test.myshopify.com', 'cart-123', 'add', 'prod-1', 1);

      expect(result).toEqual(mockCart);
      
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.params.arguments.action).toBe('add');
      expect(callBody.params.arguments.product_id).toBe('prod-1');
      expect(callBody.params.arguments.quantity).toBe(1);
    });

    it('should remove item from cart', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: { cart: { id: 'cart-123', items: [], total: '0' } },
          id: 1,
        }),
      });

      await mcpUpdateCart('test.myshopify.com', 'cart-123', 'remove', 'prod-1');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.params.arguments.action).toBe('remove');
    });
  });

  describe('isProductQuery', () => {
    it('should detect product-related queries', () => {
      expect(isProductQuery('Pokaż pierścionki')).toBe(true);
      expect(isProductQuery('Jaki jest cena naszyjnika?')).toBe(true);
      expect(isProductQuery('Masz złote kolczyki?')).toBe(true);
      expect(isProductQuery('Poleć mi bransoletę fair trade')).toBe(true);
      expect(isProductQuery('Szukam fair trade biżuterii')).toBe(true);
      expect(isProductQuery('Dostępne produkty z diamentem')).toBe(true);
    });

    it('should not detect non-product queries', () => {
      expect(isProductQuery('Jaka jest polityka zwrotów?')).toBe(false);
      expect(isProductQuery('Jak długo trwa dostawa?')).toBe(false);
      expect(isProductQuery('Witam')).toBe(false);
      expect(isProductQuery('Dziękuję')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isProductQuery('PIERŚCIONEK')).toBe(true);
      expect(isProductQuery('Pierścionek')).toBe(true);
      expect(isProductQuery('pierścionek')).toBe(true);
    });
  });

  describe('isCartQuery', () => {
    it('should detect cart-related queries', () => {
      expect(isCartQuery('Dodaj do koszyka')).toBe(true);
      expect(isCartQuery('Co jest w koszyku?')).toBe(true);
      expect(isCartQuery('Usuń z koszyka')).toBe(true);
      expect(isCartQuery('Chcę zamówić')).toBe(true);
      expect(isCartQuery('Kupuję ten produkt')).toBe(true);
    });

    it('should not detect non-cart queries', () => {
      expect(isCartQuery('Pokaż pierścionki')).toBe(false);
      expect(isCartQuery('Jaka cena?')).toBe(false);
      expect(isCartQuery('Polityka zwrotów')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isCartQuery('KOSZYK')).toBe(true);
      expect(isCartQuery('Koszyk')).toBe(true);
      expect(isCartQuery('koszyk')).toBe(true);
    });
  });
});

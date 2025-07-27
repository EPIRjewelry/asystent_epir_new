/**
 * @fileoverview Unit tests for Shopify API Integration
 *
 * This file contains comprehensive tests for the Shopify API client,
 * including configuration validation, error handling, retry mechanisms,
 * and API response processing.
 */

import {
  ShopifyClient,
  ShopifyAPIError,
  createShopifyClient,
  type ShopifyConfig,
  type ShopifyOrder,
} from "../shopifyClient";

// Mock fetch for testing HTTP requests
global.fetch = jest.fn();

describe("Shopify API Integration", () => {
  let validConfig: ShopifyConfig;

  beforeEach(() => {
    validConfig = {
      storeUrl: "https://test-store.myshopify.com",
      accessToken: "test-access-token",
      apiVersion: "2023-10",
      timeout: 30000,
    };

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe("ShopifyAPIError", () => {
    it("should create error with correct properties", () => {
      const error = new ShopifyAPIError(
        "Test error message",
        400,
        {error: "Bad request"},
        new Error("Original error")
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ShopifyAPIError);
      expect(error.message).toBe("Test error message");
      expect(error.statusCode).toBe(400);
      expect(error.apiResponse).toEqual({error: "Bad request"});
      expect(error.originalError).toBeInstanceOf(Error);
      expect(error.name).toBe("ShopifyAPIError");
    });
  });

  describe("ShopifyClient Configuration", () => {
    it("should create client with valid configuration", () => {
      expect(() => new ShopifyClient(validConfig)).not.toThrow();
    });

    it("should reject invalid store URL", () => {
      const invalidConfig = {
        ...validConfig,
        storeUrl: "https://invalid-url.com",
      };

      expect(() => new ShopifyClient(invalidConfig)).toThrow(ShopifyAPIError);
      expect(() => new ShopifyClient(invalidConfig)).toThrow(
        "Invalid store URL. Must include .myshopify.com domain"
      );
    });

    it("should reject missing access token", () => {
      const invalidConfig = {
        ...validConfig,
        accessToken: "",
      };

      expect(() => new ShopifyClient(invalidConfig)).toThrow(ShopifyAPIError);
      expect(() => new ShopifyClient(invalidConfig)).toThrow(
        "Access token is required"
      );
    });

    it("should reject missing API version", () => {
      const invalidConfig = {
        ...validConfig,
        apiVersion: "",
      };

      expect(() => new ShopifyClient(invalidConfig)).toThrow(ShopifyAPIError);
      expect(() => new ShopifyClient(invalidConfig)).toThrow(
        "API version is required"
      );
    });
  });

  describe("HTTP Request Handling", () => {
    let client: ShopifyClient;

    beforeEach(() => {
      client = new ShopifyClient(validConfig);
    });

    it("should make successful API request", async () => {
      const mockResponse = {
        products: [
          {
            id: "123",
            title: "Test Product",
            vendor: "EPIR",
            product_type: "Ring",
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
            variants: [],
          },
        ],
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValueOnce(mockResponse),
        headers: new Map(),
      });

      const products = await client.getProducts();

      expect(fetch).toHaveBeenCalledWith(
        "https://test-store.myshopify.com/admin/api/2023-10/products.json?",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Shopify-Access-Token": "test-access-token",
            "Content-Type": "application/json",
            "Accept": "application/json",
          }),
        })
      );

      expect(products).toEqual(mockResponse.products);
    });

    it("should handle API error responses", async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: jest.fn().mockResolvedValueOnce("Resource not found"),
      });

      await expect(client.getProducts()).rejects.toThrow(ShopifyAPIError);
      await expect(client.getProducts()).rejects.toThrow("Shopify API error: Not Found");
    }, 10000); // Increase timeout

    it("should handle rate limiting with retry", async () => {
      // First call returns 429 (rate limited)
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          headers: new Map([["Retry-After", "1"]]),
          text: jest.fn().mockResolvedValueOnce("Rate limited"),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValueOnce({products: []}),
          headers: new Map(),
        });

      const products = await client.getProducts();

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(products).toEqual([]);
    });

    it("should handle network timeout", async () => {
      const client = new ShopifyClient({
        ...validConfig,
        timeout: 100, // Very short timeout for testing
      });

      (fetch as jest.Mock).mockImplementationOnce(
        () => new Promise((resolve) => {
          setTimeout(resolve, 200); // Longer than timeout
        })
      );

      await expect(client.getProducts()).rejects.toThrow(ShopifyAPIError);
    });

    it("should retry on network failures", async () => {
      const networkError = new Error("Network error");

      (fetch as jest.Mock)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValueOnce({products: []}),
          headers: new Map(),
        });

      const products = await client.getProducts();

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(products).toEqual([]);
    });

    it("should fail after max retries", async () => {
      const networkError = new Error("Persistent network error");

      (fetch as jest.Mock).mockRejectedValue(networkError);

      await expect(client.getProducts()).rejects.toThrow(ShopifyAPIError);
      await expect(client.getProducts()).rejects.toThrow(
        "Request failed after 3 attempts"
      );

      expect(fetch).toHaveBeenCalledTimes(3);
    }, 15000); // Increase timeout for retry testing
  });

  describe("Products API", () => {
    let client: ShopifyClient;

    beforeEach(() => {
      client = new ShopifyClient(validConfig);
    });

    it("should fetch products with query parameters", async () => {
      const mockResponse = {products: []};

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValueOnce(mockResponse),
        headers: new Map(),
      });

      await client.getProducts({
        limit: 50,
        since_id: "123",
        created_at_min: "2023-01-01T00:00:00Z",
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("limit=50"),
        expect.any(Object)
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("since_id=123"),
        expect.any(Object)
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("created_at_min=2023-01-01T00%3A00%3A00Z"),
        expect.any(Object)
      );
    });
  });

  describe("Orders API", () => {
    let client: ShopifyClient;

    beforeEach(() => {
      client = new ShopifyClient(validConfig);
    });

    it("should fetch orders with query parameters", async () => {
      const mockResponse = {orders: []};

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValueOnce(mockResponse),
        headers: new Map(),
      });

      await client.getOrders({
        limit: 25,
        status: "closed",
        created_at_min: "2023-01-01T00:00:00Z",
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("orders.json"),
        expect.any(Object)
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("limit=25"),
        expect.any(Object)
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("status=closed"),
        expect.any(Object)
      );
    });
  });

  describe("Analytics", () => {
    let client: ShopifyClient;

    beforeEach(() => {
      client = new ShopifyClient(validConfig);
    });

    it("should calculate analytics from orders data", async () => {
      const mockOrders: ShopifyOrder[] = [
        {
          id: "1",
          order_number: "1001",
          created_at: "2023-01-01T00:00:00Z",
          total_price: "100.00",
          currency: "USD",
          customer: {
            id: "1",
            email: "test@example.com",
            first_name: "John",
            last_name: "Doe",
          },
          line_items: [
            {
              id: "1",
              product_id: "prod1",
              variant_id: "var1",
              title: "Ring",
              quantity: 1,
              price: "100.00",
            },
          ],
        },
        {
          id: "2",
          order_number: "1002",
          created_at: "2023-01-02T00:00:00Z",
          total_price: "200.00",
          currency: "USD",
          customer: {
            id: "2",
            email: "test2@example.com",
            first_name: "Jane",
            last_name: "Smith",
          },
          line_items: [
            {
              id: "2",
              product_id: "prod1",
              variant_id: "var2",
              title: "Ring",
              quantity: 2,
              price: "100.00",
            },
          ],
        },
      ];

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValueOnce({orders: mockOrders}),
        headers: new Map(),
      });

      const analytics = await client.getAnalytics(
        "2023-01-01T00:00:00Z",
        "2023-01-31T23:59:59Z"
      );

      expect(analytics.totalRevenue).toBe(300);
      expect(analytics.orderCount).toBe(2);
      expect(analytics.averageOrderValue).toBe(150);
      expect(analytics.topProducts).toHaveLength(1);
      expect(analytics.topProducts[0]).toEqual({
        id: "prod1",
        title: "Ring",
        revenue: 300,
      });
    });

    it("should handle empty orders data", async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValueOnce({orders: []}),
        headers: new Map(),
      });

      const analytics = await client.getAnalytics(
        "2023-01-01T00:00:00Z",
        "2023-01-31T23:59:59Z"
      );

      expect(analytics.totalRevenue).toBe(0);
      expect(analytics.orderCount).toBe(0);
      expect(analytics.averageOrderValue).toBe(0);
      expect(analytics.topProducts).toHaveLength(0);
    });
  });

  describe("Factory Function", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = {...originalEnv};
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it("should create client from environment variables", async () => {
      process.env.SHOPIFY_STORE_URL = "https://env-store.myshopify.com";
      process.env.SHOPIFY_ACCESS_TOKEN = "env-access-token";
      process.env.SHOPIFY_API_VERSION = "2023-10";
      process.env.SHOPIFY_TIMEOUT = "25000";

      const client = await createShopifyClient();
      expect(client).toBeInstanceOf(ShopifyClient);
    });

    it("should throw error when environment variables are missing", async () => {
      delete process.env.SHOPIFY_STORE_URL;
      delete process.env.SHOPIFY_ACCESS_TOKEN;

      await expect(createShopifyClient()).rejects.toThrow(ShopifyAPIError);
      await expect(createShopifyClient()).rejects.toThrow(
        "Shopify configuration missing"
      );
    });

    it("should use default values for optional environment variables", async () => {
      process.env.SHOPIFY_STORE_URL = "https://env-store.myshopify.com";
      process.env.SHOPIFY_ACCESS_TOKEN = "env-access-token";
      delete process.env.SHOPIFY_API_VERSION;
      delete process.env.SHOPIFY_TIMEOUT;

      const client = await createShopifyClient();
      expect(client).toBeInstanceOf(ShopifyClient);
    });
  });
});

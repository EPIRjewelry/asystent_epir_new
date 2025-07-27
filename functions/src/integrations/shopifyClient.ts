/**
 * @fileoverview Shopify API Integration Client
 *
 * This module provides a robust client for integrating with Shopify's API
 * to fetch e-commerce data for analytics processing. Includes comprehensive
 * error handling, retry mechanisms, and rate limiting compliance.
 *
 * @author EPIR Development Team
 * @version 1.0.0
 */

/**
 * Interface for Shopify API configuration
 */
export interface ShopifyConfig {
  /** Shopify store URL */
  storeUrl: string;
  /** API access token */
  accessToken: string;
  /** API version to use */
  apiVersion: string;
  /** Request timeout in milliseconds */
  timeout: number;
}

/**
 * Interface for Shopify product data
 */
export interface ShopifyProduct {
  id: string;
  title: string;
  vendor: string;
  product_type: string;
  created_at: string;
  updated_at: string;
  variants: ShopifyVariant[];
}

/**
 * Interface for Shopify product variant
 */
export interface ShopifyVariant {
  id: string;
  product_id: string;
  title: string;
  price: string;
  inventory_quantity: number;
  sku: string;
}

/**
 * Interface for Shopify order data
 */
export interface ShopifyOrder {
  id: string;
  order_number: string;
  created_at: string;
  total_price: string;
  currency: string;
  customer: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  line_items: ShopifyLineItem[];
}

/**
 * Interface for Shopify order line items
 */
export interface ShopifyLineItem {
  id: string;
  product_id: string;
  variant_id: string;
  title: string;
  quantity: number;
  price: string;
}

/**
 * Custom error class for Shopify API operations
 */
export class ShopifyAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly apiResponse?: unknown,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = "ShopifyAPIError";
  }
}

/**
 * Shopify API Client with comprehensive error handling and retry logic
 *
 * This client provides methods to interact with Shopify's REST API
 * while handling rate limits, network failures, and API errors gracefully.
 *
 * @example
 * ```typescript
 * const client = new ShopifyClient({
 *   storeUrl: "https://your-store.myshopify.com",
 *   accessToken: "your-access-token",
 *   apiVersion: "2023-10",
 *   timeout: 30000
 * });
 *
 * const products = await client.getProducts({ limit: 50 });
 * ```
 */
export class ShopifyClient {
  private readonly config: ShopifyConfig;
  private readonly baseUrl: string;

  /**
   * Creates a new Shopify client instance
   *
   * @param config - Shopify API configuration
   * @throws {ShopifyAPIError} When configuration is invalid
   */
  constructor(config: ShopifyConfig) {
    this.validateConfig(config);
    this.config = config;
    this.baseUrl = `${config.storeUrl}/admin/api/${config.apiVersion}`;
  }

  /**
   * Validates the Shopify configuration
   *
   * @param config - Configuration to validate
   * @throws {ShopifyAPIError} When configuration is invalid
   */
  private validateConfig(config: ShopifyConfig): void {
    if (!config.storeUrl) {
      throw new ShopifyAPIError(
        "Invalid store URL. Must include .myshopify.com domain",
        400
      );
    }
    let hostname: string;
    try {
      hostname = new URL(config.storeUrl).hostname;
    } catch (e) {
      throw new ShopifyAPIError(
        "Invalid store URL format",
        400
      );
    }
    if (
      !hostname.endsWith(".myshopify.com") ||
      hostname === "myshopify.com"
    ) {
      throw new ShopifyAPIError(
        "Invalid store URL. Host must be a subdomain of .myshopify.com",
        400
      );
    }

    if (!config.accessToken) {
      throw new ShopifyAPIError(
        "Access token is required",
        401
      );
    }

    if (!config.apiVersion) {
      throw new ShopifyAPIError(
        "API version is required",
        400
      );
    }
  }

  /**
   * Makes a request to Shopify API with retry logic and error handling
   *
   * @param endpoint - API endpoint to call
   * @param options - Request options
   * @return Promise resolving to API response
   * @throws {ShopifyAPIError} When request fails after retries
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const maxRetries = 3;
    let lastError: Error | null = null;

    const headers: HeadersInit = {
      "X-Shopify-Access-Token": this.config.accessToken,
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...options.headers,
    };

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout
        );

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new ShopifyAPIError(
            `Shopify API error: ${response.statusText}`,
            response.status,
            errorBody
          );
        }

        // Handle rate limiting (429 status)
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
          console.warn(`Rate limited. Retrying after ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        const data = await response.json();
        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries - 1) {
          break;
        }

        // Exponential backoff for retries
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`Request failed, retrying in ${delay}ms:`, lastError.message);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new ShopifyAPIError(
      `Request failed after ${maxRetries} attempts`,
      0,
      undefined,
      lastError || undefined
    );
  }

  /**
   * Fetches products from Shopify store
   *
   * @param params - Query parameters for filtering products
   * @return Promise resolving to array of products
   * @throws {ShopifyAPIError} When API request fails
   */
  async getProducts(params: {
    limit?: number;
    since_id?: string;
    created_at_min?: string;
    created_at_max?: string;
  } = {}): Promise<ShopifyProduct[]> {
    try {
      const queryParams = new URLSearchParams();

      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, String(value));
        }
      });

      const endpoint = `/products.json?${queryParams.toString()}`;
      const response = await this.makeRequest<{ products: ShopifyProduct[] }>(endpoint);

      return response.products;
    } catch (error) {
      throw new ShopifyAPIError(
        "Failed to fetch products from Shopify",
        0,
        undefined,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Fetches orders from Shopify store
   *
   * @param params - Query parameters for filtering orders
   * @return Promise resolving to array of orders
   * @throws {ShopifyAPIError} When API request fails
   */
  async getOrders(params: {
    limit?: number;
    since_id?: string;
    created_at_min?: string;
    created_at_max?: string;
    status?: "open" | "closed" | "cancelled" | "any";
  } = {}): Promise<ShopifyOrder[]> {
    try {
      const queryParams = new URLSearchParams();

      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, String(value));
        }
      });

      const endpoint = `/orders.json?${queryParams.toString()}`;
      const response = await this.makeRequest<{ orders: ShopifyOrder[] }>(endpoint);

      return response.orders;
    } catch (error) {
      throw new ShopifyAPIError(
        "Failed to fetch orders from Shopify",
        0,
        undefined,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Fetches analytics data for a specific date range
   *
   * @param startDate - Start date for analytics (ISO string)
   * @param endDate - End date for analytics (ISO string)
   * @return Promise resolving to analytics summary
   * @throws {ShopifyAPIError} When API request fails
   */
  async getAnalytics(startDate: string, endDate: string): Promise<{
    totalRevenue: number;
    orderCount: number;
    averageOrderValue: number;
    topProducts: Array<{ id: string; title: string; revenue: number }>;
  }> {
    try {
      const orders = await this.getOrders({
        created_at_min: startDate,
        created_at_max: endDate,
        status: "any",
      });

      const totalRevenue = orders.reduce(
        (sum, order) => sum + parseFloat(order.total_price),
        0
      );

      const orderCount = orders.length;
      const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

      // Calculate top products by revenue
      const productRevenue: Map<string, { title: string; revenue: number }> =
        new Map();

      orders.forEach((order) => {
        order.line_items.forEach((item) => {
          const revenue = parseFloat(item.price) * item.quantity;
          const existing = productRevenue.get(item.product_id);

          if (existing) {
            existing.revenue += revenue;
          } else {
            productRevenue.set(item.product_id, {
              title: item.title,
              revenue,
            });
          }
        });
      });

      const topProducts = Array.from(productRevenue.entries())
        .map(([id, data]) => ({id, ...data}))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      return {
        totalRevenue,
        orderCount,
        averageOrderValue,
        topProducts,
      };
    } catch (error) {
      throw new ShopifyAPIError(
        "Failed to generate analytics from Shopify data",
        0,
        undefined,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}

/**
 * Factory function to create a Shopify client with environment-based configuration
 *
 * @return Promise resolving to configured Shopify client
 * @throws {ShopifyAPIError} When environment configuration is missing
 */
export async function createShopifyClient(): Promise<ShopifyClient> {
  // In a real implementation, these would come from Firebase environment variables
  // or Cloud Secret Manager
  const config: ShopifyConfig = {
    storeUrl: process.env.SHOPIFY_STORE_URL || "",
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN || "",
    apiVersion: process.env.SHOPIFY_API_VERSION || "2023-10",
    timeout: parseInt(process.env.SHOPIFY_TIMEOUT || "30000"),
  };

  if (!config.storeUrl || !config.accessToken) {
    throw new ShopifyAPIError(
      "Shopify configuration missing. Please set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN environment variables",
      500
    );
  }

  return new ShopifyClient(config);
}

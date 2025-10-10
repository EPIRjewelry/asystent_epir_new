<<<<<<< HEAD
// MCP (Model Context Protocol) Integration for EPIR-ART-JEWELLERY
// Connects to Shopify Storefront MCP API for catalog search, FAQs, and cart operations

export interface Env {
  SHOP_DOMAIN?: string;
}

export interface MCPProduct {
  name: string;
  price: string;
  url: string;
  image?: string;
  description?: string;
  id?: string;
}

export interface MCPFAQResult {
  question: string;
  answer: string;
  category?: string;
}

export interface MCPCartItem {
  id: string;
  product_id: string;
  quantity: number;
  price: string;
}

export interface MCPCart {
  id: string;
  items: MCPCartItem[];
  total: string;
}

/**
 * Call MCP tool via JSON-RPC 2.0
 * @param shopDomain - Shopify shop domain (e.g., "epir-art-silver-jewellery.myshopify.com")
 * @param toolName - MCP tool name (e.g., "search_shop_catalog", "get_cart")
 * @param args - Tool arguments
 * @returns JSON-RPC result or null on error
 */
export async function mcpCall(
  shopDomain: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<any> {
  try {
    const mcpUrl = `https://${shopDomain}/api/mcp`;
    
    const response = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      console.error(`MCP call failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as {
      jsonrpc: string;
      result?: any;
      error?: { code: number; message: string };
      id: number;
    };
    
    if (data.error) {
      console.error('MCP JSON-RPC error:', data.error);
      return null;
    }

    return data.result ?? null;
  } catch (error) {
    console.error('MCP call exception:', error);
    return null;
  }
}

/**
 * Search shop catalog via MCP
 * @param shopDomain - Shopify shop domain
 * @param query - Search query
 * @param context - Additional context (e.g., "fair trade", "luxury")
 * @returns Array of products or null on error
 */
export async function mcpCatalogSearch(
  shopDomain: string,
  query: string,
  context?: string
): Promise<MCPProduct[] | null> {
  const result = await mcpCall(shopDomain, 'search_shop_catalog', {
    query,
    context: context || 'EPIR luxury jewelry',
  });

  if (!result || !Array.isArray(result.products)) {
    return null;
  }

  return result.products.map((p: any) => ({
    name: p.name || p.title || '',
    price: p.price || '',
    url: p.url || '',
    image: p.image || p.featured_image || '',
    description: p.description || '',
    id: p.id || p.product_id || '',
  }));
}

/**
 * Search shop policies and FAQs via MCP
 * @param shopDomain - Shopify shop domain
 * @param query - Search query
 * @param context - Additional context
 * @returns Array of FAQ results or null on error
 */
export async function mcpSearchPoliciesAndFaqs(
  shopDomain: string,
  query: string,
  context?: string
): Promise<MCPFAQResult[] | null> {
  const result = await mcpCall(shopDomain, 'search_shop_policies_and_faqs', {
    query,
    context: context || 'EPIR luxury',
  });

  if (!result || !Array.isArray(result.faqs)) {
    return null;
  }

  return result.faqs.map((f: any) => ({
    question: f.question || '',
    answer: f.answer || '',
    category: f.category || '',
  }));
}

/**
 * Get cart via MCP
 * @param shopDomain - Shopify shop domain
 * @param cartId - Cart ID
 * @returns Cart data or null on error
 */
export async function mcpGetCart(
  shopDomain: string,
  cartId: string
): Promise<MCPCart | null> {
  const result = await mcpCall(shopDomain, 'get_cart', { cart_id: cartId });

  if (!result || !result.cart) {
    return null;
  }

  return {
    id: result.cart.id || cartId,
    items: result.cart.items || [],
    total: result.cart.total || '0',
  };
}

/**
 * Update cart via MCP (add/remove items)
 * @param shopDomain - Shopify shop domain
 * @param cartId - Cart ID
 * @param action - "add" or "remove"
 * @param productId - Product ID
 * @param quantity - Quantity
 * @returns Updated cart or null on error
 */
export async function mcpUpdateCart(
  shopDomain: string,
  cartId: string,
  action: 'add' | 'remove',
  productId: string,
  quantity: number = 1
): Promise<MCPCart | null> {
  const result = await mcpCall(shopDomain, 'update_cart', {
    cart_id: cartId,
    action,
    product_id: productId,
    quantity,
  });

  if (!result || !result.cart) {
    return null;
  }

  return {
    id: result.cart.id || cartId,
    items: result.cart.items || [],
    total: result.cart.total || '0',
  };
}

/**
 * Detect if user query is about products (for routing to catalog search)
 * @param query - User message
 * @returns true if query seems product-related
 */
export function isProductQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  const productKeywords = [
    'pierścionek', 'pierścień', 'pierścionki',
    'naszyjnik', 'naszyjniki',
    'bransoleta', 'bransoletka', 'bransoletki',
    'kolczyk', 'kolczyki',
    'złot', 'srebrn', 'platin',
    'diament', 'brylanc', 'szafir', 'rubin', 'szmaragd',
    'produkt', 'produkty', 'kupi', 'cena', 'ceny',
    'polec', 'pokaż', 'masz', 'dostępn', 'ofert',
    'fair trade', 'etycz',
  ];

  return productKeywords.some(keyword => lowerQuery.includes(keyword));
}

/**
 * Detect if user query is about cart operations
 * @param query - User message
 * @returns true if query seems cart-related
 */
export function isCartQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  const cartKeywords = [
    'koszyk', 'koszyka', 'koszyk',
    'dodaj do koszyka', 'wrzuć do koszyka',
    'usuń z koszyka', 'wyczyść koszyk',
    'zamówienie', 'zamów', 'kupuję',
  ];

  return cartKeywords.some(keyword => lowerQuery.includes(keyword));
=======
import type { Env } from './index';

// --- Typy dla parametrów i wyników narzędzi ---

interface SearchProductParams {
  query: string;
  first?: number;
}

interface PolicyParams {
  policy_types: ('termsOfService' | 'shippingPolicy' | 'refundPolicy' | 'privacyPolicy' | 'subscriptionPolicy')[];
}

// --- Implementacje narzędzi (Tools) ---

/**
 * Narzędzie MCP: Wyszukuje produkty w katalogu Shopify za pomocą Storefront API.
 * @param params Parametry wyszukiwania, głównie `query`.
 * @param env Zmienne środowiskowe.
 * @returns Sformatowany string z wynikami lub informacja o braku wyników.
 */
export async function searchProductCatalog(params: SearchProductParams, env: Env): Promise<string> {
  const { query, first = 5 } = params;
  const storefrontUrl = `https://${env.SHOP_DOMAIN}/api/2025-10/graphql.json`;

  const graphqlQuery = {
    query: `
      query searchProducts($query: String!, $first: Int!) {
        products(query: $query, first: $first) {
          edges {
            node {
              id
              title
              descriptionHtml
              onlineStoreUrl
              priceRange {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    `,
    variables: { query, first },
  };

  const response = await fetch(storefrontUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': env.SHOPIFY_STOREFRONT_TOKEN,
    },
    body: JSON.stringify(graphqlQuery),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Shopify Storefront API error:', errorText);
    return `Wystąpił błąd podczas wyszukiwania produktów. Status: ${response.status}`;
  }

  const json: any = await response.json();
  const products = json.data?.products?.edges;

  if (!products || products.length === 0) {
    return 'Nie znaleziono produktów pasujących do zapytania.';
  }

  // Formatuj wyniki w czytelny sposób dla LLM
  return `Oto znalezione produkty pasujące do "${query}":\n` + products.map((edge: any) => {
    const p = edge.node;
    return `- Tytuł: ${p.title}\n  Opis: ${p.descriptionHtml.replace(/<[^>]*>/g, ' ').substring(0, 150)}...\n  Cena: ${p.priceRange.minVariantPrice.amount} ${p.priceRange.minVariantPrice.currencyCode}\n  Link: ${p.onlineStoreUrl}`;
  }).join('\n\n');
}

/**
 * Narzędzie MCP: Pobiera polityki sklepu (regulamin, wysyłka itp.) za pomocą Admin API.
 * @param params Parametry określające, które polityki pobrać.
 * @param env Zmienne środowiskowe.
 * @returns Sformatowany string z treścią polityk.
 */
export async function getShopPolicies(params: PolicyParams, env: Env): Promise<string> {
  const adminUrl = `https://${env.SHOP_DOMAIN}/admin/api/2025-10/graphql.json`;
  const policyFields = params.policy_types.join('\n');

  const graphqlQuery = {
    query: `
      query getShopPolicies {
        shop {
          ${policyFields} {
            body
          }
        }
      }
    `,
  };

  const response = await fetch(adminUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify(graphqlQuery),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Shopify Admin API error:', errorText);
    return `Wystąpił błąd podczas pobierania polityk sklepu. Status: ${response.status}`;
  }

  const json: any = await response.json();
  const policies = json.data?.shop;

  if (!policies) {
    return 'Nie udało się pobrać polityk sklepu.';
  }

  // Formatuj wyniki
  return `Oto treść wybranych polityk sklepu:\n` + Object.entries(policies).map(([key, value]: [string, any]) => {
    return `\n--- ${key} ---\n${value.body}`;
  }).join('\n');
}

/**
 * Funkcja pomocnicza do sprawdzania, czy zapytanie użytkownika dotyczy produktu.
 * @param message Wiadomość od użytkownika.
 * @returns True, jeśli wiadomość prawdopodobnie dotyczy produktu.
 */
export function isProductQuery(message: string): boolean {
  const keywords = ['produkt', 'pierścionek', 'naszyjnik', 'bransoletka', 'kolczyki', 'cena', 'dostępność', 'kupić', 'znaleźć'];
  const lowerCaseMessage = message.toLowerCase();
  return keywords.some(keyword => lowerCaseMessage.includes(keyword));
>>>>>>> feat/rag-backend-setup
}

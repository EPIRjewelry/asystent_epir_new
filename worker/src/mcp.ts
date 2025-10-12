import type { Env } from './index';

// --- Typy dla parametr├│w i wynik├│w narz─Ödzi ---

interface SearchProductParams {
  query: string;
  first?: number;
}

interface PolicyParams {
  policy_types: ('termsOfService' | 'shippingPolicy' | 'refundPolicy' | 'privacyPolicy' | 'subscriptionPolicy')[];
}

interface ProductResult {
  id: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  url: string;
}

interface PolicyResult {
  type: string;
  body: string;
}

// --- Implementacje narzędzi (Tools) ---

/**
 * Narz─Ödzie MCP: Wyszukuje produkty w katalogu Shopify za pomoc─ů Storefront API.
 * @param params Parametry wyszukiwania, głównie `query`.
 * @param env Zmienne srodowiskowe.
 * @returns Structured JSON z wynikami.
 */
export async function searchProductCatalog(params: SearchProductParams, env: Env): Promise<{ products: ProductResult[] }> {
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
    throw new Error(`Shopify Storefront API error: ${response.status}`);
  }

  const json: any = await response.json();
  const products = json.data?.products?.edges;

  if (!products || products.length === 0) {
    return { products: [] };
  }

  return {
    products: products.map((edge: any) => ({
      id: edge.node.id,
      title: edge.node.title,
      description: edge.node.descriptionHtml.replace(/<[^>]*>/g, '').substring(0, 200),
      price: edge.node.priceRange.minVariantPrice.amount,
      currency: edge.node.priceRange.minVariantPrice.currencyCode,
      url: edge.node.onlineStoreUrl
    }))
  };
}

/**
 * Narz─Ödzie MCP: Pobiera polityki sklepu (regulamin, wysy┼éka itp.) za pomoc─ů Admin API.
 * @param params Parametry okre┼Ťlaj─ůce, kt├│re polityki pobra─ç.
 * @param env Zmienne ┼Ťrodowiskowe.
 * @returns Structured JSON z tre┼Ťci─ů polityk.
 */
export async function getShopPolicies(params: PolicyParams, env: Env): Promise<{ policies: PolicyResult[] }> {
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
    throw new Error(`Shopify Admin API error: ${response.status}`);
  }

  const json: any = await response.json();
  const policies = json.data?.shop;

  if (!policies) {
    return { policies: [] };
  }

  return {
    policies: Object.entries(policies).map(([key, value]: [string, any]) => ({
      type: key,
      body: value.body
    }))
  };
}

/**
 * Funkcja pomocnicza do sprawdzania, czy zapytanie użytkownika dotyczy produktu.
 * @param message Wiadomość od użytkownika.
 * @returns True, jeśli wiadomość prawdopodobnie dotyczy produktu.
 */
export function isProductQuery(message: string): boolean {
  const keywords = ['produkt', 'pierścionek', 'pierścionk', 'pierscione', 'naszyjnik', 'bransoletka', 'bransolet', 'kolczyk', 'kolczyki', 'cena', 'dostepn', 'kupi', 'znalezc', 'fair trade', 'diament', 'zlot', 'złot'];
  const lowerCaseMessage = message.toLowerCase();
  return keywords.some(keyword => lowerCaseMessage.includes(keyword));
}

/**
 * Funkcja pomocnicza do sprawdzania, czy zapytanie użytkownika dotyczy koszyka.
 * @param message Wiadomość od użytkownika.
 * @returns True, jeśli wiadomość dotyczy koszyka zakupów.
 */
export function isCartQuery(message: string): boolean {
  const keywords = ['koszyk', 'dodaj', 'usuń', 'usun', 'zamówi', 'zamowi', 'kupi', 'kupuj', 'kupuję', 'checkout', 'cart'];
  const lowerCaseMessage = message.toLowerCase();
  return keywords.some(keyword => lowerCaseMessage.includes(keyword));
}

// --- JSON-RPC wrapper functions for testing ---

/**
 * Generic JSON-RPC call to MCP endpoint
 */
export async function mcpCall(shopDomain: string, toolName: string, args: any): Promise<any> {
  try {
    // Call Worker's own MCP endpoint directly (not through shop domain)
    const url = `https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev/mcp/tools/call`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: toolName, arguments: args },
        id: 1
      })
    });

    if (!response.ok) {
      console.error(`MCP call failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const json: any = await response.json();
    
    if (json.error) {
      console.error('MCP JSON-RPC error:', json.error);
      return null;
    }

    return json.result ?? null;
  } catch (error) {
    console.error('MCP call exception:', error);
    return null;
  }
}

/**
 * Search product catalog via MCP
 */
export async function mcpCatalogSearch(
  shopDomain: string,
  query: string,
  context: string = 'luxury fair trade jewelry'
): Promise<Array<{name: string; price: string; url: string; image: string; id: string}> | null> {
  const args = { query, context };
  
  const result = await mcpCall(shopDomain, 'search_shop_catalog', args);
  
  if (!result || !result.products) {
    return null;
  }

  // Normalize product format
  return result.products.map((p: any) => ({
    name: p.name || p.title || '',
    price: p.price || '',
    url: p.url || '',
    image: p.image || p.featured_image || '',
    id: p.id || p.product_id || ''
  }));
}

/**
 * Search shop policies and FAQs via MCP
 */
export async function mcpSearchPoliciesAndFaqs(
  shopDomain: string,
  query: string
): Promise<Array<{question: string; answer: string; category: string}> | null> {
  const result = await mcpCall(shopDomain, 'search_shop_policies_and_faqs', { query });
  
  if (!result || !result.faqs) {
    return null;
  }

  // Normalize FAQ format
  return result.faqs.map((faq: any) => ({
    question: faq.question || '',
    answer: faq.answer || '',
    category: faq.category || ''
  }));
}

/**
 * Get cart via MCP
 */
export async function mcpGetCart(
  shopDomain: string,
  cartId: string
): Promise<{id: string; items: any[]; total: string} | null> {
  const result = await mcpCall(shopDomain, 'get_cart', { cart_id: cartId });
  
  if (!result || !result.cart) {
    return null;
  }

  return result.cart;
}

/**
 * Update cart via MCP
 */
export async function mcpUpdateCart(
  shopDomain: string,
  cartId: string,
  action: string,
  productId: string,
  quantity?: number
): Promise<{id: string; items: any[]; total: string} | null> {
  const args: any = { cart_id: cartId, action, product_id: productId };
  if (quantity !== undefined) args.quantity = quantity;
  
  const result = await mcpCall(shopDomain, 'update_cart', args);
  
  if (!result || !result.cart) {
    return null;
  }

  return result.cart;
}


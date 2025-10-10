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
}

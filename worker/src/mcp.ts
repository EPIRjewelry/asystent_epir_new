import type { Env } from './index';

// --- Typy dla parametr├│w i wynik├│w narz─Ödzi ---

interface SearchProductParams {
  query: string;
  first?: number;
}

interface PolicyParams {
  policy_types: ('termsOfService' | 'shippingPolicy' | 'refundPolicy' | 'privacyPolicy' | 'subscriptionPolicy')[];
}

// --- Implementacje narz─Ödzi (Tools) ---

/**
 * Narz─Ödzie MCP: Wyszukuje produkty w katalogu Shopify za pomoc─ů Storefront API.
 * @param params Parametry wyszukiwania, g┼é├│wnie `query`.
 * @param env Zmienne ┼Ťrodowiskowe.
 * @returns Sformatowany string z wynikami lub informacja o braku wynik├│w.
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
    return `Wyst─ůpi┼é b┼é─ůd podczas wyszukiwania produkt├│w. Status: ${response.status}`;
  }

  const json: any = await response.json();
  const products = json.data?.products?.edges;

  if (!products || products.length === 0) {
    return 'Nie znaleziono produkt├│w pasuj─ůcych do zapytania.';
  }

  // Formatuj wyniki w czytelny spos├│b dla LLM
  return `Oto znalezione produkty pasuj─ůce do "${query}":\n` + products.map((edge: any) => {
    const p = edge.node;
    return `- Tytu┼é: ${p.title}\n  Opis: ${p.descriptionHtml.replace(/<[^>]*>/g, ' ').substring(0, 150)}...\n  Cena: ${p.priceRange.minVariantPrice.amount} ${p.priceRange.minVariantPrice.currencyCode}\n  Link: ${p.onlineStoreUrl}`;
  }).join('\n\n');
}

/**
 * Narz─Ödzie MCP: Pobiera polityki sklepu (regulamin, wysy┼éka itp.) za pomoc─ů Admin API.
 * @param params Parametry okre┼Ťlaj─ůce, kt├│re polityki pobra─ç.
 * @param env Zmienne ┼Ťrodowiskowe.
 * @returns Sformatowany string z tre┼Ťci─ů polityk.
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
    return `Wyst─ůpi┼é b┼é─ůd podczas pobierania polityk sklepu. Status: ${response.status}`;
  }

  const json: any = await response.json();
  const policies = json.data?.shop;

  if (!policies) {
    return 'Nie uda┼éo si─Ö pobra─ç polityk sklepu.';
  }

  // Formatuj wyniki
  return `Oto tre┼Ť─ç wybranych polityk sklepu:\n` + Object.entries(policies).map(([key, value]: [string, any]) => {
    return `\n--- ${key} ---\n${value.body}`;
  }).join('\n');
}

/**
 * Funkcja pomocnicza do sprawdzania, czy zapytanie u┼╝ytkownika dotyczy produktu.
 * @param message Wiadomo┼Ť─ç od u┼╝ytkownika.
 * @returns True, je┼Ťli wiadomo┼Ť─ç prawdopodobnie dotyczy produktu.
 */
export function isProductQuery(message: string): boolean {
  const keywords = ['produkt', 'pier┼Ťcionek', 'naszyjnik', 'bransoletka', 'kolczyki', 'cena', 'dost─Öpno┼Ť─ç', 'kupi─ç', 'znale┼║─ç'];
  const lowerCaseMessage = message.toLowerCase();
  return keywords.some(keyword => lowerCaseMessage.includes(keyword));
}

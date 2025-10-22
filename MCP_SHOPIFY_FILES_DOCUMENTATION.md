# Dokumentacja plików MCP Shopify i Reguł

## Pliki definiujące zapytania do MCP Shopify

### 1. `worker/src/shopify-mcp-client.ts`
**Opis**: Główny klient MCP dla Shopify Storefront API
- Wywołuje oficjalny endpoint MCP Shopify: `https://{shop_domain}/api/mcp`
- Używa Storefront API (publiczne, nie wymaga Admin Token)
- Wymaga tylko `SHOPIFY_STOREFRONT_TOKEN` jako secret

**Główne funkcje**:
- `callShopifyMcpTool(toolName, args, env)` - Uniwersalna funkcja do wywoływania narzędzi MCP
- `searchShopCatalogMcp(query, env, context)` - Wyszukiwanie produktów w katalogu
- `getShopPoliciesMcp(policyTypes, env)` - Pobieranie polityk sklepu
- `updateCart(env, cartId, lines)` - Aktualizacja koszyka z fallback na GraphQL
- `getCart(env, cartId)` - Pobieranie aktualnego koszyka
- `getOrderStatus(env, orderId)` - Pobieranie statusu zamówienia
- `getMostRecentOrderStatus(env)` - Pobieranie ostatniego zamówienia

**Zapytania GraphQL (fallback)**:
- `cartCreate` mutation - Tworzenie nowego koszyka
- `cartLinesUpdate` mutation - Aktualizacja linii koszyka
- `cart` query - Pobieranie koszyka
- `order` query - Pobieranie zamówienia
- `orders` query - Pobieranie listy zamówień

### 2. `worker/src/shopify-mcp-full-client.ts`
**Opis**: Pełny klient MCP dla Cloudflare Workers
- Zarządza połączeniami do customer i storefront MCP endpoints
- Obsługuje wywołania narzędzi i autentykację

**Główne klasy i metody**:
- `ShopifyMCPFullClient` - Główna klasa klienta
  - `connectToCustomerServer(getTokenFn)` - Łączenie z customer MCP server
  - `connectToStorefrontServer()` - Łączenie z storefront MCP server
  - `callTool(toolName, toolArgs, ...)` - Wywołanie narzędzia MCP
  - `callStorefrontTool(toolName, toolArgs)` - Wywołanie narzędzia storefront
  - `callCustomerTool(toolName, toolArgs, ...)` - Wywołanie narzędzia customer z obsługą autoryzacji

**Endpointy**:
- Storefront: `https://{shop_domain}/api/mcp`
- Customer: `https://{shop_domain}.account.myshopify.com/customer/api/mcp`

### 3. `worker/src/mcp.ts`
**Opis**: Implementacje narzędzi MCP z bezpośrednimi zapytaniami GraphQL
- Zawiera funkcje narzędzi używane przez MCP
- Używa Storefront i Admin API

**Główne funkcje i zapytania**:
- `searchProductCatalog(params, env)` - Wyszukiwanie produktów
  - Zapytanie GraphQL: `searchProducts` query z parametrami `query` i `first`
  - Pola: id, title, descriptionHtml, onlineStoreUrl, priceRange
  
- `getShopPolicies(params, env)` - Pobieranie polityk sklepu
  - Zapytanie GraphQL: `getShopPolicies` query
  - Dynamiczne pola: termsOfService, shippingPolicy, refundPolicy, privacyPolicy, subscriptionPolicy

- `mcpCatalogSearch(shopDomain, query, env, context)` - Wrapper dla wyszukiwania katalogu
  - Używa `searchProductCatalog` wewnętrznie

### 4. `worker/src/graphql.ts`
**Opis**: Narzędzia GraphQL dla integracji z Shopify API
- Obsługuje wywołania Storefront i Admin API z logiką retry i rate limiting

**Główne funkcje**:
- `executeGraphQL(url, headers, query, variables, retries)` - Uniwersalna funkcja wykonania zapytania GraphQL
- `callStorefrontAPI(shopDomain, storefrontToken, query, variables)` - Wywołanie Storefront API
- `callAdminAPI(shopDomain, adminToken, query, variables)` - Wywołanie Admin API
- `fetchProductMetafields(shopDomain, adminToken, productId, namespace)` - Pobieranie metafields produktu
  - Zapytanie: `GetProductMetafields` query
- `fetchProductsForRAG(shopDomain, adminToken, storefrontToken, searchQuery)` - Pobieranie produktów dla RAG
  - Zapytania: `SearchProducts` query w Admin API i Storefront API

**Zapytania GraphQL**:
```graphql
# GetProductMetafields
query GetProductMetafields($id: ID!) {
  product(id: $id) {
    id
    title
    metafields(first: 20) {
      edges {
        node {
          namespace
          key
          value
          type
        }
      }
    }
  }
}

# SearchProducts (Admin API)
query SearchProducts($query: String!) {
  products(first: 5, query: $query) {
    edges {
      node {
        id
        title
        description
        vendor
        productType
        tags
        metafields(first: 10) { ... }
        variants(first: 3) { ... }
      }
    }
  }
}

# SearchProducts (Storefront API)
query SearchProducts($query: String!) {
  products(first: 5, query: $query) {
    edges {
      node {
        id
        title
        description
        vendor
        productType
        tags
        variants(first: 3) {
          edges {
            node {
              id
              title
              price {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  }
}
```

### 5. `worker/src/mcp_server.ts`
**Opis**: Serwer MCP do obsługi narzędzi produktowych
- Implementuje narzędzia MCP dla produktów i wyszukiwania

**Zapytania GraphQL**:
```graphql
# Product query
query Product($id: ID!) {
  product(id: $id) {
    id
    title
    description
    vendor
    productType
    tags
    variants(first: 5) { ... }
    images(first: 5) { ... }
  }
}

# Search query
query Search($query: String!) {
  products(first: 10, query: $query) {
    edges {
      node {
        id
        title
        description
        variants(first: 3) { ... }
      }
    }
  }
}
```

## Pliki definiujące reguły systemu

### 1. `prompts/groq_system_prompt.txt`
**Opis**: Główny prompt systemowy dla modelu LLM (Groq)

**Zawartość reguł**:
- Rola: Elegancki, wyrafinowany doradca marki EPIR-ART-JEWELLERY
- Ton: Luksusowy, kulturalny i zwięzły
- Zasady odpowiedzi:
  - Używać tylko materiałów z systemu retrieval (retrieved_docs)
  - Nie halucynować faktów
  - Cytować źródła: [doc_id] lub krótki fragment
  - Jeśli brak informacji - powiedzieć "Nie mam wystarczających informacji" + 2 dalsze kroki
  - Dla rekomendacji produktów: uzasadnienie + GID/link/cena
  - Maksymalna długość: 2-4 zdania + opcjonalnie 1-2 punkty z opcjami

**Instrukcja RAG**:
1. Jeśli retrieved_docs zawiera dobre dopasowania - załączyć jako kontekst
2. Struktura: krótkie podsumowanie → rekomendacja → źródła
3. Format odpowiedzi JSON-like: `{ reply: string, sources: [{id, score?}], actions?: [{ type, payload }] }`

**Przykładowy template użytkownika**:
```
Użytkownik: "{user_query}"
Context (retrieved_docs): [{id, text, meta:{url, gid}} ... ]

Zadanie: Odpowiedz zgodnie z zasadami powyżej.
```

## Konfiguracja środowiskowa

### Wymagane zmienne środowiskowe (wrangler.toml lub secrets):
- `SHOP_DOMAIN` - Domena sklepu Shopify (np. epir-art-silver-jewellery.myshopify.com)
- `SHOPIFY_STOREFRONT_TOKEN` - Token dostępu do Storefront API
- `SHOPIFY_ADMIN_TOKEN` - Token dostępu do Admin API
- `SHOPIFY_APP_SECRET` - Klucz tajny aplikacji Shopify
- `GROQ_API_KEY` - Klucz API do usługi Groq

### Endpointy MCP:
- **Storefront MCP**: `https://{SHOP_DOMAIN}/api/mcp`
- **Customer MCP**: `https://{SHOP_DOMAIN}.account.myshopify.com/customer/api/mcp`

## Przepływ żądania MCP

```
1. Użytkownik wysyła zapytanie → Worker
2. Worker wykrywa typ zapytania (produkt/FAQ/koszyk)
3. Worker wywołuje odpowiednie narzędzie MCP:
   - searchShopCatalogMcp() dla produktów
   - getShopPoliciesMcp() dla polityk
   - updateCart() dla operacji koszyka
4. MCP endpoint zwraca dane
5. Worker formatuje kontekst dla LLM
6. LLM (Groq) generuje odpowiedź zgodnie z regułami z groq_system_prompt.txt
7. Odpowiedź streamowana do klienta przez SSE
```

## Narzędzia MCP dostępne

### Storefront Tools:
- `search_shop_catalog` - Wyszukiwanie produktów w katalogu
- `get_shop_policies` - Pobieranie polityk sklepu
- `update_cart` - Aktualizacja koszyka
- `get_cart` - Pobieranie koszyka
- `get_order_status` - Status zamówienia
- `get_most_recent_order_status` - Ostatnie zamówienie

### Customer Tools (wymagają autoryzacji):
- Narzędzia związane z kontem klienta
- Wymagają customer access token

## Dokumentacja pomocnicza

- [MCP_INTEGRATION_GUIDE.md](./MCP_INTEGRATION_GUIDE.md) - Przewodnik integracji MCP
- [README.md](./README.md) - Ogólna dokumentacja projektu
- [GRAPHQL_ARCHITECTURE.md](./GRAPHQL_ARCHITECTURE.md) - Architektura GraphQL

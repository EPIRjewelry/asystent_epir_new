# Odpowiedź na zapytanie: Pliki z zapytaniami MCP Shopify i regułami

## Pytanie
> Sprawdź jaki plik definiuje zapytania do MCPO Shopify z plik w którym zdefiniowane są reguły

## Odpowiedź

### 📁 Pliki definiujące zapytania do MCP Shopify:

1. **`worker/src/shopify-mcp-client.ts`** - Główny klient MCP
   - Wywołuje endpoint: `https://{shop_domain}/api/mcp`
   - Funkcje: `callShopifyMcpTool()`, `searchShopCatalogMcp()`, `getShopPoliciesMcp()`, `updateCart()`, `getCart()`, `getOrderStatus()`
   - Zawiera również zapytania GraphQL jako fallback

2. **`worker/src/shopify-mcp-full-client.ts`** - Pełny klient MCP
   - Klasa `ShopifyMCPFullClient`
   - Obsługuje customer i storefront endpoints
   - Metody: `connectToStorefrontServer()`, `callStorefrontTool()`, `callCustomerTool()`

3. **`worker/src/mcp.ts`** - Implementacje narzędzi MCP
   - Funkcje: `searchProductCatalog()`, `getShopPolicies()`, `mcpCatalogSearch()`
   - Zawiera bezpośrednie zapytania GraphQL do Shopify API

4. **`worker/src/graphql.ts`** - Narzędzia GraphQL
   - Funkcje: `executeGraphQL()`, `callStorefrontAPI()`, `callAdminAPI()`, `fetchProductsForRAG()`
   - Zapytania: `GetProductMetafields`, `SearchProducts`

5. **`worker/src/mcp_server.ts`** - Serwer MCP
   - Obsługa zapytań: `Product`, `Search`

### 📋 Pliki definiujące reguły systemu:

1. **`worker/src/groq.ts`** - **GŁÓWNY PLIK Z REGUŁAMI** ⭐
   - Eksportuje stałą `LUXURY_SYSTEM_PROMPT` - aktywnie używany prompt systemowy
   - Rola: Elegancki doradca marki EPIR-ART-JEWELLERY
   - Zasady: priorytet produktów z MCP, ton luksusowy, odpowiedzi 2-4 zdania
   - Funkcje: `streamGroqResponse()`, `buildGroqMessages()`

2. **`prompts/groq_system_prompt.txt`** - Archiwalny prompt
   - Alternatywna/wcześniejsza wersja reguł w formie tekstowej
   - Może służyć jako backup lub szablon

## Szczegółowa dokumentacja

Pełna dokumentacja ze wszystkimi szczegółami znajduje się w pliku:
**`MCP_SHOPIFY_FILES_DOCUMENTATION.md`**

W tym pliku znajdziesz:
- Szczegółowy opis każdego pliku
- Listę wszystkich funkcji i ich parametrów
- Przykłady zapytań GraphQL
- Opis przepływu żądań MCP
- Konfigurację zmiennych środowiskowych
- Listę dostępnych narzędzi MCP

## Podsumowanie

**Zapytania MCP**: Głównie w `worker/src/shopify-mcp-client.ts` i `worker/src/mcp.ts`

**Reguły systemu**: W `worker/src/groq.ts` (stała `LUXURY_SYSTEM_PROMPT`)

---
*Dokumentacja utworzona: 2025-10-22*

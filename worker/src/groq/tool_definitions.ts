/**
 * worker/src/groq/tool_definitions.ts
 *
 * Zwięzłe definicje narzędzi MCP zgodnie z sekcją 5.2 dokumentu:
 * "Optymalizacja Opisów Narzędzi - Ograniczyć opisy funkcji do absolutnego minimum,
 * jednocześnie zachowując pełną precyzję w definicji parametrów."
 *
 * Cel: Minimalizacja "hidden context cost" przy każdej turze konwersacji.
 */

/**
 * Zwięzłe, zoptymalizowane definicje narzędzi MCP dla Llama 3.3 (Zero-Shot Function Calling).
 * Format: krótkie opisy + precyzyjne parametry + explicit examples.
 *
 * WAŻNE (z dokumentu sekcja 5.2):
 * - search_shop_catalog WYMAGA parametrów query i context
 * - query: wyodrębnione encje (np. "pierścionek szafir 5ct srebro")
 * - context: historia klienta i preferencje (np. "budżet 3000 PLN, styl: minimalizm")
 */
export const OPTIMIZED_TOOL_DEFINITIONS = `
DOSTĘPNE NARZĘDZIA MCP (używaj TYLKO gdy konieczne):

1. search_shop_catalog(query: string, context?: string) -> Product[]
   KIEDY: Klient pyta o produkt, cenę, dostępność, rekomendację
   PARAMETRY:
   - query (REQUIRED): Wyodrębnione encje produktowe (np. "pierścionek szafir srebro", "naszyjnik złoto perła")
   - context (OPTIONAL): Historia i preferencje (np. "budżet: 3000 PLN, styl: minimalizm japoński, wcześniej oglądał Art Deco")
   PRZYKŁAD:
   {
     "tool_call": {
       "name": "search_shop_catalog",
       "arguments": {
         "query": "pierścionek szafir srebro oksydowane",
         "context": "budżet: 2500-3500 PLN, preferuje rzemiosło etyczne, lubi ciemne tony"
       }
     }
   }

2. get_cart(cart_id: string) -> Cart
   KIEDY: Klient pyta "co mam w koszyku?", "pokaż mój koszyk", "jakie produkty wybrałem?"
   PARAMETRY:
   - cart_id (REQUIRED): ID koszyka (format: "gid://shopify/Cart/...")
   PRZYKŁAD:
   {
     "tool_call": {
       "name": "get_cart",
       "arguments": {
         "cart_id": "gid://shopify/Cart/Z2NwLXVzLWVhc3QxOjAxSktHODMz"
       }
     }
   }

3. update_cart(cart_id: string|null, lines: Line[]) -> Cart
   KIEDY: Klient chce dodać/usunąć/zmienić produkt w koszyku
   PARAMETRY:
   - cart_id (REQUIRED): ID koszyka lub null (dla nowego koszyka)
   - lines (REQUIRED): Tablica produktów
     * merchandiseId: GID wariantu (MUSI być format "gid://shopify/ProductVariant/...")
     * quantity: Liczba sztuk (0 = usuń)
   PRZYKŁAD (dodaj produkt):
   {
     "tool_call": {
       "name": "update_cart",
       "arguments": {
         "cart_id": null,
         "lines": [
           {
             "merchandiseId": "gid://shopify/ProductVariant/48234567890123",
             "quantity": 1
           }
         ]
       }
     }
   }

4. get_order_status(order_id: string) -> Order
   KIEDY: Klient pyta o status konkretnego zamówienia (ma numer zamówienia)
   PARAMETRY:
   - order_id (REQUIRED): Numer zamówienia (np. "#1234" lub "gid://shopify/Order/...")
   PRZYKŁAD:
   {
     "tool_call": {
       "name": "get_order_status",
       "arguments": {
         "order_id": "#1234"
       }
     }
   }

5. get_most_recent_order_status() -> Order
   KIEDY: Klient pyta "gdzie jest moje zamówienie?", "kiedy dostanę paczkę?" (NIE podaje numeru)
   PARAMETRY: brak (używa customer_id z sesji)
   PRZYKŁAD:
   {
     "tool_call": {
       "name": "get_most_recent_order_status",
       "arguments": {}
     }
   }

ZASADY UŻYCIA NARZĘDZI:
- Jeśli kontekst RAG już zawiera odpowiedź (produkt, cenę), NIE używaj search_shop_catalog
- Zawsze wyodrębniaj encje z zapytania klienta do parametru "query"
- Zawsze przekazuj historię/preferencje w parametrze "context" (jeśli dostępne)
- GID MUSI być pełny (gid://shopify/ProductVariant/...), nie skracaj
- Używaj narzędzi oszczędnie — priorytet: odpowiedź z RAG context
`;

/**
 * Generuje zwięzłą instrukcję formatowania odpowiedzi z narzędzi.
 * Zgodnie z dokumentem sekcja 5.2: "Wymuszanie Formatowania Wywołań"
 */
export const TOOL_RESPONSE_FORMAT_INSTRUCTION = `
FORMAT ODPOWIEDZI (OBOWIĄZKOWY):

Jeśli używasz narzędzia:
\`\`\`json
{
  "tool_call": {
    "name": "[nazwa_funkcji]",
    "arguments": { ... }
  }
}
\`\`\`

Jeśli odpowiadasz konwersacyjnie (BEZ narzędzia):
\`\`\`json
{
  "reply": "[Elegancka odpowiedź (max 3-5 zdań)]",
  "sources": [{ "id": "[doc_id]", "score": 0.95 }],
  "actions": [{ "type": "product_link", "payload": "gid://..." }]
}
\`\`\`

NIE mieszaj obu formatów. Wybierz JEDEN.
`;

# MCP API Refactoring Plan

Data: 2025-10-11

Ten dokument opisuje planowane zmiany w celu dostosowania implementacji MCP (Model Context Protocol) w workerze do oficjalnej specyfikacji.

Celem jest osiągnięcie 100% zgodności, aby zapewnić długoterminową stabilność i kompatybilność z przyszłymi aktualizacjami platform e-commerce.

---

## Zadanie 1: `mcpSearchPoliciesAndFaqs` - Dodanie parametru `context` (Niski priorytet)

**Problem:**
Nasza obecna implementacja funkcji `mcpSearchPoliciesAndFaqs` nie przyjmuje opcjonalnego parametru `context`, który jest zdefiniowany w specyfikacji MCP.

**Stan Obecny (`worker/src/mcp.ts`):**
```typescript
export async function mcpSearchPoliciesAndFaqs(
  shopDomain: string,
  query: string
): Promise<FAQ[] | null> {
  // ... logika wywołania mcpCall z { query }
}
```

**Stan Docelowy (zgodny ze specyfikacją):**
```typescript
export async function mcpSearchPoliciesAndFaqs(
  shopDomain: string,
  query: string,
  context?: string // <-- DODANY PARAMETR
): Promise<FAQ[] | null> {
  const args = context ? { query, context } : { query };
  // ... logika wywołania mcpCall z args
}
```

**Kroki do wykonania:**
1.  Zaktualizuj sygnaturę funkcji `mcpSearchPoliciesAndFaqs` w `worker/src/mcp.ts`, dodając `context?: string`.
2.  Zmodyfikuj logikę, aby `context` był przekazywany do `mcpCall`, jeśli istnieje.
3.  Zaktualizuj testy w `worker/test/mcp.test.ts`, aby uwzględniały przypadki z `context` i bez niego.
4.  Sprawdź wszystkie wywołania tej funkcji w kodzie (np. w `worker/src/rag.ts`) i dostosuj je.

---

## Zadanie 2: `mcpUpdateCart` - Refaktoryzacja sygnatury i logiki (Wysoki priorytet)

**Problem:**
Nasza obecna implementacja `mcpUpdateCart` ma sygnaturę, która znacząco odbiega od standardu MCP. Używamy prostych parametrów (`action`, `productId`, `quantity`), podczas gdy specyfikacja wymaga bardziej złożonej struktury opartej na liście produktów (`lines`).

**Stan Obecny (`worker/src/mcp.ts`):**
```typescript
export async function mcpUpdateCart(
  shopDomain: string,
  cartId: string,
  action: string,
  productId: string,
  quantity?: number
): Promise<Cart | null> {
  // ... logika wywołania mcpCall z prostymi parametrami
}
```

**Stan Docelowy (zgodny ze specyfikacją):**
```typescript
// Definicja typu dla linii koszyka
interface CartLine {
  merchandiseId: string;
  quantity: number;
}

export async function mcpUpdateCart(
  shopDomain: string,
  cartId?: string, // <-- cartId jest opcjonalny
  lines?: CartLine[] // <-- Zamiast action/productId/quantity
): Promise<Cart | null> {
  const args = {
    ...(cartId && { cart_id: cartId }),
    ...(lines && { lines }),
  };
  // ... logika wywołania mcpCall z nowymi args
}
```

**Kroki do wykonania:**
1.  Zdefiniuj interfejs `CartLine` zgodnie ze specyfikacją.
2.  Zmień całkowicie sygnaturę funkcji `mcpUpdateCart` w `worker/src/mcp.ts`.
3.  Przebuduj logikę tworzenia obiektu `args` dla `mcpCall`.
4.  Przepisz testy w `worker/test/mcp.test.ts`, aby odzwierciedlały nową strukturę (np. dodawanie/usuwanie wielu produktów naraz).
5.  Znajdź i zaktualizuj wszystkie miejsca w kodzie, które wywołują `mcpUpdateCart`.

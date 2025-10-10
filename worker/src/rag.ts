/**
 * worker/src/rag.ts
 *
 * Funkcje RAG (Retrieval-Augmented Generation) używane przez worker/src/index.ts:
 * - searchShopPoliciesAndFaqs: wyszukuje w lokalnej bazie (Vectorize) lub przez MCP
 * - searchShopPoliciesAndFaqsWithMCP: wymusza użycie MCP -> zwraca wynik z narzędzi sklepu
 * - searchProductCatalogWithMCP: prosty wrapper do wyszukiwania katalogu produktów przez MCP
 * - formatRagContextForPrompt: buduje string z wyników RAG do wstrzyknięcia w prompt LLM
 *
 * ZASADA: ŻADNYCH sekretów w kodzie. Wszystkie klucze / tokeny pochodzą z env (wrangler secrets / vars).
 */

export type VectorizeIndex = {
  // Abstrakcja: implementacja zależy od bindingu Vectorize w Cloudflare (typu API).
  // Tutaj minimalny typ dla zapytań wektorowych.
  query: (q: string, opts?: { topK?: number }) => Promise<Array<{ id: string; score: number; payload?: any }>>;
};

export interface RagResultItem {
  id: string;
  title?: string;
  text?: string; // Dodane dla kompatybilności z testami
  snippet?: string;
  source?: string;
  score?: number;
  metadata?: any; // Dodane dla kompatybilności z testami
  full?: any;
}

export interface RagSearchResult {
  query?: string; // Dodane dla kompatybilności z testami
  results: RagResultItem[];
}

/**
 * Wywołaj MCP JSON-RPC tools/call na endpoint /mcp/tools/call (dev) lub /apps/assistant/mcp (App Proxy),
 * automatycznie wybiera ścieżkę zależnie od isAppProxy param w query (tutaj przyjmujemy request kierowany do Workera).
 *
 * NOTE: Nie obsługujemy tutaj bezpośrednio HMAC - endpoint /apps/assistant/mcp powinien być wywoływany przez storefront (App Proxy)
 * i Worker już w index.ts weryfikuje HMAC. Tutaj wykonujemy fetch do własnego endpointu MCP do testów/wywołań wewnętrznych.
 */
async function callMcpTool(requestOrigin: string, toolName: string, args: any): Promise<any> {
  // requestOrigin to przykład: 'https://your-worker-domain' - placeholder, ale w Workerze możesz wywołać bezpośrednio ścieżkę względną
  try {
    const url = `${requestOrigin}/mcp/tools/call`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: toolName, arguments: args },
        id: Date.now()
      })
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '<no body>');
      throw new Error(`MCP tool ${toolName} error ${res.status}: ${txt}`);
    }
    const j = await res.json().catch(() => null);
    return (j as any)?.result ?? null;
  } catch (err) {
    console.error('callMcpTool error:', err);
    return null;
  }
}

/**
 * searchProductCatalogWithMCP
 * - używa MCP tool 'search_products' do zwrócenia listy produktów
 * - env: { SHOP_DOMAIN } jest wykorzystywany przy budowie zapytania do MCP jeśli trzeba (tu przyjmujemy, że MCP jest już zmapowany)
 */
export async function searchProductCatalogWithMCP(
  query: string,
  shopDomain: string | undefined,
  shopAdminToken?: string,
  storefrontToken?: string
): Promise<string | undefined> {
  // Zwracamy string context (np. lista produktów w formie tekstowej) lub undefined
  try {
    const origin = (typeof shopDomain === 'string' && shopDomain.length) ? `https://${shopDomain}` : '';
    // Wywołujemy MCP endpoint (zakładamy, że Worker posiada /mcp/tools/call)
    const result = await callMcpTool(origin || '', 'search_products', { query });
    if (!result) return undefined;
    const products = Array.isArray(result) ? result : (result.products ?? []);
    const items = (products as any[]).slice(0, 5).map((p) => {
      const title = p.title || p.name || p.handle || 'produkt';
      const url = p.onlineStoreUrl || p.url || p.handle ? `https://${shopDomain}/products/${p.handle}` : undefined;
      return `- ${title}${url ? ` (${url})` : ''}`;
    });
    return items.length ? `Znalezione produkty:\n${items.join('\n')}` : undefined;
  } catch (e) {
    console.error('searchProductCatalogWithMCP error:', e);
    return undefined;
  }
}

/**
 * searchShopPoliciesAndFaqsWithMCP
 * - Preferuje użycie MCP (np. sklepowy MCP index) do wyszukiwania FAQ/policies.
 * - Zwraca RagSearchResult z listą elementów (id, snippet, source)
 */
export async function searchShopPoliciesAndFaqsWithMCP(
  query: string,
  shopDomain: string,
  vectorIndex?: VectorizeIndex,
  aiBinding?: any,
  topK: number = 3
): Promise<RagSearchResult> {
  try {
    // Najpierw spróbuj MCP catalog (jeśli dostępne)
    const origin = `https://${shopDomain}`;
    const mcpRes = await callMcpTool(origin, 'search_shop_policies_and_faqs', { query, topK });
    if (mcpRes && Array.isArray(mcpRes.faqs) && mcpRes.faqs.length > 0) {
      const results: RagResultItem[] = mcpRes.faqs.slice(0, topK).map((f: any, i: number) => ({
        id: f.id ?? `mcp-faq-${i}`,
        title: f.question ?? f.title ?? `FAQ ${i + 1}`,
        text: (f.answer || '').slice(0, 500), // Dodane dla kompatybilności
        snippet: (f.answer || '').slice(0, 500),
        source: f.source || 'mcp',
        score: f.score ?? undefined,
        full: f
      }));
      return { results };
    }

    // Fallback: jeśli mamy Vectorize binding -> zapytanie wektorowe
    if (vectorIndex) {
      try {
        const vres = await vectorIndex.query(query, { topK });
        const results: RagResultItem[] = vres.map((r) => ({
          id: r.id,
          title: r.payload?.title ?? r.id,
          text: (r.payload?.text ?? '').slice(0, 500), // Dodane dla kompatybilności
          snippet: (r.payload?.text ?? '').slice(0, 500),
          source: r.payload?.source ?? 'vectorize',
          score: r.score,
          metadata: r.payload?.metadata, // Dodane dla kompatybilności
          full: r.payload
        }));
        return { results };
      } catch (ve) {
        console.warn('Vectorize query failed, falling back', ve);
      }
    }

    // Ostateczny fallback: pusta lista
    return { results: [] };
  } catch (err) {
    console.error('searchShopPoliciesAndFaqsWithMCP error:', err);
    return { results: [] };
  }
}

/**
 * searchShopPoliciesAndFaqs - wygodna funkcja wywołująca wyżej implementację,
 * ale dopuszcza wywołanie bez MCP (tylko vectorIndex)
 */
export async function searchShopPoliciesAndFaqs(
  query: string,
  vectorIndex?: VectorizeIndex,
  aiBinding?: any,
  topK: number = 3
): Promise<RagSearchResult> {
  try {
    if (vectorIndex) {
      const result = await searchShopPoliciesAndFaqsWithMCP(query, '', vectorIndex, aiBinding, topK);
      return { query, results: result.results };
    }
    return { query, results: [] };
  } catch (err) {
    console.error('searchShopPoliciesAndFaqs error:', err);
    return { query, results: [] };
  }
}

/**
 * formatRagContextForPrompt
 * - Przyjmuje RagSearchResult i buduje krótki kontekst do wstrzyknięcia do promptu LLM
 */
export function formatRagContextForPrompt(rag: RagSearchResult): string {
  if (!rag || !Array.isArray(rag.results) || rag.results.length === 0) return '';

  let output = '';
  if (rag.query) {
    output += `Context (retrieved documents for query: "${rag.query}")\n\n`;
  }

  const parts = rag.results.map((r, index) => {
    const docNum = index + 1;
    const title = r.title ? `${r.title}: ` : '';
    const text = r.text || r.snippet || '';
    const score = r.score ? `${(r.score * 100).toFixed(1)}%` : '';
    const metadata = r.metadata ? `\n${JSON.stringify(r.metadata)}` : '';
    return `[Doc ${docNum}] ${score ? `(${score}) ` : ''}${title}${text}${metadata}`;
  });

  output += parts.join('\n\n');

  if (rag.results.length > 0) {
    output += '\n\nOdpowiedz używając powyższego kontekstu. Jeśli brak wystarczających informacji, powiedz to wprost.';
  }

  return output;
}

/**
 * hasHighConfidenceResults
 * - Sprawdza czy wyniki RAG mają wystarczająco wysoką pewność (domyślnie >= 0.7)
 */
export function hasHighConfidenceResults(rag: RagSearchResult, threshold: number = 0.7): boolean {
  if (!rag || !Array.isArray(rag.results) || rag.results.length === 0) return false;
  return rag.results.some(r => (r.score ?? 0) >= threshold);
}

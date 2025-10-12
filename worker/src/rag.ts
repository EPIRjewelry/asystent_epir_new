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
  query: (vector: number[], opts?: { topK?: number }) => Promise<{ matches: Array<{ id: string; score: number; metadata?: any }>; count: number }>;
};

export interface RagResultItem {
  id: string;
  title?: string;
  text?: string;
  snippet?: string;
  source?: string;
  score?: number;
  metadata?: any;
  full?: any;
}

export interface RagSearchResult {
  query?: string;
  results: RagResultItem[];
}

/**
 * Wywołaj MCP JSON-RPC tools/call na endpoint /mcp/tools/call (dev) lub /apps/assistant/mcp (App Proxy),
 * automatycznie wybiera ścieżkę zależnie od isAppProxy param w query (tutaj przyjmujemy request kierowany do Workera).
 *
 * NOTE: Nie obsługujemy tutaj bezpośrednio HMAC - endpoint /apps/assistant/mcp powinien być wywoływany przez storefront (App Proxy)
 * i Worker już w index.ts weryfikuje HMAC. Tutaj wykonujemy fetch do własnego endpointu MCP do testów/wywołań wewnętrznych.
 */
export async function callMcpTool(env: any, toolName: string, args: any): Promise<any> {
  // Use WORKER_ORIGIN if available, otherwise fallback to a test-friendly origin
  const workerOrigin = env.WORKER_ORIGIN ?? (typeof self !== 'undefined' ? self.location.origin : 'http://localhost:8787');
  const url = `${workerOrigin}/mcp/tools/call`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
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
      if (j?.error) {
        throw new Error(`MCP tool call failed: ${j.error.message}`);
      }
      return j?.result ?? null;
    } catch (err) {
      console.error(`callMcpTool attempt ${attempt + 1} error:`, err);
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 100 * (2 ** attempt)));
      } else {
        return null;
      }
    }
  }
  return null;
}

/**
 * searchProductCatalogWithMCP
 * - używa bezpośredniego wywołania searchProductCatalog (internal call)
 */
export async function searchProductCatalogWithMCP(
  query: string,
  shopDomain: string | undefined,
  env: any,
  context?: string
): Promise<string | undefined> {
  // Zwracamy string context (np. lista produktów w formie tekstowej) lub undefined
  if (!shopDomain) return '';
  
  try {
    // Import MCP module to use mcpCatalogSearch
    const mcp = await import('./mcp');
    // Context is REQUIRED by MCP spec - use default if not provided
    const searchContext = context || 'luxury fair trade jewelry';
    const products = await mcp.mcpCatalogSearch(shopDomain, query, env, searchContext);
    
    if (!products || products.length === 0) return '';
    
    const items = products.slice(0, 5).map((p) => {
      const title = p.name || 'produkt';
      const url = p.url || '';
      return `- ${title}${url ? ` (${url})` : ''}${p.price ? ` - ${p.price}` : ''}`;
    });
    return items.length ? `Znalezione produkty:\n${items.join('\n')}` : '';
  } catch (e) {
    console.error('searchProductCatalogWithMCP error:', e);
    return '';
  }
}

/**
 * searchShopPoliciesAndFaqsWithMCP
 * - Wyszukuje FAQ/policies używając Vectorize (similarity search)
 * - Zwraca RagSearchResult z listą elementów (id, snippet, source)
 */
export async function searchShopPoliciesAndFaqsWithMCP(
  query: string,
  shopDomain: string | undefined,
  vectorIndex?: VectorizeIndex,
  aiBinding?: any,
  topK: number = 3
): Promise<RagSearchResult> {
  try {
    // Use Vectorize for FAQ/policy search
    if (vectorIndex && aiBinding) {
      try {
        // Get embedding for query
        const embeddingResult = await aiBinding.run('@cf/baai/bge-large-en-v1.5', {
          text: [query]
        });
        
        const queryVector = embeddingResult.data[0];
        const vres = await vectorIndex.query(queryVector, { topK });
        
        const results: RagResultItem[] = vres.matches.map((r: any) => ({
          id: r.id,
          title: r.metadata?.title ?? r.id,
          text: r.metadata?.text ?? '',
          snippet: (r.metadata?.text ?? '').slice(0, 500),
          source: r.metadata?.source ?? 'vectorize',
          score: r.score,
          metadata: r.metadata,
          full: r.metadata
        }));
        return { query, results };
      } catch (ve) {
        console.warn('Vectorize query failed', ve);
      }
    }

    // Fallback: empty results
    return { query, results: [] };
  } catch (err) {
    console.error('searchShopPoliciesAndFaqsWithMCP error:', err);
    return { query, results: [] };
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
    if (vectorIndex && aiBinding) {
      // Get embedding for query
      const embeddingResult = await aiBinding.run('@cf/baai/bge-large-en-v1.5', {
        text: [query]
      });
      
      const queryVector = embeddingResult.data[0];
      const vres = await vectorIndex.query(queryVector, { topK });
      
      const results: RagResultItem[] = vres.matches.map((r: any) => ({
        id: r.id,
        title: r.metadata?.title ?? r.id,
        text: r.metadata?.text ?? '',
        snippet: (r.metadata?.text ?? '').slice(0, 500),
        source: r.metadata?.source ?? 'vectorize',
        score: r.score,
        metadata: r.metadata,
        full: r.metadata
      }));
      return { query, results };
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

/**
 * formatMcpProductsForPrompt
 * - Formatuje produkty z MCP do postaci tekstowej dla promptu LLM
 */
export function formatMcpProductsForPrompt(
  products: Array<{name?: string; price?: string; url?: string; description?: string; image?: string}>,
  query: string
): string {
  if (!products || products.length === 0) return '';

  let output = `Produkty znalezione dla zapytania: "${query}"\n\n`;
  
  products.forEach((product, index) => {
    output += `[Produkt ${index + 1}]\n`;
    output += `Nazwa: ${product.name || 'Brak nazwy'}\n`;
    if (product.price) output += `Cena: ${product.price}\n`;
    if (product.url) output += `Link: ${product.url}\n`;
    if (product.description) output += `Opis: ${product.description}\n`;
    if (product.image) output += `Zdjęcie: ${product.image}\n`;
    output += '\n';
  });

  return output;
}

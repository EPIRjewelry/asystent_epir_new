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

import { callMcpToolDirect } from './mcp_server';

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
 * Extract keywords from user query for Shopify search
 * Removes filler words and extracts product-related terms
 */
function extractKeywords(query: string): string {
  const lowerQuery = query.toLowerCase();
  
  // Remove common Polish filler words
  const fillerWords = ['wymien', 'pokaż', 'pokaz', 'mi', 'masz', 'czy', 'jest', 'jakies', 'jakie', 'szukam', 'poszukuje', 'poszukuję', 'chce', 'chcę'];
  
  let keywords = lowerQuery;
  fillerWords.forEach(word => {
    keywords = keywords.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
  });
  
  // Clean up extra spaces
  keywords = keywords.replace(/\s+/g, ' ').trim();
  
  return keywords || lowerQuery; // fallback to original if empty
}

/**
 * Direct MCP tool call without HTTP - calls internal functions directly.
 * This replaces the HTTP fetch to avoid WORKER_ORIGIN configuration issues.
 * 
 * NOTE: For App Proxy calls from Shopify storefront, use /apps/assistant/mcp endpoint directly.
 * This function is for internal worker-to-worker calls within the same execution context.
 */
export async function callMcpTool(env: any, toolName: string, args: any): Promise<any> {
  // If WORKER_ORIGIN is provided, call the MCP endpoint via HTTP (this is what tests expect).
  const workerOrigin = env?.WORKER_ORIGIN;
  const payload = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: toolName, arguments: args },
    id: Date.now()
  };

  if (workerOrigin) {
    const url = `${workerOrigin.replace(/\/$/, '')}/mcp/tools/call`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.status === 429) {
          // Rate limited - retry with backoff
          const backoff = 100 * (2 ** attempt);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }

        const j = await res.json().catch(() => null) as any;
        if (!j) return null;
        if (j.error) return null;
        return j.result ?? null;
      } catch (err) {
        console.error(`callMcpTool attempt ${attempt + 1} error:`, err);
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 100 * (2 ** attempt)));
          continue;
        }
        return null;
      }
    }
    return null;
  }

  // Fallback: direct internal call
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await callMcpToolDirect(env, toolName, args);
      if (result?.error) {
        throw new Error(`MCP tool call failed: ${result.error.message}`);
      }
      if (result?.result === false) return null;
      return result?.result ?? null;
    } catch (err) {
      console.error(`callMcpToolDirect attempt ${attempt + 1} error:`, err);
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
 * Wrapper for MCP tool calls with error handling and fallback.
 */
async function callMcpToolWithFallback(toolName: string, args: any, env: any): Promise<any> {
  try {
    const response = await callMcpToolDirect(toolName, args, env);
    return response;
  } catch (error) {
    console.error(`MCP tool error (${toolName}):`, error);
    if (error.message.includes('401')) {
      return { error: 'Unauthorized access. Please check your configuration.' };
    }
    return { error: `Tool ${toolName} failed: ${error.message}` };
  }
}

/**
 * searchProductCatalogWithMCP
 * - używa MCP jako PRIMARY source dla katalogu produktów
 * - Vectorize jako fallback offline/błąd MCP
 */
export async function searchProductCatalogWithMCP(
  query: string,
  shopDomain: string | undefined,
  context?: string
): Promise<string | undefined> {
  if (!shopDomain) return '';
  try {
    // MCP endpoint
  const mcpEndpoint = `https://epir-art-silver-jewellery.myshopify.com/api/mcp`;
    const payload = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'search_shop_catalog',
        arguments: { query, context: context || 'jewelry' }
      },
      id: Date.now()
    };
    const res = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '<no body>');
      throw new Error(`MCP search_shop_catalog error ${res.status}: ${txt}`);
    }
    const j = await res.json().catch(() => null) as any;
    console.log('[MCP DEBUG] Odpowiedź search_shop_catalog:', JSON.stringify(j));
    if (j && j.error) {
      throw new Error(`MCP tool call failed: ${j.error.message}`);
    }
    // Standard MCP result: j.result.content[0].text
    if (j && j.result && Array.isArray(j.result.content)) {
      if (j.result.content.length === 0) {
        return '';
      }
      const textContent = j.result.content.find((c: any) => c.type === 'text');
      if (textContent?.text) {
        return String(textContent.text);
      }
      return '';
    }
    // Fallback: zwróć raw result jako JSON string
    return '';
  } catch (e) {
    console.error('[RAG] ❌ searchProductCatalogWithMCP MCP failure:', e);
    return '';
  }
}

/**
 * searchProductsAndCartWithMCP
 * - PRIMARY: MCP tools dla produktów i koszyka (search_shop_catalog, update_cart, get_cart)
 * - FALLBACK: Vectorize dla offline product search
 * - Zwraca sformatowany kontekst dla promptu AI
 */
export async function searchProductsAndCartWithMCP(
  query: string,
  shopDomain: string | undefined,
  env: any,
  cartId?: string | null,
  intent?: 'search' | 'cart' | 'order',
  vectorIndex?: VectorizeIndex,
  aiBinding?: any
): Promise<string> {
  let output: string = '';

  try {
    // CART OPERATIONS (jeśli intent = 'cart')
    if (intent === 'cart' && cartId) {
      console.log('[RAG] 🛒 Aktualizacja koszyka przez MCP...');
      // Przykład: params do update_cart (można rozbudować o przekazywanie produktów)
      // const updateParams = { cart_id: cartId, items: [{ product_id, quantity }] };
      // Jeśli chcesz zaktualizować koszyk, wywołaj update_cart:
      // await callMcpTool(env, 'update_cart', updateParams);

      // Pobierz aktualny stan koszyka
      const cartResult = await callMcpTool(env, 'get_cart', { cart_id: cartId });

      let cartText = '';
      if (cartResult && Array.isArray(cartResult.content)) {
        cartText = cartResult.content
          .filter((c: any) => c.type === 'text' && typeof c.text === 'string')
          .map((c: any) => c.text)
          .join('\n');
      }
      if (cartText) {
        output += `\n[KOSZYK (MCP)]\n${cartText}\n`;
      }
    }

    // ORDER OPERATIONS (jeśli intent = 'order')
    if (intent === 'order') {
      console.log('[RAG] 📦 Pobieranie statusu zamówienia przez MCP...');
      // Przykład: pobierz status konkretnego zamówienia jeśli podano order_id
      // const orderStatus = await callMcpTool(env, 'get_order_status', { order_id });
      // if (orderStatus && Array.isArray(orderStatus.content)) {
      //   ...obsługa konkretnego zamówienia...
      // }

      // Pobierz status ostatniego zamówienia
      const orderResult = await callMcpTool(env, 'get_most_recent_order_status', {});

      let orderText = '';
      if (orderResult && Array.isArray(orderResult.content)) {
        orderText = orderResult.content
          .filter((c: any) => c.type === 'text' && typeof c.text === 'string')
          .map((c: any) => c.text)
          .join('\n');
      }
      if (orderText) {
        output += `\n[OSTATNIE ZAMÓWIENIE (MCP)]\n${orderText}\n`;
      }
    }

    // PRODUCT SEARCH (zawsze dla intent = 'search')
    if (intent === 'search' || !intent) {
      console.log('[RAG] 🔍 Searching products via MCP...');
      const productContext = await searchProductCatalogWithMCP(
        query,
        shopDomain,
        'luxury fair trade jewelry'
      );
      if (productContext) {
        output += `\n${productContext}\n`;
      }
    }

  // Always return a string, never false/undefined
  // If output is empty, return empty string
  const result = typeof output === 'string' ? output.trim() : '';
  return result || '';
  } catch (e) {
    console.error('[RAG] ❌ searchProductsAndCartWithMCP error:', e);
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
    // MCP path
    if (shopDomain) {
  const mcpEndpoint = `https://epir-art-silver-jewellery.myshopify.com/api/mcp`;
      const payload = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'search_shop_policies_and_faqs',
          arguments: { query }
        },
        id: Date.now()
      };
      const res = await fetch(mcpEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '<no body>');
        throw new Error(`MCP search_shop_policies_and_faqs error ${res.status}: ${txt}`);
      }
      const j = await res.json().catch(() => null) as any;
      if (j && j.error) {
        throw new Error(`MCP tool call failed: ${j.error.message}`);
      }
      // Standard MCP result: j.result.content[]
      let results: RagResultItem[] = [];
      if (j && j.result && Array.isArray(j.result.content)) {
        results = j.result.content
          .filter((c: any) => c.type === 'text')
          .map((c: any, idx: number) => ({
            id: `faq_${idx + 1}`,
            title: c.title || undefined,
            text: c.text || '',
            snippet: (c.text || '').slice(0, 500),
            source: 'mcp',
            score: undefined,
            metadata: c,
            full: c
          }));
      }
      return { query, results };
    }
    // Fallback: Vectorize
    if (vectorIndex && aiBinding) {
      // Run embedding
      const embedding = await aiBinding.run('@cf/baai/bge-large-en-v1.5', { text: [query] });
      const vector = embedding?.data?.[0] || [];
      const vectorResults = await vectorIndex.query(vector, { topK });
      const results: RagResultItem[] = (vectorResults.matches || []).map((match, idx) => ({
        id: match.id || `vector_${idx + 1}`,
        text: match.metadata?.text || '',
        snippet: (match.metadata?.text || '').slice(0, 500),
        source: 'vectorize',
        score: match.score,
        metadata: match.metadata,
        full: match
      }));
      return { query, results };
    }
    // No MCP, no Vectorize
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

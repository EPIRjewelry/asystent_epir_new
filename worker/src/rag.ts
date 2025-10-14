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
 * Direct MCP tool call without HTTP - calls internal functions directly.
 * This replaces the HTTP fetch to avoid WORKER_ORIGIN configuration issues.
 * 
 * NOTE: For App Proxy calls from Shopify storefront, use /apps/assistant/mcp endpoint directly.
 * This function is for internal worker-to-worker calls within the same execution context.
 */
export async function callMcpTool(env: any, toolName: string, args: any): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await callMcpToolDirect(env, toolName, args);
      
      if (result?.error) {
        throw new Error(`MCP tool call failed: ${result.error.message}`);
      }
      return result?.result ?? null;
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
 * - używa MCP jako PRIMARY source dla katalogu produktów
 * - Vectorize jako fallback offline/błąd MCP
 */
export async function searchProductCatalogWithMCP(
  query: string,
  shopDomain: string | undefined,
  env: any,
  context?: string,
  vectorIndex?: VectorizeIndex,
  aiBinding?: any
): Promise<string | undefined> {
  // Zwracamy string context (np. lista produktów w formie tekstowej) lub undefined
  if (!shopDomain) return '';
  
  try {
    // PRIMARY: MCP search_shop_catalog
    const mcpResult = await callMcpTool(env, 'search_shop_catalog', { query });
    
    if (mcpResult && mcpResult.content && Array.isArray(mcpResult.content)) {
      const textContent = mcpResult.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
      
      if (textContent) {
        console.log('[RAG] ✅ MCP catalog search successful');
        return `Produkty z katalogu (MCP):\n${textContent}`;
      }
    }
    
    // FALLBACK: Legacy mcpCatalogSearch (internal)
    console.log('[RAG] ⚠️ MCP primary failed, trying legacy search...');
    const mcp = await import('./mcp');
    const searchContext = context || 'luxury fair trade jewelry';
    const products = await mcp.mcpCatalogSearch(shopDomain, query, env, searchContext);
    
    if (products && products.length > 0) {
      const items = products.slice(0, 5).map((p) => {
        const title = p.name || 'produkt';
        const url = p.url || '';
        return `- ${title}${url ? ` (${url})` : ''}${p.price ? ` - ${p.price}` : ''}`;
      });
      return items.length ? `Znalezione produkty (legacy):\n${items.join('\n')}` : '';
    }
    
    // FALLBACK: Vectorize (offline/catalog indexed)
    if (vectorIndex && aiBinding) {
      console.log('[RAG] ⚠️ MCP unavailable, using Vectorize fallback...');
      const embeddingResult = await aiBinding.run('@cf/baai/bge-large-en-v1.5', {
        text: [query]
      });
      const queryVector = embeddingResult.data[0];
      const vres = await vectorIndex.query(queryVector, { topK: 5 });
      
      const items = vres.matches
        .filter((r: any) => r.metadata?.type === 'product')
        .map((r: any) => {
          const title = r.metadata?.title || r.metadata?.name || 'produkt';
          const price = r.metadata?.price || '';
          return `- ${title}${price ? ` - ${price}` : ''}`;
        });
      
      if (items.length > 0) {
        return `Produkty z Vectorize (offline):\n${items.join('\n')}`;
      }
    }
    
    return '';
  } catch (e) {
    console.error('[RAG] ❌ searchProductCatalogWithMCP complete failure:', e);
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
  let output = '';
  
  try {
    // CART OPERATIONS (jeśli intent = 'cart')
    if (intent === 'cart' && cartId) {
      console.log('[RAG] 🛒 Fetching cart via MCP...');
      const cartResult = await callMcpTool(env, 'get_cart', { cart_id: cartId });
      
      if (cartResult && cartResult.content) {
        const cartText = Array.isArray(cartResult.content)
          ? cartResult.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
          : cartResult.content;
        output += `\n[KOSZYK (MCP)]\n${cartText}\n`;
      }
    }
    
    // ORDER OPERATIONS (jeśli intent = 'order')
    if (intent === 'order') {
      console.log('[RAG] 📦 Fetching recent order via MCP...');
      const orderResult = await callMcpTool(env, 'get_most_recent_order_status', {});
      
      if (orderResult && orderResult.content) {
        const orderText = Array.isArray(orderResult.content)
          ? orderResult.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
          : orderResult.content;
        output += `\n[OSTATNIE ZAMÓWIENIE (MCP)]\n${orderText}\n`;
      }
    }
    
    // PRODUCT SEARCH (zawsze dla intent = 'search')
    if (intent === 'search' || !intent) {
      console.log('[RAG] 🔍 Searching products via MCP...');
      const productContext = await searchProductCatalogWithMCP(
        query,
        shopDomain,
        env,
        'luxury fair trade jewelry',
        vectorIndex,
        aiBinding
      );
      
      if (productContext) {
        output += `\n${productContext}\n`;
      }
    }
    
    return output.trim();
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

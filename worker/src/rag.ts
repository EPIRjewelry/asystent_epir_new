<<<<<<< HEAD
// RAG (Retrieval-Augmented Generation) module for EPIR-ART-JEWELLERY
// Integrates Cloudflare Vectorize for semantic search of shop policies, FAQs, and products
// Also supports MCP (Model Context Protocol) as primary source with Vectorize fallback

import { mcpCatalogSearch, mcpSearchPoliciesAndFaqs, type MCPProduct } from './mcp';
import { fetchProductsForRAG } from './graphql';

export interface Document {
  id: string;
  source: string;
  text: string;
  metadata?: Record<string, any>;
}

export interface SearchResult extends Document {
  score: number;
}
=======
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
>>>>>>> feat/rag-backend-setup

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

<<<<<<< HEAD
export interface VectorizeQueryResult {
  matches: VectorizeMatch[];
  count: number;
}

export interface RagContext {
  query: string;
  results: Array<{
    id: string;
    text: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>;
}

export interface VectorizeIndex {
  query: (
    vector: number[] | Float32Array,
    options?: { topK?: number; filter?: Record<string, unknown> }
  ) => Promise<VectorizeQueryResult>;
  insert: (vectors: Array<{
    id: string;
    values: number[] | Float32Array;
    metadata?: Record<string, unknown>;
  }>) => Promise<{ mutationId: string }>;
  upsert: (vectors: Array<{
    id: string;
    values: number[] | Float32Array;
    metadata?: Record<string, unknown>;
  }>) => Promise<{ mutationId: string }>;
}

interface WorkersAI {
  run: (model: string, args: Record<string, unknown>) => Promise<any>;
}

export interface Env {
  VECTOR_INDEX?: VectorizeIndex;
  AI?: WorkersAI;
  VECTORIZER_ENDPOINT?: string;
  VECTORIZER_API_KEY?: string;
}

/**
 * Generate embeddings for text using Workers AI or external API
 * @param env - Environment bindings
 * @param text - Text to embed
 * @returns Float32Array embedding vector
 */
export async function embedText(env: Env, text: string): Promise<Float32Array> {
  try {
    // Prefer Workers AI if available
    if (env.AI) {
      const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
        text: [text],
      });
      const embedding = result.data[0];
      return embedding instanceof Float32Array ? embedding : Float32Array.from(embedding);
    }
    
    // Fallback to external vectorizer endpoint
    if (env.VECTORIZER_ENDPOINT && env.VECTORIZER_API_KEY) {
      const res = await fetch(env.VECTORIZER_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.VECTORIZER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: text }),
      });
      
      if (!res.ok) {
        throw new Error(`embedText failed: ${res.status} ${res.statusText}`);
      }
      
      const json = await res.json() as { embedding: number[] };
      return Float32Array.from(json.embedding);
    }
    
    throw new Error('No embedding provider configured (AI or VECTORIZER_ENDPOINT required)');
  } catch (err) {
    console.error('embedText error:', err);
    throw err;
  }
}

/**
 * Upsert documents to the vector index
 * @param env - Environment bindings
 * @param docs - Documents to upsert
 */
export async function upsertDocuments(env: Env, docs: Document[]): Promise<void> {
  if (!env.VECTOR_INDEX) {
    throw new Error('VECTOR_INDEX binding not available');
  }
  
  if (docs.length === 0) {
    console.log('No documents to upsert');
    return;
  }
  
  try {
    const vectors = [];
    
    for (const doc of docs) {
      const embedding = await embedText(env, doc.text);
      vectors.push({
        id: doc.id,
        values: embedding,
        metadata: {
          source: doc.source,
          text: doc.text.slice(0, 500), // Store truncated text in metadata
          ...doc.metadata,
        },
      });
    }
    
    // Upsert in batches of 100 (Vectorize limit)
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await env.VECTOR_INDEX.upsert(batch);
      console.log(`Upserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vectors.length / batchSize)}`);
    }
    
    console.log(`Successfully upserted ${docs.length} documents`);
  } catch (err) {
    console.error('upsertDocuments error:', err);
    throw err;
  }
}

/**
 * Search the vector index using semantic search
 * @param env - Environment bindings
 * @param query - Search query text
 * @param topK - Number of top results to return (default: 5)
 * @returns Array of search results with scores
 */
export async function search(env: Env, query: string, topK: number = 5): Promise<SearchResult[]> {
  if (!env.VECTOR_INDEX) {
    throw new Error('VECTOR_INDEX binding not available');
  }
  
  try {
    // Generate query embedding
    const queryVector = await embedText(env, query);
    
    // Query vector index
    const result = await env.VECTOR_INDEX.query(queryVector, { topK });
    
    // Format results
    return result.matches.map(match => ({
      id: match.id,
      source: (match.metadata?.source as string) || 'unknown',
      text: (match.metadata?.text as string) || '',
      score: match.score,
      metadata: match.metadata,
    }));
  } catch (err) {
    console.error('search error:', err);
    throw err;
  }
}

/**
 * Search shop policies, FAQs, and product information using Vectorize
 * @param query - User query text
 * @param vectorIndex - Cloudflare Vectorize binding
 * @param ai - Workers AI binding for generating embeddings
 * @param topK - Number of top results to return (default: 3)
 * @returns RAG context with relevant documents
 */
export async function searchShopPoliciesAndFaqs(
  query: string,
  vectorIndex: VectorizeIndex,
  ai: WorkersAI,
=======
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
>>>>>>> feat/rag-backend-setup
  topK: number = 3
): Promise<RagSearchResult> {
  try {
<<<<<<< HEAD
    // 1. Generate embedding using Workers AI
    const embeddingResult = await ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [query],
    });
    
    const embedding = embeddingResult.data[0]; // Float32Array or number[]
    
    // 2. Query Vectorize
    const queryResult = await vectorIndex.query(embedding, { topK });
    
    // 3. Format results
    return {
      query,
      results: queryResult.matches.map(match => ({
        id: match.id,
        text: match.metadata?.text as string || '',
        score: match.score,
        metadata: match.metadata,
      })),
    };
  } catch (error) {
    console.error('RAG search error:', error);
    return {
      query,
      results: [],
    };
=======
    if (vectorIndex) {
      const result = await searchShopPoliciesAndFaqsWithMCP(query, '', vectorIndex, aiBinding, topK);
      return { query, results: result.results };
    }
    return { query, results: [] };
  } catch (err) {
    console.error('searchShopPoliciesAndFaqs error:', err);
    return { query, results: [] };
>>>>>>> feat/rag-backend-setup
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
<<<<<<< HEAD
 * Format MCP product results for LLM prompt
 * @param products - Array of MCP products
 * @param query - Original user query
 * @returns Formatted string for LLM prompt
 */
export function formatMcpProductsForPrompt(products: MCPProduct[], query: string): string {
  if (products.length === 0) {
    return '';
  }

  const productList = products
    .map((p, idx) => {
      const parts = [
        `[Produkt ${idx + 1}] ${p.name}`,
        p.price ? `Cena: ${p.price}` : '',
        p.url ? `URL: ${p.url}` : '',
        p.description ? `Opis: ${p.description}` : '',
      ];
      return parts.filter(Boolean).join(' | ');
    })
    .join('\n\n');

  return `Produkty znalezione dla zapytania "${query}":\n${productList}\n\nPolec odpowiednie produkty używając powyższych informacji.`;
}

/**
 * Check if RAG context has high-confidence results
 * @param context - RAG context
 * @param minScore - Minimum confidence score (0-1, default 0.7)
 * @returns true if at least one result meets the threshold
=======
 * hasHighConfidenceResults
 * - Sprawdza czy wyniki RAG mają wystarczająco wysoką pewność (domyślnie >= 0.7)
>>>>>>> feat/rag-backend-setup
 */
export function hasHighConfidenceResults(rag: RagSearchResult, threshold: number = 0.7): boolean {
  if (!rag || !Array.isArray(rag.results) || rag.results.length === 0) return false;
  return rag.results.some(r => (r.score ?? 0) >= threshold);
}

/**
 * Search shop policies and FAQs with MCP primary, Vectorize fallback
 * @param query - User query text
 * @param shopDomain - Shopify shop domain (for MCP)
 * @param vectorIndex - Cloudflare Vectorize binding (fallback)
 * @param ai - Workers AI binding for generating embeddings (fallback)
 * @param topK - Number of top results to return
 * @returns RAG context with relevant documents
 */
export async function searchShopPoliciesAndFaqsWithMCP(
  query: string,
  shopDomain: string | undefined,
  vectorIndex: VectorizeIndex | undefined,
  ai: WorkersAI | undefined,
  topK: number = 3
): Promise<RagContext> {
  // Try MCP first if shop domain is configured
  if (shopDomain) {
    try {
      const mcpResults = await mcpSearchPoliciesAndFaqs(shopDomain, query, 'EPIR luxury');
      
      if (mcpResults && mcpResults.length > 0) {
        return {
          query,
          results: mcpResults.slice(0, topK).map((faq, idx) => ({
            id: `mcp-faq-${idx}`,
            text: `Q: ${faq.question}\nA: ${faq.answer}`,
            score: 0.95, // High confidence for MCP results
            metadata: { source: 'mcp', category: faq.category },
          })),
        };
      }
    } catch (error) {
      console.warn('MCP FAQs search failed, falling back to Vectorize:', error);
    }
  }

  // Fallback to Vectorize
  if (vectorIndex && ai) {
    return searchShopPoliciesAndFaqs(query, vectorIndex, ai, topK);
  }

  // No results available
  return { query, results: [] };
}

/**
 * Search product catalog with MCP and GraphQL fallback
 * @param query - User query text
 * @param shopDomain - Shopify shop domain (for MCP and GraphQL)
 * @param adminToken - Shopify Admin API token (for GraphQL with metafields)
 * @param storefrontToken - Shopify Storefront API token (for GraphQL fallback)
 * @returns Formatted product context or empty string
 */
export async function searchProductCatalogWithMCP(
  query: string,
  shopDomain: string | undefined,
  adminToken?: string,
  storefrontToken?: string
): Promise<string> {
  if (!shopDomain) {
    return '';
  }

  // Try MCP first
  try {
    const products = await mcpCatalogSearch(shopDomain, query, 'fair trade luxury');
    
    if (products && products.length > 0) {
      return formatMcpProductsForPrompt(products, query);
    }
  } catch (error) {
    console.warn('MCP catalog search failed, trying GraphQL:', error);
  }

  // Fallback to GraphQL
  try {
    const products = await fetchProductsForRAG(shopDomain, adminToken, storefrontToken, query);
    
    if (products && products.length > 0) {
      const formatted = products.map((p, idx) => {
        const variant = p.variants?.edges?.[0]?.node;
        const price = variant?.price?.amount 
          ? `${variant.price.amount} ${variant.price.currencyCode || ''}`
          : variant?.price || 'Cena niedostępna';
        
        const metafields = p.metafields?.edges?.map((e: any) => e.node) || [];
        const metaInfo = metafields.length > 0 
          ? ` | Metafields: ${metafields.map((m: any) => `${m.key}=${m.value}`).join(', ')}`
          : '';
        
        return `[Produkt ${idx + 1}] ${p.title} | Cena: ${price} | Opis: ${p.description || 'Brak'}${metaInfo}`;
      }).join('\n\n');
      
      return `Produkty znalezione dla zapytania "${query}":\n${formatted}\n\nPolec odpowiednie produkty używając powyższych informacji.`;
    }
  } catch (error) {
    console.warn('GraphQL product search failed:', error);
  }

  return '';
}

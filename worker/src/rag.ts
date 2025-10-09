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

export interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

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
  topK: number = 3
): Promise<RagContext> {
  try {
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
  }
}

/**
 * Format RAG context for LLM prompt
 * @param context - RAG context with retrieved documents
 * @returns Formatted string for LLM system/user prompt
 */
export function formatRagContextForPrompt(context: RagContext): string {
  if (context.results.length === 0) {
    return '';
  }

  const docs = context.results
    .map((doc, idx) => {
      const score = (doc.score * 100).toFixed(1);
      const meta = doc.metadata ? ` [${JSON.stringify(doc.metadata)}]` : '';
      return `[Doc ${idx + 1}] (score: ${score}%)${meta}: ${doc.text}`;
    })
    .join('\n\n');

  return `Context (retrieved documents for query: "${context.query}"):\n${docs}\n\nOdpowiedz używając powyższego kontekstu. Jeśli brak wystarczających informacji, powiedz to wprost.`;
}

/**
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
 */
export function hasHighConfidenceResults(context: RagContext, minScore: number = 0.7): boolean {
  return context.results.some(doc => doc.score >= minScore);
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

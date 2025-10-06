// RAG (Retrieval-Augmented Generation) module for EPIR-ART-JEWELLERY
// Integrates Cloudflare Vectorize for semantic search of shop policies, FAQs, and products
// Also supports MCP (Model Context Protocol) as primary source with Vectorize fallback

import { mcpCatalogSearch, mcpSearchPoliciesAndFaqs, type MCPProduct } from './mcp';

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
}

interface WorkersAI {
  run: (model: string, args: Record<string, unknown>) => Promise<any>;
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
 * Search product catalog with MCP
 * @param query - User query text
 * @param shopDomain - Shopify shop domain (for MCP)
 * @returns Formatted MCP product context or empty string
 */
export async function searchProductCatalogWithMCP(
  query: string,
  shopDomain: string | undefined
): Promise<string> {
  if (!shopDomain) {
    return '';
  }

  try {
    const products = await mcpCatalogSearch(shopDomain, query, 'fair trade luxury');
    
    if (products && products.length > 0) {
      return formatMcpProductsForPrompt(products, query);
    }
  } catch (error) {
    console.warn('MCP catalog search failed:', error);
  }

  return '';
}

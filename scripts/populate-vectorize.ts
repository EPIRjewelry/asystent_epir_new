#!/usr/bin/env node
/**
 * Populate Vectorize Index with EPIR-ART-JEWELLERY shop data
 * 
 * This script fetches shop policies, FAQs, and product data,
 * generates embeddings, and inserts them into Cloudflare Vectorize.
 * 
 * Usage:
 *   node scripts/populate-vectorize.ts
 * 
 * Environment variables:
 *   - CLOUDFLARE_ACCOUNT_ID: Your Cloudflare account ID
 *   - CLOUDFLARE_API_TOKEN: API token with Vectorize permissions
 *   - VECTORIZE_INDEX_NAME: Name of the Vectorize index (default: autorag-epir-chatbot-rag)
 *   - SHOPIFY_STOREFRONT_TOKEN: Shopify Storefront API token
 *   - SHOPIFY_ADMIN_TOKEN: Shopify Admin API token (optional, for metafields)
 *   - SHOP_DOMAIN: Shop domain (e.g., epir-art-silver-jewellery.myshopify.com)
 */

import * as fs from 'fs';
import * as path from 'path';

// Configuration
const SHOPIFY_API_VERSION = '2024-10';
const MAX_RETRIES = 3;
const RATE_LIMIT_DELAY_MS = 100; // 100ms between requests (max 10 req/s)
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second initial retry delay

interface VectorizeVector {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
}

interface ShopifyProduct {
  id: string;
  title: string;
  description: string;
  productType: string;
  vendor: string;
  tags: string[];
  variants: Array<{
    id: string;
    title: string;
    price: string;
  }>;
}

interface DocumentToIndex {
  id: string;
  text: string;
  metadata: {
    type: 'policy' | 'faq' | 'product';
    title?: string;
    url?: string;
    price?: string;
    gid?: string;
  };
}

interface GraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: string[];
  extensions?: Record<string, unknown>;
}

interface GraphQLResponse<T = any> {
  data?: T;
  errors?: GraphQLError[];
}

/**
 * Sleep utility for rate limiting
 */
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute GraphQL query with retry logic and rate limiting
 */
async function executeGraphQLWithRetry<T>(
  url: string,
  headers: Record<string, string>,
  query: string,
  retries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Rate limiting: wait before each request (except first)
      if (attempt > 0) {
        const retryDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`  ⏳ Retry ${attempt}/${retries - 1} after ${retryDelay}ms...`);
        await sleep(retryDelay);
      } else {
        await sleep(RATE_LIMIT_DELAY_MS);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ query }),
      });

      // Handle HTTP errors
      if (!response.ok) {
        const errorText = await response.text();
        
        // Retry on rate limit (429) or server errors (5xx)
        if (response.status === 429 || response.status >= 500) {
          lastError = new Error(`HTTP ${response.status}: ${errorText}`);
          console.warn(`  ⚠️  Retryable error (attempt ${attempt + 1}/${retries}): ${lastError.message}`);
          continue;
        }
        
        // Don't retry on auth errors (401, 403)
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Authentication error (${response.status}): ${errorText}. Check your API token/access token.`);
        }
        
        throw new Error(`Shopify API error (${response.status}): ${errorText}`);
      }

      // Parse GraphQL response
      const result = await response.json() as GraphQLResponse<T>;

      // Check for GraphQL errors
      if (result.errors && result.errors.length > 0) {
        const errorMessages = result.errors.map(err => {
          const location = err.locations ? ` at line ${err.locations[0].line}:${err.locations[0].column}` : '';
          const path = err.path ? ` (path: ${err.path.join('.')})` : '';
          return `${err.message}${location}${path}`;
        }).join('; ');
        
        throw new Error(`GraphQL errors: ${errorMessages}`);
      }

      if (!result.data) {
        throw new Error('GraphQL response missing data field');
      }

      return result.data;
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on GraphQL errors or auth errors
      if (error instanceof Error && (
        error.message.includes('GraphQL errors') ||
        error.message.includes('Authentication error')
      )) {
        throw error;
      }
      
      // Continue to retry on network/timeout errors
      if (attempt === retries - 1) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('GraphQL request failed after retries');
}

/**
 * Fetch shop policies from Shopify (shipping, refund, privacy, etc.)
 */
async function fetchShopPolicies(
  shopDomain: string,
  storefrontToken: string
): Promise<DocumentToIndex[]> {
  console.log(`  📡 Fetching from: https://${shopDomain}/api/${SHOPIFY_API_VERSION}/graphql.json`);
  
  const query = `
    {
      shop {
        privacyPolicy { body title url }
        refundPolicy { body title url }
        shippingPolicy { body title url }
        termsOfService { body title url }
      }
    }
  `;

  const data = await executeGraphQLWithRetry<{
    shop?: Record<string, { body: string; title: string; url: string } | null>;
  }>(
    `https://${shopDomain}/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      'X-Shopify-Storefront-Access-Token': storefrontToken,
    },
    query
  );

  const docs: DocumentToIndex[] = [];
  const policies = data.shop || {};

  for (const [key, policy] of Object.entries(policies)) {
    if (policy && policy.body) {
      docs.push({
        id: `policy_${key}`,
        text: `${policy.title}\n\n${policy.body}`,
        metadata: {
          type: 'policy',
          title: policy.title,
          url: policy.url,
        },
      });
    }
  }

  return docs;
}

/**
 * Fetch products from Shopify Storefront API
 */
async function fetchProducts(
  shopDomain: string,
  storefrontToken: string,
  limit: number = 100
): Promise<DocumentToIndex[]> {
  console.log(`  📡 Fetching from: https://${shopDomain}/api/${SHOPIFY_API_VERSION}/graphql.json`);
  
  const query = `
    {
      products(first: ${limit}) {
        edges {
          node {
            id
            title
            description
            productType
            vendor
            tags
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  price {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await executeGraphQLWithRetry<{
    products?: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          description: string;
          productType: string;
          vendor: string;
          tags: string[];
          variants: {
            edges: Array<{
              node: { id: string; title: string; price: { amount: string; currencyCode: string } };
            }>;
          };
        };
      }>;
    };
  }>(
    `https://${shopDomain}/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      'X-Shopify-Storefront-Access-Token': storefrontToken,
    },
    query
  );

  const docs: DocumentToIndex[] = [];
  const products = data.products?.edges || [];

  for (const { node: product } of products) {
    const variants = product.variants.edges.map(v => v.node);
    const mainVariant = variants[0];
    const price = mainVariant
      ? `${mainVariant.price.amount} ${mainVariant.price.currencyCode}`
      : 'Cena niedostępna';

    const text = `${product.title}\n\nOpis: ${product.description}\nTyp: ${product.productType}\nProducent: ${product.vendor}\nTagi: ${product.tags.join(', ')}\nCena: ${price}`;

    docs.push({
      id: `product_${product.id}`,
      text,
      metadata: {
        type: 'product',
        title: product.title,
        price,
        gid: product.id,
      },
    });
  }

  return docs;
}

/**
 * Fetch products with metafields from Shopify Admin API
 * Requires Admin API token with read_products and read_metafields scopes
 */
async function fetchProductsWithMetafields(
  shopDomain: string,
  adminToken: string,
  limit: number = 50
): Promise<DocumentToIndex[]> {
  console.log(`  📡 Fetching from Admin API: https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`);
  
  const query = `
    {
      products(first: ${limit}) {
        edges {
          node {
            id
            title
            description
            productType
            vendor
            tags
            metafields(first: 10) {
              edges {
                node {
                  namespace
                  key
                  value
                  type
                }
              }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  price
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await executeGraphQLWithRetry<{
    products?: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          description: string;
          productType: string;
          vendor: string;
          tags: string[];
          metafields?: {
            edges: Array<{
              node: {
                namespace: string;
                key: string;
                value: string;
                type: string;
              };
            }>;
          };
          variants: {
            edges: Array<{
              node: { id: string; title: string; price: string };
            }>;
          };
        };
      }>;
    };
  }>(
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      'X-Shopify-Access-Token': adminToken,
    },
    query
  );

  const docs: DocumentToIndex[] = [];
  const products = data.products?.edges || [];

  for (const { node: product } of products) {
    const variants = product.variants.edges.map(v => v.node);
    const mainVariant = variants[0];
    const price = mainVariant ? mainVariant.price : 'Cena niedostępna';

    // Extract metafields
    const metafields = product.metafields?.edges.map(e => e.node) || [];
    const metafieldText = metafields.length > 0
      ? '\nMetafields: ' + metafields.map(m => `${m.namespace}.${m.key}=${m.value}`).join(', ')
      : '';

    const text = `${product.title}\n\nOpis: ${product.description}\nTyp: ${product.productType}\nProducent: ${product.vendor}\nTagi: ${product.tags.join(', ')}\nCena: ${price}${metafieldText}`;

    docs.push({
      id: `product_${product.id}`,
      text,
      metadata: {
        type: 'product',
        title: product.title,
        price,
        gid: product.id,
      },
    });
  }

  return docs;
}

/**
 * Load FAQs from local file (if exists)
 */
function loadLocalFaqs(): DocumentToIndex[] {
  const faqPath = path.join(__dirname, '../data/faqs.json');
  if (!fs.existsSync(faqPath)) {
    console.log('No local FAQs file found, skipping...');
    return [];
  }

  const faqs = JSON.parse(fs.readFileSync(faqPath, 'utf-8')) as Array<{
    id: string;
    question: string;
    answer: string;
  }>;

  return faqs.map(faq => ({
    id: `faq_${faq.id}`,
    text: `Q: ${faq.question}\nA: ${faq.answer}`,
    metadata: {
      type: 'faq' as const,
      title: faq.question,
    },
  }));
}

/**
 * Generate embedding for text using Workers AI (or external API)
 * TODO: Replace with actual embedding API call
 */
async function generateEmbedding(text: string): Promise<number[]> {
  // Placeholder: Return dummy embedding
  // In production, use Workers AI text-embeddings model or OpenAI embeddings API
  console.warn('Using dummy embeddings - implement actual embedding generation');
  
  // Dummy 384-dimensional embedding (common size)
  const dim = 384;
  return Array.from({ length: dim }, () => Math.random());
}

/**
 * Insert vectors into Cloudflare Vectorize
 */
async function insertVectors(
  vectors: VectorizeVector[],
  accountId: string,
  apiToken: string,
  indexName: string
): Promise<void> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/indexes/${indexName}/insert`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ vectors }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vectorize API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  console.log('Insert result:', result);
}

/**
 * Main function
 */
async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const indexName = process.env.VECTORIZE_INDEX_NAME || 'autorag-epir-chatbot-rag';
  const shopDomain = process.env.SHOP_DOMAIN;
  const storefrontToken = process.env.SHOPIFY_STOREFRONT_TOKEN;
  const adminToken = process.env.SHOPIFY_ADMIN_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  }

  console.log('🚀 Starting Vectorize population...');
  console.log(`📍 Using Shopify API version: ${SHOPIFY_API_VERSION}`);
  console.log(`⚙️  Rate limit: ${RATE_LIMIT_DELAY_MS}ms between requests`);
  console.log(`🔄 Max retries: ${MAX_RETRIES} with exponential backoff\n`);

  // Collect all documents
  const allDocs: DocumentToIndex[] = [];

  // 1. Fetch shop policies
  if (shopDomain && storefrontToken) {
    console.log('📄 Fetching shop policies...');
    try {
      const policies = await fetchShopPolicies(shopDomain, storefrontToken);
      allDocs.push(...policies);
      console.log(`  ✓ Fetched ${policies.length} policies`);
    } catch (error) {
      console.error(`  ✗ Failed to fetch policies:`, error instanceof Error ? error.message : error);
    }
  }

  // 2. Fetch products (try Admin API first for metafields, fallback to Storefront)
  if (shopDomain) {
    console.log('🛍️  Fetching products...');
    
    if (adminToken) {
      console.log('  → Using Admin API (with metafields support)');
      try {
        const products = await fetchProductsWithMetafields(shopDomain, adminToken);
        allDocs.push(...products);
        console.log(`  ✓ Fetched ${products.length} products with metafields`);
      } catch (error) {
        console.error(`  ✗ Admin API failed:`, error instanceof Error ? error.message : error);
        
        // Fallback to Storefront API
        if (storefrontToken) {
          console.log('  → Falling back to Storefront API');
          try {
            const products = await fetchProducts(shopDomain, storefrontToken);
            allDocs.push(...products);
            console.log(`  ✓ Fetched ${products.length} products`);
          } catch (fallbackError) {
            console.error(`  ✗ Storefront API also failed:`, fallbackError instanceof Error ? fallbackError.message : fallbackError);
          }
        }
      }
    } else if (storefrontToken) {
      console.log('  → Using Storefront API (no Admin token provided)');
      try {
        const products = await fetchProducts(shopDomain, storefrontToken);
        allDocs.push(...products);
        console.log(`  ✓ Fetched ${products.length} products`);
      } catch (error) {
        console.error(`  ✗ Failed to fetch products:`, error instanceof Error ? error.message : error);
      }
    } else {
      console.log('  ⚠️  No Shopify tokens provided, skipping products');
    }
  }

  // 3. Load local FAQs
  console.log('❓ Loading FAQs...');
  const faqs = loadLocalFaqs();
  allDocs.push(...faqs);
  console.log(`  ✓ Loaded ${faqs.length} FAQs`);

  console.log(`\n📊 Total documents: ${allDocs.length}`);

  if (allDocs.length === 0) {
    console.log('⚠️  No documents to index. Exiting.');
    return;
  }

  // 4. Generate embeddings and create vectors
  console.log('\n🧮 Generating embeddings...');
  const vectors: VectorizeVector[] = [];

  for (const doc of allDocs) {
    const embedding = await generateEmbedding(doc.text);
    vectors.push({
      id: doc.id,
      values: embedding,
      metadata: {
        text: doc.text.slice(0, 500), // Store truncated text in metadata
        ...doc.metadata,
      },
    });
  }

  console.log(`  ✓ Generated ${vectors.length} embeddings`);

  // 5. Insert vectors in batches (Vectorize API limit: 1000 per request)
  console.log('\n📤 Inserting vectors into Vectorize...');
  const batchSize = 100;
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    console.log(`  Inserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vectors.length / batchSize)}...`);
    await insertVectors(batch, accountId, apiToken, indexName);
  }

  console.log('\n✅ Done! Vectorize index populated successfully.');
  console.log(`\n📈 Summary:`);
  console.log(`   - Total vectors indexed: ${vectors.length}`);
  console.log(`   - API version used: ${SHOPIFY_API_VERSION}`);
  console.log(`   - Rate limiting: ${RATE_LIMIT_DELAY_MS}ms per request`);
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}

export { main as populateVectorize };

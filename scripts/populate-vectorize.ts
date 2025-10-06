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
 *   - SHOP_DOMAIN: Shop domain (e.g., epir-art-silver-jewellery.myshopify.com)
 */

import * as fs from 'fs';
import * as path from 'path';

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

/**
 * Fetch shop policies from Shopify (shipping, refund, privacy, etc.)
 */
async function fetchShopPolicies(
  shopDomain: string,
  storefrontToken: string
): Promise<DocumentToIndex[]> {
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

  const response = await fetch(`https://${shopDomain}/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': storefrontToken,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  const data = await response.json() as {
    data?: {
      shop?: Record<string, { body: string; title: string; url: string } | null>;
    };
  };

  const docs: DocumentToIndex[] = [];
  const policies = data.data?.shop || {};

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

  const response = await fetch(`https://${shopDomain}/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': storefrontToken,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  const data = await response.json() as {
    data?: {
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
    };
  };

  const docs: DocumentToIndex[] = [];
  const products = data.data?.products?.edges || [];

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

  if (!accountId || !apiToken) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  }

  console.log('🚀 Starting Vectorize population...');

  // Collect all documents
  const allDocs: DocumentToIndex[] = [];

  // 1. Fetch shop policies
  if (shopDomain && storefrontToken) {
    console.log('📄 Fetching shop policies...');
    const policies = await fetchShopPolicies(shopDomain, storefrontToken);
    allDocs.push(...policies);
    console.log(`  ✓ Fetched ${policies.length} policies`);
  }

  // 2. Fetch products
  if (shopDomain && storefrontToken) {
    console.log('🛍️  Fetching products...');
    const products = await fetchProducts(shopDomain, storefrontToken);
    allDocs.push(...products);
    console.log(`  ✓ Fetched ${products.length} products`);
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
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}

export { main as populateVectorize };

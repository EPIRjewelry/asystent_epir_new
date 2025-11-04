#!/usr/bin/env node
/**
 * RAG Ingest Script - Populate vector index with shop data
 * 
 * This script fetches products, FAQs, and policies from Shopify,
 * generates embeddings, and upserts them to the Cloudflare Vectorize index.
 * 
 * Usage:
 *   npx tsx worker/scripts/ingest.ts --source=products --batch-size=50
 *   npx tsx worker/scripts/ingest.ts --source=faq --dry-run
 *   npx tsx worker/scripts/ingest.ts --source=policies
 * 
 * Environment variables required:
 *   - CLOUDFLARE_ACCOUNT_ID: Cloudflare account ID
 *   - CLOUDFLARE_API_TOKEN: API token with Workers/Vectorize permissions
 *   - VECTORIZE_INDEX_NAME: Name of the vector index (default: autorag-epir-chatbot-rag)
 *   - SHOP_DOMAIN: Shopify shop domain (e.g., shop.myshopify.com)
 *   - SHOPIFY_STOREFRONT_TOKEN: Shopify Storefront API token
 *   - SHOPIFY_ADMIN_TOKEN: (optional) Shopify Admin API token for metafields
 * 
 * Options:
 *   --source=<type>       Source type: products|faq|policies (default: all)
 *   --batch-size=<n>      Batch size for processing (default: 50)
 *   --dry-run             Preview documents without upserting
 */

import * as fs from 'fs';
import * as path from 'path';

// Parse command-line arguments
const args = process.argv.slice(2);
const options = {
  source: 'all' as 'products' | 'faq' | 'policies' | 'all',
  batchSize: 50,
  dryRun: false,
};

for (const arg of args) {
  if (arg.startsWith('--source=')) {
    const value = arg.split('=')[1] as typeof options.source;
    if (['products', 'faq', 'policies', 'all'].includes(value)) {
      options.source = value;
    }
  } else if (arg.startsWith('--batch-size=')) {
    options.batchSize = parseInt(arg.split('=')[1], 10) || 50;
  } else if (arg === '--dry-run') {
    options.dryRun = true;
  }
}

// Environment configuration
const config = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
  apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
  indexName: process.env.VECTORIZE_INDEX_NAME || 'autorag-epir-chatbot-rag',
  shopDomain: process.env.SHOP_DOMAIN || '',
  storefrontToken: process.env.SHOPIFY_STOREFRONT_TOKEN || '',
  adminToken: process.env.SHOPIFY_ADMIN_TOKEN || '',
};

interface DocumentToIngest {
  id: string;
  source: string;
  text: string;
  metadata?: Record<string, any>;
}

interface ShopifyProduct {
  id: string;
  title: string;
  description: string;
  productType: string;
  vendor: string;
  tags: string[];
  priceRange?: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
}

interface ShopPolicy {
  id: string;
  title: string;
  body: string;
  url?: string;
}

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

/**
 * Fetch products from Shopify Storefront API
 */
async function fetchProducts(): Promise<DocumentToIngest[]> {
  if (!config.shopDomain || !config.storefrontToken) {
    console.log('⚠️  Missing SHOP_DOMAIN or SHOPIFY_STOREFRONT_TOKEN, skipping products');
    return [];
  }

  console.log('📦 Fetching products from Shopify...');

  const query = `
    query {
      products(first: 100) {
        edges {
          node {
            id
            title
            description
            productType
            vendor
            tags
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(`https://${config.shopDomain}/api/${process.env.SHOPIFY_API_VERSION || '2024-10'}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': config.storefrontToken,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as any;
    const products = result.data?.products?.edges?.map((e: any) => e.node) || [];

    const docs: DocumentToIngest[] = products.map((product: ShopifyProduct) => {
      const price = product.priceRange?.minVariantPrice
        ? `${product.priceRange.minVariantPrice.amount} ${product.priceRange.minVariantPrice.currencyCode}`
        : 'Price not available';

      const text = `${product.title}\n\nOpis: ${product.description || 'Brak opisu'}\nTyp: ${product.productType}\nProducent: ${product.vendor}\nTagi: ${product.tags.join(', ')}\nCena: ${price}`;

      return {
        id: `product_${product.id.replace('gid://shopify/Product/', '')}`,
        source: 'products',
        text,
        metadata: {
          type: 'product',
          title: product.title,
          price,
          gid: product.id,
        },
      };
    });

    console.log(`  ✓ Fetched ${docs.length} products`);
    return docs;
  } catch (error) {
    console.error('  ✗ Failed to fetch products:', error);
    return [];
  }
}

/**
 * Fetch shop policies from Shopify
 */
async function fetchPolicies(): Promise<DocumentToIngest[]> {
  if (!config.shopDomain || !config.storefrontToken) {
    console.log('⚠️  Missing SHOP_DOMAIN or SHOPIFY_STOREFRONT_TOKEN, skipping policies');
    return [];
  }

  console.log('📄 Fetching shop policies...');

  const query = `
    query {
      shop {
        privacyPolicy { id title body url }
        refundPolicy { id title body url }
        shippingPolicy { id title body url }
        termsOfService { id title body url }
      }
    }
  `;

  try {
    const response = await fetch(`https://${config.shopDomain}/api/${process.env.SHOPIFY_API_VERSION || '2024-10'}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': config.storefrontToken,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as any;
    const shop = result.data?.shop || {};

    const policyTypes = ['privacyPolicy', 'refundPolicy', 'shippingPolicy', 'termsOfService'];
    const docs: DocumentToIngest[] = [];

    for (const policyType of policyTypes) {
      const policy = shop[policyType];
      if (policy && policy.body) {
        docs.push({
          id: `policy_${policyType}`,
          source: 'policies',
          text: `${policy.title}\n\n${policy.body}`,
          metadata: {
            type: 'policy',
            title: policy.title,
            url: policy.url || '',
          },
        });
      }
    }

    console.log(`  ✓ Fetched ${docs.length} policies`);
    return docs;
  } catch (error) {
    console.error('  ✗ Failed to fetch policies:', error);
    return [];
  }
}

/**
 * Load FAQs from local JSON file
 */
function loadFAQs(): DocumentToIngest[] {
  const faqPath = path.join(__dirname, '../../data/faqs.json');
  
  if (!fs.existsSync(faqPath)) {
    console.log('ℹ️  No local FAQs file found at data/faqs.json');
    console.log('   You can create one with the following format:');
    console.log('   [{"id": "1", "question": "...", "answer": "...", "category": "..."}]');
    return [];
  }

  console.log('❓ Loading FAQs from local file...');

  try {
    const faqs = JSON.parse(fs.readFileSync(faqPath, 'utf-8')) as FAQ[];
    const docs: DocumentToIngest[] = faqs.map(faq => ({
      id: `faq_${faq.id}`,
      source: 'faq',
      text: `Q: ${faq.question}\nA: ${faq.answer}`,
      metadata: {
        type: 'faq',
        category: faq.category || 'general',
        question: faq.question,
      },
    }));

    console.log(`  ✓ Loaded ${docs.length} FAQs`);
    return docs;
  } catch (error) {
    console.error('  ✗ Failed to load FAQs:', error);
    return [];
  }
}

/**
 * Generate embedding using Workers AI REST API
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!config.accountId || !config.apiToken) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/@cf/baai/bge-base-en-v1.5`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: [text] }),
    }
  );

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json() as any;
  return result.result?.data?.[0] || result.data?.[0] || [];
}

/**
 * Upsert vectors to Cloudflare Vectorize
 */
async function upsertVectors(vectors: Array<{ id: string; values: number[]; metadata?: any }>): Promise<void> {
  if (!config.accountId || !config.apiToken) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/vectorize/v2/indexes/${config.indexName}/upsert`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ vectors }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vectorize upsert error: ${response.status} ${response.statusText}\n${errorText}`);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 RAG Ingest Script');
  console.log('====================\n');
  console.log(`Source: ${options.source}`);
  console.log(`Batch size: ${options.batchSize}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');

  // Validate configuration
  if (!options.dryRun && (!config.accountId || !config.apiToken)) {
    console.error('❌ Missing required environment variables:');
    console.error('   - CLOUDFLARE_ACCOUNT_ID');
    console.error('   - CLOUDFLARE_API_TOKEN');
    process.exit(1);
  }

  // Collect documents
  const allDocs: DocumentToIngest[] = [];

  if (options.source === 'all' || options.source === 'products') {
    const products = await fetchProducts();
    allDocs.push(...products);
  }

  if (options.source === 'all' || options.source === 'policies') {
    const policies = await fetchPolicies();
    allDocs.push(...policies);
  }

  if (options.source === 'all' || options.source === 'faq') {
    const faqs = loadFAQs();
    allDocs.push(...faqs);
  }

  console.log(`\n📊 Total documents: ${allDocs.length}\n`);

  if (allDocs.length === 0) {
    console.log('⚠️  No documents to process. Exiting.');
    process.exit(0);
  }

  // Preview mode
  if (options.dryRun) {
    console.log('🔍 DRY RUN - Preview of documents:\n');
    allDocs.slice(0, 3).forEach((doc, idx) => {
      console.log(`[${idx + 1}] ${doc.id}`);
      console.log(`    Source: ${doc.source}`);
      console.log(`    Text: ${doc.text.substring(0, 100)}...`);
      console.log('');
    });
    console.log(`... and ${allDocs.length - 3} more documents\n`);
    console.log('✓ Dry run complete. Remove --dry-run to actually upsert.');
    return;
  }

  // Generate embeddings and upsert
  console.log('🧮 Generating embeddings and upserting...\n');

  const vectors = [];
  for (let i = 0; i < allDocs.length; i++) {
    const doc = allDocs[i];
    
    try {
      const embedding = await generateEmbedding(doc.text);
      vectors.push({
        id: doc.id,
        values: embedding,
        metadata: {
          source: doc.source,
          text: doc.text.slice(0, 500), // Truncated text
          ...doc.metadata,
        },
      });

      process.stdout.write(`\r  Progress: ${i + 1}/${allDocs.length} embeddings generated`);
    } catch (error) {
      console.error(`\n  ✗ Failed to generate embedding for ${doc.id}:`, error);
    }
  }
  console.log('\n');

  // Upsert in batches
  for (let i = 0; i < vectors.length; i += options.batchSize) {
    const batch = vectors.slice(i, i + options.batchSize);
    const batchNum = Math.floor(i / options.batchSize) + 1;
    const totalBatches = Math.ceil(vectors.length / options.batchSize);

    try {
      await upsertVectors(batch);
      console.log(`  ✓ Upserted batch ${batchNum}/${totalBatches} (${batch.length} vectors)`);
    } catch (error) {
      console.error(`  ✗ Failed to upsert batch ${batchNum}:`, error);
    }
  }

  console.log('\n✅ Ingest complete!\n');
  console.log(`📈 Summary:`);
  console.log(`   - Total documents processed: ${allDocs.length}`);
  console.log(`   - Vectors generated: ${vectors.length}`);
  console.log(`   - Index name: ${config.indexName}`);
}

// Run the script
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

# Worker Scripts

This directory contains utility scripts for the worker.

## Scripts

### 1. Encoding Conversion & BOM Removal (`remove-bom.ts`)

Safely converts files to UTF-8 encoding and removes BOM (Byte Order Mark). Designed to fix "Unexpected \xff" (UTF-16 / bad encoding) build errors in Cloudflare Workers.

**Usage:**

```bash
# Preview changes (dry-run, default)
npx tsx worker/scripts/remove-bom.ts --dry-run

# Apply conversions with backups
npx tsx worker/scripts/remove-bom.ts --apply

# Check specific directory
npx tsx worker/scripts/remove-bom.ts --dir=worker/src

# Check specific file
npx tsx worker/scripts/remove-bom.ts --file=worker/src/index.ts

# Custom extensions
npx tsx worker/scripts/remove-bom.ts --extensions=.ts,.tsx,.js

# Ignore patterns
npx tsx worker/scripts/remove-bom.ts --ignore=node_modules,.git,.wrangler
```

**Options:**

- `--dry-run` - Preview changes without applying (default)
- `--apply` - Apply conversions and create timestamped backups
- `--dir=<path>` - Directory to scan (default: worker)
- `--file=<path>` - Single file to process
- `--extensions=<list>` - Comma-separated file extensions (default: .ts,.tsx,.js,.jsx)
- `--ignore=<patterns>` - Comma-separated ignore patterns (default: node_modules,.git,.wrangler,dist,build)
- `--force` - Skip confirmation prompts

**Output:**

- Generates `encoding-report.json` with details of all files checked
- Creates timestamped backups: `file.bak.YYYYMMDD_HHMMSS`
- Idempotent: safe to run multiple times

**Features:**

- Detects UTF-8, UTF-16LE, UTF-16BE encodings
- Detects and removes BOM from UTF-8 files
- Converts UTF-16 files to UTF-8
- Creates timestamped backups before any changes
- Generates detailed JSON report
- Dry-run mode by default for safety

### 2. RAG Ingest Script (`ingest.ts`)

This script populates the Cloudflare Vectorize index with shop data (products, FAQs, and policies).

## Prerequisites

- Node.js installed
- TypeScript execution runtime (tsx or ts-node)
- Required environment variables configured

## Environment Variables

```bash
# Required
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token

# Optional
VECTORIZE_INDEX_NAME=autorag-epir-chatbot-rag  # default value
SHOP_DOMAIN=your-shop.myshopify.com
SHOPIFY_STOREFRONT_TOKEN=your_storefront_token
SHOPIFY_ADMIN_TOKEN=your_admin_token  # optional, for metafields
SHOPIFY_API_VERSION=2024-10  # optional, defaults to 2024-10
```

## Installation

```bash
# Install tsx globally (if not already installed)
npm install -g tsx
```

## Usage

### Basic Usage - Ingest All Sources

```bash
npx tsx worker/scripts/ingest.ts
```

### Ingest Specific Source

```bash
# Ingest only products
npx tsx worker/scripts/ingest.ts --source=products

# Ingest only FAQs
npx tsx worker/scripts/ingest.ts --source=faq

# Ingest only policies
npx tsx worker/scripts/ingest.ts --source=policies
```

### Dry Run (Preview Documents)

```bash
# Preview documents without actually upserting
npx tsx worker/scripts/ingest.ts --dry-run

# Preview specific source
npx tsx worker/scripts/ingest.ts --source=products --dry-run
```

### Custom Batch Size

```bash
# Process in smaller batches (default is 50)
npx tsx worker/scripts/ingest.ts --batch-size=25
```

### Combined Options

```bash
npx tsx worker/scripts/ingest.ts --source=products --batch-size=100
```

## FAQs Data Format

If you want to ingest FAQs, create a file at `data/faqs.json` with the following format:

```json
[
  {
    "id": "1",
    "question": "What is your return policy?",
    "answer": "We offer 30-day returns on all items...",
    "category": "returns"
  },
  {
    "id": "2",
    "question": "Do you ship internationally?",
    "answer": "Yes, we ship to over 50 countries...",
    "category": "shipping"
  }
]
```

## Output

The script will:
1. Fetch data from configured sources
2. Generate embeddings using Workers AI
3. Upsert vectors to Cloudflare Vectorize in batches
4. Display progress and summary

Example output:
```
🚀 RAG Ingest Script
====================

Source: all
Batch size: 50
Dry run: false

📦 Fetching products from Shopify...
  ✓ Fetched 45 products
📄 Fetching shop policies...
  ✓ Fetched 4 policies
❓ Loading FAQs from local file...
  ✓ Loaded 12 FAQs

📊 Total documents: 61

🧮 Generating embeddings and upserting...

  Progress: 61/61 embeddings generated

  ✓ Upserted batch 1/2 (50 vectors)
  ✓ Upserted batch 2/2 (11 vectors)

✅ Ingest complete!

📈 Summary:
   - Total documents processed: 61
   - Vectors generated: 61
   - Index name: autorag-epir-chatbot-rag
```

## Troubleshooting

### Error: Missing environment variables
Ensure all required environment variables are set.

### Error: Shopify API error
Check that your Shopify tokens are valid and have the correct permissions.

### Error: Vectorize upsert error
Verify that your Cloudflare account has access to Vectorize and the index exists.

## Creating the Vectorize Index

If the index doesn't exist, create it using Wrangler:

```bash
wrangler vectorize create autorag-epir-chatbot-rag --dimensions=768 --metric=cosine
```

Note: Use dimensions matching your embedding model (e.g., 768 for bge-base-en-v1.5).

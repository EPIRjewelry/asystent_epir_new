# GraphQL Integration - Troubleshooting Guide

## Quick Diagnostics

### Test GraphQL Connection

#### 1. Test Storefront API
```bash
curl -X POST \
  https://epir-art-silver-jewellery.myshopify.com/api/2024-10/graphql.json \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Storefront-Access-Token: YOUR_TOKEN" \
  -d '{"query": "{ shop { name } }"}'
```

**Expected Response:**
```json
{
  "data": {
    "shop": {
      "name": "EPIR ART SILVER JEWELLERY"
    }
  }
}
```

#### 2. Test Admin API
```bash
curl -X POST \
  https://epir-art-silver-jewellery.myshopify.com/admin/api/2024-10/graphql.json \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: YOUR_ADMIN_TOKEN" \
  -d '{"query": "{ shop { name email } }"}'
```

**Expected Response:**
```json
{
  "data": {
    "shop": {
      "name": "EPIR ART SILVER JEWELLERY",
      "email": "contact@epir.pl"
    }
  }
}
```

## Common Errors & Solutions

### Error: "Authentication error (401): Invalid access token"

**Cause**: Token is invalid, expired, or not set

**Solution**:
1. Regenerate token in Shopify Admin:
   - Apps → Develop apps → Select app → API credentials
   - For Storefront: Create new Storefront access token
   - For Admin: Install app again to get new Admin token

2. Set in Worker secrets:
```bash
cd worker
wrangler secret put SHOPIFY_STOREFRONT_TOKEN
# Or
wrangler secret put SHOPIFY_ADMIN_TOKEN
```

3. Verify secrets are set:
```bash
wrangler secret list
```

### Error: "Authentication error (403): Insufficient scopes"

**Cause**: Admin API token missing required scopes

**Solution**:
1. Go to Shopify Admin → Apps → Develop apps → Your app
2. Configuration → Admin API scopes
3. Enable:
   - ✅ `read_products`
   - ✅ `read_metafields` (for metafields support)
4. Save and **reinstall the app**
5. Get new Admin API token from API credentials

### Error: "GraphQL errors: Field 'X' doesn't exist on type 'Y'"

**Cause**: Using deprecated field or wrong API version

**Solution**:
1. Check you're using API version 2024-10:
```typescript
const SHOPIFY_API_VERSION = '2024-10';
```

2. Verify field exists in [Shopify GraphQL docs](https://shopify.dev/docs/api/admin-graphql)

3. Common deprecated fields (2024-01 → 2024-10):
   - `presentmentPrices` → Use `price` directly
   - Some metafield types changed

### Error: "HTTP 429: Rate limit exceeded"

**Cause**: Too many requests to Shopify API

**Solution**:
✅ Script automatically retries with exponential backoff!

Check retry is working:
```bash
# In populate script logs, you should see:
# ⏳ Retry 1/3 after 1000ms...
# ⏳ Retry 2/3 after 2000ms...
```

If still failing:
1. Increase rate limit delay in script:
```typescript
const RATE_LIMIT_DELAY_MS = 200; // Increase from 100ms
```

2. Reduce batch size:
```typescript
const batchSize = 50; // Reduce from 100
```

### Error: "GraphQL response missing data field"

**Cause**: API returned neither data nor errors (rare)

**Solution**:
1. Check if shop domain is correct
2. Verify network connectivity
3. Check Shopify status: https://www.shopifystatus.com/

### Error: "Metafields not returned" (Admin API)

**Cause**: 
- Missing `read_metafields` scope
- Metafield doesn't exist
- Wrong namespace/key

**Solution**:
1. Verify scope in Admin:
   - Apps → Develop apps → Configuration
   - Ensure `read_metafields` is checked

2. Check metafield exists:
```graphql
{
  products(first: 1, query: "id:YOUR_PRODUCT_ID") {
    edges {
      node {
        id
        metafields(first: 20) {
          edges {
            node {
              namespace
              key
              value
            }
          }
        }
      }
    }
  }
}
```

3. If using namespace filter, try without:
```typescript
// Instead of:
metafields(namespace: "custom", first: 20)

// Use:
metafields(first: 20)
```

### Error: "Network request failed" / Timeout

**Cause**: Network issue or Shopify downtime

**Solution**:
✅ Script automatically retries 3x!

Check logs for retry attempts. If all retries fail:
1. Check internet connection
2. Check Shopify status: https://www.shopifystatus.com/
3. Increase timeout (not available in fetch, but retries should cover it)

### Populate Script Errors

#### "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN"

**Solution**:
```bash
export CLOUDFLARE_ACCOUNT_ID="your_account_id"
export CLOUDFLARE_API_TOKEN="your_api_token"
```

Get from:
- Account ID: Cloudflare Dashboard → Right sidebar
- API Token: My Profile → API Tokens → Create Token (Vectorize permissions)

#### "No documents to index"

**Cause**: 
- No Shopify tokens provided
- Shop domain incorrect
- FAQs file missing

**Solution**:
1. Check tokens are set:
```bash
echo $SHOPIFY_STOREFRONT_TOKEN
echo $SHOP_DOMAIN
```

2. Verify shop domain format:
```bash
# Correct:
export SHOP_DOMAIN="epir-art-silver-jewellery.myshopify.com"

# Wrong (no https):
export SHOP_DOMAIN="https://epir-art-silver-jewellery.myshopify.com"
```

3. Check FAQs file exists:
```bash
ls -la worker/data/faqs.json
```

## Debugging Tips

### Enable Verbose Logging

In `worker/src/graphql.ts`, add logging:
```typescript
console.log('[GraphQL] Request URL:', url);
console.log('[GraphQL] Headers:', headers);
console.log('[GraphQL] Query:', query);
console.log('[GraphQL] Response:', result);
```

### Check Wrangler Logs

```bash
cd worker
wrangler tail
```

Look for:
- `[GraphQL] Retry X/Y after Zms...` → Retries working
- `[GraphQL] Retryable error (attempt X/Y): ...` → Error details
- `GraphQL errors: ...` → Query errors

### Test Locally

```bash
cd worker
wrangler dev

# In another terminal:
curl -X POST http://localhost:8787/apps/assistant/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Find silver rings", "stream": false}'
```

### Verify Environment Variables

```bash
cd worker

# List secrets
wrangler secret list

# Check wrangler.toml vars
cat wrangler.toml | grep -A 5 "\[vars\]"
```

## Performance Optimization

### Reduce API Calls

1. **Batch requests**: Fetch multiple products in one query:
```graphql
{
  products(first: 50) { # Instead of multiple calls for 10 each
    edges {
      node {
        id
        title
      }
    }
  }
}
```

2. **Use pagination cursor** (for large catalogs):
```graphql
query GetProducts($cursor: String) {
  products(first: 50, after: $cursor) {
    edges {
      node {
        id
        title
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

3. **Cache results** in KV (for worker):
```typescript
const cacheKey = `products:${query}`;
const cached = await env.SESSIONS_KV.get(cacheKey, 'json');
if (cached) return cached;

// Fetch from API...
await env.SESSIONS_KV.put(cacheKey, JSON.stringify(result), { 
  expirationTtl: 3600 // 1 hour
});
```

### Monitor Rate Limits

Track API calls in worker:
```typescript
let apiCallCount = 0;
const startTime = Date.now();

// After each call:
apiCallCount++;
console.log(`API calls: ${apiCallCount}, Elapsed: ${Date.now() - startTime}ms`);
```

## Testing Checklist

Before deploying:

- [ ] Test Storefront API connection
- [ ] Test Admin API connection (if using)
- [ ] Verify token scopes
- [ ] Run populate script with sample data
- [ ] Check Vectorize has vectors
- [ ] Test product search in worker
- [ ] Test FAQ search in worker
- [ ] Verify retry logic with intentional 429 error
- [ ] Check logs for errors

## Quick Fixes

### Reset Everything

```bash
# Delete and recreate secrets
cd worker
wrangler secret delete SHOPIFY_STOREFRONT_TOKEN
wrangler secret delete SHOPIFY_ADMIN_TOKEN
wrangler secret put SHOPIFY_STOREFRONT_TOKEN
wrangler secret put SHOPIFY_ADMIN_TOKEN

# Clear Vectorize index
wrangler vectorize delete autorag-epir-chatbot-rag
wrangler vectorize create autorag-epir-chatbot-rag --dimensions=384 --metric=cosine

# Re-populate
cd ..
node scripts/populate-vectorize.ts
```

### Verify Deployment

```bash
# Deploy worker
cd worker
wrangler deploy

# Test endpoint
curl https://epir-art-jewellery-worker.YOUR_SUBDOMAIN.workers.dev/health

# Check if RAG works
curl -X POST https://epir-art-jewellery-worker.YOUR_SUBDOMAIN.workers.dev/apps/assistant/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is your return policy?", "stream": false}'
```

## Support Resources

- **Shopify GraphQL Docs**: https://shopify.dev/docs/api/admin-graphql
- **Shopify API Status**: https://www.shopifystatus.com/
- **Cloudflare Vectorize**: https://developers.cloudflare.com/vectorize/
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/

## Success Indicators

✅ All working correctly when you see:

**In populate script:**
```
✓ Fetched 4 policies
✓ Fetched 50 products with metafields
✓ Loaded 10 FAQs
✅ Done! Vectorize index populated successfully.
```

**In worker logs:**
```
[GraphQL] Request URL: https://epir-art-silver-jewellery.myshopify.com/api/2024-10/graphql.json
✓ Products fetched: 5
✓ RAG context generated
✓ Streaming to Groq...
```

**In API responses:**
```json
{
  "data": {
    "products": {
      "edges": [...]
    }
  }
}
```

---

**Need more help?** Check `GRAPHQL_FIX_SUMMARY.md` for detailed implementation or `GRAPHQL_FLOW_DIAGRAMS.md` for visual flows.

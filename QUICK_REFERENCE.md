# EPIR Assistant - Quick Reference

## 🚀 Quick Deploy Commands

### First Time Setup
```bash
# Set Cloudflare secrets (once)
cd worker
wrangler secret put SHOPIFY_APP_SECRET
wrangler secret put GROQ_API_KEY  # Optional
```

### Deploy Production
```bash
cd worker
npm install          # Install dependencies
npm test            # Run tests
npx tsc --noEmit    # Type check
wrangler deploy     # Deploy to production
```

### Deploy Staging
```bash
cd worker
wrangler deploy --env staging
```

### Deploy via Git Tag
```bash
git tag v1.0.0
git push origin v1.0.0
# GitHub Actions automatically deploys
```

## 🔍 Testing Commands

### Run Tests
```bash
cd worker
npm test
```

### Type Check
```bash
cd worker
npx tsc --noEmit
```

### Health Check
```bash
curl https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev/health
```

### HMAC Test
```powershell
./scripts/test_appproxy_hmac.ps1
```

### Generate Signed Request
```bash
cd worker
node generate-test.js
# Copy and run the generated curl command
```

## 📋 Configuration Quick Check

### ✅ Correct Configuration
```
TAE Endpoint:     /apps/assistant/chat
App Proxy:        /apps/assistant/* → Worker
Worker Name:      epir-art-jewellery-worker
Worker URL:       https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev
```

### 🔧 Key Files
- `worker/wrangler.toml` - Worker config & bindings
- `shopify.app.toml` - App Proxy config
- `extensions/asystent-klienta/blocks/assistant.liquid` - TAE endpoint
- `.github/workflows/deploy.yml` - GitHub Actions

## 🐛 Troubleshooting

### 404 on /apps/assistant/chat
```bash
# Check TAE endpoint
grep "data-worker-endpoint" extensions/asystent-klienta/blocks/assistant.liquid
# Should show: /apps/assistant/chat

# Redeploy Shopify app
shopify app deploy
```

### 401 HMAC Error
```bash
cd worker
wrangler secret put SHOPIFY_APP_SECRET
# Paste API Secret from Shopify Partners
```

### Bindings Not Found
```bash
cd worker
wrangler deploy  # Syncs bindings from wrangler.toml
```

### RAG Not Working
```bash
# Populate Vectorize index
node scripts/populate-vectorize.ts
```

## 📊 Worker Bindings

| Binding | Type | Resource |
|---------|------|----------|
| `DB` | D1 | epir_art_jewellery |
| `SESSIONS_KV` | KV | 08f16276a9b1... |
| `SESSION_DO` | DO | SessionDO |
| `VECTOR_INDEX` | Vectorize | autorag-epir-chatbot-rag |
| `AI` | Workers AI | Built-in |

## 🔐 Secrets

| Secret | Required | Purpose |
|--------|----------|---------|
| `SHOPIFY_APP_SECRET` | ✅ Yes | HMAC verification |
| `GROQ_API_KEY` | ⚪ Optional | Enhanced LLM |

## 📈 Monitoring

### View Logs
```bash
cd worker
wrangler tail
```

### Check Dashboard
https://dash.cloudflare.com → Workers & Pages → epir-art-jewellery-worker

## 🔄 Update Workflow

1. Make code changes
2. Run tests: `npm test`
3. Type check: `npx tsc --noEmit`
4. Test locally: `wrangler dev`
5. Deploy staging: `wrangler deploy --env staging`
6. Test staging
7. Deploy production: `wrangler deploy`
8. Or use git tag for auto-deploy

## 📚 Documentation

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Full deployment guide
- [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md) - Architecture diagrams
- [QUICKSTART_RAG_GROQ.md](./QUICKSTART_RAG_GROQ.md) - RAG & Groq setup
- [SUMMARY.md](./SUMMARY.md) - Feature overview

---

**Need Help?** See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed instructions.

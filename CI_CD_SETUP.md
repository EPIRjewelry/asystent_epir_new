# CI/CD Setup Guide

## Overview

This repository uses GitHub Actions for continuous integration and deployment. The workflows are located in `.github/workflows/`.

## Workflows

### CI Workflow (`ci.yml`)

Runs on every push and pull request to `main` branch.

**Jobs:**
1. **test-backend** - Runs worker tests and type checking
2. **build-frontend** - Builds frontend if present
3. **deploy-worker** - Deploys to Cloudflare (manual trigger only)

### Required GitHub Secrets

The following secrets need to be configured in your GitHub repository settings:

#### For CI/CD Pipeline

| Secret Name | Required | Purpose | How to Get |
|------------|----------|---------|------------|
| `CLOUDFLARE_API_TOKEN` | For deployment | Deploy Worker to Cloudflare | [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) → Create Token with "Edit Cloudflare Workers" permissions |

#### For Runtime (Cloudflare Secrets)

These are set in Cloudflare, not GitHub:

```bash
cd worker
wrangler secret put SHOPIFY_APP_SECRET
wrangler secret put GROQ_API_KEY  # Optional
wrangler secret put SHOPIFY_ADMIN_API_TOKEN  # Optional, for Admin API
```

| Secret Name | Required | Purpose |
|------------|----------|---------|
| `SHOPIFY_APP_SECRET` | Yes | HMAC verification for App Proxy |
| `GROQ_API_KEY` | Optional | Enhanced LLM via Groq |
| `SHOPIFY_ADMIN_API_TOKEN` | Optional | Access Shopify Admin API for metafields |

## CI Pipeline Details

### TypeScript Type Checking

The CI runs TypeScript type checking with:
```bash
npx tsc --noEmit
```

**Dependencies:**
- `typescript` - Added to `worker/package.json` devDependencies
- `@types/node` - For Node.js global types
- `@cloudflare/workers-types` - For Cloudflare Workers types

### Test Suite

Tests run with Vitest:
```bash
npm run test
```

**Test Coverage:**
- 69 tests across 5 test suites
- GraphQL integration tests
- RAG/MCP integration tests  
- Groq LLM tests
- Authentication tests

### Known Issues

#### Vite CJS Deprecation Warning

You may see this warning in CI logs:
```
The CJS build of Vite's Node API is deprecated.
```

This is a **warning only** and does not fail the build. It will be addressed when Vitest updates to use ESM.

#### MCP/RAG Test Errors

Tests may show HTTP/network error messages in stderr:
```
MCP call failed: 500 Internal Server Error
MCP JSON-RPC error: { code: -32600, message: 'Invalid Request' }
```

These are **expected test behaviors** - the tests verify graceful error handling and still pass.

## Shopify Admin API Token

To generate `SHOPIFY_ADMIN_API_TOKEN`:

1. Go to Shopify Admin → Apps → [Your App] → Configuration
2. Navigate to API credentials
3. Create a new access token with scopes:
   - `read_products`
   - `read_metafields`
4. Copy the token
5. Set in Cloudflare:
   ```bash
   cd worker
   wrangler secret put SHOPIFY_ADMIN_API_TOKEN
   ```

## Troubleshooting

### TypeScript Errors in CI

If you see "TypeScript not found" errors:
- Ensure `typescript` is in `worker/package.json` devDependencies
- Run `npm ci` before `npx tsc`

### GraphQL 401 Errors

If tests fail with GraphQL 401 errors:
- Check that mock setup is correct in tests
- Verify SHOPIFY_ADMIN_API_TOKEN is set (for production, not CI)
- The CI tests use mocks and should not need real tokens

### Cache Issues

If dependencies seem stale:
- Clear GitHub Actions cache
- Update cache key in workflow file

## Local Testing

Before pushing to CI, test locally:

```bash
cd worker

# Install dependencies
npm ci

# Run tests
npm test

# Type check
npx tsc --noEmit

# All in one
npm ci && npm test && npx tsc --noEmit
```

## Deployment

### Manual Deploy via GitHub Actions

1. Go to Actions tab in GitHub
2. Select "CI" workflow
3. Click "Run workflow"
4. Select `main` branch
5. Click "Run workflow"

This will run tests, type checking, and deploy to Cloudflare.

### Direct Deploy

```bash
cd worker
wrangler deploy
```

## Files Modified for CI Fix

| File | Change | Reason |
|------|--------|--------|
| `worker/package.json` | Added `typescript` and `@types/node` to devDependencies | Fix "TypeScript not found" in CI |
| `worker/tsconfig.json` | Added `include`, `vitest/globals` types, path mapping | Fix type checking errors |
| `worker/test/graphql.test.ts` | Fixed import paths (`../worker/src` → `../src`) | Correct module resolution |
| `worker/test/graphql.test.ts` | Added type parameters (`<any>`) to API calls | Fix strict TypeScript errors |
| `.gitignore` | Added `dist/`, `.wrangler/`, `*.log`, `.dev.vars` | Prevent committing build artifacts |

## Best Practices

1. **Always run tests locally** before pushing
2. **Never commit secrets** to the repository
3. **Use environment variables** for configuration
4. **Keep CI fast** - tests run in ~5 seconds
5. **Monitor CI logs** for warnings even if tests pass

## Related Documentation

- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Quick commands and config
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Deployment procedures
- [GRAPHQL_TROUBLESHOOTING.md](GRAPHQL_TROUBLESHOOTING.md) - GraphQL issues

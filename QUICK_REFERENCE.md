# Quick Reference: Streaming Chat API

## 🚀 Quick Start

### Test Streaming Endpoint
```bash
node worker/test-streaming.js https://your-worker.workers.dev "Your message"
```

### Populate Vectorize
```bash
wrangler dev worker/populate-vectorize.ts
# Then visit: http://localhost:8787
```

## 📡 API Reference

### Endpoint: POST /chat

**Request:**
```json
{
  "message": "string (required)",
  "session_id": "string (optional)",
  "stream": true|false
}
```

**Query Parameters (Shopify App Proxy):**
- `shop`: Store domain
- `timestamp`: Unix timestamp
- `signature`: HMAC-SHA256 signature

**Streaming Response (SSE):**
```
data: {"session_id":"uuid"}

data: {"content":"partial text","session_id":"uuid","done":false}

data: {"content":"complete text","session_id":"uuid","done":true}

data: [DONE]
```

**Non-Streaming Response:**
```json
{
  "reply": "Complete response text",
  "session_id": "uuid"
}
```

## 🔧 Environment Variables

### Required
- `SHOPIFY_APP_SECRET`: App secret for HMAC verification

### Optional
- `GROQ_API_KEY`: Groq API key (recommended)
- `ALLOWED_ORIGIN`: CORS origin whitelist

### Bindings
- `AI`: Workers AI binding
- `VECTORIZE`: Vectorize index
- `SESSION_DO`: Durable Object
- `DB`: D1 database
- `SESSIONS_KV`: KV namespace

## 📦 Frontend Widget API

### Helper Functions

```javascript
// Create new assistant message element
const element = createAssistantMessage();

// Update message content (for streaming)
updateAssistantMessage(element, "Updated text");

// Add user message
addUserMessage("User's message");

// Add error message
addErrorMessage("Error occurred");
```

### Session Management

```javascript
// Get stored session ID
const sessionId = localStorage.getItem('epir_session');

// Session automatically stored on response
// Key: 'epir_session'
```

### Streaming Handlers

**SSE Format:**
```javascript
async function handleStreamingResponse(response) {
  const reader = response.body.getReader();
  // ... parse SSE data: lines
  // ... handle meta-chunks, content chunks
}
```

**JSONL Format:**
```javascript
async function handleJsonlResponse(response) {
  const reader = response.body.getReader();
  // ... parse JSONL lines
  // ... handle type: 'meta', content chunks
}
```

## 🔍 RAG Function

### Search Shop Policies

```typescript
const contexts = await searchShopPoliciesAndFaqs(
  "user query",
  env
);
// Returns: string[] (top 3 relevant contexts)
```

### Vectorize Document Format

```typescript
{
  id: "unique-id",
  values: number[], // 768-dim embedding
  metadata: {
    type: "policy"|"faq"|"about",
    category: string,
    lang: "pl"|"en",
    text: string  // Original text
  }
}
```

## 🤖 LLM Providers

### Groq API (Primary)
- Model: `llama-3.1-70b-versatile`
- Requires: `GROQ_API_KEY`
- Streaming: Native SSE

### Workers AI (Fallback)
- Model: `@cf/meta/llama-3.1-8b-instruct`
- Requires: `AI` binding
- Streaming: Simulated word-by-word

### Embedding Model
- Model: `@cf/baai/bge-base-en-v1.5`
- Dimensions: 768
- Use: RAG query embeddings

## 🧪 Testing Patterns

### HMAC Generation (Node.js)

```javascript
const crypto = require('crypto');

function generateHMAC(params, body, secret) {
  const sortedKeys = Object.keys(params).sort();
  const parts = sortedKeys.map(k => `${k}=${params[k]}`);
  const message = parts.join('') + body;
  
  return crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(message, 'utf8')
    .digest('hex');
}

const sig = generateHMAC(
  { shop: 'store.myshopify.com', timestamp: '1234567890' },
  '{"message":"test"}',
  'your-secret'
);
```

### cURL Examples

**Streaming:**
```bash
curl -N -X POST "https://worker.dev/chat?shop=store.myshopify.com&timestamp=1234567890&signature=abc123" \
  -H "Content-Type: application/json" \
  -d '{"message":"Test","stream":true}'
```

**Non-Streaming:**
```bash
curl -X POST "https://worker.dev/chat?shop=store.myshopify.com&timestamp=1234567890&signature=abc123" \
  -H "Content-Type: application/json" \
  -d '{"message":"Test","stream":false}'
```

## 📊 Response Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success (streaming or JSON) |
| 400 | Bad Request (invalid JSON, missing message) |
| 401 | Unauthorized (invalid HMAC) |
| 429 | Rate Limit Exceeded (20/min per session) |
| 500 | Internal Server Error |

## 🎨 CSS Classes

```css
.msg-user      /* User message */
.msg-assistant /* AI assistant message */
.msg-error     /* Error message */
```

## 🔐 Security Checklist

- [x] HMAC verification on all /chat requests
- [x] Rate limiting per session (20/min)
- [x] CORS origin validation
- [x] Input sanitization (JSON parsing)
- [x] Constant-time HMAC comparison
- [x] Body included in HMAC calculation

## 📈 Performance Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| TTFB (meta-chunk) | < 100ms | First byte to client |
| TTFB (first token) | < 200ms | With RAG overhead |
| Token throughput | 20-50/sec | Depends on provider |
| RAG latency | < 200ms | Embedding + search |
| Session lookup | < 20ms | Durable Object |

## 🐛 Common Issues

### Streaming not working
- Check Content-Type header
- Disable CDN buffering
- Verify browser support

### RAG returns no results
- Check Vectorize is populated
- Verify AI binding works
- Adjust similarity threshold

### HMAC verification fails
- Check secret matches Shopify
- Verify body is included
- Check timestamp is recent

### Session not persisting
- Check localStorage available
- Verify session_id in response
- Check domain cookies/storage

## 📚 Documentation Links

- Full Guide: `STREAMING_AND_RAG.md`
- Implementation: `IMPLEMENTATION_SUMMARY.md`
- Main README: `README.md`

## 🆘 Debugging

### Enable Verbose Logging

```typescript
// In worker code
console.log('Debug:', { message, session_id, stream });
```

### Check Worker Logs

```bash
wrangler tail
```

### Test Vectorize

```bash
wrangler vectorize query epir-policies-faqs \
  --vector='[0.1, 0.2, ..., 0.768]' \
  --top-k=3
```

### Verify Bindings

```bash
wrangler deploy --dry-run
# Shows all configured bindings
```

---

**Last Updated**: 2024
**Version**: 1.0.0
**Status**: Production Ready

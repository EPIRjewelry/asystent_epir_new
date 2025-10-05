# Streaming LLM & RAG Implementation Guide

## Overview

This document describes the implementation of streaming LLM responses and RAG (Retrieval-Augmented Generation) functionality in the EPIR Jewellery Assistant.

## Features Implemented

### 1. Frontend Streaming Widget (`extensions/asystent-klienta/assets/chat.js`)

The new chat.js widget provides advanced streaming capabilities:

#### Helper Functions

- **`createAssistantMessage()`**: Creates a new assistant message element in the chat UI
- **`updateAssistantMessage(element, text)`**: Updates the content of an assistant message with streaming text
- **`addUserMessage(text)`**: Adds a user message to the chat
- **`addErrorMessage(text)`**: Displays error messages to the user

#### Streaming Support

The widget supports two streaming formats:

1. **SSE (Server-Sent Events)**: `text/event-stream`
   - Format: `data: {"content": "...", "session_id": "...", "done": false}\n\n`
   - Handles `[DONE]` signal
   - Updates UI in real-time as tokens arrive

2. **JSONL/NDJSON**: `application/x-ndjson` or `application/jsonl`
   - Format: One JSON object per line
   - First line can be meta-chunk with session_id
   - Subsequent lines contain content chunks

#### Session Management

- Automatically extracts and stores `session_id` from meta-chunks
- Persists session_id in `localStorage` under key `epir_session`
- Sends session_id with each request for conversation continuity

#### Error Handling

- Graceful degradation to non-streaming JSON responses
- User-friendly error messages in Polish
- Console logging for debugging

### 2. Backend Streaming (`worker/src/index.ts`)

#### Meta-Chunk First

The streaming response now sends a meta-chunk first containing the session_id:

```json
data: {"session_id": "uuid-here"}
```

This allows the frontend to immediately store the session without waiting for content.

#### Multi-Provider Support

The backend now supports multiple LLM providers with automatic fallback:

1. **Groq API** (Primary, if configured)
   - Model: `llama-3.1-70b-versatile`
   - True streaming via SSE
   - Requires `GROQ_API_KEY` environment variable

2. **Cloudflare Workers AI** (Fallback)
   - Model: `@cf/meta/llama-3.1-8b-instruct`
   - Streaming or simulated word-by-word delivery
   - Uses AI binding

#### Streaming Functions

- **`generateAIResponseStreaming()`**: Main streaming function with provider selection
- **`generateGroqResponseStreaming()`**: Groq-specific streaming implementation
- **`generateAIResponse()`**: Non-streaming fallback for backward compatibility

### 3. RAG (Retrieval-Augmented Generation)

#### Vector Search Function

**`searchShopPoliciesAndFaqs(query, env)`**

This function implements semantic search over shop policies and FAQs:

1. **Embedding Generation**
   - Uses Workers AI model: `@cf/baai/bge-base-en-v1.5`
   - Converts user query to vector embedding

2. **Vectorize Search**
   - Queries Vectorize index for top 3 most relevant documents
   - Returns context snippets with metadata

3. **Context Injection**
   - Relevant context is injected into system prompt
   - Format: "Relewantne informacje z bazy wiedzy:\n[contexts]"

#### Integration

RAG search is automatically performed for both streaming and non-streaming responses:

```typescript
const contexts = await searchShopPoliciesAndFaqs(userMessage, env);
if (contexts.length > 0) {
  systemContent += '\n\nRelewantne informacje z bazy wiedzy:\n' + contexts.join('\n\n');
}
```

### 4. Enhanced HMAC Verification

The HMAC verification now includes the request body:

**Before**: Only query parameters were included in HMAC message

**After**: Query parameters + request body (if present)

```typescript
// Message format: sorted_params + body (no separators)
let message = parts.join(''); // sorted query params
const body = await clonedRequest.text();
if (body) {
  message += body; // append body without separator
}
```

This provides stronger security for POST requests with JSON payloads.

## Configuration

### Required Environment Variables

Add these to your Cloudflare Worker environment:

```toml
# wrangler.toml or Worker Settings

[vars]
ALLOWED_ORIGIN = "https://your-store.myshopify.com"
SHOPIFY_APP_SECRET = "your-shopify-app-secret"

# Optional: For Groq API (recommended for better streaming)
GROQ_API_KEY = "your-groq-api-key"
```

### Required Bindings

```toml
# D1 Database
[[d1_databases]]
binding = "DB"
database_name = "epir_art_jewellery"
database_id = "your-database-id"

# KV Namespace
[[kv_namespaces]]
binding = "SESSIONS_KV"
id = "your-kv-id"

# Durable Object
[[durable_objects.bindings]]
name = "SESSION_DO"
class_name = "SessionDO"
script_name = "epir-art-jewellery-worker"

# Workers AI (for embeddings and LLM)
[ai]
binding = "AI"

# Vectorize (for RAG)
[[vectorize]]
binding = "VECTORIZE"
index_name = "epir-policies-faqs"
```

## Setting Up Vectorize for RAG

### 1. Create Vectorize Index

```bash
# Create index with 768 dimensions (for bge-base-en-v1.5 embeddings)
npx wrangler vectorize create epir-policies-faqs \
  --dimensions=768 \
  --metric=cosine
```

### 2. Populate Index with Documents

Create a script to add your shop policies and FAQs:

```typescript
// populate-vectorize.ts
import { Ai } from '@cloudflare/ai';

const documents = [
  {
    id: '1',
    text: 'Oferujemy darmową wysyłkę dla zamówień powyżej 500 zł...',
    metadata: { type: 'policy', category: 'shipping' }
  },
  {
    id: '2',
    text: 'Wszystkie nasze produkty wykonane są z certyfikowanego srebra 925...',
    metadata: { type: 'faq', category: 'materials' }
  },
  // Add more documents...
];

// Generate embeddings and insert into Vectorize
for (const doc of documents) {
  const embedding = await ai.run('@cf/baai/bge-base-en-v1.5', {
    text: doc.text
  });
  
  await env.VECTORIZE.insert([{
    id: doc.id,
    values: embedding.data[0],
    metadata: { ...doc.metadata, text: doc.text }
  }]);
}
```

Run with:
```bash
npx wrangler dev populate-vectorize.ts
```

## Testing

### Test Streaming Endpoint

```bash
# Using curl with streaming
curl -N -X POST "https://your-worker.workers.dev/chat?shop=your-store.myshopify.com&timestamp=1234567890&signature=..." \
  -H "Content-Type: application/json" \
  -d '{"message":"Tell me about your jewelry","stream":true}'
```

### Test Non-Streaming (Backward Compatible)

```bash
curl -X POST "https://your-worker.workers.dev/chat?shop=your-store.myshopify.com&timestamp=1234567890&signature=..." \
  -H "Content-Type: application/json" \
  -d '{"message":"Tell me about your jewelry","stream":false}'
```

### Frontend Testing

1. Deploy the Theme App Extension
2. Add the "Asystent klienta (AI)" block to your theme
3. Open the page in your store
4. Send a message and watch it stream in real-time

## Response Formats

### SSE Streaming Response

```
data: {"session_id":"123e4567-e89b-12d3-a456-426614174000"}

data: {"content":"Witaj","session_id":"123e4567-e89b-12d3-a456-426614174000","done":false}

data: {"content":"Witaj! Jak","session_id":"123e4567-e89b-12d3-a456-426614174000","done":false}

data: {"content":"Witaj! Jak mogę","session_id":"123e4567-e89b-12d3-a456-426614174000","done":false}

data: {"content":"Witaj! Jak mogę Ci pomóc?","session_id":"123e4567-e89b-12d3-a456-426614174000","done":true}

data: [DONE]
```

### JSONL/NDJSON Response

```json
{"type":"meta","session_id":"123e4567-e89b-12d3-a456-426614174000"}
{"content":"Witaj","session_id":"123e4567-e89b-12d3-a456-426614174000"}
{"content":"Witaj! Jak","session_id":"123e4567-e89b-12d3-a456-426614174000"}
{"content":"Witaj! Jak mogę Ci pomóc?","session_id":"123e4567-e89b-12d3-a456-426614174000","done":true}
```

### Non-Streaming JSON Response

```json
{
  "reply": "Witaj! Jak mogę Ci pomóc?",
  "session_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

## Performance Considerations

1. **RAG Search**: Adds ~100-200ms latency for embedding generation and vector search
2. **Groq API**: Typically faster and higher quality than Workers AI
3. **Streaming**: Improves perceived performance by showing partial responses immediately
4. **Caching**: Consider implementing response caching for common queries

## Security

1. **HMAC Verification**: All requests must include valid Shopify App Proxy signature
2. **Body Inclusion**: Request body is now part of HMAC calculation
3. **Rate Limiting**: SessionDO implements 20 requests/minute per session
4. **Input Validation**: All user inputs are validated before processing

## Troubleshooting

### Streaming Not Working

- Check Content-Type header in response
- Verify browser supports ReadableStream
- Check for proxy/CDN buffering (X-Accel-Buffering header)

### RAG Not Finding Results

- Verify Vectorize index is populated
- Check embedding model is working
- Adjust topK parameter for more/fewer results

### Groq API Errors

- Verify GROQ_API_KEY is set correctly
- Check API rate limits and quotas
- Review API response error messages

## Next Steps

1. **Add More Documents**: Populate Vectorize with comprehensive shop policies and FAQs
2. **Fine-tune RAG**: Adjust topK, similarity thresholds, and context formatting
3. **Monitor Performance**: Track streaming latency and RAG relevance
4. **A/B Testing**: Compare Groq vs Workers AI response quality
5. **Add Caching**: Implement intelligent response caching

## License

MIT License - see LICENSE file for details

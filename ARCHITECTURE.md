# Visual Architecture Diagram

## Request Flow: Streaming Chat with RAG

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          User Browser (Shopify Store)                   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Theme App Extension Block                                        │  │
│  │                                                                   │  │
│  │ ┌────────────────┐  ┌────────────────┐  ┌─────────────────────┐ │  │
│  │ │ <form>         │  │ <div messages> │  │ chat.js (Widget)    │ │  │
│  │ │  <input>       │→→│  .msg-user     │←←│ • createMessage()   │ │  │
│  │ │  <button>      │  │  .msg-assistant│  │ • updateMessage()   │ │  │
│  │ └────────────────┘  │  .msg-error    │  │ • handleStreaming() │ │  │
│  │                     └────────────────┘  │ • localStorage      │ │  │
│  │                                         └─────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    │ POST /apps/assistant/chat         │
│                                    │ {message, session_id, stream}     │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │
                   ┌─────────────────┴──────────────────┐
                   │  Shopify App Proxy                 │
                   │  • Adds HMAC signature             │
                   │  • Forwards to Worker              │
                   └─────────────────┬──────────────────┘
                                     │
                                     ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                        Cloudflare Worker Ecosystem                      │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 1. Request Handler                                               │  │
│  │    ┌─────────────────────────────────────────────────────────┐   │  │
│  │    │ verifyAppProxyHmac(request, SHOPIFY_APP_SECRET)         │   │  │
│  │    │ • Extract signature from query params                   │   │  │
│  │    │ • Build message: sorted_params + body                   │   │  │
│  │    │ • crypto.subtle.verify() - constant time                │   │  │
│  │    │ ✓ Returns 401 if invalid                               │   │  │
│  │    └─────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                     ↓                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 2. Session Management (Durable Object)                          │  │
│  │    ┌─────────────────────────────────────────────────────────┐   │  │
│  │    │ SessionDO.get(session_id)                               │   │  │
│  │    │ • In-memory conversation history                        │   │  │
│  │    │ • Rate limiting: 20 req/min                             │   │  │
│  │    │ • Persistence to DO storage                             │   │  │
│  │    │ • Archive to D1 on end()                                │   │  │
│  │    └─────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                     ↓                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 3. Streaming Response Setup                                     │  │
│  │    ┌─────────────────────────────────────────────────────────┐   │  │
│  │    │ TransformStream()                                       │   │  │
│  │    │ • Send meta-chunk: {"session_id": "..."}               │   │  │
│  │    │ • Content-Type: text/event-stream                       │   │  │
│  │    │ • Cache-Control: no-cache                               │   │  │
│  │    └─────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                     ↓                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 4. RAG Pipeline (Vectorize)                                     │  │
│  │    ┌─────────────────────────────────────────────────────────┐   │  │
│  │    │ searchShopPoliciesAndFaqs(userMessage)                  │   │  │
│  │    │                                                          │   │  │
│  │    │ a) Generate Query Embedding                             │   │  │
│  │    │    AI.run('@cf/baai/bge-base-en-v1.5', {text})          │   │  │
│  │    │    → 768-dimensional vector                             │   │  │
│  │    │                                                          │   │  │
│  │    │ b) Vector Search                                        │   │  │
│  │    │    VECTORIZE.query(vector, {topK: 3})                   │   │  │
│  │    │    → Top 3 most similar documents                       │   │  │
│  │    │                                                          │   │  │
│  │    │ c) Extract Context                                      │   │  │
│  │    │    contexts = matches.map(m => m.metadata.text)         │   │  │
│  │    │    → Array of relevant text snippets                    │   │  │
│  │    └─────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                     ↓                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 5. LLM Streaming (Multi-Provider)                               │  │
│  │                                                                  │  │
│  │    ┌───────────────────────────────────────────────────────┐    │  │
│  │    │ Provider Selection (with fallback)                    │    │  │
│  │    └───────────────┬───────────────────────────────────────┘    │  │
│  │                    │                                             │  │
│  │     ┌──────────────┴──────────────┐                             │  │
│  │     │                              │                             │  │
│  │     ↓ (Primary)                    ↓ (Fallback)                 │  │
│  │  ┌──────────────────┐      ┌───────────────────┐               │  │
│  │  │ Groq API         │      │ Workers AI        │               │  │
│  │  │ • llama-3.1-70b  │      │ • llama-3.1-8b    │               │  │
│  │  │ • Native SSE     │      │ • Simulated       │               │  │
│  │  │ • Fast, Quality  │      │ • Free tier       │               │  │
│  │  └────────┬─────────┘      └───────┬───────────┘               │  │
│  │           │                        │                             │  │
│  │           └────────────┬───────────┘                             │  │
│  │                        ↓                                          │  │
│  │    ┌───────────────────────────────────────────────────────┐    │  │
│  │    │ Inject RAG Context into System Prompt                 │    │  │
│  │    │ systemPrompt += "\n\nRelewantne info:\n" + contexts  │    │  │
│  │    └───────────────────────────────────────────────────────┘    │  │
│  │                        ↓                                          │  │
│  │    ┌───────────────────────────────────────────────────────┐    │  │
│  │    │ Stream Tokens via onChunk() Callback                  │    │  │
│  │    │ • Parse SSE: data: {...}                              │    │  │
│  │    │ • Accumulate content                                  │    │  │
│  │    │ • Send chunks to client                               │    │  │
│  │    └───────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                     ↓                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 6. Response Streaming                                            │  │
│  │    ┌─────────────────────────────────────────────────────────┐   │  │
│  │    │ SSE Format Output:                                      │   │  │
│  │    │                                                          │   │  │
│  │    │ data: {"content":"Witaj","done":false}                 │   │  │
│  │    │ data: {"content":"Witaj! Jak","done":false}            │   │  │
│  │    │ data: {"content":"Witaj! Jak mogę","done":false}       │   │  │
│  │    │ ...                                                     │   │  │
│  │    │ data: {"content":"[full text]","done":true}            │   │  │
│  │    │ data: [DONE]                                           │   │  │
│  │    └─────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                     ↓                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 7. Persistence                                                   │  │
│  │    ┌─────────────────────────────────────────────────────────┐   │  │
│  │    │ SessionDO.append('assistant', fullResponse)             │   │  │
│  │    │ • Save to DO storage                                    │   │  │
│  │    │ • Eventually archive to D1                              │   │  │
│  │    └─────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                     ↓
                          SSE stream flows to browser
                                     ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                          Browser Updates UI                             │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ chat.js Streaming Handler                                        │  │
│  │                                                                   │  │
│  │ 1. Parse SSE lines                                               │  │
│  │    → Extract data: {...}                                         │  │
│  │                                                                   │  │
│  │ 2. Handle meta-chunk                                             │  │
│  │    → localStorage.setItem('epir_session', session_id)            │  │
│  │                                                                   │  │
│  │ 3. Handle content chunks                                         │  │
│  │    → element = createAssistantMessage()                          │  │
│  │    → updateAssistantMessage(element, data.content)               │  │
│  │                                                                   │  │
│  │ 4. Handle errors                                                 │  │
│  │    → addErrorMessage(data.error)                                 │  │
│  │                                                                   │  │
│  │ 5. Scroll to bottom                                              │  │
│  │    → elMsgs.scrollTop = elMsgs.scrollHeight                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Summary

1. **User Input** → Form submission
2. **Frontend** → POST to /apps/assistant/chat with message
3. **Shopify** → App Proxy adds HMAC signature
4. **Worker** → Verify HMAC, retrieve/create session
5. **RAG** → Search Vectorize for relevant context
6. **LLM** → Generate response with context (Groq/Workers AI)
7. **Stream** → SSE chunks back to client
8. **Frontend** → Parse chunks, update UI progressively
9. **Persist** → Save conversation to Durable Object → D1

## Key Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Widget | JavaScript (chat.js) | UI and streaming handler |
| Backend | Cloudflare Workers | Request handling, orchestration |
| Auth | crypto.subtle | HMAC verification |
| Sessions | Durable Objects | In-memory state |
| Archive | D1 Database | Long-term storage |
| RAG | Vectorize | Semantic search |
| Embeddings | Workers AI (bge-base-en-v1.5) | Query vectorization |
| LLM | Groq/Workers AI | Response generation |
| Streaming | SSE | Real-time delivery |

## Performance Characteristics

```
User Action
    ↓ < 50ms - Network latency
HMAC Verification
    ↓ < 5ms - Crypto operation
Session Lookup
    ↓ < 20ms - DO fetch
Meta-chunk Sent ← First byte to user (TTFB)
    ↓ 100-200ms - Embedding + search
RAG Context Retrieved
    ↓ 50-200ms - LLM initialization
First Token ← User sees typing indicator
    ↓ 20-50 tokens/sec
Token Stream ← Progressive UI updates
    ↓
Complete Response
    ↓ < 10ms
Persisted to DO
```

## Security Layers

```
┌─────────────────────────────────────┐
│ 1. Shopify App Proxy                │
│    • Adds signature to requests     │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 2. HMAC Verification                │
│    • Query params + body            │
│    • Constant-time comparison       │
│    • Rejects invalid signatures     │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 3. Rate Limiting                    │
│    • 20 requests/min per session    │
│    • In Durable Object              │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 4. Input Validation                 │
│    • JSON parsing                   │
│    • Required fields check          │
│    • Type safety (TypeScript)       │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 5. CORS                             │
│    • Origin whitelist               │
│    • Preflight handling             │
└─────────────────────────────────────┘
```

## Files Overview

### Frontend (Theme App Extension)
- `extensions/asystent-klienta/assets/chat.js` - Streaming widget
- `extensions/asystent-klienta/assets/assistant.css` - Styling
- `extensions/asystent-klienta/blocks/assistant.liquid` - Template

### Backend (Cloudflare Worker)
- `worker/src/index.ts` - Main handler, RAG, LLM
- `worker/src/auth.ts` - HMAC verification

### Documentation
- `STREAMING_AND_RAG.md` - Complete implementation guide
- `IMPLEMENTATION_SUMMARY.md` - This file
- `QUICK_REFERENCE.md` - API quick reference
- `README.md` - Updated with new features

### Testing & Utilities
- `worker/test-streaming.js` - Automated testing
- `worker/populate-vectorize.ts` - Sample data loader

---

**Total Lines Changed**: 1,921 additions across 11 files
**TypeScript**: ✅ Compiles without errors
**Documentation**: ✅ Comprehensive
**Testing**: ✅ Utilities provided
**Ready for**: Deployment

# EPIR Assistant - Fixed Architecture Diagram

## Request Flow (Shopify → Worker)

```mermaid
sequenceDiagram
    participant User as 👤 Customer
    participant TAE as Theme App Extension<br/>(Liquid + JS)
    participant Proxy as Shopify App Proxy<br/>(/apps/assistant/*)
    participant Worker as Cloudflare Worker<br/>(epir-art-jewellery-worker)
    participant DO as Durable Object<br/>(SessionDO)
    participant D1 as D1 Database
    participant Vectorize as Vectorize Index<br/>(RAG)
    participant AI as Workers AI / Groq<br/>(LLM)

    User->>TAE: Click chat widget
    TAE->>TAE: Load endpoint from<br/>data-worker-endpoint="/apps/assistant/chat"
    TAE->>Proxy: POST /apps/assistant/chat<br/>{message, session_id}
    
    Note over Proxy: Shopify adds HMAC signature<br/>and proxies to Worker URL
    
    Proxy->>Worker: POST /chat<br/>X-Shopify-Hmac-Sha256: [signature]
    
    Worker->>Worker: Verify HMAC<br/>(auth.ts)
    
    Worker->>DO: Get/Create Session<br/>env.SESSION_DO.idFromName(sessionId)
    DO->>DO: Append user message<br/>Rate limit check
    
    DO->>Vectorize: Search relevant docs<br/>(rag.ts - if implemented)
    Vectorize-->>DO: Return context
    
    DO->>AI: Generate response<br/>(groq.ts or Workers AI)
    AI-->>DO: Stream tokens
    
    DO->>Worker: SSE stream<br/>data: {delta: "token"}
    Worker->>Proxy: Forward SSE
    Proxy->>TAE: Forward SSE
    TAE->>User: Display streaming response
    
    Note over DO,D1: On session end:<br/>DO flushes history to D1
    DO->>D1: INSERT conversations, messages
```

## Component Architecture

```mermaid
graph TB
    subgraph "Shopify Store"
        A[Customer Browser]
        B[Theme App Extension<br/>assistant.liquid + assistant.js]
    end
    
    subgraph "Shopify Platform"
        C[App Proxy<br/>/apps/assistant/* → Worker]
        D[HMAC Signature]
    end
    
    subgraph "Cloudflare Worker<br/>epir-art-jewellery-worker"
        E[Request Handler<br/>index.ts]
        F[HMAC Verifier<br/>auth.ts]
        G[RAG Module<br/>rag.ts]
        H[LLM Module<br/>groq.ts]
    end
    
    subgraph "Cloudflare Resources"
        I[Durable Object<br/>SessionDO]
        J[D1 Database<br/>epir_art_jewellery]
        K[KV Namespace<br/>SESSIONS_KV]
        L[Vectorize Index<br/>autorag-epir-chatbot-rag]
        M[Workers AI<br/>llama-3.1-8b]
    end
    
    subgraph "External Services"
        N[Groq API<br/>llama-3.3-70b]
    end
    
    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> E
    E --> G
    E --> H
    E --> I
    I --> J
    I --> K
    G --> L
    H --> M
    H --> N
    
    style C fill:#f9f,stroke:#333,stroke-width:2px
    style E fill:#bbf,stroke:#333,stroke-width:2px
    style I fill:#bfb,stroke:#333,stroke-width:2px
```

## Configuration Mapping

```mermaid
graph LR
    subgraph "shopify.app.toml"
        A1[prefix = 'apps']
        A2[subpath = 'assistant']
        A3[url = worker URL]
    end
    
    subgraph "TAE assistant.liquid"
        B1[data-worker-endpoint<br/>/apps/assistant/chat]
    end
    
    subgraph "worker/wrangler.toml"
        C1[name = epir-art-jewellery-worker]
        C2[D1: DB binding]
        C3[KV: SESSIONS_KV]
        C4[DO: SESSION_DO]
        C5[Vectorize: VECTOR_INDEX]
        C6[AI binding]
    end
    
    subgraph "Shopify Proxy Result"
        D1[/apps/assistant/* <br/>proxies to Worker]
    end
    
    A1 --> D1
    A2 --> D1
    A3 --> D1
    B1 --> D1
    C1 --> D1
    C2 --> C1
    C3 --> C1
    C4 --> C1
    C5 --> C1
    C6 --> C1
    
    style D1 fill:#ffa,stroke:#333,stroke-width:3px
```

## Fixed Issues Summary

### ❌ Before Fix
```
TAE Endpoint: /apps/epir-assistant/chat (WRONG - typo with "epir-" prefix)
                          ↓ (404 - not found)
App Proxy:    /apps/assistant/* → Worker (MISMATCH)
```

### ✅ After Fix
```
TAE Endpoint: /apps/assistant/chat (CORRECT)
                          ↓ (matches)
App Proxy:    /apps/assistant/* → Worker (PERFECT MATCH)
                          ↓
Worker:       epir-art-jewellery-worker (with all bindings)
```

## Bindings Configuration

### Production Worker
- **Name**: `epir-art-jewellery-worker`
- **URL**: `https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev`

| Binding | Type | Resource | Purpose |
|---------|------|----------|---------|
| `DB` | D1 Database | `epir_art_jewellery` | Store conversations & messages |
| `SESSIONS_KV` | KV Namespace | `08f16276a9b1...` | Session metadata cache |
| `SESSION_DO` | Durable Object | `SessionDO` | Stateful session handling |
| `VECTOR_INDEX` | Vectorize | `autorag-epir-chatbot-rag` | RAG semantic search |
| `AI` | Workers AI | Built-in | LLM inference (fallback) |

### Staging Worker
- **Name**: `epir-art-jewellery-worker-staging`
- **URL**: `https://epir-art-jewellery-worker-staging.krzysztofdzugaj.workers.dev`
- **Config**: Same bindings, separate environment for testing

## Deployment Environments

```mermaid
graph TB
    subgraph "Production"
        P1[wrangler deploy]
        P2[Worker: epir-art-jewellery-worker]
        P3[URL: *.workers.dev]
    end
    
    subgraph "Staging"
        S1[wrangler deploy --env staging]
        S2[Worker: epir-art-jewellery-worker-staging]
        S3[URL: *-staging.workers.dev]
    end
    
    subgraph "Git Tags"
        G1[git tag v1.0.0]
        G2[GitHub Actions]
    end
    
    P1 --> P2 --> P3
    S1 --> S2 --> S3
    G1 --> G2 --> P1
    
    style P2 fill:#bfb,stroke:#333,stroke-width:2px
    style S2 fill:#ffa,stroke:#333,stroke-width:2px
```

## Security Flow (HMAC Verification)

```mermaid
sequenceDiagram
    participant TAE as Theme App Extension
    participant Shopify as Shopify App Proxy
    participant Worker as Cloudflare Worker
    participant Auth as auth.ts<br/>(verifyAppProxyHmac)

    TAE->>Shopify: POST /apps/assistant/chat<br/>{message, session_id}
    
    Note over Shopify: Shopify calculates HMAC:<br/>1. Sort query params<br/>2. Append request body<br/>3. Sign with SHOPIFY_APP_SECRET
    
    Shopify->>Worker: POST /chat<br/>X-Shopify-Hmac-Sha256: [signature]<br/>?shop=...&timestamp=...
    
    Worker->>Auth: verifyAppProxyHmac(request, secret)
    
    alt HMAC Valid
        Auth-->>Worker: ✅ true
        Worker->>Worker: Process request
    else HMAC Invalid
        Auth-->>Worker: ❌ false
        Worker->>Shopify: 401 Unauthorized
        Shopify->>TAE: Error response
    end
    
    Note over Worker,Auth: Dev Bypass:<br/>env.DEV_BYPASS='1' +<br/>header x-dev-bypass:1
```

---

**Legend:**
- 🟢 Green: Production-ready components
- 🟡 Yellow: Staging/development components
- 🔵 Blue: Core processing components
- 🔴 Red: External dependencies

**Status**: ✅ Architecture Fixed and Documented

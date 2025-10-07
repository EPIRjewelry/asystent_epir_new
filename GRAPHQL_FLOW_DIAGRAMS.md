# GraphQL Integration Flow Diagrams

## 1. Error Handling Flow

```mermaid
graph TB
    A[Start GraphQL Request] --> B{executeGraphQL}
    B --> C[Rate Limit: Wait 100ms]
    C --> D[POST to Shopify API]
    D --> E{HTTP Status?}
    
    E -->|200 OK| F{Has GraphQL Errors?}
    E -->|401/403| G[❌ Auth Error<br/>No Retry<br/>Throw Error]
    E -->|429| H[⚠️ Rate Limited<br/>Retry with Backoff]
    E -->|5xx| I[⚠️ Server Error<br/>Retry with Backoff]
    
    F -->|No| J[✅ Return Data]
    F -->|Yes| K[❌ Parse Errors<br/>Throw with Details]
    
    H --> L[Wait: 1s → 2s → 4s]
    I --> L
    L --> M{Retry Count < 3?}
    M -->|Yes| B
    M -->|No| N[❌ Max Retries<br/>Throw Error]
    
    J --> O[✅ Success]
    
    style G fill:#f66
    style K fill:#f66
    style N fill:#f66
    style O fill:#6f6
    style J fill:#6f6
```

## 2. Admin API → Storefront Fallback

```mermaid
graph TB
    A[Product Search Request] --> B{Admin Token<br/>Available?}
    
    B -->|Yes| C[Try Admin API<br/>with Metafields]
    B -->|No| D[Use Storefront API]
    
    C --> E{Admin API<br/>Success?}
    E -->|Yes| F[✅ Return Products<br/>with Metafields]
    E -->|No| G[⚠️ Admin Failed<br/>Log Error]
    
    G --> H{Storefront Token<br/>Available?}
    H -->|Yes| D
    H -->|No| I[❌ No Products<br/>Return Empty]
    
    D --> J{Storefront<br/>Success?}
    J -->|Yes| K[✅ Return Products<br/>without Metafields]
    J -->|No| L[❌ Both Failed<br/>Return Empty]
    
    F --> M[Format for RAG]
    K --> M
    M --> N[✅ Product Context Ready]
    
    style F fill:#6f6
    style K fill:#6f6
    style N fill:#6f6
    style I fill:#f66
    style L fill:#f66
```

## 3. Populate Vectorize Flow

```mermaid
graph TB
    A[Start populate-vectorize.ts] --> B[Load Environment Vars]
    B --> C{Tokens<br/>Available?}
    
    C -->|No| D[❌ Error: Missing Tokens]
    C -->|Yes| E[Fetch Shop Policies<br/>Storefront API]
    
    E --> F{Admin Token?}
    F -->|Yes| G[Fetch Products<br/>Admin API + Metafields]
    F -->|No| H[Fetch Products<br/>Storefront API]
    
    G --> I{Success?}
    I -->|No| J[Fallback to<br/>Storefront API]
    I -->|Yes| K[Products with<br/>Metafields ✅]
    
    J --> H
    H --> L[Products without<br/>Metafields ✅]
    
    K --> M[Load FAQs<br/>from JSON]
    L --> M
    
    M --> N[Generate Embeddings<br/>for All Docs]
    N --> O[Batch Insert<br/>to Vectorize]
    
    O --> P[✅ Population Complete]
    
    style P fill:#6f6
    style K fill:#6f6
    style L fill:#6f6
    style D fill:#f66
```

## 4. RAG Search with GraphQL

```mermaid
graph TB
    A[User Query] --> B{Query Type?}
    
    B -->|Product| C[Search Products]
    B -->|Policy/FAQ| D[Search Knowledge Base]
    
    C --> E{MCP Available?}
    E -->|Yes| F[Try MCP Catalog Search]
    E -->|No| G[GraphQL Product Search]
    
    F --> H{MCP Success?}
    H -->|Yes| I[✅ MCP Products]
    H -->|No| J[⚠️ MCP Failed]
    
    J --> G
    
    G --> K{Admin API?}
    K -->|Yes| L[Admin API<br/>with Metafields]
    K -->|No| M[Storefront API]
    
    L --> N{Success?}
    N -->|Yes| O[✅ Products with Meta]
    N -->|No| M
    
    M --> P[✅ Basic Products]
    
    D --> Q{Vectorize Ready?}
    Q -->|Yes| R[Vectorize Search]
    Q -->|No| S[MCP FAQ Search]
    
    R --> T[✅ FAQ Results]
    S --> T
    
    I --> U[Format Context]
    O --> U
    P --> U
    T --> U
    
    U --> V[Send to LLM<br/>Groq/Workers AI]
    V --> W[✅ AI Response]
    
    style W fill:#6f6
    style I fill:#6f6
    style O fill:#6f6
    style P fill:#6f6
    style T fill:#6f6
```

## 5. Complete Request Flow

```mermaid
sequenceDiagram
    participant U as User/Widget
    participant W as Worker
    participant G as GraphQL Module
    participant S as Shopify API
    participant V as Vectorize
    participant L as LLM (Groq)
    
    U->>W: POST /apps/assistant/chat
    W->>W: Verify HMAC
    W->>W: Get Session History
    
    alt Product Query
        W->>G: fetchProductsForRAG()
        G->>G: Rate limit (100ms)
        G->>S: Admin API Query
        alt Admin Success
            S-->>G: Products + Metafields
            G-->>W: Products with Meta
        else Admin Fails
            S-->>G: 401/403 Error
            G->>S: Storefront API Query
            S-->>G: Basic Products
            G-->>W: Products without Meta
        end
    else Policy/FAQ Query
        W->>V: Vectorize Search
        V-->>W: Relevant Docs
    end
    
    W->>L: Stream Request with Context
    L-->>W: Stream Response
    W-->>U: SSE Stream
    
    Note over W,S: Retry Logic:<br/>429 → Wait 1s, 2s, 4s<br/>401/403 → Immediate fail<br/>5xx → Retry
```

## 6. Error Scenarios & Handling

```mermaid
graph LR
    A[GraphQL Request] --> B{Error Type?}
    
    B -->|401 Unauthorized| C[❌ Invalid Token<br/>Check API token]
    B -->|403 Forbidden| D[❌ Insufficient Scopes<br/>Add read_products,<br/>read_metafields]
    B -->|429 Rate Limit| E[⚠️ Retry 3x<br/>Exponential Backoff<br/>1s → 2s → 4s]
    B -->|5xx Server Error| F[⚠️ Retry 3x<br/>Exponential Backoff]
    B -->|GraphQL Error| G[❌ Parse Details<br/>Field/Path/Line]
    B -->|Network Error| H[⚠️ Retry 3x]
    
    E --> I{Retry Success?}
    F --> I
    H --> I
    
    I -->|Yes| J[✅ Success]
    I -->|No| K[❌ Max Retries<br/>Throw Error]
    
    style C fill:#f66
    style D fill:#f66
    style G fill:#f66
    style K fill:#f66
    style J fill:#6f6
```

## 7. API Version Update Impact

```mermaid
graph TB
    A[API 2024-01<br/>OLD] --> B[API 2024-10<br/>NEW]
    
    B --> C[✅ Latest Features]
    B --> D[✅ Better Performance]
    B --> E[✅ Improved Error Messages]
    B --> F[✅ New Field Support]
    
    C --> G[Metafields Enhanced]
    D --> H[Rate Limits Optimized]
    E --> I[Detailed GraphQL Errors]
    F --> J[New Product Fields]
    
    style B fill:#6f6
    style C fill:#6f6
    style D fill:#6f6
    style E fill:#6f6
    style F fill:#6f6
```

## Key Improvements Summary

### Before Fix ❌
- API Version: 2024-01 (outdated)
- No retry logic
- Generic error: "Shopify API error: 401"
- No rate limiting
- No Admin API support
- No metafields

### After Fix ✅
- API Version: 2024-10 (latest)
- Retry with exponential backoff (3 attempts)
- Detailed errors: "Authentication error (401): Invalid access token. Check your API token."
- Rate limiting: 100ms between requests
- Admin API with metafields support
- Fallback chain: Admin → Storefront
- GraphQL error parsing with field/path/line details

### Performance Metrics
- **Rate Limit**: 100ms delay = max 10 req/s (Shopify limit: 20 req/s)
- **Retry Schedule**: 1s → 2s → 4s (exponential backoff)
- **Max Attempts**: 3 retries per request
- **Timeout Handling**: Automatic retry on network errors

### Security Best Practices
- ✅ Token validation before requests
- ✅ Scope verification (read_products, read_metafields)
- ✅ Error messages don't expose sensitive data
- ✅ Admin token optional (graceful degradation)

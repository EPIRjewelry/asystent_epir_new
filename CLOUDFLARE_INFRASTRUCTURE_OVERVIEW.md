# CLOUDFLARE INFRASTRUCTURE OVERVIEW - EPIR JEWELRY

## 📊 Account Information
- **Account ID**: `73283c24dc79f92edef30dcdbc98f230`
- **Email**: `krzysztofdzugaj@gmail.com`
- **Account Name**: `Krzysztofdzugaj@gmail.com's Account`

## 🗄️ D1 Databases

### jewelry-analytics-db
- **Database ID**: `6a4f7cbb-3c1c-42c7-9d79-4ef74d421f23`
- **Name**: `jewelry-analytics-db`
- **Created**: `2025-08-05T19:37:23.876Z`
- **Version**: `production`
- **Tables**: 6 tables
  - `_cf_KV` (system table)
  - `page_views` (analytics)
  - `sqlite_sequence` (system table)
  - `conversions` (e-commerce analytics)
  - `conversations` (chat history)
  - `messages` (chat messages)
- **File Size**: `32768 bytes`

### conversations table structure:
```sql
- id (INTEGER, PRIMARY KEY)
- session_id (TEXT, NOT NULL)
- started_at (INTEGER, NOT NULL) -- Unix timestamp
- ended_at (INTEGER, NOT NULL)   -- Unix timestamp
```

### messages table structure:
```sql
- id (INTEGER, PRIMARY KEY)
- conversation_id (INTEGER, NOT NULL, FOREIGN KEY -> conversations.id)
- role (TEXT, NOT NULL) -- 'user' | 'assistant'
- content (TEXT, NOT NULL)
- created_at (INTEGER, NOT NULL) -- Unix timestamp
```

## 🗂️ KV Namespaces

### jewelry-analytics-cache
- **Namespace ID**: `61bccce88f8d4df3a3369d5da8563b51`
- **Title**: `jewelry-analytics-cache`
- **URL Encoding Support**: `true`
- **Usage**: Cache dla analityki i konfiguracji MCP
- **Current Content**: Empty (available for use)

### MY_KV
- **Namespace ID**: `08f16276a9b14ca7b3c00404e8e8d0d9`
- **Title**: `MY_KV`
- **URL Encoding Support**: `true`
- **Usage**: Sesje użytkowników w głównym workerze (SESSIONS_KV)

## 🧮 Vectorize Indexes

### autorag-epir-chatbot-rag
- **Index Name**: `autorag-epir-chatbot-rag`
- **Dimensions**: `1024` (używa bge-large-en-v1.5 model)
- **Metric**: `cosine`
- **Description**: `Cloudflare Managed AutoRAG.`
- **Created**: `2025-08-23T08:37:56.193551Z`
- **Modified**: `2025-08-23T08:37:56.193551Z`
- **Usage**: RAG knowledge base dla produktów jubilerskich

## 🤖 Workers AI
- **Binding**: `AI`
- **Access**: Remote (zawsze używa produkcyjnego API)
- **Models in use**:
  - `@cf/baai/bge-large-en-v1.5` (embeddings, 1024 dim)
  - Potencjalnie inne modele LLM

## 👷 Workers

### epir-art-jewellery-worker (GŁÓWNY)
- **Name**: `epir-art-jewellery-worker`
- **URL**: `https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev/`
- **Purpose**: Główna aplikacja Shopify z chat botem
- **Features**: 
  - Shopify App Proxy integration
  - SSE streaming chat
  - HMAC verification
  - Durable Objects (SessionDO)
  - Rate limiting

### jewelry-rag-mcp-server (NOWY MCP)
- **Name**: `jewelry-rag-mcp-server`
- **Purpose**: Model Context Protocol server do zarządzania infrastrukturą
- **Features**:
  - JSON-RPC 2.0 protocol
  - Bearer token authentication
  - 11 management tools
- **Status**: W development

## 🔧 Shared Bindings Configuration

### D1 Database Binding
```toml
[[d1_databases]]
binding = "DB"
database_name = "jewelry-analytics-db"
database_id = "6a4f7cbb-3c1c-42c7-9d79-4ef74d421f23"
```

### KV Bindings
```toml
# Config dla MCP
[[kv_namespaces]]
binding = "CONFIG_KV"
id = "61bccce88f8d4df3a3369d5da8563b51"

# Sesje użytkowników (shared)
[[kv_namespaces]]
binding = "SESSIONS_KV"
id = "08f16276a9b14ca7b3c00404e8e8d0d9"
```

### Vectorize Binding
```toml
[[vectorize]]
binding = "VECTORIZE_INDEX"
index_name = "autorag-epir-chatbot-rag"
```

### AI Binding
```toml
[ai]
binding = "AI"
```

## 🏗️ Architecture Overview

```
┌─────────────────────┐    ┌──────────────────────┐
│ epir-art-jewellery  │    │ jewelry-rag-mcp      │
│ -worker             │    │ -server              │
│ (Shopify App)       │    │ (Infrastructure MCP) │
└─────────┬───────────┘    └─────────┬────────────┘
          │                          │
          └──────────┬─────────────────┘
                     │ SHARED RESOURCES
          ┌──────────▼─────────────────────┐
          │                              │
    ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼──────┐
    │ D1        │ │ KV        │ │ Vectorize  │
    │ jewelry-  │ │ analytics │ │ autorag-   │
    │ analytics │ │ + sessions│ │ epir-chat  │
    │ -db       │ │           │ │ bot-rag    │
    └───────────┘ └───────────┘ └────────────┘
```

## 🚦 Current Status
- ✅ **D1 Database**: Configured and in use
- ✅ **KV Namespaces**: Both configured and available
- ✅ **Vectorize Index**: Created with 1024 dimensions
- ✅ **Main Worker**: Deployed and operational
- 🟡 **MCP Server**: In development, ready for testing
- 🟡 **AI Binding**: Available, charges apply even in dev

## 🔐 Security Notes
- Bearer token authentication dla MCP: `MCP_SERVER_AUTH_TOKEN`
- HMAC verification dla Shopify App Proxy
- Separate bindings umożliwiają controlled access
- Development bypasses dostępne dla testów

## 📝 Next Steps
1. Deploy MCP server to production
2. Configure production environment IDs
3. Set up MCP authentication tokens
4. Test cross-worker communication if needed
5. Monitor usage and costs
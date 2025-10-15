# Jewelry RAG MCP Server

Serwer Model Context Protocol (MCP) dla aplikacji bota konwersacyjnego RAG marki jubilerskiej, hostowany na Cloudflare Workers.

## 🏗️ Architektura

Ten serwer MCP umożliwia zewnętrznemu agentowi AI bezpieczne zarządzanie:

- **Bazą Wiedzy** (Cloudflare Vectorize)
- **Historią Konwersacji** (Cloudflare D1)
- **Monitoringiem** (AI Gateway Analytics)
- **Konfiguracją** (Cloudflare KV)

## 🚀 Szybki Start

### 1. Instalacja Dependencies

```bash
npm install
```

### 2. Konfiguracja Cloudflare

Przed wdrożeniem skonfiguruj następujące zasoby w Cloudflare:

#### D1 Database
```bash
# Utwórz bazę danych D1
wrangler d1 create jewelry-rag-db

# Zaktualizuj database_id w wrangler.toml
# Utwórz tabele (przykładowy schemat)
wrangler d1 execute jewelry-rag-db --local --file=schema.sql
```

#### KV Namespace
```bash
# Utwórz przestrzeń nazw KV
wrangler kv:namespace create "CONFIG_KV"

# Zaktualizuj id w wrangler.toml
```

#### Vectorize Index
```bash
# Utwórz indeks Vectorize
wrangler vectorize create jewelry-products-index --dimensions=384 --metric=cosine
```

#### Sekrety
```bash
# Ustaw token autoryzacji MCP
wrangler secret put MCP_SERVER_AUTH_TOKEN

# Ustaw token API Cloudflare (dla Analytics)
wrangler secret put CLOUDFLARE_API_TOKEN

# Ustaw Account ID
wrangler secret put CLOUDFLARE_ACCOUNT_ID
```

### 3. Rozwój Lokalny

```bash
npm run dev
```

### 4. Wdrożenie

```bash
npm run deploy
```

## 🔧 Dostępne Narzędzia MCP

### 📚 Zarządzanie Bazą Wiedzy

#### `insertKnowledge`
Dodaje nowe dokumenty do bazy wektorowej.

```json
{
  "documents": [
    {
      "id": "product-001",
      "text": "Złoty pierścionek z diamentem...",
      "metadata": {"category": "rings", "price": 2500}
    }
  ]
}
```

#### `deleteKnowledge`
Usuwa dokumenty z bazy wektorowej.

```json
{
  "document_ids": ["product-001", "product-002"]
}
```

#### `rebuildIndex`
Przebudowuje całą bazę wiedzy z zewnętrznego źródła.

```json
{
  "source_url": "https://example.com/products.json"
}
```

### 💾 Zarządzanie Konwersacjami

#### `queryConversations`
Przeszukuje historię konwersacji klienta.

```json
{
  "customer_id": "user-123",
  "date_range_start": "2024-01-01",
  "date_range_end": "2024-12-31"
}
```

#### `getConversationTranscript`
Pobiera pełny zapis konwersacji.

```json
{
  "session_id": "session-456"
}
```

#### `archiveOldConversations`
Archiwizuje stare konwersacje.

```json
{
  "days": 90
}
```

### 📊 Monitoring i Analiza

#### `getAiGatewayLogs`
Pobiera logi AI Gateway z filtrowaniem.

```json
{
  "filter_options": {
    "status_code": 500,
    "has_cache_hit": true
  },
  "time_window_minutes": 60
}
```

#### `checkCacheHitRatio`
Sprawdza wskaźnik trafień cache.

```json
{}
```

### 🚀 Konfiguracja Aplikacji

#### `updateSystemPrompt`
Aktualizuje prompt systemowy bota.

```json
{
  "new_prompt": "Jesteś ekspertem jubilerskim..."
}
```

#### `getSystemPrompt`
Pobiera aktualny prompt systemowy.

```json
{}
```

#### `listBindings`
Wyświetla skonfigurowane powiązania Workera.

```json
{}
```

## 🔐 Autoryzacja

Wszystkie żądania do serwera MCP muszą zawierać nagłówek autoryzacji:

```
Authorization: Bearer YOUR_MCP_SERVER_AUTH_TOKEN
```

## 📡 Endpoint API

Serwer MCP dostępny jest pod adresem:

```
POST /mcp
```

### Przykładowe żądanie MCP:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "insertKnowledge",
    "arguments": {
      "documents": [
        {
          "id": "ring-001",
          "text": "Elegancki złoty pierścionek z brylantem",
          "metadata": {"category": "rings", "material": "gold"}
        }
      ]
    }
  }
}
```

### Przykładowa odpowiedź:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"success\": true, \"results\": [{\"id\": \"ring-001\", \"status\": \"inserted\"}]}"
      }
    ]
  }
}
```

## 🛠️ Rozwój

### Struktura Projektu

```
src/
├── index.ts          # Główny plik z logiką MCP i narzędziami
├── mcp/              # (legacy - można usunąć)
├── models/           # (legacy - można usunąć)
├── services/         # (legacy - można usunąć)
└── utils/            # (legacy - można usunąć)
```

### Dodawanie Nowych Narzędzi

1. Dodaj definicję narzędzia do tablicy `tools`
2. Zaimplementuj funkcję obsługi w `toolHandlers`
3. Przetestuj lokalnie za pomocą `npm run dev`

## 🔍 Troubleshooting

### Sprawdzanie statusu serwera
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" https://your-worker.workers.dev/health
```

### Testowanie narzędzi MCP
```bash
curl -X POST https://your-worker.workers.dev/mcp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 📝 License

MIT
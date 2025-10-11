# Analiza Brakujących Bindingów w wrangler.toml

## 🔍 Problem: Brakujące Bindingi

### Aktualna Sytuacja (HEAD/main)
W obecnej wersji `worker/wrangler.toml` **BRAKUJE**:
- ❌ `[[vectorize]]` - binding dla VECTOR_INDEX
- ❌ `compatibility_flags = ["nodejs_compat"]`
- ❌ Konfiguracje środowisk (staging/production)
- ❌ Nazwy: database zmieniona z "epir_art_jewellery" na "jewelry-analytics-db"

### Co JEST w obecnej wersji:
- ✅ KV namespace (SESSIONS_KV)
- ✅ D1 Database (DB)
- ✅ Durable Objects (SESSION_DO)
- ✅ AI binding
- ✅ WORKER_ORIGIN (dodany przeze mnie)

## 📊 Historia Zmian

### Commit z PEŁNYMI bindingami: `131d449`
**Tytuł:** "Fix App Proxy endpoint and add environment configs"  
**Data:** Wcześniejszy commit

**Zawartość:**
```toml
name = "epir-art-jewellery-worker"
main = "src/index.ts"
compatibility_date = "2025-09-30"
compatibility_flags = ["nodejs_compat"]  # ← JEST

[durable_objects]
bindings = [
  { name = "SESSION_DO", class_name = "SessionDO" }
]

[[d1_databases]]
binding = "DB"
database_name = "epir_art_jewellery"  # ← Oryginalna nazwa
database_id = "6a4f7cbb-3c1c-42c7-9d79-4ef74d421f23"

[[kv_namespaces]]
binding = "SESSIONS_KV"
id = "08f16276a9b14ca7b3c00404e8e8d0d9"

[[vectorize]]  # ← JEST!
binding = "VECTOR_INDEX"
index_name = "autorag-epir-chatbot-rag"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["SessionDO"]

[ai]
binding = "AI"

[vars]
ALLOWED_ORIGIN = "https://epir-art-silver-jewellery.myshopify.com"

# Staging environment
[env.staging]
name = "epir-art-jewellery-worker-staging"
workers_dev = true

[env.staging.vars]
ALLOWED_ORIGIN = "https://epir-art-silver-jewellery.myshopify.com"
```

### Commit gdzie zniknęły: `70f32ae`
**Tytuł:** "feat: Complete AI assistant security and testing implementation"  
**Data:** Późniejszy commit

**Co się stało:**
- Usunięto `[[vectorize]]` binding
- Usunięto `compatibility_flags`
- Usunięto konfiguracje środowisk
- Zmieniono nazwę bazy danych

### Obecny stan: `HEAD` (5e7a45d)
**Nie ma zmian w wrangler.toml** - pozostały zmiany z commitu 70f32ae

## 🎯 Dlaczego to powoduje problemy?

### 1. Testy zakładają obecność VECTOR_INDEX
W `test/rag.test.ts` znajduje się **15 odniesień** do `VECTOR_INDEX`:

```typescript
// Przykłady z testów:
mockEnv.VECTOR_INDEX.query(...)
mockEnv.VECTOR_INDEX.upsert(...)
expect(...).toThrow('VECTOR_INDEX binding not available')
```

### 2. Kod używa VECTOR_INDEX opcjonalnie
W `src/index.ts` kod sprawdza obecność VECTOR_INDEX:

```typescript
// Fallback logic
} else if (env.VECTOR_INDEX && env.AI) {
  ragContext = await searchShopPoliciesAndFaqs(
    userMessage,
    env.VECTOR_INDEX,  // ← Używane gdy dostępne
    env.AI,
    5
  );
}
```

### 3. Wpływ na testy

**51 testów failujących** dotyczy głównie:
- ❌ `test/rag.test.ts` - testy RAG zakładające VECTOR_INDEX
- ❌ `test/auth.test.ts` - brak zmiennej SECRET (nie w wrangler.toml, tylko w testach)
- ❌ `test/mcp.test.ts` - problemy z funkcjami które nie są eksportowane
- ❌ `test/index.test.ts` - błąd składniowy (który naprawiłem)

## 🔬 Szczegółowa Analiza Różnic

### Utracone Bindingi:
```diff
- compatibility_flags = ["nodejs_compat"]
- [[vectorize]]
- binding = "VECTOR_INDEX"
- index_name = "autorag-epir-chatbot-rag"
```

### Zmienione Nazwy:
```diff
- database_name = "epir_art_jewellery"
+ database_name = "jewelry-analytics-db"
```

### Utracone Konfiguracje Środowisk:
```diff
- [env.staging]
- name = "epir-art-jewellery-worker-staging"
- workers_dev = true
```

## 🤔 Analiza Przyczyn

### Możliwe Scenariusze:

1. **Celowa Zmiana podczas refaktoringu** (commit 70f32ae)
   - Być może Vectorize nie był jeszcze skonfigurowany w Cloudflare
   - Kod został przystosowany do działania BEZ Vectorize (fallback do MCP)
   - Testy NIE zostały zaktualizowane odpowiednio

2. **Nieukończona migracja**
   - Przejście z Vectorize na czysty MCP
   - Testy pozostały ze starego podejścia

3. **Konflikt podczas merge**
   - Merge z branch 'feat/rag-backend-setup' (commit 8e64a2b)
   - Mogły zostać utracone bindingi

## 📋 Status Funkcjonalności

### Co DZIAŁA bez VECTOR_INDEX:
- ✅ MCP-based product search (`searchProductCatalogWithMCP`)
- ✅ MCP-based policy search (`searchShopPoliciesAndFaqsWithMCP`)
- ✅ Fallback do MCP gdy brak Vectorize
- ✅ Chat z AI (Groq/Workers AI)

### Co NIE DZIAŁA bez VECTOR_INDEX:
- ❌ Bezpośrednie embeddings search w Vectorize
- ❌ Funkcje `embedText()`, `search()`, `upsertDocuments()`
- ❌ Testy zakładające VECTOR_INDEX (51 testów)

## 💡 Rekomendacje

### Opcja 1: Przywrócić VECTOR_INDEX
Jeśli planujesz używać Vectorize:
```bash
git show 131d449:worker/wrangler.toml > worker/wrangler.toml.with-vectorize
# Review i merge odpowiednich sekcji
```

### Opcja 2: Zaktualizować testy
Jeśli Vectorize nie jest używany:
- Usuń/dostosuj testy używające VECTOR_INDEX
- Skoncentruj się na testach MCP
- Zaktualizuj mock'i w testach

### Opcja 3: Hybrydowe podejście (ZALECANE)
Pozostaw kod z opcjonalnym VECTOR_INDEX:
```typescript
if (env.VECTOR_INDEX && env.AI) {
  // Use Vectorize when available
} else {
  // Fallback to MCP
}
```

## 🎓 Wnioski

1. **Vectorize NIE jest obecnie skonfigurowany** w wrangler.toml
2. **Kod obsługuje brak Vectorize** dzięki fallback do MCP
3. **Testy nie zostały zaktualizowane** po usunięciu Vectorize
4. **Ostatni pełny config:** commit `131d449`
5. **Zmiany nastąpiły w:** commit `70f32ae`

## 📝 Dodatkowe Obserwacje

### Zmiany Nazewnicze:
- `epir_art_jewellery` → `jewelry-analytics-db`
- To sugeruje zmianę strategii/architektury

### Brakujące Flagii:
- `nodejs_compat` - może być potrzebna dla niektórych pakietów Node.js

### Środowiska:
- Brak konfiguracji staging/production
- Wszystko deployuje się do jednego środowiska

## ⚙️ Następne Kroki (DO ROZWAŻENIA):

1. **Decyzja:** Czy używamy Vectorize czy tylko MCP?
2. **Jeśli TAK na Vectorize:** 
   - Przywróć bindingi z commit 131d449
   - Skonfiguruj Vectorize index w Cloudflare
   - Deploy z pełnym configiem
3. **Jeśli NIE:**
   - Dostosuj/usuń testy używające VECTOR_INDEX
   - Dodaj testy dla MCP fallback
   - Wyczyść kod z nieużywanych funkcji Vectorize

---

**Podsumowanie:** Bindingi zniknęły podczas commitu `70f32ae` prawdopodobnie celowo, ale testy nie zostały odpowiednio zaktualizowane. Ostatnia wersja z pełnymi bindingami to commit `131d449`.

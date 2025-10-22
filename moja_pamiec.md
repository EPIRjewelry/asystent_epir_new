# 🧠 Pamięć Projektu - EPIR-ART-JEWELLERY
**Data:** 2025-10-22  
**Branch:** `wip/move-shop-chat-agent`  
**Ostatni commit:** `ff666a9` - feat(security): Priority 1 & 3 - HMAC hardening + luxury prompt

---

## ✅ CO WŁAŚNIE ZROBILIŚMY (dziś)

### **Priority 1 (HMAC Security - CRITICAL) ✅ ZAKOŃCZONE**
1. **Utworzono moduł `worker/src/hmac.ts`** (191 linii, 5 funkcji):
   - `computeHmac()` - generowanie HMAC-SHA256 (hex)
   - `verifyHmac()` - **constant-time comparison** (zapobiega timing attacks)
   - `parseSignature()` - parsowanie hex/base64
   - `canonicalizeParams()` - Shopify query canonicalization
   - `verifyTimestamp()` - replay attack prevention (5min okno)

2. **Zrefaktorowano `worker/src/security.ts`**:
   - Zastąpiono inline `crypto.subtle` → używa funkcji z `hmac.ts`
   - Dodano constant-time comparison (BEZPIECZEŃSTWO!)
   - Uproszczono logikę (usunięto fallback z `&`)

3. **Testy:**
   - 44/44 testy jednostkowe w `worker/test/unit/hmac.test.ts` ✅
   - 4 nowe testy brzegowe w `worker/test/auth.test.ts` ✅
   - 18/18 auth.test.ts przechodzi ✅
   - **Wynik:** 167/172 testy OK (5 starych błędów RAG/MCP - puste mocki, NIE związane z HMAC)

### **Priority 3 (Luxury Tone - HIGH) ✅ ZAKOŃCZONE**
1. **Zaktualizowano `LUXURY_SYSTEM_PROMPT`** w:
   - `worker/src/groq.ts`
   - `worker/src/cloudflare-ai.ts`

2. **Nowy prompt zawiera:**
   - Ton haute-couture z filozofią i sztuką
   - Przykłady: ❌ ZŁY vs ✅ DOBRY
   - Humor, Art Deco, minimalizm
   - Struktura 3-5 zdań
   - Instrukcje MCP (koszyk/zamówienia)

3. **Testy:**
   - Rozszerzono `worker/test/groq.test.ts` z 4 do 18 testów ✅

### **Nowe pliki:**
- `.github/copilot-instructions.md` - mandat "Fazy Dopracowania" (5 priorytetów)
- `worker/src/hmac.ts` - moduł HMAC
- `worker/test/unit/hmac.test.ts` - testy HMAC (44 testy)

---

## 🚀 STAN WDROŻENIA

**✅ KOD W PRODUKCJI:**
- Wdrożono przez `wrangler deploy` (Exit Code: 0)
- Worker działa na: `asystent.epirbizuteria.pl/*`
- Version ID: `2a054c4a-a486-4efa-a152-d8f349cc2203`

**✅ KOD W GITHUB:**
- Branch: `wip/move-shop-chat-agent`
- Commit: `ff666a9` (pushed)
- URL: https://github.com/EPIRjewelry/asystent_epir_new/tree/wip/move-shop-chat-agent

---

## 📊 OTWARTE PULL REQUESTY (Dependabot)

### **PR #34** - `@types/node` 20.19.22 → 24.8.1
- **Status:** 🟡 Open (unstable)
- **Typ:** Dependencies (dev)
- **Wpływ:** ⚠️ Major bump (20 → 24), wymaga sprawdzenia kompatybilności
- **Rekomendacja:** Przeczekać, sprawdzić CI checks

### **PR #35** - `actions/setup-node` v4 → v6
- **Status:** 🟡 Open (unstable)
- **Typ:** GitHub Actions
- **Breaking changes:**
  - Automatyczny caching tylko dla npm (OK dla nas)
  - Wymaga runner v2.327.1+
- **Rekomendacja:** Sprawdzić CI, potem można merge

---

## 🎯 CO DALEJ (Priorytety z `.github/copilot-instructions.md`)

### **Priority 1 (HMAC) ✅ ZAKOŃCZONE**
- Moduł utworzony, zintegrowany, przetestowany
- 🔒 Constant-time comparison aktywny
- 🔒 Replay protection aktywny

### **Priority 2 (Performance) ⏸️ ODROCZONE**
- Cold start optimization
- Latency measurements
- Timeouty dla RAG/Groq
- **Dlaczego odroczone:** Brak problemów w produkcji, nie krytyczne

### **Priority 3 (UX/Ton) ✅ ZAKOŃCZONE**
- LUXURY_SYSTEM_PROMPT z haute-couture tonem
- 18 testów walidacji promptu

### **Priority 4 (Logging) ⏳ NASTĘPNY**
- Dodać `console.log/warn/error` w:
  - `worker/src/security.ts` (HMAC failures)
  - `worker/src/index.ts` (rate limits, DO errors)
  - `worker/src/mcp_server.ts` (tool failures)
- **Czas:** ~15 minut
- **Wartość:** Diagnostyka w produkcji

### **Priority 5 (Testing) 🔄 W TRAKCIE**
- ✅ 44 testy HMAC
- ✅ 4 testy brzegowe auth
- ❌ 5 testów RAG/MCP failuje (mocki)

---

## 🛠️ ARCHITEKTURA PROJEKTU

### **Stack:**
- **Runtime:** Cloudflare Workers (Node.js compat)
- **Language:** TypeScript (strict mode)
- **Testing:** Vitest v1.6.1 (69+ testów)
- **Deployment:** `wrangler deploy`

### **Infrastruktura Cloudflare:**
- **D1:** `epir_art_jewellery` (conversations/messages)
- **KV:** `SESSIONS_KV` (session metadata)
- **Vectorize:** `autorag-epir-chatbot-rag` (RAG embeddings)
- **Durable Objects:**
  - `SessionDO` - stan sesji użytkownika
  - `RateLimiterDO` - 20 req/60s limit

### **AI:**
- **Workers AI:** `@cf/meta/llama-3.1-8b-instruct`
- **Groq:** `llama-3.3-70b-versatile` (opcjonalny)
- **RAG:** Vectorize + MCP tools

### **Shopify:**
- **App Proxy:** `/apps/assistant/*` → worker
- **Theme Extension:** `extensions/asystent-klienta/`
- **HMAC:** SHA-256 verification (constant-time!)

---

## 🧪 TESTY - AKTUALNY STAN

**Passing:** 167/172 (97%)  
**Failing:** 5 (RAG/MCP - puste mocki, NIE blokujące)  
**Skipped:** 4 (deprecated/edge cases)

### **Suity testów:**
- ✅ `test/auth.test.ts` - 18/18 (11 starych + 7 nowych)
- ✅ `test/unit/hmac.test.ts` - 44/44 (nowe)
- ✅ `test/groq.test.ts` - 18/18 (4 stare + 14 nowych)
- ✅ `test/graphql.test.ts` - 8/8
- ✅ `test/cloudflare-ai.test.ts` - 12/12
- ✅ `test/index.test.ts` - 34/34
- ✅ `test/unit/rate-limiter.test.ts` - 5/5
- ❌ `test/rag.test.ts` - 23/26 (3 failują - puste mocki produktów)
- ❌ `test/unit/mcp.test.ts` - 9/11 (2 failują - puste mocki)

### **Znane problemy testów:**
1. **RAG/MCP mocki zwracają puste produkty** - wymaga poprawki mocków
2. **TypeScript errors w groq.ts** - property 'buffer' (nie blokujące testów)

---

## 📁 KLUCZOWE PLIKI (zmodyfikowane dziś)

### **Nowe:**
```
.github/copilot-instructions.md          # Mandat dopracowania
worker/src/hmac.ts                       # Moduł HMAC (191 linii)
worker/test/unit/hmac.test.ts            # Testy HMAC (44 testy)
```

### **Zmodyfikowane:**
```
worker/src/security.ts                   # Integracja HMAC
worker/src/groq.ts                       # LUXURY_SYSTEM_PROMPT
worker/src/cloudflare-ai.ts              # LUXURY_SYSTEM_PROMPT
worker/test/auth.test.ts                 # +4 testy brzegowe
worker/test/groq.test.ts                 # 4→18 testów
```

---

## 🔧 KOMENDY DO PAMIĘTANIA

### **Testy:**
```powershell
cd worker
npm test                          # Wszystkie testy
npm test -- auth.test.ts          # Konkretny plik
npm test -- hmac.test.ts          # Testy HMAC
npx tsc --noEmit                  # TypeScript check
```

### **Wdrożenie:**
```powershell
cd worker
wrangler deploy                   # Deploy do produkcji
```

### **Git:**
```powershell
git status
git add .
git commit -m "message"
git push origin wip/move-shop-chat-agent
```

---

## 💡 NA NOWYM KOMPIE ZACZNIJ OD:

1. **Sklonuj repo:**
   ```powershell
   git clone https://github.com/EPIRjewelry/asystent_epir_new.git
   cd asystent_epir_new
   git checkout wip/move-shop-chat-agent
   ```

2. **Zainstaluj zależności:**
   ```powershell
   cd worker
   npm install
   ```

3. **Uruchom testy (weryfikacja):**
   ```powershell
   npm test
   ```
   Powinno być: **167/172 passing**

4. **Przeczytaj:**
   - `.github/copilot-instructions.md` - lista priorytetów
   - Ten plik (`moja_pamiec.md`) - kontekst

5. **Następny krok:**
   - **Priority 4 (Logging)** - dodać logowanie w 3 plikach (~15 min)
   - LUB naprawić 5 failujących testów RAG/MCP (mocki)

---

## 🎯 KLUCZOWE DECYZJE DZIŚ

1. ✅ **HMAC integracja PRZED Performance** - bezpieczeństwo > optymalizacja
2. ✅ **Constant-time comparison** - zapobiega timing attacks (CRITICAL!)
3. ✅ **Nie przepisujemy SessionDO** - zgodnie z mandatem "Fazy Dopracowania"
4. ✅ **5 failujących testów RAG/MCP NIE BLOKUJĄ** - problem z mockami, nie kodem
5. ⏸️ **PR #34 i #35 Dependabot** - czekamy na stable CI checks

---

## 📞 KONTAKT Z PROJEKTEM

- **Repo:** https://github.com/EPIRjewelry/asystent_epir_new
- **Branch:** `wip/move-shop-chat-agent`
- **Produkcja:** https://asystent.epirbizuteria.pl/
- **Worker URL:** https://epir-art-jewellery-worker.krz...

---

**🚀 Gotowe do pracy na nowym kompie! Powodzenia!**
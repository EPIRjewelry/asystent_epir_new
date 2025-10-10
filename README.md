# EPIR-ART-JEWELLERY (Cloudflare-first Shopify Assistant)

[![CI](https://github.com/EPIRjewelry/asystent_epir_new/actions/workflows/ci.yml/badge.svg)](https://github.com/EPIRjewelry/asystent_epir_new/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Inteligentny asystent zakupowy oparty na Cloudflare Workers (z D1/KV/Durable Objects) + Theme App Extension (TAE). Zapewnia streamowany chat z AI (Groq, Workers AI, opcjonalnie RAG z Vectorize) oraz zintegrowane narzędzia (pozyskiwanie produktów z Shopify, polecenia shop policy).

## 🎉 Recent Updates (2025-10-07)

**✅ FIXED: CI/CD Pipeline - TypeScript & Dependencies**
- Added missing TypeScript dependency to worker/package.json
- Fixed import paths in test files (../worker/src → ../src)
- Enhanced tsconfig.json with proper module resolution
- All 69 tests passing, type checking successful
- CI pipeline now fully operational

📚 **New Documentation**: [CI_CD_SETUP.md](./CI_CD_SETUP.md) | [CI_FIX_SUMMARY.md](./CI_FIX_SUMMARY.md)

**Previous Update (2025-10-06)**
- ✅ Fixed App Proxy Integration & Duplicate Workers Issue
- Corrected TAE endpoint: `/apps/epir-assistant/chat` → `/apps/assistant/chat`
- Added staging environment configuration
- Enhanced GitHub Actions workflow

📚 **Documentation**: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) | [FIX_SUMMARY.md](./FIX_SUMMARY.md)

Krótki opis:
- Theme App Extension (widget) w `extensions/asystent-klienta`
- Backend Cloudflare Worker + Durable Object + D1 w `worker/`
- Zero Prisma; stan live w DO, archiwum w D1.

## Setup (skrót)
1) Shopify App (Partner Dashboard)
   - Włącz App Proxy (np. subpath: /apps/assistant → kieruj do publicznego URL Workera)
   - Zainstaluj TAE w sklepie, dodaj blok "Asystent klienta (AI)" do sekcji
2) Cloudflare
   - Utwórz D1 (np. epir_art_jewellery) i wgraj `worker/schema.sql`
   - Utwórz KV (SESSIONS_KV)
   - Uzupełnij `worker/wrangler.toml` (IDs dla D1, KV, Vectorize, Queue)
   - Zdefiniuj sekrety (patrz niżej) i uruchom deploy: `npm run worker:deploy`

---

Live deployment
- Deployed Worker URL: https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev

3) Zmienne środowiskowe (Workers Vars / Secrets)
   - **SHOPIFY_APP_SECRET**: Klucz tajny aplikacji Shopify. **Wymagany do autoryzacji App Proxy.**
   - **GROQ_API_KEY**: klucz do usługi Groq (opcjonalnie, jeśli integrujesz Groq LLM)
   - ALLOWED_ORIGIN: np. `https://twoj-sklep.myshopify.com`
   - Ustawianie sekretów (przykład):

```powershell
cd worker
wrangler secret put SHOPIFY_APP_SECRET
wrangler secret put GROQ_API_KEY
```

4) TAE → Worker
   - `assistant.js` woła `/apps/assistant/chat` (App Proxy) → kierowane do Workera `/chat`
5) Test
   - W sklepie otwórz stronę z blokiem i wyślij wiadomość; odpowiedź to na razie Echo.

## Architektura
- TAE → Worker `/chat` → Durable Object (SessionDO) append → (RAG/LLM/tools) → append → reply
- DO `end()` flushuje historię do D1 (tabele conversations/messages)

## Backend (Cloudflare Worker) – szybki start

1. Instalacja zależności i local dev:

```powershell
cd worker
npm install
npm run dev
```

2. Budowanie / sprawdzenie typów (CI też uruchamia ten krok):

```powershell
cd worker
npx tsc --project tsconfig.json
```

3. Deploy na Cloudflare:

```powershell
cd worker
npm run deploy
```

4. Zamykanie sesji i archiwizacja w D1:
   - Durable Object przechowuje bieżącą historię w pamięci + storage; po zakończeniu rozmowy wywołaj `POST /chat` z `stream=false`, a po stronie DO możesz opcjonalnie wywołać `/end` (lub dodać automatyczne wywołanie w webhooku).

5. Dev bypass HMAC:
   - W `wrangler.toml` ustaw `DEV_BYPASS = "1"`, a w żądaniu dodaj nagłówek `x-dev-bypass: 1`, aby testować bez podpisu Shopify (tylko lokalnie!).

## Bezpieczeństwo
Endpoint `/chat` jest chroniony za pomocą weryfikacji sygnatury **HMAC**, zgodnie z oficjalnym i bezpiecznym mechanizmem Shopify App Proxy.
- **Konfiguracja**: Musisz ustawić zmienną `SHOPIFY_APP_SECRET` w sekretach Cloudflare Workers. Klucz ten znajdziesz w panelu deweloperskim swojej aplikacji w Shopify.
- **Działanie**: Tylko żądania poprawnie podpisane przez Shopify zostaną przetworzone. Wszystkie inne próby dostępu zostaną odrzucone z błędem `401 Unauthorized`.

## Następne kroki

### 📚 Dokumentacja
- **[ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md)** - Szczegółowa analiza architektury z diagramem Mermaid flow
- **[EVALUATION.md](./EVALUATION.md)** - Kompleksowa ocena kodu, tabela per-file, rekomendacje i next steps

### 🚀 Priority Actions
1. **RAG Implementation** - Aktywuj Vectorize query w `worker/src/rag.ts` (wykorzystaj binding `VECTOR_INDEX`)
2. **Groq LLM** - Zintegruj `worker/src/groq.ts` z luxury Polish prompt dla luksusowego tonu
3. **Populate Data** - Uruchom `scripts/populate-vectorize.ts` aby zaindeksować shop policies, FAQs, produkty
4. **E2E Tests** - Dodaj Playwright testy dla streaming flow i HMAC verification
5. **Deploy Automation** - Workflow `.github/workflows/deploy.yml` dla auto-deploy na git tags

### ✅ Już Zaimplementowane
- ✓ SSE streaming do TAE z delta-based updates
- ✓ HMAC verification (constant-time, bezpieczny)
- ✓ Rate limiting (20 req/60s per session)
- ✓ D1 persistence (conversations + messages)
- ✓ Durable Objects dla sesji (global distribution)
- ✓ Comprehensive unit tests (30 tests passing)

## Continuous Integration (GitHub Actions)

Repozytorium zawiera prosty workflow CI w `.github/workflows/ci.yml`, który uruchamia instalację zależności i podstawowy TypeScript check przy push/PR do `main`.

Jeżeli chcesz, mogę rozbudować CI o testy (Vitest), lint (ESLint) oraz deploy Workera przy tagu `v*`.

### 🔍 Encoding Check Workflow

Automatyczny workflow sprawdza poprawność kodowania plików (UTF-8 bez BOM) przy każdym push/PR.

**Jeśli build Cloudflare Worker'a failuje z błędem `Unexpected "\xff"` (UTF-16 / bad encoding):**

```bash
# Sprawdź kodowanie (dry-run)
npx tsx worker/scripts/remove-bom.ts --dry-run

# Napraw problemy z kodowaniem (tworzy backupy z timestampem)
npx tsx worker/scripts/remove-bom.ts --apply
```

Więcej informacji: [worker/scripts/README.md](./worker/scripts/README.md)

## Nowe zdalne repo

Projekt został skopiowany do nowego repozytorium: https://github.com/EPIRjewelry/asystent_epir_new

## Licencja

Ten projekt jest dostępny na licencji MIT — zobacz plik `LICENSE`.


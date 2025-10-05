# EPIR-ART-JEWELLERY (Cloudflare-first Shopify Assistant)

[![CI](https://github.com/EPIRjewelry/asystent_epir_new/actions/workflows/ci.yml/badge.svg)](https://github.com/EPIRjewelry/asystent_epir_new/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

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
   - Uzupełnij `wrangler.toml` (IDs dla D1 i KV)
   - Deploy: `npm run worker:deploy`

---

Live deployment
- Deployed Worker URL: https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev

3) Zmienne środowiskowe (Workers Vars)
   - **SHOPIFY_APP_SECRET**: Klucz tajny aplikacji Shopify. **Wymagany do autoryzacji.**
   - ALLOWED_ORIGIN: https://twoj-sklep.myshopify.com
   - SHOPIFY_STOREFRONT_TOKEN: (opcjonalnie, jeśli Worker ma wołać Storefront API)
4) TAE → Worker
   - `assistant.js` woła `/apps/assistant/chat` (App Proxy) → kierowane do Workera `/chat`
5) Test
   - W sklepie otwórz stronę z blokiem i wyślij wiadomość; odpowiedź to na razie Echo.

## Architektura
- TAE → Worker `/chat` → Durable Object (SessionDO) append → (RAG/LLM/tools) → append → reply
- DO `end()` flushuje historię do D1 (tabele conversations/messages)

## Bezpieczeństwo
Endpoint `/chat` jest chroniony za pomocą weryfikacji sygnatury **HMAC**, zgodnie z oficjalnym i bezpiecznym mechanizmem Shopify App Proxy.
- **Konfiguracja**: Musisz ustawić zmienną `SHOPIFY_APP_SECRET` w sekretach Cloudflare Workers. Klucz ten znajdziesz w panelu deweloperskim swojej aplikacji w Shopify.
- **Działanie**: Tylko żądania poprawnie podpisane przez Shopify zostaną przetworzone. Wszystkie inne próby dostępu zostaną odrzucone z błędem `401 Unauthorized`.

## Następne kroki
- Dodać RAG (Vectorize) i LLM (Workers AI) + narzędzia (Shopify Storefront API)
- Włączyć streaming (SSE) do TAE

## Continuous Integration (GitHub Actions)

Repozytorium zawiera prosty workflow CI w `.github/workflows/ci.yml`, który uruchamia instalację zależności i podstawowy TypeScript check przy push/PR do `main`.

Jeżeli chcesz, mogę rozbudować CI o testy (Vitest), lint (ESLint) oraz deploy Workera przy tagu `v*`.

## Nowe zdalne repo

Projekt został skopiowany do nowego repozytorium: https://github.com/EPIRjewelry/asystent_epir_new

## Licencja

Ten projekt jest dostępny na licencji MIT — zobacz plik `LICENSE`.


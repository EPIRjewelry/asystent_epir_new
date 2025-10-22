
# EPIR-ART-JEWELLERY — Instrukcja dla Agenta AI (Faza Dopracowania)

Cel tego dokumentu: nakierować agenta AI wyłącznie na dopracowanie, optymalizację, testowanie i debugowanie istniejącej aplikacji. Aplikacja jest już wdrożona; absolutnie nie zmieniamy jej bazowej architektury ani końcówek produkcyjnych.

Najważniejsze zasady (MANDAT):
- Nie modyfikuj architektury: TAE → App Proxy → Worker → SessionDO → D1/KV/Vectorize. Zmiany to wyłącznie poprawki, rozszerzenia testów, logowanie, optymalizacja implementacji istniejących funkcji.
- Priorytetyzuj zadania według listy „Obszar / Cel / Priorytet” poniżej.
- Wszystkie zmiany muszą mieć testy jednostkowe/integracyjne i przejść `npm test` + `npx tsc --noEmit` w `worker/`.

Priorytety (co robić najpierw):
1) Bezpieczeństwo — HMAC (Krytyczny)
  - Cel: Dopracować i rozbudować testy jednostkowe HMAC (Vitest) dla `worker/src/security.ts`.
  - Konkretne akcje: dodać testy dla canonicalization (multi-value params, sort order), obsługi hex vs base64, timestamp replay, empty body, large bodies.
  - Plik do zmiany/testów: `worker/test/auth.test.ts` (rozszerzyć istniejące scenariusze).

2) Wydajność — Cold Start / Latency (Wysoki)
  - Cel: Upewnić się, że Durable Objects są inicjalizowane minimalnie i że wywołania RAG/Groq mają timeouty/fallbacky.
  - Konkretne akcje: dodać krótkie mierniki czasu/logowanie (start/end) w `worker/src/index.ts` oraz zabezpieczyć callMcpTool/streamGroqResponse z timeout+retry; dodać testy jednostkowe/smoke dla szybkiego pathu bez RAG.
  - Pliki: `worker/src/index.ts`, `worker/src/rag.ts`, `worker/src/groq.ts`.

3) UX / Luksusowy Ton — Groq prompt tuning (Wysoki)
  - Cel: Udoskonalić `LUXURY_SYSTEM_PROMPT` w `worker/src/groq.ts`, dodać walidację outputu (np. JSON schema) dla narzędzi MCP.
  - Konkretne akcje: mała refaktoryzacja promptu + testy integracyjne `worker/test/groq.test.ts` aby walidować, że model otrzymuje kontekst i nie halucynuje.

4) Stabilność — Logging & Monitoring (Wysoki)
  - Cel: Dodać rozsądne logowanie błędów i kluczowych zdarzeń (HMAC fail, rate-limit, DO errors, RAG failures).
  - Konkretne akcje: instrumentować strategiczne miejsca w `worker/src/security.ts`, `worker/src/index.ts`, `worker/src/mcp_server.ts`. Użyj console.log/warn/error + opcjonalne metadane (request id/session id). Nie wprowadzaj zewnętrznych zależności.

5) Testowanie — Generowanie testów na żądanie (Standard)
  - Cel: Tworzyć testy (Vitest) dla krytycznych ścieżek: HMAC, rate-limiter, DO state transitions, RAG fallbacks, streaming SSE parsing.
  - Konkretne pliki z testami: `worker/test/*.test.ts` i `worker/test/unit/*.test.ts`.

Minimalne kontrakty przy wprowadzaniu zmian
- Inputs/outputs: Zmiany muszą zachować obecny publiczny kontrakt HTTP i format SSE; nie zmieniaj kluczy request/response ani schematu danych wysyłanego do TAE.
- Error modes: Loguj błędy, zwracaj istniejące statusy (np. 401 dla HMAC) — nie zmieniaj kodów HTTP używanych obecnie.
- Success criteria: Wszystkie nowe testy green; `npm test` i `npx tsc --noEmit` w `worker/` PASS.

Przykłady konkretnych testów HMAC do dodać (do `worker/test/auth.test.ts`):
- test('handles multi-value query params canonicalization') — potwierdź, że `a=1&a=2&b=3` jest kanonizowane jak oczekiwane;
- test('accepts hex and base64 signature encodings') — wygeneruj obie formy i sprawdź OK;
- test('rejects replay via timestamp outside 5min window') — sprawdź reason `timestamp_out_of_range`;
- test('verifies empty body vs non-empty body behavior') — sprawdź canonical concat rules.

Quick commands (z poziomu projektu):
```powershell
cd worker
npm install
npm test
npx tsc --noEmit
```

Rules for the agent (procedural):
- Nigdy nie wprowadzać breaking changes do routingu, configu `wrangler.toml`, `shopify.app.toml`, ani do `extensions/asystent-klienta/blocks/assistant.liquid`.
- Preferuj małe, bezpieczne poprawki i testy: max 1-3 pliki modyfikowane na PR, z jasnym changelogiem i testami.
- Jeśli zmiana wymaga nowych zasobów Cloudflare (D1/KV/Vectorize/AI), najpierw zaproponuj plan i dopiero potem modyfikuj kod testowy.

Co mogę zrobić teraz (propozycje działań, wybierz jedną):
1. Rozszerzyć `worker/test/auth.test.ts` o dodatkowe przypadki HMAC (najwyższy priorytet).
2. Dodać bezpieczne logowanie w `worker/src/security.ts` i `worker/src/index.ts` oraz dodać 2-3 testy smoke.
3. Zaktualizować `LUXURY_SYSTEM_PROMPT` w `worker/src/groq.ts` i dodać test walidujący schemat outputu.

Powiedz proszę, którą akcję mam wykonać teraz (domyślnie: 1 — rozszerzyć testy HMAC). Jeśli chcesz, przygotuję PR z commitami i uruchomię testy lokalnie.

---
Proszę o feedback: czy priorytety i zasady są zgodne z Twoimi oczekiwaniami? Jeśli tak — przystąpię do implementacji (zacznę od HMAC tests i uruchomię `npm test`).

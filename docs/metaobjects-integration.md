# Metaobiekty, Knowledge Base i MCP — notatka

Data: 2025-10-23

Krótka konkluzja z analizy repozytorium i panelu Shopify (Query log):

- Do 2025-10-11 zapytania były widoczne w panelu Shopify Knowledge Base.
- Agent EPIR już wtedy kierował zapytania przez MCP / własny backend (Cloudflare Worker).
- Mimo użycia MCP, logi Query log zawierały zapytania do 11.10.2025 — po tej dacie przestały się zapisywać.
- Wnioski: brak zapisu rozmów w KB wynika nie z błędu agenta, lecz ze zmiany zachowania po stronie Shopify/MCP (lub ze zmiany ścieżki integracji, tzn. zapytania nie przechodzą przez natywny endpoint Knowledge Base).

Zastosowanie Metaobiektów w kontekście projektu (konkretne wskazówki):

- Metaobiekty jako centralne encje: `Gemstone`, `Style`, `Material`, `PersonalizationOption`, `Collection`.
- Produkty mają metafield typu `metaobject_reference` (np. `specyfikacja_kamienia`) wskazujący na pojedynczy metaobiekt.
- MCP -> twarde filtrowanie: budować filtry po polach metaobiektów (np. `metafields.specyfikacja_kamienia.nazwa == 'Diament'`).
- RAG -> semantyczne użycie pól opisowych metaobiektów (`description_for_rag`) oraz KB/Vectorize jako fallback.
- Synonimy i `nazwa_kanoniczna` w metaobiekcie: słownik NLU (mapowanie user query → canonical entity).

Proponowane krótkie kroki techniczne (gdzie dodać w repo):

- `worker/src/mcp.ts` lub `worker/src/shopify-mcp-client.ts`: dodać `resolveMetaobjects(query)` i `buildMcpFilterFromEntities(entities)`.
- `worker/src/rag.ts`: używać `description_for_rag` metaobiektów przy tworzeniu RAG context.
- `worker/src/index.ts` / `worker/src/handlers/chat.ts`: przed wywołaniem MCP rozwiązywać encje i przekazywać filtry MCP.
- `scripts/populate-vectorize.ts`: indeksować pola `description_for_rag` i `nazwa_kanoniczna + synonimy` metaobiektów.
- Testy: `worker/test/unit/mcp.test.ts` i `worker/test/rag.test.ts` (mapowanie i formatowanie).

Ryzyka i uwagi:

- Ambiguity: wiele metaobiektów pasujących do synonimu → wymaga disambiguation (top-N, dialog doprecyzowujący).
- Uprawnienia API Admin: dostęp do metaobiektów wymaga tokenów i rate limitów — cache w KV.
- Zmiana w metaobiekcie powinna unieważniać cache wyników wyszukiwania.

Wnioski końcowe:

Metaobiekty + metafieldy to naturalne rozwiązanie dla uporządkowania atrybutów (kamienie, style, personalizacje). W naszej aplikacji Agent EPIR pozwolą na spójne mapowanie zapytań (NLU) do twardych filtrów MCP oraz na bogatszy kontekst RAG. Implementacja wymaga: resolvera metaobiektów, buildera filtrów MCP, indeksacji opisów do Vectorize oraz dodania testów.

# PRIVATE APP DOGMA — Asystent-EPIR-Jewellery

To jest oficjalne, niezmienne oświadczenie dotyczące tej aplikacji i jej przeznaczenia.

- Nazwa aplikacji: Asystent-EPIR-Jewellery
- Client ID: 74ac36ea2ce7f727f5ef7874a9b1697f
- Przeznaczenie: APLIKACJA PRYWATNA — działa wyłącznie na sklepie:
  `epir-art-silver-jewellery.myshopify.com`
- Organizacja partnerów: EPIR sp. z o.o.

Jeżeli aplikacja zostanie zainstalowana na innym sklepie lub powiązana z inną organizacją, to uznajemy to za nieautoryzowane użycie.

Weryfikacja:
- Admin sklepu produkcyjnego: https://admin.shopify.com/store/epir-art-silver-jewellery
- MCP endpoint: https://epir-art-silver-jewellery.myshopify.com/api/mcp
- Worker: epir-art-jewellery-worker (Cloudflare)

Procedura awaryjna:
1. Jeśli aplikacja pojawi się pod innym sklepem, natychmiast odinstaluj.
2. Sprawdź `shopify.app.toml` i `wrangler.toml` w repozytorium.
3. Zaktualizuj `SHOP_DOMAIN` i wypchnij zmiany; odśwież sekret `SHOPIFY_STOREFRONT_TOKEN` w Cloudflare.

Data utworzenia: 2025-10-10
Autor: właściciel aplikacji (EPIR)

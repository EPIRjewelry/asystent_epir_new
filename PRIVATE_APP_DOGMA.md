# PRIVATE APP DOGMA — Agent EPIR Art Jewellery

To jest oficjalne, niezmienne oświadczenie dotyczące tej aplikacji i jej przeznaczenia.

- Nazwa aplikacji: **Agent EPIR Art Jewellery**
- Client ID: `abbb8988e6c96ba5ca0c3545de0d3491`
- Przeznaczenie: **APLIKACJA PRYWATNA** — działa wyłącznie na sklepie:
  `epir-art-silver-jewellery.myshopify.com`
- Custom Domain: `epirbizuteria.pl`
- Organizacja partnerów: **EPIR Art Jewellery&Gemstone**
- Data migracji: 2025-10-10

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

# INSTRUKCJE - Stworzenie nowej aplikacji Shopify i instalacja

## 1. Utwórz nową aplikację w Shopify Partners

Otwórz: https://partners.shopify.com/

Kroki:
1. Kliknij **Apps** → **Create app**
2. Wybierz **Create app manually**
3. Nazwa aplikacji: `Asystent-EPIR-v2`
4. App URL: `https://shopify.dev/apps/default-app-home`

## 2. Skonfiguruj aplikację

W panelu nowo utworzonej aplikacji:

### Configuration → App setup:
- **App URL**: https://shopify.dev/apps/default-app-home
- **Allowed redirection URL(s)**: 
  ```
  https://shopify.dev/apps/default-app-home/api/auth
  ```

### Configuration → App proxy:
- **Subpath prefix**: `apps`
- **Subpath**: `assistant`
- **Proxy URL**: `https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev`

### API access:
Zaznacz uprawnienia (scopes):
- `read_products`
- `read_customers`
- `read_orders`

## 3. Skopiuj credentials

Po utworzeniu aplikacji:
1. Przejdź do **Overview** lub **API credentials**
2. Skopiuj:
   - **API key** (client ID)
   - **API secret key** (SHOPIFY_APP_SECRET)

## 4. Zaktualizuj lokalne pliki

### Plik: `shopify.app.toml`
Otwórz i zamień:
```toml
client_id = "WKLEJ_TUTAJ_API_KEY"
```

### Plik: `worker/wrangler.toml` (lub Cloudflare Dashboard)
Dodaj/zaktualizuj w sekcji [vars] lub jako secret:
```toml
SHOPIFY_APP_SECRET = "WKLEJ_TUTAJ_API_SECRET"
```

**WAŻNE**: Nie commituj API secret do repozytorium! Ustaw go jako secret w Cloudflare Dashboard:
- Workers → Twój worker → Settings → Variables → Add variable (encrypted)

## 5. Wdróż Worker z nowym secret

```powershell
cd C:\Users\user\epir_asystent\EPIR-ART-JEWELLERY\worker
npx wrangler deploy
```

## 6. Wygeneruj link instalacyjny

Po zaktualizowaniu `client_id` w `shopify.app.toml`, użyj tego szablonu:

```
https://NAZWA_SKLEPU.myshopify.com/admin/oauth/authorize?client_id=TWOJ_NOWY_CLIENT_ID&scope=read_products,read_customers,read_orders&redirect_uri=https%3A%2F%2Fshopify.dev%2Fapps%2Fdefault-app-home%2Fapi%2Fauth&state=install_v2
```

Zamień:
- `NAZWA_SKLEPU` → np. epir-art-silver-jewellery
- `TWOJ_NOWY_CLIENT_ID` → API key z Partners

LUB użyj Partners → Distribution → Generate install link.

## 7. Zainstaluj aplikację

1. Otwórz wygenerowany link w przeglądarce (zalogowany jako admin sklepu)
2. Zaakceptuj uprawnienia
3. Aplikacja zostanie zainstalowana

## 8. Test działania

1. Otwórz sklep storefront
2. Dodaj blok theme app extension (Theme editor → Add block → Asystent klienta)
3. Wyślij testową wiadomość przez widget
4. Sprawdź DevTools → Network → request do `/apps/assistant/chat` powinien mieć `signature` i zwrócić odpowiedź JSON

## Backup

Twoje stare pliki konfiguracyjne są w:
`C:\Users\user\epir_asystent\backup_shopify_20251004_233555\`

Możesz je usunąć po pomyślnej migracji.

## Troubleshooting

- Jeśli "invalid installation link" → sprawdź czy `client_id` i `redirect_uri` dokładnie pasują (case-sensitive)
- Jeśli 401 HMAC → sprawdź czy `SHOPIFY_APP_SECRET` w Workerze jest poprawny
- Jeśli proxy nie działa → sprawdź czy App proxy URL w Partners dokładnie pasuje do Twojego Workera

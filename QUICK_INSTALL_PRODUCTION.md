# 🚀 INSTALACJA NA SKLEP PRODUKCYJNY - Agent EPIR Art Jewellery

**Data**: 2025-10-10  
**Organizacja**: EPIR Art Jewellery&Gemstone  
**Sklep**: epir-art-silver-jewellery.myshopify.com

---

## ⚡ SZYBKA INSTALACJA (3 KROKI)

### KROK 1: Zainstaluj aplikację na sklepie

**Kliknij ten link (zaloguj się jako admin):**

```
https://admin.shopify.com/store/epir-art-silver-jewellery/oauth/install_custom_app?client_id=abbb8988e6c96ba5ca0c3545de0d3491
```

✅ Zatwierdź uprawnienia  
✅ Aplikacja pojawi się w: **Admin → Apps → Agent EPIR Art Jewellery**

---

### KROK 2: Wdróż extension na sklep

```powershell
cd C:\Users\user\epir_asystent\EPIR-ART-JEWELLERY
shopify app deploy
```

✅ Wybierz: Release new version  
✅ Potwierdź wdrożenie

---

### KROK 3: Aktywuj widget w Theme Editor

1. **Admin → Online Store → Themes**
2. Kliknij **Customize** na AKTYWNYM motywie (lub kopii testowej)
3. Dodaj blok: **"Asystent Klienta AI"** (znajdziesz w Apps)
4. Umieść gdzie chcesz (np. footer, header, floating button)
5. **SAVE**

---

## 🔐 Sekrety Cloudflare (już skonfigurowane)

✅ `SHOP_DOMAIN = "epir-art-silver-jewellery.myshopify.com"` (w wrangler.toml)  
✅ `SHOPIFY_STOREFRONT_TOKEN` (secret w Cloudflare)  
✅ `SHOPIFY_APP_SECRET` (secret w Cloudflare)

**Jeśli potrzebujesz zaktualizować:**

```powershell
cd C:\Users\user\epir_asystent\EPIR-ART-JEWELLERY\worker
wrangler secret put SHOPIFY_APP_SECRET
wrangler secret put SHOPIFY_STOREFRONT_TOKEN
```

---

## 📊 Dane Aplikacji

| Pole | Wartość |
|------|---------|
| **Nazwa** | Agent EPIR Art Jewellery |
| **Client ID** | `abbb8988e6c96ba5ca0c3545de0d3491` |
| **Organizacja** | EPIR Art Jewellery&Gemstone |
| **Worker URL** | https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev |
| **App Proxy** | /apps/assistant/* |
| **Custom Domain** | epirbizuteria.pl |
| **Shopify Domain** | epir-art-silver-jewellery.myshopify.com |

---

## ✅ Weryfikacja po instalacji

**Test 1**: Health check worker

```powershell
curl.exe https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev/health
# Wynik: "ok"
```

**Test 2**: App Proxy (przez custom domain)

```powershell
# Uwaga: może przekierować 301 z .myshopify.com na epirbizuteria.pl
curl.exe https://epirbizuteria.pl/apps/assistant/health -L
```

**Test 3**: Widget na storefront

1. Otwórz: https://epirbizuteria.pl
2. Sprawdź czy widget się pojawia
3. Wyślij testową wiadomość: "Pokaż pierścionki z diamentem"

**Test 4**: Monitor logs w czasie rzeczywistym

```powershell
cd worker
wrangler tail --format pretty
```

---

## 🎨 Aktywacja Extension (szczegóły)

Po wdrożeniu extension przez `shopify app deploy`:

1. Extension **automatycznie jest dostępny** dla sklepu
2. **NIE** pojawi się automatycznie na storefront
3. Musisz **ręcznie dodać** go w Theme Editor

**Kroki w Theme Editor:**

```
Admin → Online Store → Themes → Customize
  ↓
Kliknij "Add section" lub "Add app block"
  ↓
Znajdź: "Asystent Klienta AI" (w sekcji Apps)
  ↓
Dodaj, dostosuj pozycję, SAVE
```

---

## 🔍 Troubleshooting

### Problem: 401 Unauthorized na /apps/assistant/chat

**Przyczyna**: HMAC signature nie pasuje  
**Rozwiązanie**: Sprawdź `SHOPIFY_APP_SECRET`:

1. Shopify Partners → Apps → Agent EPIR Art Jewellery → Configuration
2. Skopiuj "API secret key"
3. `wrangler secret put SHOPIFY_APP_SECRET` (wklej secret)

### Problem: Widget nie pojawia się na storefront

**Przyczyna**: Extension nie został aktywowany w Theme Editor  
**Rozwiązanie**: Zobacz "KROK 3" powyżej

### Problem: 404 Not Found na /apps/assistant/*

**Przyczyna 1**: App Proxy potrzebuje czasu (do 5 min po instalacji)  
**Przyczyna 2**: Aplikacja nie została zainstalowana na sklepie  
**Rozwiązanie**: 
- Sprawdź: Admin → Apps → czy "Agent EPIR Art Jewellery" jest na liście
- Jeśli nie - użyj linku instalacyjnego z KROKU 1

### Problem: 301 Redirect z myshopify.com na epirbizuteria.pl

**To normalne!** Shopify automatycznie przekierowuje na primary domain.  
App Proxy działa na obu domenach, ale ostateczny endpoint to zawsze primary domain.

---

## 📝 Notatki Ważne

- Aplikacja jest **custom app** - działa tylko dla Twojego sklepu
- **Primary domain**: epirbizuteria.pl (customers widzą tę domenę)
- **Shopify domain**: epir-art-silver-jewellery.myshopify.com (admin, backend)
- Widget wysyła żądania przez **App Proxy**: `/apps/assistant/chat`
- Worker obsługuje HMAC verification dla bezpieczeństwa
- MCP endpoint: `https://epir-art-silver-jewellery.myshopify.com/api/mcp`

---

## 🎯 Następne Kroki Po Instalacji

1. ✅ Zainstaluj aplikację (KROK 1)
2. ✅ Wdróż extension (KROK 2)
3. ✅ Aktywuj w Theme Editor (KROK 3)
4. 🧪 Przetestuj na kopii motywu (recommended)
5. 🚀 Przenieś na główny motyw (production)
6. 📊 Monitoruj logi i zachowanie użytkowników

---

**Gotowy?** Kliknij link instalacyjny z KROKU 1! 🚀

# 🏢 Konfiguracja Organizacji Shopify Partners

## Aktualna Konfiguracja (POPRAWNA ✅)

### Organizacja Shopify Partners
- **Nazwa**: EPIR sp. z o.o.
- **Dashboard**: https://partners.shopify.com/4201011/apps/28593828659

### Aplikacja
- **Nazwa**: Asystent-EPIR-Jewellery
- **Client ID**: 74ac36ea2ce7f727f5ef7874a9b1697f
- **Organizacja**: EPIR sp. z o.o.

### Sklep Produkcyjny
- **Domena**: epir-art-silver-jewellery.myshopify.com
- **Status**: Aplikacja zainstalowana ✅
- **Extension**: epir-art-jewellery-10 wdrożony ✅

### Sklep Deweloperski
- **Domena**: epir-art-test.myshopify.com
- **Przeznaczenie**: Testy przed wdrożeniem

---

## 🎯 Następne Kroki

### 1. Wejdź do Sklepu Produkcyjnego
```
https://admin.shopify.com/store/epir-art-silver-jewellery
```

### 2. Sprawdź Zainstalowaną Aplikację
- Admin → Apps → "Asystent-EPIR-Jewellery"
- Powinna być widoczna jako zainstalowana

### 3. Aktywuj Extension w Theme Editor
- Admin → Online Store → Themes
- Kliknij "Customize" na aktywnym motywie
- Dodaj sekcję/blok: **"Asystent Klienta AI"**
- Zapisz motyw

### 4. Zweryfikuj App Proxy
```powershell
# Test App Proxy (z HMAC)
$testUrl = "https://epir-art-silver-jewellery.myshopify.com/apps/assistant/health"
curl.exe $testUrl -v
```

---

## 📋 Endpoint MCP dla Twojego Sklepu

✅ **POPRAWNY ENDPOINT MCP:**
```
https://epir-art-silver-jewellery.myshopify.com/api/mcp
```

Skonfigurowany w `worker/wrangler.toml`:
```toml
SHOP_DOMAIN = "epir-art-silver-jewellery.myshopify.com"
```

Worker automatycznie używa:
```typescript
const mcpEndpoint = `https://${env.SHOP_DOMAIN}/api/mcp`;
// = https://epir-art-silver-jewellery.myshopify.com/api/mcp
```

---

## ⚠️ Uwaga o Drugiej Organizacji

**EPIR Art Jewellery&Gemstone** - jeśli to osobna organizacja:
- Prawdopodobnie nie ma własnych dev stores
- Możesz ją zignorować lub scalić z główną organizacją
- Obecna konfiguracja z "EPIR sp. z o.o." jest PRAWIDŁOWA

---

## 🔗 Ważne Linki

**Shopify Partners Dashboard:**
- https://partners.shopify.com/4201011/apps/28593828659

**Sklep Admin (produkcja):**
- https://admin.shopify.com/store/epir-art-silver-jewellery

**Sklep Admin (dev):**
- https://admin.shopify.com/store/epir-art-test

**Worker Dashboard:**
- https://dash.cloudflare.com/?to=/:account/workers/services/view/epir-art-jewellery-worker

---

## ✅ Podsumowanie

**NIE ZMIENIAJ** obecnej konfiguracji!

Aplikacja jest poprawnie:
1. ✅ Przypisana do organizacji "EPIR sp. z o.o."
2. ✅ Zainstalowana w sklepie `epir-art-silver-jewellery`
3. ✅ Skonfigurowana z poprawnym SHOP_DOMAIN
4. ✅ Wdrożona z extension `epir-art-jewellery-10`

**Jedyne co pozostało:**
- Aktywować extension w Theme Editor sklepu produkcyjnego
- Przetestować na żywym sklepie

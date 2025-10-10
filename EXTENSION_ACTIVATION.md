# Theme App Extension - Activation & Testing Guide

## ✅ Extension Deployed Successfully!

**Version:** epir-art-jewellery-10  
**Date:** October 10, 2025  
**Link:** https://dev.shopify.com/dashboard/161978858/apps/285938286593/versions/756777648129

---

## 🎯 Quick Activation (3 Steps)

### 1. Open Theme Editor
```
Admin → Online Store → Themes → Customize (on active theme)
```

### 2. Add Extension Block
- Click "Add section" or "Add app block"
- Find: **Asystent Klienta AI** (under Apps)
- Place it where you want the chat widget
- **Save** theme

### 3. Test on Storefront
- Visit: https://epir-art-test.myshopify.com
- Chat bubble should appear (bottom-right)
- Click & test messaging

---

## 🧪 End-to-End Test Checklist

### ✅ Basic Functionality
- [ ] Widget bubble visible on page
- [ ] Click opens/closes chat window
- [ ] Can type and send messages
- [ ] Messages appear in chat history

### ✅ HMAC Verification (Security)
Open DevTools → Network → send message → check `/apps/assistant/chat`:
- [ ] URL includes `?signature=...` parameter
- [ ] Response: **200 OK** (not 401)
- [ ] HMAC verification passes

### ✅ MCP Product Search
Ask: **"Pokaż pierścionki z diamentem"**
- [ ] LLM response includes product recommendations
- [ ] Worker logs show: `[Shopify MCP] Calling search_shop_catalog`
- [ ] No MCP errors in worker logs

### ✅ Session Persistence
- [ ] Send messages → refresh page → session ID persists
- [ ] localStorage key `epir-assistant-session` exists

---

## 🔧 Configuration Verification

### Worker Secrets (Cloudflare)
```powershell
cd worker
wrangler secret list
```
Expected output:
```
[
  { "name": "SHOPIFY_APP_SECRET" },
  { "name": "SHOPIFY_STOREFRONT_TOKEN" }
]
```

### Worker Variables (wrangler.toml)
```toml
[vars]
ALLOWED_ORIGIN = "*"
SHOP_DOMAIN = "epir-art-silver-jewellery.myshopify.com"
```

### App Proxy (shopify.app.toml)
```toml
[app_proxy]
url = "https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev"
subpath = "assistant"
prefix = "apps"
```

---

## 🐛 Troubleshooting

### Issue: Widget Not Appearing
**Solutions:**
1. Verify extension is enabled in Theme Editor
2. Check browser console for JavaScript errors
3. Clear browser cache and hard reload (Ctrl+Shift+R)

### Issue: 401 Unauthorized on /apps/assistant/chat
**Solutions:**
1. Verify App Proxy configuration in Partners Dashboard
2. Check `SHOPIFY_APP_SECRET` is set correctly:
   ```powershell
   wrangler secret put SHOPIFY_APP_SECRET
   ```
3. Ensure app is installed on store

### Issue: No Product Results from MCP
**Solutions:**
1. Check worker logs: `wrangler tail --format pretty`
2. Verify `SHOPIFY_STOREFRONT_TOKEN` is set
3. Test MCP endpoint manually:
   ```powershell
   curl -X POST https://epir-art-silver-jewellery.myshopify.com/api/mcp `
     -H "Content-Type: application/json" `
     -H "X-Shopify-Storefront-Access-Token: YOUR_TOKEN" `
     -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_shop_catalog","arguments":{"query":"ring"}},"id":1}'
   ```

### Issue: CSP Errors
**Solution:** Shopify handles CSP automatically for Theme App Extensions. If errors persist:
1. Check that assets load from correct domain
2. Verify no inline scripts/styles (use external files)

---

## 📊 Monitor Worker Logs Live

```powershell
cd C:\Users\user\epir_asystent\EPIR-ART-JEWELLERY\worker
wrangler tail --format pretty
```

Expected logs when message sent:
```
[INFO] HMAC verification passed
[INFO] [Shopify MCP] Calling search_shop_catalog at https://epir-art-silver-jewellery.myshopify.com/api/mcp
[INFO] Groq LLM request with product context
```

---

## 🚀 Next Steps

1. **Activate extension in Theme Editor** (see Step 1-2 above)
2. **Test on dev store** (epir-art-test.myshopify.com)
3. **Verify all checkboxes** above pass
4. **Optional:** Set `GROQ_API_KEY` for better responses
5. **Production:** Update `SHOP_DOMAIN` and redeploy

---

## 📝 Quick Commands

```powershell
# Deploy extension
shopify app deploy

# Watch worker logs
cd worker
wrangler tail --format pretty

# Deploy worker
wrangler deploy

# List secrets
wrangler secret list

# Update shop domain
# Edit worker/wrangler.toml → [vars] SHOP_DOMAIN = "..."
```

---

**Ready to activate?** Go to Theme Editor and add the extension! 🎨

# Manual Testing Guide for HMAC Verification

## Prerequisites

- Access to Shopify Admin Panel
- SHOPIFY_APP_SECRET configured in Cloudflare Workers
- Test shop domain (e.g., `test-store.myshopify.com`)

## Option 1: Test with PowerShell Script (Recommended)

The repository includes a ready-to-use PowerShell script for testing:

```powershell
# Navigate to project root
cd /path/to/asystent_epir_new

# Run the test script
.\scripts\test_appproxy_hmac.ps1
```

**What it does:**
1. Prompts for `SHOPIFY_APP_SECRET` (securely)
2. Generates current timestamp
3. Builds canonical message with sorted parameters
4. Computes HMAC-SHA256 in hex format
5. Sends request to App Proxy or direct Worker URL
6. Displays response status and body

**Expected Output:**
```
message: shop=test-store.myshopify.comtimestamp=1234567890
signature (hex): abc123def456...
Calling: https://test-store.myshopify.com/apps/assistant/chat?...
Status: 200
Body: { ... }
```

## Option 2: Test with cURL (Linux/macOS)

### Step 1: Generate HMAC Signature

```bash
# Set variables
SHOP="test-store.myshopify.com"
TIMESTAMP=$(date +%s)
SECRET="your-shopify-app-secret"

# Build canonical message (sorted params, no separators)
MESSAGE="shop=${SHOP}timestamp=${TIMESTAMP}"

# Compute HMAC-SHA256 in hex
SIGNATURE=$(echo -n "$MESSAGE" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

echo "Message: $MESSAGE"
echo "Signature: $SIGNATURE"
```

### Step 2: Send Request

**Via App Proxy:**
```bash
curl "https://${SHOP}/apps/assistant/chat?shop=${SHOP}&timestamp=${TIMESTAMP}&signature=${SIGNATURE}" \
  -v \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'
```

**Direct to Worker:**
```bash
WORKER_URL="https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev"

curl "${WORKER_URL}/chat?shop=${SHOP}&timestamp=${TIMESTAMP}&signature=${SIGNATURE}" \
  -v \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'
```

### Expected Response

**Success (200 OK):**
```json
{
  "reply": "Assistant response here...",
  "sessionId": "..."
}
```

**Failed HMAC (401 Unauthorized):**
```json
{
  "error": "Invalid HMAC signature"
}
```

## Option 3: Test with Node.js

Create a test script `test-hmac.js`:

```javascript
import crypto from 'crypto';

const SHOP = 'test-store.myshopify.com';
const TIMESTAMP = Math.floor(Date.now() / 1000).toString();
const SECRET = 'your-shopify-app-secret';

// Build canonical message (Shopify App Proxy format)
const message = `shop=${SHOP}timestamp=${TIMESTAMP}`;

// Compute HMAC-SHA256
const hmac = crypto.createHmac('sha256', SECRET);
hmac.update(message);
const signature = hmac.digest('hex');

console.log('Message:', message);
console.log('Signature:', signature);

// Build request URL
const url = `https://${SHOP}/apps/assistant/chat?shop=${SHOP}&timestamp=${TIMESTAMP}&signature=${signature}`;
console.log('URL:', url);

// Send request
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'test' })
});

console.log('Status:', response.status);
console.log('Body:', await response.text());
```

Run it:
```bash
node test-hmac.js
```

## Option 4: Test Multi-Value Parameters

Test with multiple values for same parameter:

```bash
# Message with multi-value param (comma-joined)
MESSAGE="ids=1,2,3shop=${SHOP}timestamp=${TIMESTAMP}"
SIGNATURE=$(echo -n "$MESSAGE" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

# URL with separate param instances
curl "https://${SHOP}/apps/assistant/chat?ids=1&ids=2&ids=3&shop=${SHOP}&timestamp=${TIMESTAMP}&signature=${SIGNATURE}" \
  -X POST
```

## Option 5: Test Header-Based Signature (Base64)

```bash
# Build canonical message (different format for header mode)
BODY='{"message":"test"}'
PARAMS="shop=${SHOP}"
CANONICAL="${PARAMS}\n${BODY}"

# Compute HMAC-SHA256 and convert to base64
SIGNATURE_BASE64=$(echo -n -e "$CANONICAL" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)

# Send with header
curl "https://${SHOP}/apps/assistant/chat?shop=${SHOP}" \
  -X POST \
  -H "X-Shopify-Hmac-Sha256: ${SIGNATURE_BASE64}" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

## Troubleshooting

### 401 Unauthorized

**Possible causes:**
1. **Wrong secret**: Verify `SHOPIFY_APP_SECRET` matches your app settings
2. **Timestamp expired**: Shopify may reject signatures older than 60 seconds
3. **Incorrect canonical format**: Ensure parameters are sorted and formatted correctly
4. **Encoding issues**: Use decoded values in canonical message

**Debug steps:**
```bash
# Check what message Worker is building
# Add console.log in worker/src/auth.ts temporarily:
console.log('Canonical message:', message);
console.log('Received signature:', receivedHex);
console.log('Computed signature:', computedHex);

# Then check Worker logs:
wrangler tail
```

### Different Signature Every Time

This is **expected** if you're using timestamps! Generate signature with same timestamp for testing:

```bash
TIMESTAMP=1234567890  # Fixed timestamp for testing
```

### URL Encoding Issues

Ensure special characters are properly handled:

```bash
# Test with special chars
MESSAGE="param=hello worldshop=${SHOP}"
# URLSearchParams will decode "hello%20world" to "hello world"
```

## Verification Checklist

After testing, verify:

- [ ] Valid signature returns 200 OK
- [ ] Invalid signature returns 401 Unauthorized
- [ ] Multi-value params work correctly (`ids=1&ids=2` → canonical: `ids=1,2`)
- [ ] URL-encoded params are decoded properly (`hello%20world` → `hello world`)
- [ ] Both header (base64) and query (hex) formats work
- [ ] Timestamp validation works (if implemented)
- [ ] Worker logs show HMAC verification success/failure

## Security Notes

⚠️ **Never commit or log the `SHOPIFY_APP_SECRET`**

✅ Use environment variables or secure secret storage

✅ Test in development environment first

✅ Rotate secrets regularly in production

## Next Steps

1. Run automated test suite:
   ```bash
   cd worker
   npm test -- auth.test.ts
   ```

2. Review security documentation:
   - [SECURITY_REVIEW.md](./SECURITY_REVIEW.md)
   - [HMAC_VERIFICATION_FLOW.md](./HMAC_VERIFICATION_FLOW.md)

3. Deploy to production with confidence! 🚀

---

*For questions or issues, refer to [PR_28_SUMMARY.md](./PR_28_SUMMARY.md)*

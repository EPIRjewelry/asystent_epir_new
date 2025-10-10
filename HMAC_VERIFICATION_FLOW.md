# Shopify App Proxy HMAC Verification Flow

## Overview Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Shopify App Proxy Request                     │
│                                                                   │
│  GET /apps/assistant/chat?                                       │
│    shop=test.myshopify.com&                                      │
│    timestamp=1234567890&                                         │
│    ids=1&ids=2&ids=3&                                           │
│    param=hello%20world&                                         │
│    signature=abc123def456...                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Step 1: Parse & Filter Parameters                   │
│                                                                   │
│  ✓ URLSearchParams automatically decodes URL encoding            │
│  ✓ Filter out: signature, hmac, shopify_hmac                    │
│  ✓ Extract multi-values: ids=[1,2,3]                            │
│                                                                   │
│  Params after filtering:                                         │
│    shop = "test.myshopify.com"                                  │
│    timestamp = "1234567890"                                      │
│    ids = ["1", "2", "3"]                                        │
│    param = "hello world"  (decoded!)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Step 2: Sort Keys Alphabetically                    │
│                                                                   │
│  Array.from(params.keys()).sort()                               │
│                                                                   │
│  Sorted keys: ["ids", "param", "shop", "timestamp"]            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│        Step 3: Build Canonical Message (Query Mode)             │
│                                                                   │
│  For each key:                                                   │
│    - Get all values: params.getAll(key)                         │
│    - Join multi-values with comma: values.join(',')             │
│    - Format: key=value                                           │
│                                                                   │
│  Parts:                                                          │
│    ids=1,2,3                                                    │
│    param=hello world                                             │
│    shop=test.myshopify.com                                      │
│    timestamp=1234567890                                          │
│                                                                   │
│  Join WITHOUT separators:                                        │
│    "ids=1,2,3param=hello worldshop=test.myshopify.comtimestamp=1234567890"
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Step 4: Compute HMAC-SHA256                         │
│                                                                   │
│  Key: SHOPIFY_APP_SECRET                                        │
│  Message: canonical string from Step 3                           │
│  Algorithm: HMAC-SHA256                                          │
│                                                                   │
│  crypto.subtle.sign('HMAC', key, message)                       │
│    → 32 bytes (256 bits)                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Step 5: Convert to Hex (Query Mode)                │
│                                                                   │
│  bytes.map(b => b.toString(16).padStart(2, '0')).join('')       │
│                                                                   │
│  Result: "abc123def456..."  (64 hex characters)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│     Step 6: Constant-Time Comparison (Timing Attack Prevention) │
│                                                                   │
│  Query Mode (hex):                                              │
│    crypto.subtle.verify(HMAC, key, receivedSig, message)        │
│    ✓ Built-in constant-time comparison                          │
│                                                                   │
│  Header Mode (base64):                                          │
│    constantTimeEqual(computedSig, receivedSig)                  │
│    ✓ XOR-based comparison without early termination             │
│                                                                   │
│  function constantTimeEqual(a, b) {                             │
│    if (a.length !== b.length) return false;                     │
│    let result = 0;                                               │
│    for (let i = 0; i < a.length; i++)                           │
│      result |= a.charCodeAt(i) ^ b.charCodeAt(i);              │
│    return result === 0;  // All bits must be 0                  │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Result                                     │
│                                                                   │
│  ✅ Signatures match     → return true   (allow request)         │
│  ❌ Signatures differ    → return false  (reject request)        │
└─────────────────────────────────────────────────────────────────┘
```

## Header Mode (Alternative Format)

```
┌─────────────────────────────────────────────────────────────────┐
│              Header-Based HMAC Verification                      │
│                                                                   │
│  POST /chat?shop=test.myshopify.com&foo=bar                     │
│  Headers:                                                        │
│    X-Shopify-Hmac-Sha256: base64signature                       │
│  Body:                                                           │
│    {"message":"test"}                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Step 1: Build Canonical Message                     │
│                                                                   │
│  Params (URL-encoded, sorted, joined with '&'):                 │
│    foo=bar&shop=test.myshopify.com                              │
│                                                                   │
│  Canonical format: params + '\n' + body                         │
│    "foo=bar&shop=test.myshopify.com\n{\"message\":\"test\"}"    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Step 2: Compute HMAC → Base64                       │
│                                                                   │
│  HMAC-SHA256 → bytes → base64                                   │
│    crypto.subtle.sign() → btoa() → base64string                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Step 3: Constant-Time Compare                       │
│                                                                   │
│  constantTimeEqual(computed, received)                          │
│    ✓ XOR-based comparison                                        │
│    ✓ No early termination                                        │
└─────────────────────────────────────────────────────────────────┘
```

## Key Differences Between Modes

| Aspect | Query Param Mode | Header Mode |
|--------|------------------|-------------|
| **Signature Location** | `?signature=...` | `X-Shopify-Hmac-Sha256: ...` |
| **Encoding** | Hex (64 chars) | Base64 (44 chars) |
| **Param Encoding** | Decoded values | URL-encoded values |
| **Separator** | None (concatenated) | `&` between params |
| **Body Included** | No | Yes (after `\n`) |
| **Comparison** | `crypto.subtle.verify()` | `constantTimeEqual()` |
| **Typical Use** | Standard Shopify App Proxy | Alternative/custom setups |

## Security Properties

### ✅ Protection Against Timing Attacks

Both modes use constant-time comparison:

```typescript
// Query mode: Built-in constant-time
crypto.subtle.verify(HMAC, key, signature, message)
  → Always takes same time regardless of where difference occurs

// Header mode: Custom constant-time
constantTimeEqual(a, b)
  → XOR all bytes, no early return
  → Timing independent of signature mismatch location
```

### ✅ Protection Against Signature Manipulation

All signature-related parameters are filtered:
- `signature` (the signature itself)
- `hmac` (alternative signature param)
- `shopify_hmac` (Shopify-specific variant)

This prevents attackers from injecting additional signature params to manipulate verification.

### ✅ Proper URL Decoding

URLSearchParams automatically handles URL decoding:
- `param=hello%20world` → `"hello world"`
- `param=foo%26bar` → `"foo&bar"`
- Canonical message uses **decoded** values

### ✅ Multi-Value Parameter Support

```
?ids=1&ids=2&ids=3

URLSearchParams.getAll('ids') → ["1", "2", "3"]
Join with comma → "ids=1,2,3"
```

## Example Verification

### Real Shopify Request
```
GET /apps/assistant/chat?
  shop=test-store.myshopify.com&
  timestamp=1234567890&
  path_prefix=/apps/assistant&
  signature=abc123...
```

### Canonical Message
```
path_prefix=/apps/assistantshop=test-store.myshopify.comtimestamp=1234567890
```

### HMAC Computation
```typescript
const message = "path_prefix=/apps/assistantshop=test-store.myshopify.comtimestamp=1234567890";
const key = "your-app-secret";
const signature = hmac_sha256(key, message).toHex();
// → "abc123..." (64 hex chars)
```

### Verification
```typescript
if (signature === receivedSignature) {
  // ✅ Request is authentic
} else {
  // ❌ Reject as unauthorized
}
```

---

*For implementation details, see [worker/src/auth.ts](./worker/src/auth.ts)*  
*For security analysis, see [SECURITY_REVIEW.md](./SECURITY_REVIEW.md)*

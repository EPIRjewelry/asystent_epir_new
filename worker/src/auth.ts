// Consolidated HMAC verification for Shopify App Proxy.
// 
// SECURITY IMPLEMENTATION NOTES:
// ===============================
// 
// 1. CANONICALIZATION (Shopify App Proxy Format):
//    - URL parameters are automatically decoded by URLSearchParams
//    - Parameters are sorted alphabetically by key
//    - Multi-value parameters are joined with commas (e.g., ids=1,2,3)
//    - Signature-related params (signature, hmac, shopify_hmac) are excluded
//    - Query mode: params joined WITHOUT separators (k1=v1k2=v2)
//    - Header mode: params joined WITH '&' separator, plus '\n' + body
// 
// 2. CONSTANT-TIME COMPARISON:
//    - Base64 signatures use custom constantTimeEqual() to prevent timing attacks
//    - Hex signatures use crypto.subtle.verify() which is constant-time
//    - Both approaches are cryptographically secure
// 
// 3. SIGNATURE FORMAT SUPPORT:
//    - Header-based: Base64-encoded HMAC-SHA256 (X-Shopify-Hmac-Sha256, etc.)
//    - Query param: Hex-encoded HMAC-SHA256 (?signature=...)
//    - Automatically detects and validates both formats
//
// Supports two common cases:
//  - header-based HMAC (base64, e.g. X-Shopify-Hmac-Sha256)
//  - query param 'signature' (hex) fallback
export async function verifyAppProxyHmac(request: Request, secret: string): Promise<boolean> {
  if (!secret) return false;

  try {
    // Prefer header-style HMAC which is common for App Proxy setups
    const headerSig =
      request.headers.get('X-Shop-Signature') ||
      request.headers.get('x-shop-signature') ||
      request.headers.get('x-shopify-hmac-sha256') ||
      request.headers.get('X-Shopify-Hmac-Sha256');

    const url = new URL(request.url);

    // Read raw body safely
    const cloned = request.clone();
    const bodyText = await cloned.text();

    if (headerSig) {
      // canonical string: params (sorted & encoded) + '\n' + body
      const params = [...url.searchParams.entries()]
        .filter(([k]) => k !== 'signature' && k !== 'hmac' && k !== 'shopify_hmac')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      const canonical = params.length > 0 ? `${params}\n${bodyText}` : bodyText || '';

      const enc = new TextEncoder();
      const keyData = enc.encode(secret);
      const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(canonical));
      const sigBytes = new Uint8Array(sigBuf);
      let binary = '';
      for (let i = 0; i < sigBytes.byteLength; i++) binary += String.fromCharCode(sigBytes[i]);
      const computedBase64 = typeof btoa === 'function' ? btoa(binary) : globalThis.btoa(binary);
      return constantTimeEqual(computedBase64, headerSig);
    }

    // Fallback: query param 'signature' (hex encoded)
    const params = new URLSearchParams(url.search);
    const receivedHex = params.get('signature');
    if (!receivedHex) return false;
    // build canonical message used by some proxies: sorted k=values joined without separators
    // Filter out signature-related params to prevent manipulation
    params.delete('signature');
    params.delete('hmac');
    params.delete('shopify_hmac');
    const keys = Array.from(new Set(Array.from(params.keys()))).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const values = params.getAll(k);
      const joined = values.length > 1 ? values.join(',') : values[0] ?? '';
      parts.push(`${k}=${joined}`);
    }
    const message = parts.join('');

    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sig = hexToBytes(receivedHex);
    if (sig.length === 0) return false;
    const signature = sig.buffer.slice(sig.byteOffset, sig.byteOffset + sig.byteLength) as ArrayBuffer;
    return crypto.subtle.verify('HMAC', cryptoKey, signature, enc.encode(message));
  } catch (e) {
    console.error('HMAC verify error', e);
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * 
 * This function uses bitwise XOR to compare strings without early termination,
 * ensuring the comparison takes the same amount of time regardless of where
 * differences occur. This prevents attackers from using timing information
 * to deduce the correct signature byte-by-byte.
 * 
 * @param a First string to compare
 * @param b Second string to compare
 * @returns true if strings are equal, false otherwise
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

/**
 * Convert hex string to byte array.
 * 
 * Validates that the input is a valid hex string (only 0-9, a-f, A-F)
 * and has an even length before conversion.
 * 
 * @param hex Hexadecimal string to convert
 * @returns Uint8Array of bytes, or empty array if invalid
 */
function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return new Uint8Array();
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return out;
}

export default { verifyAppProxyHmac };

<<<<<<< HEAD
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
=======
/**
 * worker/src/auth.ts
 *
 * Stabilna weryfikacja HMAC dla Shopify App Proxy zgodnie z oficjalną dokumentacją.
 */
>>>>>>> feat/rag-backend-setup

import type { Env } from './index';

export async function verifyAppProxyHmac(request: Request, envOrSecret: Env | string): Promise<boolean> {
  const secret = typeof envOrSecret === 'string' ? envOrSecret : envOrSecret.SHOPIFY_APP_SECRET;
  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);
  const receivedSignature = params.get('signature');
  if (!receivedSignature) return false;

  // Zbierz params jako Map (obsługuje multi-values)
  const paramMap: Map<string, string[]> = new Map();
  for (const [key, value] of params.entries()) {
    if (key !== 'signature') {
      if (!paramMap.has(key)) paramMap.set(key, []);
      paramMap.get(key)!.push(value);
    }
  }

  // Kanonikalizacja
  const sortedPairs: string[] = [];
  const sortedKeys = Array.from(paramMap.keys()).sort();
  for (const key of sortedKeys) {
    const values = paramMap.get(key)!;
    const joinedValues = values.join(',');
    sortedPairs.push(`${key}=${joinedValues}`);
  }
  const canonicalized = sortedPairs.join('');

  // Log dla debugu (usuń w prod)
  console.log('Canonicalized string:', canonicalized);
  console.log('Received signature:', receivedSignature);

  // HMAC-SHA256 z secret
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(canonicalized));
  const calculatedSignature = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Secure compare
  let receivedBytes: Uint8Array;
  try {
<<<<<<< HEAD
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
=======
    receivedBytes = hexToBytes(receivedSignature);
  } catch {
>>>>>>> feat/rag-backend-setup
    return false;
  }
  return timingSafeEqual(signatureBytes, receivedBytes);
}

/**
<<<<<<< HEAD
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
=======
 * Porównanie w stałym czasie dla ArrayBuffer lub Uint8Array.
 */
function timingSafeEqual(a: ArrayBuffer | Uint8Array, b: ArrayBuffer | Uint8Array): boolean {
  const aBytes = a instanceof Uint8Array ? a : new Uint8Array(a);
  const bBytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (aBytes.length !== bBytes.length) return false;
>>>>>>> feat/rag-backend-setup
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

/**
<<<<<<< HEAD
 * Convert hex string to byte array.
 * 
 * Validates that the input is a valid hex string (only 0-9, a-f, A-F)
 * and has an even length before conversion.
 * 
 * @param hex Hexadecimal string to convert
 * @returns Uint8Array of bytes, or empty array if invalid
=======
 * Konwertuj hex string na Uint8Array.
>>>>>>> feat/rag-backend-setup
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-f]/gi, '');
  if (clean.length % 2 !== 0) throw new Error('Invalid hex length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

export default { verifyAppProxyHmac };

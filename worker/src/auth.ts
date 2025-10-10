/**
 * worker/src/auth.ts
 *
 * Stabilna weryfikacja HMAC dla Shopify App Proxy zgodnie z oficjalną dokumentacją.
 */

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
    receivedBytes = hexToBytes(receivedSignature);
  } catch {
    return false;
  }
  return timingSafeEqual(signatureBytes, receivedBytes);
}

/**
 * Porównanie w stałym czasie dla ArrayBuffer lub Uint8Array.
 */
function timingSafeEqual(a: ArrayBuffer | Uint8Array, b: ArrayBuffer | Uint8Array): boolean {
  const aBytes = a instanceof Uint8Array ? a : new Uint8Array(a);
  const bBytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (aBytes.length !== bBytes.length) return false;
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

/**
 * Konwertuj hex string na Uint8Array.
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

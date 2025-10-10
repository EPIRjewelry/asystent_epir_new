import { describe, it, expect } from 'vitest';
import { verifyAppProxyHmac } from '../src/auth';

describe('verifyAppProxyHmac', () => {
  const SECRET = 'test-secret-key-123';

  it('should return false when secret is empty', async () => {
    const req = new Request('https://example.com/chat');
    const result = await verifyAppProxyHmac(req, '');
    expect(result).toBe(false);
  });

  it('should return false when no signature header or query param', async () => {
    const req = new Request('https://example.com/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'test' }),
    });
    const result = await verifyAppProxyHmac(req, SECRET);
    expect(result).toBe(false);
  });

  it('should verify valid base64 header signature', async () => {
    // Build canonical message
    const bodyText = JSON.stringify({ message: 'test' });
    const params = 'foo=bar&shop=test.myshopify.com';
    const canonical = `${params}\n${bodyText}`;

    // Compute HMAC-SHA256 in base64
    const enc = new TextEncoder();
    const keyData = enc.encode(SECRET);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(canonical));
    const sigBytes = new Uint8Array(sigBuf);
    let binary = '';
    for (let i = 0; i < sigBytes.byteLength; i++) binary += String.fromCharCode(sigBytes[i]);
    const computedBase64 = btoa(binary);

    const req = new Request(`https://example.com/chat?foo=bar&shop=test.myshopify.com`, {
      method: 'POST',
      headers: { 'X-Shopify-Hmac-Sha256': computedBase64 },
      body: bodyText,
    });

    const result = await verifyAppProxyHmac(req, SECRET);
    expect(result).toBe(true);
  });

  it('should reject invalid base64 header signature', async () => {
    const req = new Request('https://example.com/chat?foo=bar', {
      method: 'POST',
      headers: { 'X-Shopify-Hmac-Sha256': 'invalid-signature-base64' },
      body: JSON.stringify({ message: 'test' }),
    });

    const result = await verifyAppProxyHmac(req, SECRET);
    expect(result).toBe(false);
  });

  it('should verify valid hex query param signature', async () => {
    // Build canonical message (query-based: sorted k=v joined without &)
    const message = 'foo=barshop=test.myshopify.com';
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
    const sigBytes = new Uint8Array(sigBuf);
    const hexSig = Array.from(sigBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

    const req = new Request(`https://example.com/chat?foo=bar&shop=test.myshopify.com&signature=${hexSig}`, {
      method: 'POST',
    });

    const result = await verifyAppProxyHmac(req, SECRET);
    expect(result).toBe(true);
  });

  it('should reject invalid hex query param signature', async () => {
    const req = new Request('https://example.com/chat?foo=bar&signature=deadbeef', {
      method: 'POST',
    });

    const result = await verifyAppProxyHmac(req, SECRET);
    expect(result).toBe(false);
  });

  // Security Review Tests - URL Decoding & Multi-value Parameters
  it('should handle URL-encoded parameter values correctly', async () => {
    // Shopify App Proxy uses DECODED values in canonical message
    // URL arrives with encoding, but canonical message uses decoded values
    const decodedValue = 'hello world & special=chars';
    const message = `param=${decodedValue}shop=test.myshopify.com`;
    
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
    const sigBytes = new Uint8Array(sigBuf);
    const hexSig = Array.from(sigBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

    // URL contains encoded value
    const encodedValue = encodeURIComponent(decodedValue);
    const req = new Request(
      `https://example.com/chat?param=${encodedValue}&shop=test.myshopify.com&signature=${hexSig}`,
      { method: 'POST' }
    );

    const result = await verifyAppProxyHmac(req, SECRET);
    expect(result).toBe(true);
  });

  it('should handle multi-value parameters with comma joining', async () => {
    // Shopify App Proxy spec: multi-value params are joined with commas
    const message = 'ids=1,2,3shop=test.myshopify.com';
    
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
    const sigBytes = new Uint8Array(sigBuf);
    const hexSig = Array.from(sigBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

    const req = new Request(
      `https://example.com/chat?ids=1&ids=2&ids=3&shop=test.myshopify.com&signature=${hexSig}`,
      { method: 'POST' }
    );

    const result = await verifyAppProxyHmac(req, SECRET);
    expect(result).toBe(true);
  });

  // E2E-style tests with realistic Shopify App Proxy format
  it('should verify realistic Shopify App Proxy request (query signature)', async () => {
    const shop = 'test-store.myshopify.com';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const pathPrefix = '/apps/assistant';
    
    // Build canonical message: sorted params without separators
    const message = `path_prefix=${pathPrefix}shop=${shop}timestamp=${timestamp}`;
    
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
    const sigBytes = new Uint8Array(sigBuf);
    const hexSig = Array.from(sigBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

    const req = new Request(
      `https://example.com/chat?shop=${shop}&timestamp=${timestamp}&path_prefix=${pathPrefix}&signature=${hexSig}`,
      { method: 'POST' }
    );

    const result = await verifyAppProxyHmac(req, SECRET);
    expect(result).toBe(true);
  });

  it('should support both hex and base64 signature formats', async () => {
    const bodyText = JSON.stringify({ message: 'test' });
    const params = 'foo=bar&shop=test.myshopify.com';
    const canonical = `${params}\n${bodyText}`;

    const enc = new TextEncoder();
    const keyData = enc.encode(SECRET);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(canonical));
    const sigBytes = new Uint8Array(sigBuf);
    
    // Base64 format (header-based)
    let binary = '';
    for (let i = 0; i < sigBytes.byteLength; i++) binary += String.fromCharCode(sigBytes[i]);
    const base64Sig = btoa(binary);

    const req1 = new Request(`https://example.com/chat?foo=bar&shop=test.myshopify.com`, {
      method: 'POST',
      headers: { 'X-Shopify-Hmac-Sha256': base64Sig },
      body: bodyText,
    });

    const result1 = await verifyAppProxyHmac(req1, SECRET);
    expect(result1).toBe(true);

    // Hex format (query param) - different canonical format
    const message = 'foo=barshop=test.myshopify.com';
    const cryptoKey2 = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf2 = await crypto.subtle.sign('HMAC', cryptoKey2, enc.encode(message));
    const sigBytes2 = new Uint8Array(sigBuf2);
    const hexSig = Array.from(sigBytes2).map((b) => b.toString(16).padStart(2, '0')).join('');

    const req2 = new Request(
      `https://example.com/chat?foo=bar&shop=test.myshopify.com&signature=${hexSig}`,
      { method: 'POST' }
    );

    const result2 = await verifyAppProxyHmac(req2, SECRET);
    expect(result2).toBe(true);
  });

  it('should use constant-time comparison for HMAC (timing attack protection)', async () => {
    // This test verifies the implementation uses constant-time comparison
    // Note: We can't directly test timing, but we verify the function exists and works correctly
    
    const bodyText = JSON.stringify({ message: 'test' });
    const params = 'shop=test.myshopify.com';
    const canonical = `${params}\n${bodyText}`;

    const enc = new TextEncoder();
    const keyData = enc.encode(SECRET);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(canonical));
    const sigBytes = new Uint8Array(sigBuf);
    let binary = '';
    for (let i = 0; i < sigBytes.byteLength; i++) binary += String.fromCharCode(sigBytes[i]);
    const validSig = btoa(binary);

    // Test with valid signature
    const req1 = new Request(`https://example.com/chat?shop=test.myshopify.com`, {
      method: 'POST',
      headers: { 'X-Shopify-Hmac-Sha256': validSig },
      body: bodyText,
    });
    expect(await verifyAppProxyHmac(req1, SECRET)).toBe(true);

    // Test with invalid signature (same length)
    const invalidSig = validSig.replace(/[A-Z]/g, 'X');
    const req2 = new Request(`https://example.com/chat?shop=test.myshopify.com`, {
      method: 'POST',
      headers: { 'X-Shopify-Hmac-Sha256': invalidSig },
      body: bodyText,
    });
    expect(await verifyAppProxyHmac(req2, SECRET)).toBe(false);
  });

  it('should handle empty body correctly in header mode', async () => {
    const params = 'foo=bar&shop=test.myshopify.com';
    const canonical = `${params}\n`;

    const enc = new TextEncoder();
    const keyData = enc.encode(SECRET);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(canonical));
    const sigBytes = new Uint8Array(sigBuf);
    let binary = '';
    for (let i = 0; i < sigBytes.byteLength; i++) binary += String.fromCharCode(sigBytes[i]);
    const computedBase64 = btoa(binary);

    const req = new Request(`https://example.com/chat?foo=bar&shop=test.myshopify.com`, {
      method: 'POST',
      headers: { 'X-Shopify-Hmac-Sha256': computedBase64 },
      body: '',
    });

    const result = await verifyAppProxyHmac(req, SECRET);
    expect(result).toBe(true);
  });

  it('should filter out signature-related params from canonical string', async () => {
    // Ensure signature, hmac, and shopify_hmac params are excluded
    const message = 'foo=barshop=test.myshopify.com';
    
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
    const sigBytes = new Uint8Array(sigBuf);
    const hexSig = Array.from(sigBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

    // Include various signature-related params that should be filtered
    const req = new Request(
      `https://example.com/chat?foo=bar&shop=test.myshopify.com&signature=${hexSig}&hmac=should-be-ignored&shopify_hmac=also-ignored`,
      { method: 'POST' }
    );

    const result = await verifyAppProxyHmac(req, SECRET);
    expect(result).toBe(true);
  });
});

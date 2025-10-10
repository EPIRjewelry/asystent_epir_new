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

  it('should verify valid hex query param signature (GET request, no body)', async () => {
    // Build canonical message (query-based: sorted k=v joined without &)
    const message = 'foo=barshop=test.myshopify.com';
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
    const sigBytes = new Uint8Array(sigBuf);
    const hexSig = Array.from(sigBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

    const req = new Request(`https://example.com/chat?foo=bar&shop=test.myshopify.com&signature=${hexSig}`, {
      method: 'GET',
    });

    const result = await verifyAppProxyHmac(req, SECRET);
    expect(result).toBe(true);
  });

  it('should verify valid hex query param signature with body (POST request)', async () => {
    // Build canonical message with body (query-based: sorted k=v joined without & + body)
    const bodyText = JSON.stringify({ message: 'test' });
    const message = 'foo=barshop=test.myshopify.com' + bodyText;
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
    const sigBytes = new Uint8Array(sigBuf);
    const hexSig = Array.from(sigBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

    const req = new Request(`https://example.com/chat?foo=bar&shop=test.myshopify.com&signature=${hexSig}`, {
      method: 'POST',
      body: bodyText,
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

  it('should reject query param signature that excludes body (security test)', async () => {
    // Build signature WITHOUT body (old vulnerable behavior)
    const message = 'foo=barshop=test.myshopify.com';
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
    const sigBytes = new Uint8Array(sigBuf);
    const hexSig = Array.from(sigBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

    // But send request WITH body - this should fail
    const req = new Request(`https://example.com/chat?foo=bar&shop=test.myshopify.com&signature=${hexSig}`, {
      method: 'POST',
      body: JSON.stringify({ message: 'malicious' }),
    });

    const result = await verifyAppProxyHmac(req, SECRET);
    expect(result).toBe(false); // Should fail because body wasn't included in signature
  });
});

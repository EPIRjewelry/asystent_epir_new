import { describe, it, expect } from 'vitest';
import { verifyAppProxyHmac } from '../../src/auth';

// Small helper to compute HMAC hex
async function computeHmacHex(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

describe('App Proxy HMAC verification', () => {
  it('should verify canonicalization and signature', async () => {
    const secret = 'testsecret123';
    const params = {
      shop: 'test-shop.myshopify.com',
      path_prefix: '/apps/assistant',
      timestamp: '1697030400'
    } as any;

    // Build canonical string as Shopify expects
    const canonical = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
    const signature = await computeHmacHex(secret, canonical);

    // Build a fake Request with query string
  const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&') + `&signature=${signature}`;
    const req = new Request(`https://example.com/apps/assistant/mcp?${qs}`);

    const valid = await verifyAppProxyHmac(req, secret);
    expect(valid).toBe(true);
  });
});

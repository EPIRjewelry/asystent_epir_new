import { describe, it, expect } from 'vitest';
import { verifyAppProxyHmac, replayCheck } from '../src/security';

describe('verifyAppProxyHmac', () => {
  const SECRET = 'test-secret-key-123';
  const env = { SHOPIFY_APP_SECRET: SECRET };

  it('should return false when secret is empty', async () => {
    const req = new Request('https://example.com/chat');
    const result = await verifyAppProxyHmac(req, '');
    expect(result.ok).toBe(false);
  });

  it('should return false when no signature header or query param', async () => {
    const req = new Request('https://example.com/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'test' }),
    });
    const result = await verifyAppProxyHmac(req, env.SHOPIFY_APP_SECRET);
    expect(result.ok).toBe(false);
  });

  it('should verify valid query signature', async () => {
    // Parametry query string
    const params: { [key: string]: string } = {
      shop: 'test.myshopify.com',
      foo: 'bar',
      timestamp: Math.floor(Date.now() / 1000).toString(), // current timestamp
    };

    // Kanonikalizacja: sortuj klucze, format key=value, concat bez separatorów
    const sortedKeys = Object.keys(params).sort();
    const canonicalized = sortedKeys.map(key => `${key}=${params[key]}`).join('');

    // Body
    const bodyStr = JSON.stringify({ message: 'test' });

    // Combined: params + body
    const combined = canonicalized + bodyStr;

    // Obliczanie HMAC-SHA256 na combined
    const enc = new TextEncoder();
    const keyData = enc.encode(SECRET);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(combined));
    const computedHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Dodaj signature do query
    const queryString = sortedKeys.map(key => `${key}=${params[key]}`).join('&') + `&signature=${computedHex}`;

    const req = new Request(`https://example.com/chat?${queryString}`, {
      method: 'POST',
      body: bodyStr,
    });

    const result = await verifyAppProxyHmac(req, env.SHOPIFY_APP_SECRET);
    expect(result.ok).toBe(true);
  });

  it('should reject invalid query signature', async () => {
    const req = new Request('https://example.com/chat?foo=bar&signature=invalid-hex', {
      method: 'POST',
      body: JSON.stringify({ message: 'test' }),
    });

    const result = await verifyAppProxyHmac(req, env.SHOPIFY_APP_SECRET);
    expect(result.ok).toBe(false);
  });

  // Nowe testy dla canonicalization
  it('should handle multi-value params (canonicalization)', async () => {
    const url = new URL('https://example.com/chat');
    url.searchParams.append('a', '1');
    url.searchParams.append('a', '2'); // multi-value
    url.searchParams.set('b', '3');
    url.searchParams.set('signature', 'dummy'); // zostanie usunięty

    // Kanonikalizacja: a=1,a=2,b=3 (sortowane, multi-values)
    const canonicalized = 'a=1a=2b=3'; // bez separatorów

    const enc = new TextEncoder();
    const keyData = enc.encode(SECRET);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(canonicalized));
    const computedHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    url.searchParams.set('signature', computedHex);

    const req = new Request(url.toString(), {
      method: 'POST',
      body: '', // empty body
    });

    const result = await verifyAppProxyHmac(req, env.SHOPIFY_APP_SECRET);
    expect(result.ok).toBe(true);
  });

  it('should handle sorting params in canonicalization', async () => {
    const params: Record<string, string> = { z: 'last', a: 'first', m: 'middle' };
    const sortedKeys = Object.keys(params).sort(); // ['a', 'm', 'z']
    const canonicalized = sortedKeys.map(k => `${k}=${params[k]}`).join(''); // a=firstm=middlez=last

    const enc = new TextEncoder();
    const keyData = enc.encode(SECRET);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(canonicalized));
    const computedHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    const queryString = 'z=last&a=first&m=middle&signature=' + computedHex;

    const req = new Request(`https://example.com/chat?${queryString}`, {
      method: 'POST',
      body: '',
    });

    const result = await verifyAppProxyHmac(req, env.SHOPIFY_APP_SECRET);
    expect(result.ok).toBe(true);
  });

  // Testy dla podpisów hex
  it('should verify hex signature', async () => {
    const canonicalized = 'foo=bar';
    const bodyStr = '';
    const combined = canonicalized + bodyStr;

    const enc = new TextEncoder();
    const keyData = enc.encode(SECRET);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(combined));
    const computedHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    const req = new Request(`https://example.com/chat?foo=bar&signature=${computedHex}`, {
      method: 'POST',
      body: bodyStr,
    });

    const result = await verifyAppProxyHmac(req, env.SHOPIFY_APP_SECRET);
    expect(result.ok).toBe(true);
  });

  // Testy dla body JSON z różnym whitespace
  it('should verify with JSON body (compact)', async () => {
    const paramsCanonical = 'foo=bar';
    const bodyStr = '{"message":"test"}';
    const combined = paramsCanonical + bodyStr;

    const enc = new TextEncoder();
    const keyData = enc.encode(SECRET);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(combined));
    const computedHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    const req = new Request(`https://example.com/chat?foo=bar&signature=${computedHex}`, {
      method: 'POST',
      body: bodyStr, // raw body
    });

    const result = await verifyAppProxyHmac(req, env.SHOPIFY_APP_SECRET);
    expect(result.ok).toBe(true);
  });

  it('should verify with JSON body (with whitespace)', async () => {
    const paramsCanonical = 'foo=bar';
    const bodyStr = '{\n  "message": "test"\n}';
    const combined = paramsCanonical + bodyStr;

    const enc = new TextEncoder();
    const keyData = enc.encode(SECRET);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(combined));
    const computedHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    const req = new Request(`https://example.com/chat?foo=bar&signature=${computedHex}`, {
      method: 'POST',
      body: bodyStr, // raw body z whitespace
    });

    const result = await verifyAppProxyHmac(req, env.SHOPIFY_APP_SECRET);
    expect(result.ok).toBe(true);
  });

  it('should reject with modified body', async () => {
    const paramsCanonical = 'foo=bar';
    const bodyStr = '{"message":"test"}';
    const combined = paramsCanonical + bodyStr;

    const enc = new TextEncoder();
    const keyData = enc.encode(SECRET);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(combined));
    const computedHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    const req = new Request(`https://example.com/chat?foo=bar&signature=${computedHex}`, {
      method: 'POST',
      body: '{"message":"modified"}', // inny body
    });

    const result = await verifyAppProxyHmac(req, env.SHOPIFY_APP_SECRET);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('hmac_mismatch');
  });

  // Testy dla timestamp
  it('should reject timestamp out of range', async () => {
    const oldTimestamp = '1609459200'; // 2021-01-01
    const canonicalized = 'foo=bar';

    const enc = new TextEncoder();
    const keyData = enc.encode(SECRET);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(canonicalized));
    const computedHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    const req = new Request(`https://example.com/chat?foo=bar&timestamp=${oldTimestamp}&signature=${computedHex}`, {
      method: 'POST',
      body: '',
    });

    const result = await verifyAppProxyHmac(req, env.SHOPIFY_APP_SECRET);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('timestamp_out_of_range');
  });
});

describe('replayCheck', () => {
  it('should return ok for unused signature', async () => {
    // Mock DO stub
    const mockStub = {
      fetch: async (url: string, options: any) => {
        if (url === '/replay-check') {
          return new Response(JSON.stringify({ used: false }), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      },
    } as DurableObjectStub;

    const result = await replayCheck(mockStub, 'sig123', '1672531200');
    expect(result.ok).toBe(true);
  });

  it('should return false for used signature', async () => {
    const mockStub = {
      fetch: async (url: string, options: any) => {
        return new Response(JSON.stringify({ used: true }), { status: 200 });
      },
    } as DurableObjectStub;

    const result = await replayCheck(mockStub, 'sig123', '1672531200');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('signature_already_used');
  });

  it('should handle DO error', async () => {
    const mockStub = {
      fetch: async (url: string, options: any) => {
        return new Response('Internal Error', { status: 500 });
      },
    } as DurableObjectStub;

    const result = await replayCheck(mockStub, 'sig123', '1672531200');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('DO error');
  });
});

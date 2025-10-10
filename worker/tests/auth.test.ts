import { describe, it, expect, beforeAll } from 'vitest';
import { verifyAppProxyHmac } from '../src/auth';
import type { Env } from '../src/index';

// --- Mock Environment ---
const mockEnv: Env = {
  SHOPIFY_APP_SECRET: 'hush', // Testowy sekret, używany tylko w testach
  // Uzupełnij inne wymagane pola env, nawet jeśli są puste lub mockowe
  DB: {} as any,
  SESSIONS_KV: {} as any,
  SESSION_DO: {} as any,
  VECTOR_INDEX: {} as any,
  AI: {} as any,
  ALLOWED_ORIGIN: '*',
  SHOP_DOMAIN: 'test.myshopify.com',
  SHOPIFY_ADMIN_TOKEN: 'test_admin_token',
  SHOPIFY_STOREFRONT_TOKEN: 'test_storefront_token',
  GROQ_API_KEY: 'test_groq_key',
};

// --- Helper do tworzenia HMAC (uproszczona wersja do testów) ---
async function testHmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}


describe('HMAC Signature Verification (auth.ts)', () => {

  it('should return true for a valid signature', async () => {
    const params = new URLSearchParams({
      shop: 'some-shop.myshopify.com',
      timestamp: '1337178173',
      logged_in_customer_id: '',
      path_prefix: '/apps/test',
    });
    
    // Kanonikalizacja zgodna z Shopify
    const canonical = 'logged_in_customer_id=path_prefix=/apps/testshop=some-shop.myshopify.comtimestamp=1337178173';
    const signature = await testHmacSha256Hex(mockEnv.SHOPIFY_APP_SECRET, canonical);
    params.set('signature', signature);

    const request = new Request(`https://test.com/apps/assistant/chat?${params.toString()}`);
    
    const isValid = await verifyAppProxyHmac(request, mockEnv);
    expect(isValid).toBe(true);
  });

  it('should return false for an invalid signature', async () => {
    const params = new URLSearchParams({
      shop: 'some-shop.myshopify.com',
      timestamp: '1337178173',
    });
    params.set('signature', 'invalid-signature-123');

    const request = new Request(`https://test.com/apps/assistant/chat?${params.toString()}`);
    
    const isValid = await verifyAppProxyHmac(request, mockEnv);
    expect(isValid).toBe(false);
  });

  it('should return false if signature parameter is missing', async () => {
    const params = new URLSearchParams({
      shop: 'some-shop.myshopify.com',
      timestamp: '1337178173',
    });

    const request = new Request(`https://test.com/apps/assistant/chat?${params.toString()}`);
    
    const isValid = await verifyAppProxyHmac(request, mockEnv);
    expect(isValid).toBe(false);
  });

  it('should correctly handle parameters with special characters in values', async () => {
    const params = new URLSearchParams({
      a: '1',
      b: 'value with spaces & equals=',
      c: '3'
    });

    const canonical = 'a=1b=value with spaces %26 equals%3Dc=3';
    const signature = await testHmacSha256Hex(mockEnv.SHOPIFY_APP_SECRET, canonical);
    params.set('signature', signature);

    const request = new Request(`https://test.com/apps/assistant/chat?${params.toString()}`);
    
    const isValid = await verifyAppProxyHmac(request, mockEnv);
    expect(isValid).toBe(true);
  });
});

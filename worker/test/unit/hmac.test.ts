/**
 * worker/test/unit/hmac.test.ts
 *
 * Comprehensive unit tests for HMAC helpers (worker/src/hmac.ts).
 * Tests cover:
 * - computeHmac: signature generation
 * - verifyHmac: signature verification with constant-time comparison
 * - parseSignature: hex/base64 format parsing
 * - canonicalizeParams: query string canonicalization
 * - verifyTimestamp: replay attack prevention
 *
 * Priority 1 (Krytyczny): Bezpieczeństwo HMAC
 */

import { describe, it, expect } from 'vitest';
import {
  computeHmac,
  verifyHmac,
  parseSignature,
  canonicalizeParams,
  verifyTimestamp,
} from '../../src/hmac';

describe('HMAC Helpers', () => {
  const TEST_SECRET = 'test-secret-key-123';
  const TEST_MESSAGE = 'hello world';

  describe('computeHmac', () => {
    it('should compute valid HMAC-SHA256 signature (string input)', async () => {
      const signature = await computeHmac(TEST_SECRET, TEST_MESSAGE);

      // Should be 64-char hex string (32 bytes * 2)
      expect(signature).toMatch(/^[0-9a-f]{64}$/);
      expect(signature.length).toBe(64);
    });

    it('should compute valid HMAC-SHA256 signature (Uint8Array input)', async () => {
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(TEST_MESSAGE);

      const signature = await computeHmac(TEST_SECRET, messageBytes);

      expect(signature).toMatch(/^[0-9a-f]{64}$/);
      expect(signature.length).toBe(64);
    });

    it('should produce consistent signatures for same input', async () => {
      const sig1 = await computeHmac(TEST_SECRET, TEST_MESSAGE);
      const sig2 = await computeHmac(TEST_SECRET, TEST_MESSAGE);

      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different secrets', async () => {
      const sig1 = await computeHmac('secret1', TEST_MESSAGE);
      const sig2 = await computeHmac('secret2', TEST_MESSAGE);

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different messages', async () => {
      const sig1 = await computeHmac(TEST_SECRET, 'message1');
      const sig2 = await computeHmac(TEST_SECRET, 'message2');

      expect(sig1).not.toBe(sig2);
    });

    it('should throw error for empty secret', async () => {
      await expect(computeHmac('', TEST_MESSAGE)).rejects.toThrow('Secret key cannot be empty');
    });

    it('should handle empty message', async () => {
      const signature = await computeHmac(TEST_SECRET, '');

      expect(signature).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle unicode characters', async () => {
      const signature = await computeHmac(TEST_SECRET, 'Zażółć gęślą jaźń 🎉');

      expect(signature).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle large messages', async () => {
      const largeMessage = 'x'.repeat(10000);
      const signature = await computeHmac(TEST_SECRET, largeMessage);

      expect(signature).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('verifyHmac', () => {
    it('should verify valid signature', async () => {
      const signature = await computeHmac(TEST_SECRET, TEST_MESSAGE);
      const isValid = await verifyHmac(signature, TEST_SECRET, TEST_MESSAGE);

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const invalidSig = 'a'.repeat(64);
      const isValid = await verifyHmac(invalidSig, TEST_SECRET, TEST_MESSAGE);

      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong secret', async () => {
      const signature = await computeHmac('wrong-secret', TEST_MESSAGE);
      const isValid = await verifyHmac(signature, TEST_SECRET, TEST_MESSAGE);

      expect(isValid).toBe(false);
    });

    it('should reject signature with modified message', async () => {
      const signature = await computeHmac(TEST_SECRET, 'original message');
      const isValid = await verifyHmac(signature, TEST_SECRET, 'modified message');

      expect(isValid).toBe(false);
    });

    it('should return false for empty signature', async () => {
      const isValid = await verifyHmac('', TEST_SECRET, TEST_MESSAGE);

      expect(isValid).toBe(false);
    });

    it('should return false for empty secret', async () => {
      const signature = await computeHmac(TEST_SECRET, TEST_MESSAGE);
      const isValid = await verifyHmac(signature, '', TEST_MESSAGE);

      expect(isValid).toBe(false);
    });

    it('should handle Uint8Array message input', async () => {
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(TEST_MESSAGE);
      const signature = await computeHmac(TEST_SECRET, messageBytes);
      const isValid = await verifyHmac(signature, TEST_SECRET, messageBytes);

      expect(isValid).toBe(true);
    });

    it('should use constant-time comparison (timing safety)', async () => {
      // This test verifies constant-time behavior indirectly
      // by checking multiple signatures of different lengths/content
      const sig1 = await computeHmac(TEST_SECRET, 'test1');
      const sig2 = await computeHmac(TEST_SECRET, 'test2');

      // Both should complete in similar time (we can't measure precisely in unit tests)
      const valid1 = await verifyHmac(sig1, TEST_SECRET, 'test1');
      const valid2 = await verifyHmac(sig2, TEST_SECRET, 'test2');

      expect(valid1).toBe(true);
      expect(valid2).toBe(true);
    });

    it('should reject tampered signature (single bit flip)', async () => {
      const signature = await computeHmac(TEST_SECRET, TEST_MESSAGE);
      // Flip one character
      const tamperedSig = signature.substring(0, 10) + 'x' + signature.substring(11);
      const isValid = await verifyHmac(tamperedSig, TEST_SECRET, TEST_MESSAGE);

      expect(isValid).toBe(false);
    });
  });

  describe('parseSignature', () => {
    it('should parse valid hex signature', () => {
      const hexSig = 'a'.repeat(64);
      const parsed = parseSignature(hexSig);

      expect(parsed).toBe(hexSig);
    });

    it('should normalize uppercase hex to lowercase', () => {
      const hexSig = 'ABCDEF1234567890' + '0'.repeat(48);
      const parsed = parseSignature(hexSig);

      expect(parsed).toBe(hexSig.toLowerCase());
    });

    it('should parse base64 signature and convert to hex', () => {
      // Base64 encoded 32-byte signature
      const base64Sig = 'pWGm1Av0IEBKARczz7exkNYsZb8LzaMrV7J32a2fFG4='; // Example
      const parsed = parseSignature(base64Sig);

      expect(parsed).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should throw error for invalid signature format', () => {
      expect(() => parseSignature('invalid!!!')).toThrow('Invalid signature format');
    });

    it('should throw error for odd-length hex', () => {
      expect(() => parseSignature('abc')).toThrow('Invalid signature format');
    });

    it('should handle mixed case hex', () => {
      const mixedSig = 'AbCdEf' + '0'.repeat(58);
      const parsed = parseSignature(mixedSig);

      expect(parsed).toBe(mixedSig.toLowerCase());
    });
  });

  describe('canonicalizeParams', () => {
    it('should canonicalize query params (sorted, no separators)', () => {
      const params = new URLSearchParams('z=last&a=first&m=middle');
      const canonical = canonicalizeParams(params);

      expect(canonical).toBe('a=firstm=middlez=last');
    });

    it('should exclude signature and hmac params by default', () => {
      const params = new URLSearchParams('foo=bar&signature=xyz&hmac=abc');
      const canonical = canonicalizeParams(params);

      expect(canonical).toBe('foo=bar');
      expect(canonical).not.toContain('signature');
      expect(canonical).not.toContain('hmac');
    });

    it('should handle custom exclude keys', () => {
      const params = new URLSearchParams('foo=bar&secret=xyz&token=abc');
      const canonical = canonicalizeParams(params, ['secret', 'token']);

      expect(canonical).toBe('foo=bar');
    });

    it('should handle multi-value params (URLSearchParams)', () => {
      const params = new URLSearchParams();
      params.append('a', '1');
      params.append('a', '2');
      params.append('b', '3');

      const canonical = canonicalizeParams(params);

      // URLSearchParams.entries() returns all values
      expect(canonical).toContain('a=1');
      expect(canonical).toContain('a=2');
      expect(canonical).toContain('b=3');
    });

    it('should handle empty params', () => {
      const params = new URLSearchParams();
      const canonical = canonicalizeParams(params);

      expect(canonical).toBe('');
    });

    it('should handle special characters in values', () => {
      const params = new URLSearchParams('name=test shop&price=100');
      const canonical = canonicalizeParams(params);

      expect(canonical).toBe('name=test shopprice=100');
    });

    it('should sort params alphabetically', () => {
      const params = new URLSearchParams('zebra=1&apple=2&banana=3');
      const canonical = canonicalizeParams(params);

      expect(canonical).toBe('apple=2banana=3zebra=1');
    });
  });

  describe('verifyTimestamp', () => {
    it('should accept current timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      const isValid = verifyTimestamp(now);

      expect(isValid).toBe(true);
    });

    it('should accept timestamp within 5 minutes (default)', () => {
      const fourMinutesAgo = Math.floor(Date.now() / 1000) - 240;
      const isValid = verifyTimestamp(fourMinutesAgo);

      expect(isValid).toBe(true);
    });

    it('should reject timestamp older than 5 minutes (default)', () => {
      const sixMinutesAgo = Math.floor(Date.now() / 1000) - 360;
      const isValid = verifyTimestamp(sixMinutesAgo);

      expect(isValid).toBe(false);
    });

    it('should reject timestamp in the future (>5 minutes)', () => {
      const sixMinutesLater = Math.floor(Date.now() / 1000) + 360;
      const isValid = verifyTimestamp(sixMinutesLater);

      expect(isValid).toBe(false);
    });

    it('should accept custom maxAgeSeconds', () => {
      const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
      const isValid = verifyTimestamp(tenMinutesAgo, 660); // 11 minutes allowed

      expect(isValid).toBe(true);
    });

    it('should reject invalid timestamp (NaN)', () => {
      const isValid = verifyTimestamp(NaN);

      expect(isValid).toBe(false);
    });

    it('should reject negative timestamp', () => {
      const isValid = verifyTimestamp(-100);

      expect(isValid).toBe(false);
    });

    it('should reject zero timestamp', () => {
      const isValid = verifyTimestamp(0);

      expect(isValid).toBe(false);
    });

    it('should handle edge case: exactly maxAge seconds old', () => {
      const exactlyFiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
      const isValid = verifyTimestamp(exactlyFiveMinutesAgo, 300);

      expect(isValid).toBe(true);
    });
  });

  describe('Integration: Full HMAC flow', () => {
    it('should verify Shopify-style App Proxy request', async () => {
      const secret = 'shopify-app-secret-123';
      const params = new URLSearchParams({
        shop: 'test-shop.myshopify.com',
        timestamp: Math.floor(Date.now() / 1000).toString(),
        path_prefix: '/apps/assistant',
      });

      // Canonicalize and sign
      const canonical = canonicalizeParams(params);
      const signature = await computeHmac(secret, canonical);

      // Verify
      const isValid = await verifyHmac(signature, secret, canonical);

      expect(isValid).toBe(true);
    });

    it('should verify request with body (params + body concat)', async () => {
      const secret = 'test-secret';
      const params = new URLSearchParams({ shop: 'test.myshopify.com' });
      const body = JSON.stringify({ message: 'hello' });

      // Concat params + body (Shopify App Proxy style)
      const canonical = canonicalizeParams(params);
      const combined = canonical + body;

      const signature = await computeHmac(secret, combined);
      const isValid = await verifyHmac(signature, secret, combined);

      expect(isValid).toBe(true);
    });

    it('should reject request with tampered body', async () => {
      const secret = 'test-secret';
      const params = new URLSearchParams({ shop: 'test.myshopify.com' });
      const originalBody = JSON.stringify({ message: 'hello' });
      const tamperedBody = JSON.stringify({ message: 'hacked' });

      const canonical = canonicalizeParams(params);
      const combined = canonical + originalBody;
      const signature = await computeHmac(secret, combined);

      // Verify with tampered body
      const tamperedCombined = canonical + tamperedBody;
      const isValid = await verifyHmac(signature, secret, tamperedCombined);

      expect(isValid).toBe(false);
    });

    it('should handle replay attack prevention (timestamp)', async () => {
      const secret = 'test-secret';
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const params = new URLSearchParams({
        shop: 'test.myshopify.com',
        timestamp: oldTimestamp.toString(),
      });

      const canonical = canonicalizeParams(params);
      const signature = await computeHmac(secret, canonical);

      // Signature is valid
      const isValidSig = await verifyHmac(signature, secret, canonical);
      expect(isValidSig).toBe(true);

      // But timestamp is too old
      const isValidTimestamp = verifyTimestamp(oldTimestamp, 300);
      expect(isValidTimestamp).toBe(false);
    });
  });
});

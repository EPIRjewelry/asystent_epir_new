import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChat, streamAssistantResponse } from '../src/index';

// Helper to build a minimal env used across tests
function makeMockEnv() {
  return {
    SHOP_DOMAIN: 'test-shop.myshopify.com',
    AI: { run: vi.fn().mockResolvedValue({ response: 'AI default response' }) },
    VECTOR_INDEX: undefined,
    GROQ_API_KEY: 'test-key',
    SESSION_DO: {
      idFromName: vi.fn().mockReturnValue({
        toString: () => 'mock-id',
      }),
      get: vi.fn().mockReturnValue({
        fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: 'mock-state' }))),
      }),
    },
  };
}

describe('makeMockEnv - test środowiska', () => {
  it('AI.run zwraca domyślną odpowiedź', async () => {
    const env = makeMockEnv();
    const result = await env.AI.run('test input');
    expect(result).toEqual({ response: 'AI default response' });
  });
});

// Pamiętaj, że to prawdopodobnie nie jest jeszcze cały plik testowy.
// Brakuje tu właściwych testów (bloków `describe` lub `it`),
// które korzystałyby z tej funkcji `makeMockEnv`.
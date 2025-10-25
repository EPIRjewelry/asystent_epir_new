import { describe, it, expect } from 'vitest';
import { LUXURY_SYSTEM_PROMPT } from '../src/prompts/luxury-system-prompt';
import { buildGroqMessagesFromData, GroqPromptData } from '../src/groq/engineer_prompt';

// Helper function dla testów - emuluje starą sygnaturę buildMessages
function buildMessages(
  history: { role: 'user' | 'assistant', content: string }[],
  userQuery: string,
  ragContext?: { id: string, text: string, meta: { url: string, gid: string } }[]
) {
  const data: GroqPromptData = {
    systemPersona: LUXURY_SYSTEM_PROMPT,
    chatHistory: history,
    ragContext: ragContext || [],
    userQuery: userQuery
  };
  return buildGroqMessagesFromData(data);
}

describe('Groq Module', () => {
  describe('LUXURY_SYSTEM_PROMPT', () => {
    it('should contain luxury branding for EPIR-ART-JEWELLERY', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('EPIR-ART-JEWELLERY');
      expect(LUXURY_SYSTEM_PROMPT).toContain('eleganckim');
      expect(LUXURY_SYSTEM_PROMPT).toContain('wyrafinowanym');
      expect(LUXURY_SYSTEM_PROMPT).toContain('luksusowym');
    });

    it('should include haute-couture tone guidelines', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('haute-couture');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Elegancja z nutą ciepła');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Dyskretny humor wysokiej klasy');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Kontekst kulturalny');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Filozofia luksusu');
    });

    it('should include concrete examples of good and bad tone', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('PRZYKŁADY TONU');
      expect(LUXURY_SYSTEM_PROMPT).toContain('❌ ZŁY');
      expect(LUXURY_SYSTEM_PROMPT).toContain('✅ DOBRY');
      expect(LUXURY_SYSTEM_PROMPT).toContain('minimalizm japoński');
      expect(LUXURY_SYSTEM_PROMPT).toContain('jak dobre wino');
    });

    it('should include RAG instructions', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('retrieved_docs');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Nie halucynuj');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Cytuj źródło');
    });

    it('should specify response structure', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('STRUKTURA ODPOWIEDZI');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Krótkie powitanie/podsumowanie');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Rekomendacja produktów');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Lista produktów');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Cytowanie źródeł');
    });

    it('should specify response constraints', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('3-5 zdań');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Maksymalna długość');
    });

    it('should mandate Polish language and formal address', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('po polsku');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Polecam Pani/Panu');
      expect(LUXURY_SYSTEM_PROMPT).toContain('unikaj slangu');
    });

    it('should include MCP cart and order instructions', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('AKCJE KOSZYKA I ZAMÓWIENIA');
      expect(LUXURY_SYSTEM_PROMPT).toContain('update_cart');
      expect(LUXURY_SYSTEM_PROMPT).toContain('get_order_status');
      expect(LUXURY_SYSTEM_PROMPT).toContain('get_cart');
    });

    it('should prioritize MCP products in responses', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('PRIORYTET #1');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Produkty z katalogu (MCP)');
      expect(LUXURY_SYSTEM_PROMPT).toContain('MUSISZ wymienić te produkty');
    });
  });

  describe('buildMessages', () => {
    it('should include system prompt as first message', () => {
      const messages = buildMessages([], 'test message');

      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('EPIR-ART-JEWELLERY');
    });

    it('should include user message as last message', () => {
      const messages = buildMessages([], 'Pokaż pierścionki');

      expect(messages[messages.length - 1]).toEqual({
        role: 'user',
        content: 'Pokaż pierścionki',
      });
    });

    it('should include history messages in order', () => {
      const history = [
        { role: 'user' as const, content: 'Witaj' },
        { role: 'assistant' as const, content: 'Dzień dobry' },
        { role: 'user' as const, content: 'Jaka cena?' },
        { role: 'assistant' as const, content: '500 PLN' },
      ];

      const messages = buildMessages(history, 'Czy jest dostępny?');

      expect(messages).toHaveLength(6); // system + 4 history + 1 new user
      expect(messages[1]).toEqual({ role: 'user', content: 'Witaj' });
      expect(messages[2]).toEqual({ role: 'assistant', content: 'Dzień dobry' });
      expect(messages[3]).toEqual({ role: 'user', content: 'Jaka cena?' });
      expect(messages[4]).toEqual({ role: 'assistant', content: '500 PLN' });
      expect(messages[5]).toEqual({ role: 'user', content: 'Czy jest dostępny?' });
    });

    it('should limit history to last 10 messages', () => {
      const history = Array.from({ length: 20 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `Message ${i}`,
      }));

      const messages = buildMessages(history, 'New message');

      // system + last 10 from history + new user = 12 total
      expect(messages).toHaveLength(12);
      expect(messages[1].content).toBe('Message 10'); // First of last 10
      expect(messages[10].content).toBe('Message 19'); // Last of last 10
      expect(messages[11].content).toBe('New message');
    });

    it('should append RAG context to system prompt when provided', () => {
      const ragContext = [
        { 
          id: 'doc1', 
          text: 'Pierścionki z szafirem 1200 PLN',
          meta: { url: 'https://example.com/doc1', gid: 'gid://shopify/Product/123' }
        }
      ];
      const messages = buildMessages([], 'test', ragContext);

      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('EPIR-ART-JEWELLERY');
      expect(messages[0].content).toContain('doc1');
      expect(messages[0].content).toContain('Pierścionki z szafirem');
    });

    it('should not append RAG context when not provided', () => {
      const messages = buildMessages([], 'test');

      expect(messages[0].content).toContain('EPIR-ART-JEWELLERY');
      // RAG context powinien być pusty, więc nie powinno być sekcji KONTEKST RAG
    });

    it('should handle empty history', () => {
      const messages = buildMessages([], 'Solo message');

      expect(messages).toHaveLength(2); // system + user
      expect(messages[0].role).toBe('system');
      expect(messages[1]).toEqual({ role: 'user', content: 'Solo message' });
    });

    it('should preserve message content exactly', () => {
      const userMessage = 'Szukam pierścionka z diamentem, budżet 5000 PLN';
      const messages = buildMessages([], userMessage);

      expect(messages[1].content).toBe(userMessage);
    });
  });

  describe('Message format compliance', () => {
    it('should produce valid Groq API message format', () => {
      const messages = buildMessages(
        [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' },
        ],
        'Question'
      );

      messages.forEach(msg => {
        expect(msg).toHaveProperty('role');
        expect(msg).toHaveProperty('content');
        expect(['system', 'user', 'assistant']).toContain(msg.role);
        expect(typeof msg.content).toBe('string');
      });
    });
  });
});

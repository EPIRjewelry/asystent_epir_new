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
      expect(LUXURY_SYSTEM_PROMPT).toContain('elegancki');
      expect(LUXURY_SYSTEM_PROMPT).toContain('luksusowy');
    });

    it('should include haute-couture tone guidelines', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('haute-couture');
      expect(LUXURY_SYSTEM_PROMPT).toContain('ciepły, elegancki');
    });

    it('should include concrete examples with scenarios', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('PRZYKŁAD PRZEPŁYWU');
      expect(LUXURY_SYSTEM_PROMPT).toContain('klient zalogowany');
      expect(LUXURY_SYSTEM_PROMPT).toContain('nowy klient');
    });

    it('should include RAG and security instructions', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('RAG');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Nie generuj fałszywych informacji');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Cytuj źródła RAG');
    });

    it('should specify response structure with Chain-of-Thought', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('ETAP 1: ANALIZA I PLANOWANIE');
      expect(LUXURY_SYSTEM_PROMPT).toContain('ETAP 2: WYKONANIE I ODPOWIEDŹ');
      expect(LUXURY_SYSTEM_PROMPT).toContain('"thinking"');
      expect(LUXURY_SYSTEM_PROMPT).toContain('"reply"');
      expect(LUXURY_SYSTEM_PROMPT).toContain('"tool_call"');
    });

    it('should specify response constraints', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('3-5 zdań maksymalnie');
      expect(LUXURY_SYSTEM_PROMPT).toContain('elegancko i na temat');
    });

    it('should mandate Polish language and formal address', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('języku polskim');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Polecam Pani/Panu');
      expect(LUXURY_SYSTEM_PROMPT).toContain('unikaj slangu');
    });

    it('should include MCP cart and order instructions', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('DOSTĘPNE NARZĘDZIA');
      expect(LUXURY_SYSTEM_PROMPT).toContain('update_cart');
      expect(LUXURY_SYSTEM_PROMPT).toContain('get_order_status');
      expect(LUXURY_SYSTEM_PROMPT).toContain('get_cart');
    });

    it('should include JSON contract format', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('KONTRAKT JSON');
      expect(LUXURY_SYSTEM_PROMPT).toContain('{ "reply": "<naturalna odpowiedź>" }');
      expect(LUXURY_SYSTEM_PROMPT).toContain('{ "tool_call":');
      expect(LUXURY_SYSTEM_PROMPT).toContain('{ "error":');
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

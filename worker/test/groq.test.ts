import { describe, it, expect } from 'vitest';
import { buildGroqMessages, LUXURY_SYSTEM_PROMPT } from '../src/groq';

describe('Groq Module', () => {
  describe('LUXURY_SYSTEM_PROMPT', () => {
    it('should contain luxury branding for EPIR-ART-JEWELLERY', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('EPIR-ART-JEWELLERY');
      expect(LUXURY_SYSTEM_PROMPT).toContain('eleganckim');
      expect(LUXURY_SYSTEM_PROMPT).toContain('wyrafinowanym');
      expect(LUXURY_SYSTEM_PROMPT).toContain('luksusowym');
    });

    it('should include RAG instructions', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('retrieved_docs');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Nie halucynuj');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Cytuj źródło');
    });

    it('should specify response constraints', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('2-4 zdania');
      expect(LUXURY_SYSTEM_PROMPT).toContain('Maksymalna długość odpowiedzi');
    });

    it('should mandate Polish language', () => {
      expect(LUXURY_SYSTEM_PROMPT).toContain('po polsku');
    });
  });

  describe('buildGroqMessages', () => {
    it('should include system prompt as first message', () => {
      const messages = buildGroqMessages([], 'test message');

      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('EPIR-ART-JEWELLERY');
    });

    it('should include user message as last message', () => {
      const messages = buildGroqMessages([], 'Pokaż pierścionki');

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

      const messages = buildGroqMessages(history, 'Czy jest dostępny?');

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

      const messages = buildGroqMessages(history, 'New message');

      // system + last 10 from history + new user = 12 total
      expect(messages).toHaveLength(12);
      expect(messages[1].content).toBe('Message 10'); // First of last 10
      expect(messages[10].content).toBe('Message 19'); // Last of last 10
      expect(messages[11].content).toBe('New message');
    });

    it('should append RAG context to system prompt when provided', () => {
      const ragContext = 'Retrieved docs:\n[Doc 1]: Pierścionki z szafirem 1200 PLN';
      const messages = buildGroqMessages([], 'test', ragContext);

      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain(LUXURY_SYSTEM_PROMPT);
      expect(messages[0].content).toContain('Retrieved docs:');
      expect(messages[0].content).toContain('Pierścionki z szafirem');
    });

    it('should not append RAG context when not provided', () => {
      const messages = buildGroqMessages([], 'test');

      expect(messages[0].content).toBe(LUXURY_SYSTEM_PROMPT);
      expect(messages[0].content).not.toContain('Retrieved docs');
    });

    it('should handle empty history', () => {
      const messages = buildGroqMessages([], 'Solo message');

      expect(messages).toHaveLength(2); // system + user
      expect(messages[0].role).toBe('system');
      expect(messages[1]).toEqual({ role: 'user', content: 'Solo message' });
    });

    it('should preserve message content exactly', () => {
      const userMessage = 'Szukam pierścionka z diamentem, budżet 5000 PLN';
      const messages = buildGroqMessages([], userMessage);

      expect(messages[1].content).toBe(userMessage);
    });
  });

  describe('Message format compliance', () => {
    it('should produce valid Groq API message format', () => {
      const messages = buildGroqMessages(
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

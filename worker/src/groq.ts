/**
 * worker/src/groq.ts
 *
 * Integracja z Groq (OpenAI-compatible endpoint).
 * - streamGroqResponse: wykonuje request stream=true i zwraca ReadableStream<string> z tekstowymi chunkami
 * - getGroqResponse: non-streaming request, zwraca pelna odpowiedz tekstowa
 * - buildGroqMessages: buduje tablice wiadomosci (system,user,assistant) z opcjonalnym RAG context
 *
 * Uwaga: NIE wrzucaj sekretow do kodu. Przekaz GROQ API key przez Cloudflare Secrets (wrangler secret put GROQ_API_KEY)
 */

export type GroqMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export const LUXURY_SYSTEM_PROMPT = `Jestes eleganckim, wyrafinowanym doradca marki EPIR-ART-JEWELLERY. Twoim zadaniem jest udzielac precyzyjnych, rzeczowych rekomendacji produktowych i odpowiedzi obslugi klienta, zawsze w tonie luksusowym, kulturalnym i zwiezlym.

ZASADY:
- Uzywaj tylko materialow dostarczonych przez system retrieval (retrieved_docs). Nie halucynuj.
- Cytuj zrodlo przy istotnych faktach: [doc_id] lub krotki fragment.
- Jesli brak wystarczajacych informacji — powiedz krotko "Nie mam wystarczajacych informacji" i zaproponuj 2 dalsze kroki (np. poprosic o szczegoly, sprawdzic stan magazynu).
- Dla rekomendacji produktow: podawaj krotkie uzasadnienie i (jesli dostepne) nazwe produktu, cene.
- Maksymalna dlugosc odpowiedzi: 2-4 zdania, opcjonalnie 1-2 punkty z opcjami.
- Ton: profesjonalny, ciepły, luksusowy - jakbys byl osobistym doradca w butiku jubilerskim.

JEZYK: Zawsze odpowiadaj po polsku.`;

/**
 * Parsuje stream SSE z Groq (tekst EventSource style), wyciaga pola data: {...} i enqueue-uje delta/content.
 * Zwraca ReadableStream<string> emitujacy kolejne fragmenty tekstu w kolejnosci otrzymanej od Groq.
 */
export async function streamGroqResponse(
  messages: GroqMessage[],
  apiKey: string,
  model: 'llama-3.3-70b-versatile' = 'llama-3.3-70b-versatile'
): Promise<ReadableStream<string>> {
  if (!apiKey) throw new Error('Missing GROQ API key');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 0.9
    })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '<no body>');
    throw new Error(`Groq API error (${res.status}): ${txt}`);
  }

  if (!res.body) throw new Error('Groq response has no body');

  // Transform SSE text -> enqueue only meaningful content chunks
  const textStream = res.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream<string, string>({
        start() {
          this.buffer = '';
        },
        transform(chunk, controller) {
          // Dodaj chunk do buffera (obsługa niepełnych linii)
          this.buffer += chunk;
          
          // Podziel na linie, ale zachowaj ostatnią niepełną linię w bufferze
          const lines = this.buffer.split(/\r?\n/);
          this.buffer = lines.pop() || ''; // Ostatnia linia może być niepełna
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            // Standardowy format Groq SSE: "data: { ... }" lub "data: [DONE]"
            if (trimmed === 'data: [DONE]' || trimmed === '[DONE]') {
              continue;
            }
            
            // Usuń prefix "data: " jeśli istnieje
            const prefix = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
            
            try {
              const parsed = JSON.parse(prefix);
              // Wybieramy delta content (OpenAI-like structure)
              const content = parsed?.choices?.[0]?.delta?.content;
              const messageContent = parsed?.choices?.[0]?.message?.content;
              
              if (typeof content === 'string' && content) {
                controller.enqueue(content);
              } else if (typeof messageContent === 'string' && messageContent) {
                controller.enqueue(messageContent);
              }
            } catch (e) {
              // Ignoruj nieparsowalne fragmenty (nie wysyłaj surowych JSONów)
              // Log tylko dla debugowania w development
              if (prefix.length > 0 && prefix.length < 200) {
                console.warn('[Groq SSE] Failed to parse chunk:', prefix.slice(0, 100));
              }
            }
          }
        },
        flush(controller) {
          // Przetwórz pozostałą niepełną linię z buffera
          if (this.buffer.trim()) {
            const trimmed = this.buffer.trim();
            if (trimmed !== 'data: [DONE]' && trimmed !== '[DONE]') {
              const prefix = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
              try {
                const parsed = JSON.parse(prefix);
                const content = parsed?.choices?.[0]?.delta?.content || parsed?.choices?.[0]?.message?.content;
                if (typeof content === 'string' && content) {
                  controller.enqueue(content);
                }
              } catch (e) {
                // Ignoruj błędy przy finalnym flushowaniu
              }
            }
          }
        }
      })
    );

  return textStream;
}

/**
 * Non-streaming Groq call - zwraca pelna odpowiedz tekstowa (pierwszej choice.message.content).
 */
export async function getGroqResponse(
  messages: GroqMessage[],
  apiKey: string,
  model = 'llama-3.3-70b-versatile'
): Promise<string> {
  if (!apiKey) throw new Error('Missing GROQ API key');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 0.9
    })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '<no body>');
    throw new Error(`Groq API error (${res.status}): ${txt}`);
  }

  const json = (await res.json().catch(() => null)) as any;
  const content = json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text;
  if (!content) throw new Error('Groq API returned empty response');
  return String(content);
}

/**
 * Buduje tablice wiadomosci (system + history + user). Opcjonalnie wstrzykuje ragContext przed wiadomoscia user.
 */
export function buildGroqMessages(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  userMessage: string,
  ragContext?: string
): GroqMessage[] {
  const systemContent = ragContext && ragContext.length
    ? `${LUXURY_SYSTEM_PROMPT}\n\nKontekst:\n${ragContext}`
    : LUXURY_SYSTEM_PROMPT;

  const messages: GroqMessage[] = [
    { role: 'system', content: systemContent },
    ...history.slice(-10).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage }
  ];

  return messages;
}
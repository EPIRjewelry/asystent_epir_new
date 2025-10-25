/**
 * worker/src/ai-client.ts
 * Ujednolicony klient do komunikacji z API Groq.
 * Zastępuje redundantne pliki `groq.ts` i `cloudflare-ai.ts`.
 * Odpowiedzialność: Wyłącznie obsługa żądań HTTP (streaming i non-streaming) do API.
 * NIE zawiera logiki biznesowej, budowania promptów ani promptów systemowych.
 */

export type GroqMessage = { 
  role: 'system' | 'user' | 'assistant' | 'tool'; 
  content: string;
  tool_call_id?: string;  // Opcjonalne dla wiadomości 'tool'
  name?: string;           // Opcjonalne dla wiadomości 'tool'
};

/**
 * Interfejs dla środowiska Cloudflare Worker.
 */
interface Env {
  GROQ_API_KEY: string;
}

/**
 * Parametry wywołania API Groq.
 */
interface GroqPayload {
  model: string;
  messages: GroqMessage[];
  stream: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Wykonuje streamingowe zapytanie do Groq i zwraca ReadableStream z tekstem.
 * @param messages - Tablica wiadomości (system, user, assistant).
 * @param model - Nazwa modelu (np. 'llama3-70b-8192').
 * @param env - Środowisko Workera (dla API key).
 * @returns ReadableStream<string> - Strumień fragmentów tekstu (delta).
 */
export async function streamGroqResponse(
  messages: GroqMessage[],
  model: string,
  env: Env
): Promise<ReadableStream<string>> {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Missing GROQ_API_KEY secret');

  const payload: GroqPayload = {
    model,
    messages,
    stream: true,
    temperature: 0.5,
    max_tokens: 3000,
    top_p: 0.9,
  };

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    const errorBody = await res.text().catch(() => '<no body>');
    throw new Error(`Groq API error (${res.status}): ${errorBody}`);
  }

  // Parsuj SSE stream z Groq i wyciągaj tylko fragmenty tekstu (delta content)
  let buffer = '';
  const textStream = res.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream<string, string>({
        start() {
          buffer = '';
        },
        transform(chunk, controller) {
          buffer += chunk;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]' || trimmed === '[DONE]') continue;
            
            const prefix = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
            try {
              const parsed = JSON.parse(prefix);
              const content = parsed?.choices?.[0]?.delta?.content;
              const messageContent = parsed?.choices?.[0]?.message?.content;
              
              if (typeof content === 'string' && content) {
                controller.enqueue(content);
              } else if (typeof messageContent === 'string' && messageContent) {
                controller.enqueue(messageContent);
              }
            } catch (e) {
              // Ignoruj nieparsowalne fragmenty
            }
          }
        },
        flush(controller) {
          if (buffer.trim() && buffer.trim() !== 'data: [DONE]' && buffer.trim() !== '[DONE]') {
            const trimmed = buffer.trim();
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
      })
    );

  return textStream;
}

/**
 * Wykonuje standardowe (non-streaming) zapytanie do Groq.
 * @param messages - Tablica wiadomości (system, user, assistant).
 * @param model - Nazwa modelu (np. 'llama3-70b-8192').
 * @param env - Środowisko Workera (dla API key).
 * @returns Pełna odpowiedź tekstowa (content) od modelu.
 */
export async function getGroqResponse(
  messages: GroqMessage[],
  model: string,
  env: Env
): Promise<string> {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Missing GROQ_API_KEY secret');

  const payload: GroqPayload = {
    model,
    messages,
    stream: false,
    temperature: 0.5,
    max_tokens: 3000,
    top_p: 0.9,
  };

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '<no body>');
    throw new Error(`Groq API error (${res.status}): ${errorBody}`);
  }

  const json: any = await res.json().catch(() => null);
  const content = json?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Groq API returned an empty or invalid response');
  }

  return String(content);
}

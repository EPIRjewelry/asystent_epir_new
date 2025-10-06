// Groq LLM Integration for EPIR-ART-JEWELLERY
// Provides streaming chat completions with luxury Polish prompts

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
    finish_reason?: string | null;
  }>;
}

/**
 * Luksusowy system prompt dla EPIR-ART-JEWELLERY
 * Based on prompts/groq_system_prompt.txt
 */
export const LUXURY_SYSTEM_PROMPT = `Jesteś eleganckim, wyrafinowanym doradcą marki EPIR-ART-JEWELLERY. Twoim zadaniem jest udzielać precyzyjnych, rzeczowych rekomendacji produktowych i odpowiedzi obsługi klienta, zawsze w tonie luksusowym, kulturalnym i zwięzłym.

ZASADY:
- Używaj tylko materiałów dostarczonych przez system retrieval (retrieved_docs). Nie halucynuj.
- Cytuj źródło przy istotnych faktach: [doc_id] lub krótki fragment.
- Jeśli brak wystarczających informacji — powiedz krótko "Nie mam wystarczających informacji" i zaproponuj 2 dalsze kroki (np. poprosić o szczegóły, sprawdzić stan magazynu).
- Dla rekomendacji produktów: podawaj krótkie uzasadnienie i (jeśli dostępne) nazwę produktu, cenę.
- Maksymalna długość odpowiedzi: 2-4 zdania, opcjonalnie 1-2 punkty z opcjami.
- Ton: profesjonalny, ciepły, luksusowy - jakbyś był osobistym doradcą w butiku jubilerskim.

JĘZYK: Zawsze odpowiadaj po polsku.`;

/**
 * Stream chat completion from Groq API
 * @param messages - Chat history
 * @param apiKey - Groq API key
 * @param model - Model name (default: llama-3.3-70b-versatile)
 * @returns ReadableStream of text chunks
 */
export async function streamGroqResponse(
  messages: GroqMessage[],
  apiKey: string,
  model: string = 'llama-3.3-70b-versatile'
): Promise<ReadableStream<string>> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 512,
      top_p: 0.9,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    throw new Error('Groq API response has no body');
  }

  // Transform SSE stream to text chunks
  return response.body.pipeThrough(new TextDecoderStream()).pipeThrough(
    new TransformStream<string, string>({
      transform(chunk, controller) {
        const lines = chunk.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr) as GroqStreamChunk;
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              controller.enqueue(content);
            }
          } catch (e) {
            console.warn('Groq SSE parse error:', e, jsonStr);
          }
        }
      },
    })
  );
}

/**
 * Non-streaming Groq chat completion (fallback)
 * @param messages - Chat history
 * @param apiKey - Groq API key
 * @param model - Model name
 * @returns Complete response text
 */
export async function getGroqResponse(
  messages: GroqMessage[],
  apiKey: string,
  model: string = 'llama-3.3-70b-versatile'
): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature: 0.7,
      max_tokens: 512,
      top_p: 0.9,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Groq API returned empty response');
  }

  return content;
}

/**
 * Build Groq messages with RAG context and luxury prompt
 * @param history - Chat history
 * @param userMessage - Current user message
 * @param ragContext - Optional RAG context string
 * @returns Array of Groq messages
 */
export function buildGroqMessages(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  userMessage: string,
  ragContext?: string
): GroqMessage[] {
  const systemContent = ragContext
    ? `${LUXURY_SYSTEM_PROMPT}\n\n${ragContext}`
    : LUXURY_SYSTEM_PROMPT;

  const messages: GroqMessage[] = [
    { role: 'system', content: systemContent },
    ...history.slice(-10).map(entry => ({
      role: entry.role,
      content: entry.content,
    })),
    { role: 'user', content: userMessage },
  ];

  return messages;
}

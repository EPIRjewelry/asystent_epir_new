/**
 * worker/src/cloudflare-ai.ts
 *
 * Integracja z Cloudflare AI Gateway.
 * - streamResponse: wykonuje request stream=true i zwraca ReadableStream<string> z tekstowymi chunkami
 * - getResponse: non-streaming request, zwraca pełną odpowiedź tekstową
 * buildMessages: buduje tablicę wiadomości (system,user,assistant) z opcjonalnym RAG context
 */

export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Wykrywa intencję użytkownika (koszyk, zamówienie lub null).
 * Zwraca 'cart', 'order' lub null.
 */
export function detectMcpIntent(userMessage: string): 'cart' | 'order' | null {
  const msg = userMessage.toLowerCase();
  
  const cartKeywords = [
    'koszyk', 'dodaj do koszyka', 'w koszyku', 'zawartość koszyka', 
    'co mam w koszyku', 'usuń z koszyka', 'aktualizuj koszyk', 'pokaż koszyk',
    'cart', 'add to cart', 'show cart', 'my cart', 'what is in my cart', 'update cart'
  ];
  
  const orderKeywords = [
    'zamówienie', 'mojego zamówienia', 'status zamówienia', 'moje zamówienie', 'śledzenie', 'śledzenie przesyłki',
    'gdzie jest', 'kiedy dotrze', 'ostatnie zamówienie', 'gdzie jest moja paczka',
    'kiedy dostanę', 'order', 'tracking', 'delivery', 'order status', 'where is my package',
    'track my order', 'recent order'
  ];
  
  if (cartKeywords.some(kw => msg.includes(kw))) {
    return 'cart';
  }
  
  if (orderKeywords.some(kw => msg.includes(kw))) {
    return 'order';
  }
  
  return null;
}

/**
 * Wykrywa, czy wiadomość użytkownika dotyczy koszyka lub zamówień.
 * Zwraca true, jeśli użytkownik prawdopodobnie pyta o koszyk/zamówienia.
 */
export function detectCartOrOrderIntent(userMessage: string): boolean {
  return detectMcpIntent(userMessage) !== null;
}

export const LUXURY_SYSTEM_PROMPT = `Jesteś eleganckim, wyrafinowanym doradcą marki EPIR-ART-JEWELLERY. Twoim zadaniem jest udzielać precyzyjnych, rzeczowych rekomendacji produktowych i odpowiedzi obsługi klienta, zawsze w tonie uprzejmym, kulturalnym i zwięzłym.


ZASADY:
- Używaj TYLKO danych z MCP/RAG (retrieved_docs) jako źródeł prawdy. Nie wymyślaj, Nie halucynuj, nie korzystaj z własnej wiedzy ani domysłów.
- Cytuj źródło przy istotnych faktach: [doc_id] lub krótki fragment.
- Jeśli brak wystarczających informacji — powiedz krótko "Nie mam wystarczających informacji" i zaproponuj 2 dalsze kroki (np. poprosić o szczegóły, sprawdzić stan magazynu).
- Dla rekomendacji produktów: podawaj krótkie uzasadnienie i (jeśli dostępne) nazwę produktu, cenę.
- Maksymalna długość odpowiedzi: 2-4 zdania, opcjonalnie 1-2 punkty z opcjami.
- Ton: profesjonalny, ciepły, luksusowym - jakbyś był osobistym doradcą w butiku jubilerskim.

AKCJE KOSZYKA I ZAMÓWIENIA:
- Gdy klient prosi o dodanie produktu do koszyka, użyj narzędzi MCP (update_cart) i odpowiedz z gracją: "Dodałem [nazwa produktu] do Twojego koszyka z największą starannością."
- Przy pytaniach o status zamówienia, użyj MCP (get_order_status, get_most_recent_order_status) i przedstaw informacje w elegancki sposób.
- Dla zapytań o zawartość koszyka, użyj MCP (get_cart) i podsumuj elegancko: "W Twoim koszyku znajdują się [lista], łączna wartość: [kwota]."
- Zachowaj dyskrecję i elegancję w każdej interakcji dotyczącej transakcji.

JĘZYK: Zawsze odpowiadaj po polsku.`;

interface GroqStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
    finish_reason?: string | null;
  }>;
}

/**
 * Wykonuje streamingowy request do Groq API i zwraca ReadableStream z parsowanymi chunkami.
 */
export async function streamResponse(
  messages: AiMessage[],
  env: any,
  model: string = 'llama-3.3-70b-versatile'
): Promise<ReadableStream<Uint8Array>> {
  if (!env.GROQ_API_KEY) throw new Error('Groq API key is missing');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
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

  // Transform SSE stream to text chunks (jak w oryginalnym groq.ts)
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
  ).pipeThrough(new TextEncoderStream());
}

/**
 * Wykonuje non-streaming request do Groq API i zwraca pełną odpowiedź tekstową.
 */
export async function getResponse(
  messages: AiMessage[],
  env: any,
  model: string = 'llama-3.3-70b-versatile'
): Promise<string> {
  if (!env.GROQ_API_KEY) throw new Error('Groq API key is missing');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
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
 * Buduje tablicę wiadomości (system + history + user). 
 * Opcjonalnie wstrzykuje ragContext (produkty/polityki) oraz mcpContext (koszyk/zamówienia).
 */
export function buildMessages(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  userMessage: string,
  ragContext?: string,
  mcpContext?: string
): AiMessage[] {
  let systemContent = LUXURY_SYSTEM_PROMPT;
  
  if (ragContext && ragContext.length) {
    systemContent += `\n\nKontekst (produkty/polityki):\n${ragContext}`;
  }
  
  if (mcpContext && mcpContext.length) {
    systemContent += `\n\nKontekst (koszyk/zamówienia):\n${mcpContext}`;
  }

  const messages: AiMessage[] = [
    { role: 'system', content: systemContent },
    ...history.slice(-10).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage }
  ];

  return messages;
}

/**
 * Pobiera kontekst MCP (koszyk lub ostatnie zamówienie) jeśli wykryto odpowiednią intencję.
 * @param userMessage Wiadomość użytkownika do analizy intencji
 * @param cartId ID koszyka (jeśli dostępne)
 * @param env Środowisko Cloudflare Workers
 * @returns String z kontekstem MCP lub undefined
 */
export async function fetchMcpContextIfNeeded(
  userMessage: string,
  cartId: string | null | undefined,
  env: any
): Promise<string> {
  if (!detectCartOrOrderIntent(userMessage)) {
    return '';
  }

  const msg = userMessage.toLowerCase();
  
  try {
    // Import dynamiczny, aby uniknąć circular dependency
    const { getCart, getMostRecentOrderStatus } = await import('./shopify-mcp-client.js');
    
    // Jeśli pytanie o koszyk i mamy cartId
    if ((msg.includes('koszyk') || msg.includes('cart')) && cartId) {
      const cartDataRaw = await getCart(env, cartId);
      
      // Parsuj JSON i formatuj elegancko
      try {
        const cart = JSON.parse(cartDataRaw);
        const items = cart.lines?.edges?.map((edge: any) => {
          const product = edge.node.merchandise?.product?.title || 'Produkt';
          const qty = edge.node.quantity || 1;
          return `${product} x${qty}`;
        }).join(', ') || 'brak produktów';
        
        const total = cart.cost?.totalAmount 
          ? `${cart.cost.totalAmount.amount} ${cart.cost.totalAmount.currencyCode}`
          : 'brak ceny';
        
        return `Koszyk: ${items}. Łącznie: ${total}`;
      } catch (parseErr) {
        // Fallback: zwróć surowy JSON
        return `Koszyk klienta (${cartId}): ${cartDataRaw}`;
      }
    }
    
    // Jeśli pytanie o zamówienie (różne formy gramatyczne: zamówienie/zamówienia/zamówieniu)
    if (msg.includes('zamów') || msg.includes('order') || msg.includes('śledzenie')) {
      const orderData = await getMostRecentOrderStatus(env);
      
      // Parsuj JSON jeśli możliwe
      try {
        const order = JSON.parse(orderData);
        const orderName = order.name || order.id || 'nieznane';
        const status = order.displayFulfillmentStatus || order.fulfillmentStatus || 'nieznany';
        return `Ostatnie zamówienie ${orderName}, status: ${status}`;
      } catch (parseErr) {
        return `Ostatnie zamówienie klienta: ${orderData}`;
      }
    }
  } catch (error) {
    console.error('[MCP Context Fetch] Error:', error);
    return '';
  }
  
  return '';
}

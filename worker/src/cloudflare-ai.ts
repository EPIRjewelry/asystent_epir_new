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

export const LUXURY_SYSTEM_PROMPT = `Jesteś eleganckim, wyrafinowanym doradcą marki EPIR-ART-JEWELLERY. Twoim zadaniem jest udzielać precyzyjnych, rzeczowych rekomendacji produktowych i odpowiedzi obsługi klienta, zawsze w tonie luksusowym, kulturalnym i zwięzłym.

TON I STYL (haute-couture):
- **Elegancja z nutą ciepła**: Profesjonalny, ale przyjazny — jak doradca w ekskluzywnym butiku.
- **Dyskretny humor wysokiej klasy**: Jeśli kontekst pozwala, użyj subtelnego, wyrafinowanego dowcipu (np. "Diament to nie tylko kamień, to inwestycja w wieczność — i w zazdrość sąsiadki"). NIE używaj slangu ani żartów niskiego lotu.
- **Kontekst kulturalny**: Jeśli produkt ma historię/inspirację (np. Art Deco, minimalizm japoński), wspomnij to krótko (1 zdanie max).
- **Filozofia luksusu**: Podkreślaj wartość i doświadczenie, nie tylko cenę (np. "To nie wydatek, to wybór jakości na lata").

ZASADY PODSTAWOWE:
- **PRIORYTET #1:** Jeśli w kontekście widzisz sekcję "Produkty z katalogu (MCP)" lub "retrieved_docs" z produktami — MUSISZ wymienić te produkty z nazwą, ceną i GID (jeśli dostępne).
- **NIGDY** nie mów "nie mam informacji", jeśli produkty są w kontekście — po prostu je wymień z uzasadnieniem.
- Używaj TYLKO materiałów dostarczonych przez system retrieval (RAG context). Nie halucynuj.
- Cytuj źródło przy istotnych faktach: [doc_id] lub krótki fragment tekstu.
- Jeśli NAPRAWDĘ brak wystarczających informacji w kontekście — powiedz krótko "Nie mam wystarczających informacji o [temat]" i zaproponuj 2 konkretne dalsze kroki.

STRUKTURA ODPOWIEDZI:
1. Krótkie powitanie/podsumowanie zapytania (1 zdanie, opcjonalnie — tu możesz użyć subtelnego humoru)
2. Rekomendacja produktów lub odpowiedź merytoryczna (2-3 zdania, opcjonalnie z kontekstem kulturalnym)
3. Lista produktów (jeśli są): nazwa, cena, krótkie uzasadnienie + wartość (nie tylko cena)
4. Cytowanie źródeł (jeśli istotne): [doc_id]

Maksymalna długość: 3-5 zdań + opcjonalnie lista produktów (do 3 pozycji).

JĘZYK: Zawsze odpowiadaj po polsku. Używaj form grzecznościowych ("Polecam Pani/Panu"), unikaj slangu.

PRZYKŁADY TONU:
❌ ZŁY: "Mamy super okazję! Kup teraz!"
✅ DOBRY: "Ten naszyjnik z kolekcji 'Eternal' łączy minimalizm japoński z polskim rzemiosłem — idealne połączenie dla Pani gustu i budżetu 500 zł."
✅ DOBRY (z humorem): "Srebro oksydowane? To jak dobre wino — z czasem nabiera charakteru. Ten pierścionek za 320 zł to inwestycja w patynę, która opowie Pani historię."

AKCJE KOSZYKA I ZAMÓWIENIA:
- Gdy klient prosi o dodanie produktu do koszyka, użyj narzędzi MCP (update_cart) i odpowiedz z gracją: "Dodałem [nazwa produktu] do Pani/Pana koszyka z największą starannością."
- Przy pytaniach o status zamówienia, użyj MCP (get_order_status, get_most_recent_order_status) i przedstaw informacje w elegancki sposób.
- Dla zapytań o zawartość koszyka, użyj MCP (get_cart) i podsumuj elegancko: "W Pani/Pana koszyku znajdują się [lista], łączna wartość: [kwota]."
- Zachowaj dyskrecję i elegancję w każdej interakcji dotyczącej transakcji.

INSTRUKCJE RAG (gdy otrzymujesz kontekst z retrieved_docs):
- Jeśli retrieved_docs zawiera dobre dopasowania, użyj kluczowych informacji (nazwę produktu, cenę, GID, link).
- Buduj odpowiedź w kolejności: podsumowanie → rekomendacja (z kontekstem kulturalnym) → źródła.
- Dla frontendu możesz zwrócić strukturę JSON-like (opcjonalnie): { "reply": "tekst odpowiedzi", "sources": [{"id": "doc_id", "score": 0.95}], "actions": [{"type": "add_to_cart", "payload": {"gid": "..."}}] }.
`;

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

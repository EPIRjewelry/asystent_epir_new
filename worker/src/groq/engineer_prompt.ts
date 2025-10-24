/**
 * worker/src/groq/engineer_prompt.ts
 *
 * Inżynieria promptu dla Llama 3.3 (Zero-Shot Function Calling).
 * Zgodnie z dokumentem sekcja 5.2: minimalizacja "hidden context cost"
 * poprzez zwięzłe definicje narzędzi i precyzyjne parametry.
 */


import { OPTIMIZED_TOOL_DEFINITIONS, TOOL_RESPONSE_FORMAT_INSTRUCTION } from './tool_definitions';
import { generateMcpToolSchema } from '../mcp/tool_schema';

export interface GroqPromptData {
  /** Treść System Prompt (Persona, Zasady) załadowana z pliku lub stała. */
  systemPersona: string;
  /** Historia konwersacji (użytkownik/asystent) pobrana z Durable Object. */
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Kontekst RAG (retrieved_docs) pobrany z Cloudflare Vectorize. */
  ragContext?: Array<{ id: string; text: string; meta: { url: string; gid: string } }>;
  /** Aktualne zapytanie klienta. */
  userQuery: string;
  /** Pełny schemat narzędzi MCP (JSON Schema) do walidacji outputu. */

  toolSchema?: string;

/**
 * Buduje kompletny, finalny prompt inżynierski dla modelu Groq/Llama 3.3.
 *
 * Format outputu to pełny prompt string, gotowy do wstrzyknięcia w API Groq.
 * Minimalizuje halucynacje poprzez explict instructions dla RAG i tool calling.
 *
 * @param data - Ustrukturyzowane dane wejściowe.
 * @returns Pełny prompt w formacie string (system instruction + context + query).
 */
export function generateGroqPrompt(data: GroqPromptData): string {
  const { systemPersona, chatHistory, ragContext, userQuery } = data;
  // Wypełnij toolSchema jeśli nie jest ustawione
  if (!data.toolSchema) {
    data.toolSchema = generateMcpToolSchema();
  }

  // 1. Sekcja Kontekst RAG (wstrzykiwanie kontekstu z Vectorize)
  let contextSection = '';
  if (ragContext && ragContext.length > 0) {
    const contextEntries = ragContext
      .map(
        (doc) =>
          `[doc_id: ${doc.id}] Tekst: "${doc.text}" (Źródło: ${doc.meta.url}, GID: ${doc.meta.gid})`
      )
      .join('\n');

    contextSection = `
--- KONTEKST RAG (Shopify Knowledge Base / Vectorize) ---
Poniższy, zweryfikowany kontekst z zasobów EPIR-ART-JEWELLERY jest jedynym autorytatywnym źródłem informacji dla Twojej odpowiedzi. Odwołuj się do niego, cytując [doc_id].

${contextEntries}
--------------------------------------------------------
`;
  }

  // 2. Sekcja Narzędzi MCP (zgodnie z dokumentem sekcja 5.2)
  // ZAWSZE wstrzykuj zoptymalizowane definicje (minimalizacja hidden context cost)
  // Dodatkowo wstrzykuj pełny schemat narzędzi do walidacji (toolSchema)
  const toolSection = `
  --- NARZĘDZIA MCP (Shopify Model Context Protocol) ---
  ${OPTIMIZED_TOOL_DEFINITIONS}
  
  --- MCP TOOL SCHEMA (JSON Schema for validation) ---
  ${data.toolSchema}
  --------------------------------------------------------
  `;

  // 3. Sekcja Historia Konwersacji (pamięć Durable Object)
  const historySection =
    chatHistory.length > 0
      ? chatHistory
          .map((msg) => `${msg.role === 'user' ? 'Klient' : 'Asystent'}: ${msg.content}`)
          .join('\n')
      : '(Brak historii konwersacji — pierwsze zapytanie klienta)';

  // 4. Finałowy Prompt Inżynierski (łączenie wszystkiego)
  const finalPrompt = `
--- SYSTEM INSTRUCTION (Persona & Rules) ---
${systemPersona}

${toolSection}
${contextSection}

--- HISTORIA KONWERSACJI (Pamięć Durable Object) ---
${historySection}
--------------------------------------------------------

--- AKTUALNE ZAPYTANIE KLIENTA ---
Klient: "${userQuery}"
---------------------------------

ZADANIE:
1. Jeśli kontekst RAG (retrieved_docs) zawiera odpowiedź (produkt, cenę) → odpowiedz konwersacyjnie (NIE używaj narzędzia)
2. Jeśli brak wystarczających informacji w RAG → użyj narzędzia search_shop_catalog z precyzyjnymi parametrami:
   - query: wyodrębnione encje (np. "pierścionek szafir srebro")
   - context: historia i preferencje (np. "budżet 3000 PLN, lubi minimalizm")
3. Dla operacji koszyka/zamówień → użyj odpowiedniego narzędzia (get_cart, update_cart, get_order_status)

${TOOL_RESPONSE_FORMAT_INSTRUCTION}

PAMIĘTAJ:
- Luksusowy ton EPIR-ART-JEWELLERY (elegancja, etyczne pochodzenie, wartość)
- Cytuj źródła: [doc_id] lub krótki fragment
- Max 3-5 zdań dla odpowiedzi konwersacyjnych
- GID format: gid://shopify/ProductVariant/... (PEŁNY, nie skracaj)
`;

  return finalPrompt;
}

/**
 * Buduje tablicę wiadomości (messages) dla API Groq w formacie OpenAI-compatible.
 *
 * @param data - Ustrukturyzowane dane wejściowe (zgodne z GroqPromptData).
 * @returns Tablica wiadomości gotowa do przekazania do Groq API.
 */
export function buildGroqMessagesFromData(
  data: GroqPromptData
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const systemPrompt = generateGroqPrompt(data);

  // Historia konwersacji (ostatnie 10 wiadomości dla context window)
  const historyMessages = data.chatHistory.slice(-10).map((h) => ({
    role: h.role as 'user' | 'assistant',
    content: h.content
  }));

  // Ostatnie zapytanie użytkownika
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...historyMessages,
    { role: 'user' as const, content: data.userQuery }
  ];

  return messages;
}
}

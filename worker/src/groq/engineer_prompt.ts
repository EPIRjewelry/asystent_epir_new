// worker/src/groq/engineer_prompt.ts

// ZAŁOŻENIE: Importujemy zwięzłe definicje narzędzi (zgodnie z opisem funkcjonalnym)
import { OPTIMIZED_TOOL_DEFINITIONS } from './tool_definitions';
import type { GroqMessage } from '../ai-client';

/**
 * Interfejs dla ustrukturyzowanych danych wejściowych modelu LLM.
 * Odzwierciedla dane zbierane przez logikę Cloudflare Worker (Durable Object, RAG, MCP).
 */
export interface GroqPromptData {
  /** Treść System Prompt (Persona, Zasady) załadowana z pliku groq_system_prompt.txt lub luxury-system-prompt.ts. */
  systemPersona: string;
  /** Historia konwersacji (użytkownik/asystent) pobrana z Durable Object. Może zawierać dodatkowe pola (ts, tool_calls), które zostaną wyczyszczone. */
  chatHistory: Array<{ role: 'user' | 'assistant' | 'tool', content: string, ts?: number, tool_calls?: any, tool_call_id?: string, name?: string }>;
  /** Kontekst RAG (retrieved_docs) pobrany z Cloudflare Vectorize. */
  ragContext: { id: string, text: string, meta: { url: string, gid: string } }[];
  /** Aktualne zapytanie klienta. */
  userQuery: string;
}

/**
 * Buduje kompletny, finalny prompt inżynierski dla modelu Groq/Llama 3.3.
 *
 * @param data - Ustrukturyzowane dane wejściowe.
 * @returns Pełny prompt w formacie string.
 */
export function generateGroqPrompt(data: GroqPromptData): string {
  const { systemPersona, ragContext } = data;

	// 1. Sekcja Kontekst RAG (wstrzykiwanie kontekstu)
	const contextEntries = ragContext && ragContext.length > 0
		? ragContext.map(doc => `[${doc.id}] ${doc.text}`).join('\n')
		: '';
	const contextSection = ragContext && ragContext.length > 0
		? `\n--- KONTEKST RAG (Shopify Knowledge Base / Vectorize) ---\nPoniższy, zweryfikowany kontekst z zasobów EPIR-ART-JEWELLERY jest jedynym autorytatywnym źródłem informacji dla Twojej odpowiedzi. Odwołuj się do niego, cytując [doc_id].\n\n${contextEntries}\n--------------------------------------------------------`
		: '';
	
	const toolSection = `\n--- DOSTĘPNE NARZĘDZIA MCP (Model Context Protocol) ---\n${OPTIMIZED_TOOL_DEFINITIONS}\n--------------------------------------------------------`;

	const finalPrompt = `${systemPersona}${toolSection}${contextSection}\n\nPAMIĘTAJ: Zawsze zwracaj odpowiedź w formacie JSON: {"reply": "..."} lub {"tool_call": {"name": "...", "arguments": {...}}}`;

  return finalPrompt;
}

/**
 * Buduje pełną tablicę wiadomości dla API Groq z obiektu GroqPromptData.
 *
 * @param data - Ustrukturyzowane dane wejściowe.
 * @returns Tablica wiadomości gotowa do wysłania do API.
 */
export function buildGroqMessagesFromData(data: GroqPromptData): GroqMessage[] {
  // 1. Zbuduj główny prompt systemowy
  const systemContent = generateGroqPrompt(data);
  
  const messages: GroqMessage[] = [
    { role: 'system', content: systemContent },
  ];

  // 2. Dodaj historię (ostatnie 10 wiadomości, aby uniknąć przepełnienia kontekstu)
  // WAŻNE: Czyścimy pola - usuwamy 'ts' i inne pola które Groq nie akceptuje
  const cleanHistory = data.chatHistory.slice(-10).map((msg): GroqMessage => ({
    role: msg.role,
    content: msg.content,
    ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
    ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
    ...(msg.name && { name: msg.name }),
  }));
  messages.push(...cleanHistory);

  // 3. Dodaj PRZYPOMNIENIE o JSON tuż przed user query (jako ostatnia "assistant" message)
  messages.push({ 
    role: 'assistant', 
    content: '{"reply": "Rozumiem. Odpowiem w formacie JSON."}' 
  });

  // 4. Dodaj aktualne zapytanie użytkownika jako ostatnią wiadomość
  messages.push({ role: 'user', content: data.userQuery });

  return messages;
}
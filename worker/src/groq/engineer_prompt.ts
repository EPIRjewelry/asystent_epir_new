// worker/src/groq/engineer_prompt.ts
// Harmony message builder for Groq/OpenAI-compatible LLMs.
// Implements Chain-of-Thought (CoT) control and MCP tool schema embedding.
// Zgodność z dokumentacją: OpenAI function-calling, Shopify MCP, Harmony format.

import { logInfo, logDebug, logError } from '../index';
import { getToolSchemasJson } from '../mcp_tools';

export type GroqPromptData = {
  systemPersona: string;
  chatHistory: { role: 'user' | 'assistant', content: string }[];
  ragContext?: { id: string, text: string, meta?: { url?: string, gid?: string } }[];
  userQuery: string;
};

/**
 * Harmony message structure with roles and hierarchy.
 * - system: Immutable rules, RAG policy, MCP tool schemas (highest authority, cacheable prefix)
 * - developer: Dynamic constraints (max_cot_tokens, reasoning_mode, output format) (medium authority)
 * - user: End-user query and dynamic context (low authority, minimal, at the end)
 * - tool: Tool execution results (returned to model after tool call)
 * - assistant: Model output (conversational reply or tool call)
 */
export type HarmonyMessage = {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;  // For tool role
  name?: string;          // For tool role
};

/**
 * Developer constraints for CoT control and output formatting.
 */
export type DeveloperConstraints = {
  reasoning_mode: 'low' | 'high' | 'auto';
  max_cot_tokens: number;
  output_format?: string; // e.g., "JSON schema X.Y"
};

/**
 * Classify query complexity to guide reasoning_mode and CoT budget.
 * Heuristic based on keywords and length; returns 'low' | 'high'.
 * - low: greetings, short generic questions, simple FAQs
 * - high: multi-step, cart/order operations, code/GraphQL/theme tasks
 */
export function classifyQueryComplexity(input: string): 'low' | 'high' {
  const msg = (input || '').toLowerCase();
  const short = msg.replace(/\s+/g, ' ').trim();

  // Greetings / very short
  const greetingRe = /^(cześć|czesc|hej|witaj|witam|dzień dobry|dzien dobry|dobry wieczór|dobry wieczor|hi|hello|hey)$/i;
  if (short.length > 0 && short.length <= 15 && greetingRe.test(short)) return 'low';

  // Simple FAQs and one-intent searches
  const simplePatterns = [
    /godziny|zwrot|reklamacj|dostawa|darmowa wysyłka|wysylka|kontakt|adres|telefon|email|promocj/i,
    /cena|koszt|materia[łl]|rozmiar|wymiary|gwarancj|certyfikat/i,
  ];
  if (simplePatterns.some((re) => re.test(msg)) && msg.length < 140) return 'low';

  // Complex intents: cart/order/compare/filter/steps/code/theme/graphql
  const complexSignals = [
    /dodaj do koszyka|usuń z koszyka|zaktualizuj koszyk|cart|add to cart|remove from cart|update cart/i,
    /zamówienie|status zamówienia|order status|track(ing)? my order|recent order/i,
    /por[óo]wn(a|y)j|filtruj|posortuj|usun duplikaty|zgrupuj|pipeline|krok po kroku/i,
    /graphql|schema|introspect|fragment|mutation|query|liquid|theme|component|react|typescript|javascript/i,
  ];
  if (complexSignals.some((re) => re.test(msg))) return 'high';

  // Length heuristic: long queries usually need more reasoning
  if (msg.length >= 220) return 'high';

  return 'low';
}

/**
 * Builds Harmony-compliant messages for Groq/OpenAI API.
 * Order: system -> developer -> user (with optional RAG context).
 * 
 * @param promptData - Legacy prompt data structure
 * @param developerConstraints - CoT and output constraints
 * @returns Array of Harmony messages
 */
export function buildHarmonyMessages(
  promptData: GroqPromptData,
  developerConstraints?: DeveloperConstraints
): HarmonyMessage[] {
  const systemBase = typeof promptData.systemPersona === 'string' 
    ? promptData.systemPersona 
    : JSON.stringify(promptData.systemPersona);
  
  const rag = Array.isArray(promptData.ragContext) && promptData.ragContext.length > 0 
    ? promptData.ragContext 
    : [];

  // SYSTEM MESSAGE: Immutable rules + RAG policy + MCP tool schemas
  let systemContent = systemBase;
  
  // Append MCP tool schemas (JSON Schema format)
  systemContent += `\n\n=== MCP TOOL SCHEMAS ===\n`;
  systemContent += `You have access to the following tools. Always use the JSON schema below to generate valid tool calls.\n`;
  systemContent += `NEVER invent GraphQL fields, Liquid variables, or component props. Always use introspect_graphql_schema before generating GraphQL code.\n\n`;
  systemContent += getToolSchemasJson();
  
  // Append RAG context if provided
  if (rag.length > 0) {
    const snippets = rag.map(r => `- ${r.id}: ${r.text} (${r.meta?.url || r.meta?.gid || ''})`).join('\n');
    systemContent += `\n\n=== RAG CONTEXT (retrieved_docs) ===\n${snippets}`;
    systemContent += `\n\nRAG POLICY: Use only the above sources. Do not scrape external URLs or invent facts.`;
  }

  const messages: HarmonyMessage[] = [
    { role: 'system', content: systemContent }
  ];

  // DEVELOPER MESSAGE: CoT constraints and output format
  if (developerConstraints) {
    const { reasoning_mode, max_cot_tokens, output_format } = developerConstraints;
    
    let devContent = `=== DEVELOPER CONSTRAINTS ===\n`;
    devContent += `- reasoning_mode: ${reasoning_mode}\n`;
    devContent += `- max_cot_tokens: ${max_cot_tokens}\n`;
    
    if (reasoning_mode === 'low') {
      devContent += `\nFor low-complexity tasks, prefer short deterministic answers. Avoid CoT unless explicitly requested by the user.\n`;
    } else if (reasoning_mode === 'high') {
      devContent += `\nFor high-complexity tasks, use detailed chain-of-thought reasoning. Keep CoT under ${max_cot_tokens} tokens.\n`;
    } else {
      devContent += `\nAuto-detect task complexity and use CoT as needed. Keep CoT under ${max_cot_tokens} tokens.\n`;
    }
    
    devContent += `\nIf chain-of-thought is required:\n`;
    devContent += `1. Generate CoT ONLY in a separate message with role 'internal' or 'debug' (not in final answer).\n`;
    devContent += `2. Keep CoT concise and under max_cot_tokens. If reasoning requires more tokens, generate a one-paragraph summary and attach full reasoning to internal audit only.\n`;
    devContent += `3. Do NOT include CoT in the final user-facing answer message.\n`;
    
    if (output_format) {
      devContent += `\n- Output format: ${output_format}\n`;
      devContent += `Ensure final response follows the specified JSON schema exactly.\n`;
    }

    messages.push({ role: 'developer', content: devContent });
  }

  // CHAT HISTORY (last 10 messages to keep context window manageable)
  const history = Array.isArray(promptData.chatHistory) ? promptData.chatHistory : [];
  const lastHistory = history.slice(-10);
  messages.push(...lastHistory.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })));

  // USER MESSAGE (current query)
  messages.push({ role: 'user', content: promptData.userQuery });

  return messages;
}

/**
 * Legacy function for backward compatibility.
 * Builds basic Groq messages without Harmony structure.
 */
export function buildGroqMessagesFromData(promptData: GroqPromptData) {
  const systemBase = typeof promptData.systemPersona === 'string' ? promptData.systemPersona : JSON.stringify(promptData.systemPersona);
  const rag = Array.isArray(promptData.ragContext) && promptData.ragContext.length > 0 ? promptData.ragContext : [];

  // Append RAG context to system prompt if provided
  let systemContent = systemBase;
  if (rag.length > 0) {
    const snippets = rag.map(r => `- ${r.id}: ${r.text} (${r.meta?.url || r.meta?.gid || ''})`).join('\n');
    systemContent += `\n\nKONTEKST RAG (retrieved_docs):\n${snippets}`;
  }

  const history = Array.isArray(promptData.chatHistory) ? promptData.chatHistory : [];
  // Limit history to last 10 messages
  const lastHistory = history.slice(-10);

  const messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }> = [
    { role: 'system', content: systemContent },
    ...lastHistory.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: promptData.userQuery }
  ];

  return messages;
}
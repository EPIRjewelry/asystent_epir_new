// worker/src/groq.ts
// Integracja Groq API dla EPIR-ART-JEWELLERY. Obsługuje luxury-system-prompt, walidację outputu, narzędzia MCP.

import { LUXURY_SYSTEM_PROMPT } from './prompts/luxury-system-prompt';

export async function streamGroqResponse({ messages, tools, timeoutMs = 12000 }) {
  // ...implementacja streamingu odpowiedzi Groq z timeoutem i MCP tool_call
  // Użyj LUXURY_SYSTEM_PROMPT jako system promptu
  // Waliduj output: musi być czysty JSON (reply/tool_call)
  // ...
  throw new Error('Not implemented: streamGroqResponse');
}

export function validateGroqOutput(output) {
  // Walidacja: czy output to czysty JSON reply/tool_call
  if (!output) return false;
  try {
    const obj = typeof output === 'string' ? JSON.parse(output) : output;
    if (obj.reply && typeof obj.reply === 'string') return true;
    if (obj.tool_call && typeof obj.tool_call === 'object') return true;
    return false;
  } catch {
    return false;
  }
}

export { LUXURY_SYSTEM_PROMPT };

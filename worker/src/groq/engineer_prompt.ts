// worker/src/groq/engineer_prompt.ts
// Small helper to build Groq messages from promptData. Kept minimal to satisfy tests and existing imports.

export type GroqPromptData = {
  systemPersona: string;
  chatHistory: { role: 'user' | 'assistant', content: string }[];
  ragContext?: { id: string, text: string, meta?: { url?: string, gid?: string } }[];
  userQuery: string;
};

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

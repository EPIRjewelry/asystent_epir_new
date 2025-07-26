// functions/src/agents/analyticsAgent.ts
import { defineFlow, run } from '@genkit-ai/flow';
import { gemini } from '@genkit-ai/vertexai'; // Założenie, że używamy Vertex AI Gemini

// Definiujemy nasz flow (przepływ) dla agenta analitycznego
export const analyticsAgentFlow = defineFlow(
  {
    name: 'analyticsAgentFlow',
    inputSchema: { type: 'string' }, // Wejście to prosty tekst
    outputSchema: { type: 'string' }, // Wyjście to prosty tekst
  },
  async (input) => {
    // Logika agenta analitycznego będzie tutaj
    // Na początek, po prostu odpowiemy na input, aby sprawdzić, czy działa
    const response = await run(gemini.model('gemini-1.5-flash')).generate({
      prompt: `Jesteś ekspertem od analizy e-commerce dla EPIR biżuterii. Odpowiedz krótko: ${input}`,
    });

    return response.text();
  }
);

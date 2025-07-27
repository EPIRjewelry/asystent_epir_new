// functions/src/agents/analyticsAgent.ts
import {genkit, z} from "genkit";
import {vertexAI, gemini15Flash} from "@genkit-ai/vertexai";

// Tworzymy instancję Genkit z pluginami
const ai = genkit({
  plugins: [
    vertexAI({location: "us-central1"}),
  ],
});

// Definiujemy nasz flow (przepływ) dla agenta analitycznego
export const analyticsAgentFlow = ai.defineFlow(
  {
    name: "analyticsAgentFlow",
    inputSchema: z.string().describe(
      "Pytanie lub zapytanie dotyczące analityki e-commerce"
    ),
    outputSchema: z.string(),
  },
  async (input: string) => {
    // Logika agenta analitycznego będzie tutaj
    // Na początek, po prostu odpowiemy na input, aby sprawdzić, czy działa
    const response = await ai.generate({
      model: gemini15Flash,
      prompt: "Jesteś ekspertem od analizy e-commerce dla EPIR biżuterii. " +
        `Odpowiedz krótko: ${input}`,
    });

    return response.text;
  }
);

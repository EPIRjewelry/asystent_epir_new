// functions/src/index.ts (Twój główny plik funkcji)

import {setGlobalOptions} from "firebase-functions";
import {onRequest} from "firebase-functions/https"; // Może być usunięte, jeśli nie używasz onRequest
import * as logger from "firebase-functions/logger";

// Importuj onCallGenkit oraz inne potrzebne rzeczy z Genkit
import {onCallGenkit} from "firebase-functions/v2/https";
import {genkit} from "genkit";

// Importuj plugin Vertex AI, jeśli używasz genkit({ plugins: [vertexAI()] })
import {vertexAI} from "@genkit-ai/vertexai";

// Importuj swój flow agenta analitycznego
import {analyticsAgentFlow} from "./agents/analyticsAgent"; // Pamiętaj o poprawnej ścieżce!

// Ustawienia globalne dla funkcji Firebase
setGlobalOptions({ maxInstances: 10 });

// --- Konfiguracja Genkit (MUSISZ DODAĆ TO DO index.ts) ---
genkit({
  plugins: [
    // Upewnij się, że używasz odpowiedniego plugina dla swojego modelu.
    // Jeśli używasz @genkit-ai/vertexai (jak w analyticsAgent.ts), to:
    vertexAI(),
    // Jeśli używasz @genkit-ai/googleai, to:
    // googleAI(),
  ],
  // Możesz określić domyślny model, jeśli chcesz
  // model: gemini15Flash, // Przykład
});
// --------------------------------------------------------

// Teraz eksportujemy Twój flow Genkit jako funkcję Cloud Function
// Nazwa eksportu będzie nazwą funkcji wywoływalnej.
export const callAnalyticsAgent = onCallGenkit(
  // Możesz dodać opcje dla funkcji, np. secrets, jeśli potrzebujesz API key'a
  // secrets: [apiKey], // Jeśli używasz np. GoogleAI i API klucza
  {}, // Brak specjalnych opcji w tym przypadku, ale klamry są wymagane
  analyticsAgentFlow // Przekazujemy zdefiniowany flow
);

// Poniższa funkcja jest nadal zakomentowana, więc się nie wdroży.
// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });


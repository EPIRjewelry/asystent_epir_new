// functions/src/index.ts (Twój główny plik funkcji)

import {setGlobalOptions} from "firebase-functions";
import {defineString} from "firebase-functions/params";

// Importuj onCallGenkit oraz inne potrzebne rzeczy z Genkit
import {onCallGenkit} from "firebase-functions/v2/https";
import {genkit} from "genkit";

// Importuj plugin Vertex AI
import {vertexAI} from "@genkit-ai/vertexai";

// Importuj swój flow agenta analitycznego
import {analyticsAgentFlow} from "./agents/analyticsAgent";

// Ustawienia globalne dla funkcji Firebase
setGlobalOptions({maxInstances: 10});

// Definicja parametrów Firebase Functions dla bindowania secrets
const SHOPIFY_STORE_URL = defineString("SHOPIFY_STORE_URL");
const SHOPIFY_ACCESS_TOKEN = defineString("SHOPIFY_ACCESS_TOKEN");
const SHOPIFY_API_VERSION = defineString("SHOPIFY_API_VERSION", { default: "2025-07" });
const GEMINI_API_KEY = defineString("GEMINI_API_KEY");
const VERTEX_AI_LOCATION = defineString("VERTEX_AI_LOCATION", { default: "us-central1" });

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
  // Bindowanie parametrów/secrets dla Genkit function
  {
    secrets: [SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN, SHOPIFY_API_VERSION, GEMINI_API_KEY, VERTEX_AI_LOCATION],
    // Możesz dodać dodatkowe opcje funkcji tutaj
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  analyticsAgentFlow // Przekazujemy zdefiniowany flow
);

// Poniższa funkcja jest nadal zakomentowana, więc się nie wdroży.
// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });


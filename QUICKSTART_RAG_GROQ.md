# Quick Start: Aktywacja RAG i Groq LLM

Ten przewodnik pokazuje jak aktywować pełny production-ready AI Assistant z RAG i Groq LLM w 5 krokach.

## Krok 1: Ustaw Sekrety w Cloudflare Workers

```bash
cd worker

# Ustaw Groq API Key (pobierz z https://console.groq.com/)
wrangler secret put GROQ_API_KEY
# Wklej swój klucz API

# Upewnij się że SHOPIFY_APP_SECRET jest ustawiony
wrangler secret put SHOPIFY_APP_SECRET
# Wklej klucz z Shopify Partners → API credentials
```

## Krok 2: Zaimplementuj Generowanie Embeddings

Otwórz `worker/src/rag.ts` i zamień funkcję `generateEmbedding()`:

### Opcja A: Użyj Workers AI (darmowe, wbudowane)

```typescript
// W worker/src/rag.ts, dodaj na początku:
interface WorkersAI {
  run: (model: string, args: Record<string, unknown>) => Promise<any>;
}

// Zamień funkcję searchShopPoliciesAndFaqs:
export async function searchShopPoliciesAndFaqs(
  query: string,
  vectorIndex: VectorizeIndex,
  ai: WorkersAI,  // Dodaj parametr
  topK: number = 3
): Promise<RagContext> {
  try {
    // 1. Generate embedding using Workers AI
    const embeddingResult = await ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [query],
    });
    
    const embedding = embeddingResult.data[0]; // Float32Array or number[]
    
    // 2. Query Vectorize
    const queryResult = await vectorIndex.query(embedding, { topK });
    
    // 3. Format results
    return {
      query,
      results: queryResult.matches.map(match => ({
        id: match.id,
        text: match.metadata?.text as string || '',
        score: match.score,
        metadata: match.metadata,
      })),
    };
  } catch (error) {
    console.error('RAG search error:', error);
    return { query, results: [] };
  }
}
```

### Opcja B: Użyj OpenAI API (bardziej precyzyjne)

```typescript
async function generateEmbedding(text: string, openaiKey: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      input: text,
      model: 'text-embedding-3-small', // 384 dimensions
    }),
  });
  
  const data = await response.json();
  return data.data[0].embedding;
}
```

## Krok 3: Integruj RAG w Worker

Otwórz `worker/src/index.ts` i zmodyfikuj `streamAssistantResponse()`:

```typescript
// Dodaj importy na górze:
import { searchShopPoliciesAndFaqs, formatRagContextForPrompt } from './rag';
import { streamGroqResponse, buildGroqMessages } from './groq';

// W funkcji streamAssistantResponse(), zamień AI logic:
async function streamAssistantResponse(
  sessionId: string,
  userMessage: string,
  stub: DurableObjectStub,
  env: Env,
): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      // 1. Fetch history
      const historyResp = await stub.fetch('https://session/history');
      const historyRaw = await historyResp.json().catch(() => []);
      const history = ensureHistoryArray(historyRaw);

      // 2. Perform RAG search
      let ragContext: string | undefined;
      if (env.VECTOR_INDEX && env.AI) {
        const ragResult = await searchShopPoliciesAndFaqs(
          userMessage, 
          env.VECTOR_INDEX, 
          env.AI  // Pass AI binding for embeddings
        );
        if (ragResult.results.length > 0) {
          ragContext = formatRagContextForPrompt(ragResult);
        }
      }

      // 3. Build messages with luxury prompt
      const messages = buildGroqMessages(history, userMessage, ragContext);

      // 4. Stream from Groq (if API key available)
      let fullReply = '';
      
      // Send initial session_id event
      await writer.write(encoder.encode(`data: ${JSON.stringify({ session_id: sessionId, done: false })}\n\n`));

      if (env.GROQ_API_KEY) {
        // Use Groq streaming
        const stream = await streamGroqResponse(messages, env.GROQ_API_KEY);
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = typeof value === 'string' ? value : decoder.decode(value);
          fullReply += chunk;
          
          const evt = JSON.stringify({ delta: chunk, session_id: sessionId, done: false });
          await writer.write(encoder.encode(`data: ${evt}\n\n`));
        }
      } else {
        // Fallback to Workers AI
        fullReply = await generateAIResponse(history, userMessage, env);
        const parts = fullReply.split(/(\s+)/);
        for (const part of parts) {
          const evt = JSON.stringify({ delta: part, session_id: sessionId, done: false });
          await writer.write(encoder.encode(`data: ${evt}\n\n`));
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
      }

      // 5. Append final reply to session
      await stub.fetch('https://session/append', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'assistant', content: fullReply, session_id: sessionId }),
      });

      // 6. Send done event
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ content: fullReply, session_id: sessionId, done: true })}\n\n`)
      );
      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (error) {
      console.error('Streaming error', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: message, session_id: sessionId })}\n\n`));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      ...cors(env),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

## Krok 4: Dodaj VECTOR_INDEX do Env Interface

W `worker/src/index.ts`, zaktualizuj interface Env:

```typescript
export interface Env {
  DB: D1Database;
  SESSIONS_KV: KVNamespace;
  SESSION_DO: DurableObjectNamespace;
  VECTOR_INDEX: VectorizeIndex;  // ✓ Już w wrangler.toml, dodaj do typów
  ALLOWED_ORIGIN?: string;
  AI?: WorkersAI;
  SHOPIFY_STOREFRONT_TOKEN?: string;
  SHOP_DOMAIN?: string;
  SHOPIFY_APP_SECRET?: string;
  GROQ_API_KEY?: string;  // Dodaj
  DEV_BYPASS?: string;
}
```

Dodaj import dla VectorizeIndex:

```typescript
import type { VectorizeIndex } from './rag';
```

## Krok 5: Populate Vectorize Index

```bash
# W głównym katalogu projektu
export CLOUDFLARE_ACCOUNT_ID="your_account_id"
export CLOUDFLARE_API_TOKEN="your_api_token"
export SHOP_DOMAIN="epir-art-silver-jewellery.myshopify.com"
export SHOPIFY_STOREFRONT_TOKEN="your_storefront_token"

# Uruchom skrypt
node scripts/populate-vectorize.ts
```

**Uwaga**: Skrypt używa dummy embeddings. Przed uruchomieniem, zaimplementuj prawdziwe embeddings w funkcji `generateEmbedding()` (Opcja A lub B z Kroku 2).

## Krok 6: Deploy

```bash
cd worker
npm run deploy
```

## Weryfikacja

1. **Test Groq**: Wyślij wiadomość przez widget - odpowiedź powinna być w luksusowym tonie (sprawdź `LUXURY_SYSTEM_PROMPT`)

2. **Test RAG**: Zadaj pytanie o politykę zwrotów - odpowiedź powinna zawierać konkretne informacje z FAQs

3. **Check Logs**:
   ```bash
   wrangler tail
   ```
   Sprawdź czy nie ma błędów "Vectorize search not yet implemented"

## Troubleshooting

### Błąd: "Groq API error (401)"
- Sprawdź czy `GROQ_API_KEY` jest poprawnie ustawiony:
  ```bash
  wrangler secret list
  ```

### Błąd: "Vectorize index not found"
- Sprawdź w Cloudflare Dashboard → Vectorize czy index istnieje
- Upewnij się że `wrangler.toml` ma poprawny `index_name`

### Odpowiedzi bez RAG context
- Sprawdź czy Vectorize index ma dane:
  ```bash
  wrangler vectorize list
  ```
- Sprawdź czy `generateEmbedding()` zwraca poprawny wektor (384 lub 1536 wymiarów)

### Brak streaming
- Sprawdź DevTools → Network → Response Headers: powinno być `Content-Type: text/event-stream`
- Sprawdź czy frontend poprawnie parsuje SSE (assistant.js)

## Next Steps

Po aktywacji RAG + Groq:
1. **Monitoruj quality**: Sprawdź czy odpowiedzi są rzeczywiście lepsze
2. **Dodaj metrics**: Track usage, response times, error rates
3. **E2E Tests**: Dodaj Playwright testy dla critical flows
4. **UX**: Dodaj retry button, typing indicator, markdown rendering

---

**Gotowe! Twój luxury AI assistant powinien teraz działać z pełnym RAG pipeline i luksusowym tonem. 💎✨**

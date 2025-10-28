/// <reference types="@cloudflare/workers-types" />

/**
 * Przeniesione z cloudflare-ai.ts: Wykrywa intencję użytkownika (koszyk, zamówienie lub null).
 */
export function detectMcpIntent(userMessage: string): 'cart' | 'order' | null {
  const msg = userMessage.toLowerCase();

  const cartKeywords = [
    'koszyk', 'dodaj do koszyka', 'w koszyku', 'zawartość koszyka', 
    'co mam w koszyku', 'usuń z koszyka', 'aktualizuj koszyk', 'pokaż koszyk',
    'cart', 'add to cart', 'show cart', 'my cart', 'what is in my cart', 'update cart'
  ];

  const orderKeywords = [
    'zamówienie', 'mojego zamówienia', 'status zamówienia', 'moje zamówienie', 'śledzenie', 'śledzenie przesyłki',
    'gdzie jest', 'kiedy dotrze', 'ostatnie zamówienie',
    'order status', 'order', 'track my order', 'recent order', 'where is my package' // Dodano brakujące angielskie keywordy
  ];

  if (cartKeywords.some(keyword => msg.includes(keyword))) {
    return 'cart';
  }
  if (orderKeywords.some(keyword => msg.includes(keyword))) {
    return 'order';
  }
  return null;
}

/**
 * Przeniesione z cloudflare-ai.ts: Dynamicznie pobiera kontekst MCP (koszyk/zamówienie).
 * UWAGA: Musisz dostosować wywołania 'getCart' i 'getMostRecentOrderStatus' 
 * do rzeczywistych funkcji narzędziowych MCP (jeśli ich nazwy są inne).
 */

export async function fetchMcpContextIfNeeded(
  intent: 'cart' | 'order' | null,
  cartId: string | null | undefined,
  env: any,
  // optional injectable functions for tests
  getCartFn?: (id: string, env: any) => Promise<any>,
  getMostRecentOrderStatusFn?: (env: any) => Promise<any>
): Promise<string | null> {
  try {
    const getCartImpl = getCartFn ?? ((id: string, e: any) => getCart(e, id));
    const getOrderImpl = getMostRecentOrderStatusFn ?? ((e: any) => getMostRecentOrderStatus(e));

    if (intent === 'cart' && cartId) {
      try {
        const raw = await getCartImpl(cartId, env);
        // raw may be JSON string or already-parsed object
        let parsed: any = raw;
        if (typeof raw === 'string') {
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            return `Kontekst Koszyka (surowy): ${String(raw)}`;
          }
        }

        // Build simple cart summary
        const lines = parsed?.lines?.edges || [];
        const items = lines
          .map((edge: any) => {
            const qty = edge?.node?.quantity ?? '';
            const title = edge?.node?.merchandise?.product?.title ?? edge?.node?.merchandise?.title ?? '';
            return `${title}${qty ? ` x${qty}` : ''}`.trim();
          })
          .filter(Boolean)
          .join(', ');

        const amount = parsed?.cost?.totalAmount?.amount;
        const currency = parsed?.cost?.totalAmount?.currencyCode;

        let out = `Kontekst Koszyka`;
        if (items) out += `: ${items}`;
        if (amount && currency) out += ` — ${amount} ${currency}`;
        return out;
      } catch (err) {
        console.error('fetchMcpContextIfNeeded cart error:', err);
        return 'Błąd pobierania kontekstu';
      }
    }

    if (intent === 'order') {
      try {
        const raw = await getOrderImpl(env);
        let parsed: any = raw;
        if (typeof raw === 'string') {
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            return `Kontekst Zamówienia (surowy): ${String(raw)}`;
          }
        }

        let out = `Kontekst Zamówienia`;
        if (parsed?.name) out += `: ${parsed.name}`;
        if (parsed?.displayFulfillmentStatus) out += ` — ${parsed.displayFulfillmentStatus}`;
        if (parsed?.totalPriceSet?.shopMoney?.amount && parsed?.totalPriceSet?.shopMoney?.currencyCode) {
          out += ` — ${parsed.totalPriceSet.shopMoney.amount} ${parsed.totalPriceSet.shopMoney.currencyCode}`;
        }
        return out;
      } catch (err) {
        console.error('fetchMcpContextIfNeeded order error:', err);
        return 'Błąd pobierania kontekstu';
      }
    }

    return null;
  } catch (error) {
    console.error('Error in fetchMcpContextIfNeeded:', error);
    return `Unexpected error: ${toErrorMessage(error)}`;
  }
}

// Bezpieczne pozyskanie komunikatu błędu z unknown
function toErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as any).message;
    return typeof msg === 'string' ? msg : JSON.stringify(msg);
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

import { verifyAppProxyHmac, replayCheck } from './security';
import {
  searchShopPoliciesAndFaqs,
  searchShopPoliciesAndFaqsWithMCP,
  searchProductCatalogWithMCP,
  formatRagContextForPrompt,
  type VectorizeIndex
} from './rag';
import { LUXURY_SYSTEM_PROMPT } from './prompts/luxury-system-prompt';
import { streamGroqHarmonyEvents, getGroqResponse, streamGroqResponse } from './ai-client';
import { getAdminExecutionQueue } from './admin-queue';
import { validateFunctionSignature } from './mcp_tools';
import { buildHarmonyMessages, classifyQueryComplexity, DeveloperConstraints } from './groq/engineer_prompt';
// import { buildGroqMessagesFromData } from './groq/engineer_prompt';
import { generateMcpToolSchema } from './mcp/tool_schema';
import { getCart, getMostRecentOrderStatus } from './shopify-mcp-client';
import { handleMcpRequest, callMcpToolDirect } from './mcp_server';
import { RateLimiterDO } from './rate-limiter';

// Aliasy funkcji MCP zgodne z konwencją nazewnictwa narzędzi
const get_cart = (id: string, env: any) => getCart(env, id);
const get_most_recent_order_status = (env: any) => getMostRecentOrderStatus(env);

type ChatRole = 'user' | 'assistant' | 'tool';

interface HistoryEntry {
  role: ChatRole;
  content: string;
  ts: number;
  // Opcjonalne pola dla tool calling (zapisywane przez SessionDO, ale usuwane przed wysłaniem do Groq)
  tool_calls?: any;
  tool_call_id?: string;
  name?: string;
}

interface AppendPayload {
  role: ChatRole;
  content: string;
  session_id?: string;
}

interface ChatRequestBody {
  message: string;
  session_id?: string;
  cart_id?: string;
  stream?: boolean;
}

interface EndPayload {
  session_id?: string;
}

interface AiRunResult {
  response?: string;
}

interface WorkersAI {
  run: (model: string, args: Record<string, unknown>) => Promise<AiRunResult>;
}

export interface Env {
  DB: D1Database;
  SESSIONS_KV: KVNamespace;
  SESSION_DO: DurableObjectNamespace;
  RATE_LIMITER_DO: DurableObjectNamespace;
  VECTOR_INDEX?: VectorizeIndex;
  SHOPIFY_APP_SECRET: string;
  ALLOWED_ORIGIN?: string;
  AI?: WorkersAI;
  SHOPIFY_STOREFRONT_TOKEN?: string;
  SHOPIFY_ADMIN_TOKEN?: string;
  SHOP_DOMAIN?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string; // Optional: override for Groq model (e.g., 'mixtral-8x7b-32768')
  DEV_BYPASS?: string; // '1' to bypass HMAC in dev
  WORKER_ORIGIN?: string;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const MODEL_NAME = '@cf/meta/llama-3.1-8b-instruct';
const MAX_HISTORY = 200;

function now(): number {
  return Date.now();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isChatRole(value: unknown): value is ChatRole {
  return value === 'user' || value === 'assistant';
}

function parseAppendPayload(input: unknown): AppendPayload | null {
  if (typeof input !== 'object' || input === null) return null;
  const maybe = input as Record<string, unknown>;
  if (!isChatRole(maybe.role) || !isNonEmptyString(maybe.content)) return null;
  const sessionId = typeof maybe.session_id === 'string' && maybe.session_id.length > 0 ? maybe.session_id : undefined;
  return { role: maybe.role, content: String(maybe.content), session_id: sessionId };
}

function parseChatRequestBody(input: unknown): ChatRequestBody | null {
  if (typeof input !== 'object' || input === null) return null;
  const maybe = input as Record<string, unknown>;
  if (!isNonEmptyString(maybe.message)) return null;
  const sessionId = typeof maybe.session_id === 'string' && maybe.session_id.length > 0 ? maybe.session_id : undefined;
  const cartId = typeof maybe.cart_id === 'string' && maybe.cart_id.length > 0 ? maybe.cart_id : undefined;
  // Uwaga: domy┼Ťlnie stream = false, aby nie w┼é─ůcza─ç SSE bez jawnego ┼╝─ůdania
  const stream = typeof maybe.stream === 'boolean' ? maybe.stream : false;
  return {
    message: String(maybe.message),
    session_id: sessionId,
    cart_id: cartId,
    stream,
  };
}

function parseEndPayload(input: unknown): EndPayload | null {
  if (typeof input !== 'object' || input === null) return null;
  const maybe = input as Record<string, unknown>;
  const sessionId = typeof maybe.session_id === 'string' && maybe.session_id.length > 0 ? maybe.session_id : undefined;
  return { session_id: sessionId };
}

function ensureHistoryArray(input: unknown): HistoryEntry[] {
  // Handle string JSON (legacy storage format)
  if (typeof input === 'string' && input.trim().startsWith('[')) {
    try {
      input = JSON.parse(input);
    } catch (e) {
      console.warn('Failed to parse history string:', e);
      return [];
    }
  }
  
  if (!Array.isArray(input)) return [];
  const out: HistoryEntry[] = [];
  for (const candidate of input) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const raw = candidate as Record<string, unknown>;
    if (!isChatRole(raw.role) || !isNonEmptyString(raw.content)) continue;
    const ts = typeof raw.ts === 'number' ? raw.ts : now();
    
    // Zachowaj tool calling fields jeśli istnieją
    const entry: HistoryEntry = { 
      role: raw.role, 
      content: String(raw.content), 
      ts 
    };
    if (raw.tool_calls) entry.tool_calls = raw.tool_calls;
    if (typeof raw.tool_call_id === 'string') entry.tool_call_id = raw.tool_call_id;
    if (typeof raw.name === 'string') entry.name = raw.name;
    
    out.push(entry);
  }
  return out.slice(-MAX_HISTORY);
}

function cors(env: Env): Record<string, string> {
  const origin = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Shop-Signature',
  };
}

export class SessionDO {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private history: HistoryEntry[] = [];
  private cartId: string | null = null;
  private sessionId: string | null = null;
  private lastRequestTimestamp = 0;
  private requestsInWindow = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    this.state.blockConcurrencyWhile(async () => {
      const rawHistory = await this.state.storage.get<unknown>('history');
      const storedCartId = await this.state.storage.get<string>('cart_id');
      const storedSessionId = await this.state.storage.get<string>('session_id');
      this.history = ensureHistoryArray(rawHistory);
      if (storedCartId) {
        this.cartId = storedCartId;
      }
      if (storedSessionId) {
        this.sessionId = storedSessionId;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.rateLimitOk()) {
      return new Response('Rate limit exceeded', { status: 429 });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    if (method === 'GET' && pathname.endsWith('/history')) {
      return new Response(JSON.stringify(this.history), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (method === 'POST' && pathname.endsWith('/append')) {
      const payload = parseAppendPayload(await request.json().catch(() => null));
      if (!payload) {
        return new Response('Bad Request', { status: 400 });
      }
      if (payload.session_id) {
        this.sessionId = payload.session_id;
        await this.state.storage.put('session_id', payload.session_id);
      }
      await this.append(payload);
      return new Response('ok');
    }

    if (method === 'POST' && pathname.endsWith('/end')) {
      const payload = parseEndPayload(await request.json().catch(() => null));
      const sessionId = payload?.session_id ?? 'unknown';
      await this.end(sessionId);
      return new Response('ended');
    }

    if (method === 'POST' && pathname.endsWith('/replay-check')) {
      const payload = await request.json().catch(() => null);
      const p = payload as { signature?: string; timestamp?: string } | null;
      if (!p || !p.signature || !p.timestamp) {
        return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });
      }
      const { signature, timestamp } = p;
      const key = `replay:${signature}`;
      const used = await this.state.storage.get<boolean>(key);
      if (used) {
        return new Response(JSON.stringify({ used: true }), { status: 200 });
      }
      // Mark as used
      await this.state.storage.put(key, true);
      return new Response(JSON.stringify({ used: false }), { status: 200 });
    }

    if (method === 'GET' && pathname.endsWith('/cart-id')) {
      return new Response(JSON.stringify({ cart_id: this.cartId }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (method === 'POST' && pathname.endsWith('/set-cart-id')) {
      const payload = await request.json().catch(() => null);
      const p = payload as { cart_id?: string } | null;
      if (!p || typeof p.cart_id !== 'string') {
        return new Response('Bad Request', { status: 400 });
      }
      this.cartId = p.cart_id;
      await this.state.storage.put('cart_id', p.cart_id);
      return new Response('ok');
    }

    if (method === 'POST' && pathname.endsWith('/log-cart-action')) {
      const payload = await request.json().catch(() => null);
      const p = payload as { action?: string; details?: Record<string, any> } | null;
      if (!p || typeof p.action !== 'string') {
        return new Response('Bad Request: action required', { status: 400 });
      }
      await this.logCartAction(p.action, p.details || {});
      return new Response('ok');
    }

    if (method === 'GET' && pathname.endsWith('/cart-logs')) {
      const cartLogs = await this.state.storage.get<Array<any>>('cart_logs') || [];
      return new Response(JSON.stringify({ logs: cartLogs }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  private rateLimitOk(): boolean {
    const current = now();
    if (current - this.lastRequestTimestamp > RATE_LIMIT_WINDOW_MS) {
      this.requestsInWindow = 1;
      this.lastRequestTimestamp = current;
      return true;
    }
    this.requestsInWindow += 1;
    return this.requestsInWindow <= RATE_LIMIT_MAX_REQUESTS;
  }

  private async append(payload: AppendPayload): Promise<void> {
    this.history.push({ role: payload.role, content: payload.content, ts: now() });
    this.history = this.history.slice(-MAX_HISTORY);
    // Store as array directly (not stringified) for proper DO storage serialization
    await this.state.storage.put('history', this.history);
  }

  private async logCartAction(action: string, details: Record<string, any>): Promise<void> {
    // Logowanie akcji koszyka do Durable Object storage (opcjonalnie do D1)
    const cartLog = {
      action,
      details,
      timestamp: now(),
      cart_id: this.cartId,
      session_id: this.sessionId
    };
    
    // Dodaj do lokalnego logu w DO
    const cartLogs = await this.state.storage.get<Array<any>>('cart_logs') || [];
    cartLogs.push(cartLog);
    
    // Zachowaj ostatnie 50 akcji
    const trimmedLogs = cartLogs.slice(-50);
    await this.state.storage.put('cart_logs', trimmedLogs);
    
    // Opcjonalnie: zapisz do D1 dla długoterminowej analityki
    if (this.env.DB) {
      try {
        await this.env.DB.prepare(
          'INSERT INTO cart_actions (session_id, cart_id, action, details, created_at) VALUES (?1, ?2, ?3, ?4, ?5)'
        ).bind(
          this.sessionId || 'unknown',
          this.cartId || null,
          action,
          JSON.stringify(details),
          now()
        ).run();
      } catch (e) {
        console.error('[SessionDO] Failed to log cart action to D1:', e);
        // Nie przerywaj flow jeśli logging się nie powiedzie
      }
    }
    
    console.log(`[SessionDO] 🛒 Cart action logged: ${action}`, details);
  }

  private async end(sessionId: string): Promise<void> {
    if (this.history.length === 0) {
      await this.state.storage.delete('history');
      await this.state.storage.delete('session_id');
      return;
    }

    if (this.env.DB) {
      const started = this.history[0]?.ts ?? now();
      const ended = this.history[this.history.length - 1]?.ts ?? started;
      await this.env.DB.prepare(
        'INSERT INTO conversations (session_id, started_at, ended_at) VALUES (?1, ?2, ?3)'
      ).bind(sessionId, started, ended).run();
      const row = await this.env.DB.prepare('SELECT last_insert_rowid() AS id').first<{ id: number }>();
      const conversationId = row?.id;
      if (conversationId !== undefined) {
        const stmt = this.env.DB.prepare(
          'INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4)'
        );
        for (const entry of this.history) {
          await stmt.bind(conversationId, entry.role, entry.content, entry.ts).run();
        }
      }
    }

    this.history = [];
    this.cartId = null;
    await this.state.storage.delete('history');
    await this.state.storage.delete('session_id');
    await this.state.storage.delete('cart_id');
    await this.state.storage.delete('cart_logs'); // Wyczyść logi koszyka
  }
}

async function generateAIResponse(history: HistoryEntry[], userMessage: string, env: Env, ragContext?: string): Promise<string> {
  const ai = env.AI;
  if (!ai || typeof ai.run !== 'function') {
    return `Echo: ${userMessage}`;
  }

  const recentHistory = history.slice(-10);
  const systemPrompt = ragContext 
    ? `Jesteś pomocnym asystentem sklepu jubilerskiego EPIR. Odpowiadasz na pytania konkretnie i kulturalnie. Użyj poniższych informacji ze sklepu, aby odpowiedzieć na pytanie użytkownika:\n\n${ragContext}`
    : 'Jesteś pomocnym asystentem sklepu jubilerskiego EPIR. Odpowiadasz na pytania konkretnie i kulturalnie.';
  
  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    ...recentHistory.map((entry) => ({ role: entry.role, content: entry.content })),
    { role: 'user' as const, content: userMessage },
  ];

  const response = await ai.run(MODEL_NAME, {
    messages,
    max_tokens: 512,
    temperature: 0.7,
    top_p: 0.9,
  }).catch((error: unknown) => {
    console.error('AI error', error);
    return null;
  });

  if (response && typeof response.response === 'string' && response.response.trim().length > 0) {
    return response.response.trim();
  }

  return 'Przepraszam, nie uda┼éo mi si─Ö wygenerowa─ç odpowiedzi. Spr├│buj ponownie.';
}

/**
 * If the configured env.AI supports streaming, try to obtain a ReadableStream<string>
 * that yields incremental text chunks. Return null if not available.
 */
async function generateAIResponseStream(history: HistoryEntry[], userMessage: string, env: Env, ragContext?: string): Promise<ReadableStream<string> | null> {
  // Build messages same as non-streaming
  const recentHistory = history.slice(-10);
  const systemPrompt = ragContext 
    ? `Jesteś pomocnym asystentem sklepu jubilerskiego EPIR. Odpowiadasz na pytania konkretnie i kulturalnie. Użyj poniższych informacji ze sklepu, aby odpowiedzieć na pytanie użytkownika:\n\n${ragContext}`
    : 'Jesteś pomocnym asystentem sklepu jubilerskiego EPIR. Odpowiadasz na pytania konkretnie i kulturalnie.';
  
  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    ...recentHistory.map((entry) => ({ role: entry.role, content: entry.content })),
    { role: 'user' as const, content: userMessage },
  ];

  // Try common streaming entrypoints on env.AI
  try {
    const ai: any = env.AI as any;
    if (!ai) return null;

    // 1) Workers AI hypothetical stream method: ai.stream(model, args)
    if (typeof ai.stream === 'function') {
      return await ai.stream(MODEL_NAME, { messages, max_tokens: 512, temperature: 0.7, top_p: 0.9 });
    }

    // 2) Some bindings expose runStream
    if (typeof ai.runStream === 'function') {
      return await ai.runStream(MODEL_NAME, { messages, max_tokens: 512, temperature: 0.7, top_p: 0.9 });
    }

    // 3) Some SDKs return an object with a readable property from run()
    if (typeof ai.run === 'function') {
      const maybe = await ai.run(MODEL_NAME, { messages, max_tokens: 512, temperature: 0.7, top_p: 0.9 });
      if (maybe && typeof maybe === 'object' && maybe.readable) return maybe.readable as ReadableStream<string>;
    }
  } catch (e) {
    console.warn('AI streaming not available or failed to start', e);
    return null;
  }

  return null;
}

async function handleChat(request: Request, env: Env): Promise<Response> {
  const payload = parseChatRequestBody(await request.json().catch(() => null));
  if (!payload) {
    return new Response('Bad Request: message required', { status: 400, headers: cors(env) });
  }

  // Greeting prefilter: detect short greetings and return fast response without RAG/MCP
  const greetingCheck = payload.message.toLowerCase().trim();
  const greetingPattern = /^(cześć|czesc|hej|witaj|witam|dzień dobry|dzien dobry|dobry wieczór|dobry wieczor|hi|hello|hey)$/i;
  const isShortGreeting = greetingCheck.length < 15 && greetingPattern.test(greetingCheck);
  
  if (isShortGreeting) {
    const sessionId = payload.session_id ?? crypto.randomUUID();
    const doId = env.SESSION_DO.idFromName(sessionId);
    const stub = env.SESSION_DO.get(doId);
    
    // Append user message
    await stub.fetch('https://session/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user', content: payload.message, session_id: sessionId }),
    });
    
    // Return fast greeting response without AI
    const greetingReply = 'Witaj! Jestem asystentem EPIR. Jak mogę Ci dzisiaj pomóc? 🌟';
    
    await stub.fetch('https://session/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'assistant', content: greetingReply, session_id: sessionId }),
    });
    
    return new Response(JSON.stringify({ reply: greetingReply, session_id: sessionId }), {
      headers: { ...cors(env), 'Content-Type': 'application/json' },
    });
  }

  const sessionId = payload.session_id ?? crypto.randomUUID();
  const doId = env.SESSION_DO.idFromName(sessionId);
  const stub = env.SESSION_DO.get(doId);

  const appendResponse = await stub.fetch('https://session/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'user', content: payload.message, session_id: sessionId }),
  });
  if (!appendResponse.ok) {
    return new Response('Internal Error: session append failed', { status: 500, headers: cors(env) });
  }

  // Save cart_id to SessionDO if provided
  if (payload.cart_id) {
    console.log('[handleChat] Saving cart_id to session:', payload.cart_id);
    await stub.fetch('https://session/set-cart-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart_id: payload.cart_id }),
    });
  }

  if (payload.stream) {
    return streamAssistantResponse(sessionId, payload.message, stub, env);
  }

  // Non-streaming path with RAG + Groq support
  const historyResp = await stub.fetch('https://session/history');
  const historyData = await historyResp.json().catch(() => []);
  const history = ensureHistoryArray(historyData);
  
  // Get cart_id from SessionDO
  const cartIdResp = await stub.fetch('https://session/cart-id');
  const cartIdData = await cartIdResp.json().catch(() => ({ cart_id: null }));
  const cartId = (cartIdData as { cart_id?: string | null }).cart_id;
  
  let reply: string;
  
  // Perform RAG search with MCP integration
  let ragContext: string | undefined;
  let mcpContext: string | null | undefined;
  
  // Smart intent detection - skip MCP for conversational/follow-up queries
  const lowerMsg = payload.message.toLowerCase();
  
  // Conversational queries (no product search needed)
  const isConversational = /^(jak|co|kiedy|dlaczego|czy|pamietasz|pamiętasz|jak mam na imię|kim jestem|znasz mnie|przypomnij|co ostatnio|czego szukałem|co mówiłem|co pytałem)/i.test(lowerMsg) 
    || /(jak się masz|jak tam|co słychać|co u ciebie|jak leci|jak minął dzień|dobrze się czujesz)/i.test(lowerMsg);
  const isFollowUp = /^(ten|ta|to|go|je|ją|chciałbym|chce|możesz|pokaz|pokaż mi|wyślij|link)/i.test(lowerMsg.trim());
  
  // Extract entity from history for follow-up queries
  let entityFromHistory: string | undefined;
  if (isFollowUp && history.length > 0) {
    // Look for product mentions in last assistant message
    const lastAssistant = [...history].reverse().find(h => h.role === 'assistant');
    if (lastAssistant) {
      const productMatch = lastAssistant.content.match(/"([^"]+)"|„([^"]+)"|'([^']+)'/);
      if (productMatch) {
        entityFromHistory = productMatch[1] || productMatch[2] || productMatch[3];
      }
    }
  }
  
  // Detect intent (product, cart, order, or FAQ)
  const isCartIntent = /koszyk|dodaj do koszyka|usuń z koszyka|cart|add to cart/.test(lowerMsg);
  const isOrderIntent = /zamówienie|status zamówienia|order|tracking/.test(lowerMsg);
  const isProductIntent = /produkt|pierścionek|naszyjnik|kolczyki|bransoletka|biżuteria|szukam|pokaż|product|ring|necklace|earring|bracelet|jewelry/.test(lowerMsg);
  
  // PRIMARY: MCP for products, cart, orders (skip for conversational queries)
  if (env.SHOP_DOMAIN && !isConversational) {
    const { searchProductsAndCartWithMCP } = await import('./rag');
    
    let intent: 'search' | 'cart' | 'order' | undefined;
    if (isCartIntent) intent = 'cart';
    else if (isOrderIntent) intent = 'order';
    else if (isProductIntent || isFollowUp) intent = 'search';
    
    // Use entity from history for follow-up queries
    const searchQuery = entityFromHistory || payload.message;
    
    const mcpResult = await searchProductsAndCartWithMCP(
      searchQuery,
      env.SHOP_DOMAIN,
      env,
      cartId,
      intent,
      env.VECTOR_INDEX,
      env.AI
    );
    
    if (mcpResult) {
      ragContext = mcpResult;
    }
  }
  
  // FALLBACK: Vectorize for FAQ/policies (if no product/cart/order context found)
  if (!ragContext || ragContext.trim().length === 0) {
    if (env.SHOP_DOMAIN) {
      // Use MCP with Vectorize fallback for policies
      const ragResult = await searchShopPoliciesAndFaqsWithMCP(
        payload.message,
        env.SHOP_DOMAIN,
        env.VECTOR_INDEX,
        env.AI,
        3
      );
      if (ragResult.results.length > 0) {
        ragContext = formatRagContextForPrompt(ragResult);
      }
    } else if (env.VECTOR_INDEX && env.AI) {
      // Vectorize-only fallback
      const ragResult = await searchShopPoliciesAndFaqs(
        payload.message, 
        env.VECTOR_INDEX, 
        env.AI,
        3
      );
      if (ragResult.results.length > 0) {
        ragContext = formatRagContextForPrompt(ragResult);
      }
    }
  }
  
  // Fetch additional MCP context (wykryj intencję i przekaż funkcje MCP)
  const intent = detectMcpIntent(payload.message);
  mcpContext = await fetchMcpContextIfNeeded(
    intent,
    cartId,
    env,
    get_cart,
    get_most_recent_order_status
  );
  
  // Use Groq AI
    // Use Groq AI
  const promptData = {
    systemPersona: LUXURY_SYSTEM_PROMPT,
    chatHistory: history,
    ragContext: Array.isArray(ragContext) ? ragContext : [],
    userQuery: payload.message
  };
  // const messages = buildGroqMessagesFromData(promptData);
  // Zbuduj tablicę messages zgodnie z formatem Groq API
  const messages = [
    { role: 'system', content: promptData.systemPersona },
    ...promptData.chatHistory.map((entry: any) => ({ role: entry.role, content: entry.content })),
    { role: 'user', content: promptData.userQuery }
  ];
  if (payload.stream && env.GROQ_API_KEY) {
    return streamAssistantResponse(sessionId, payload.message, stub, env);
  } else if (env.GROQ_API_KEY) {
    const modelResponse = await getGroqResponse(
  messages,
  (env as any).GROQ_MODEL ?? 'openai/gpt-oss-120b',
  env as { GROQ_API_KEY: string }
    );
    
    // === BLOK WALIDACJI (KROK 3.c) ===
    // Zakładamy, że 'modelResponse' to string z odpowiedzią JSON od Groq
    // oraz że 'generateMcpToolSchema' jest zaimportowany.
    
    let responseJson: any;
    try {
      responseJson = JSON.parse(modelResponse);
    } catch (e: any) {
      // Błąd krytyczny: Model nie zwrócił JSON.
      console.error('BŁĄD KRYTYCZNY: Model nie zwrócił JSON.', e.message);
      // Zwróć błąd do klienta lub poproś model o ponowne sformatowanie
      // return new Response('Błąd formatowania odpowiedzi AI.', { status: 500 });
      // (Na razie kontynuujemy, zakładając, że błąd jest w logice poniżej)
    }
    
    // Sprawdź, czy model chce wywołać narzędzie
    if (responseJson && responseJson.tool_call) {
      const { name, arguments: args } = responseJson.tool_call;
    
      // 1. Pobierz schemat (parsuj JSON string do tablicy)
      const schemaString = generateMcpToolSchema();
      const schema = JSON.parse(schemaString);
      
      // 2. Znajdź definicję dla tego konkretnego narzędzia
      const toolDefinition = schema.find((t: any) => t.function.name === name);
    
      if (!toolDefinition) {
        console.error(`Błąd walidacji: Model próbował wywołać nieznane narzędzie: ${name}`);
        
        // Zwróć błąd do LLM, aby mógł się poprawić
        const errorResponse = {
          role: 'tool',
          tool_call_id: responseJson.tool_call.id || 'unknown',
          name: name,
          content: `Błąd walidacji: Nieznane narzędzie "${name}". Dostępne narzędzia: ${schema.map((t: any) => t.function.name).join(', ')}`
        };
        
        // Zwracamy błąd do klienta (w przyszłości: ponowne wywołanie LLM z tym błędem)
        return new Response(JSON.stringify(errorResponse), { 
          status: 400, 
          headers: { ...cors(env), 'Content-Type': 'application/json' }
        });
      } else {
        // 3. Waliduj argumenty
        // UWAGA: Pełna walidacja z AJV zostanie dodana w kolejnym kroku
        // Na razie wykonujemy podstawową walidację istnienia wymaganych pól
        const requiredParams = toolDefinition.function.parameters?.required || [];
        const missingParams = requiredParams.filter((param: string) => !(param in args));
        
        if (missingParams.length > 0) {
          console.error(`Błąd walidacji: Brakujące argumenty dla ${name}:`, missingParams);
          
          // Zwróć błąd do LLM, aby mógł się poprawić
          const errorResponse = {
            role: 'tool',
            tool_call_id: responseJson.tool_call.id || 'unknown',
            name: name,
            content: `Błąd walidacji argumentów: Brakujące parametry: ${missingParams.join(', ')}. Wymagane: ${requiredParams.join(', ')}`
          };
          
          // TODO: Dodać logikę ponownego wywołania LLM z tym błędem (retry loop)
          // Na razie zwracamy błąd do klienta
          return new Response(JSON.stringify(errorResponse), { 
            status: 400, 
            headers: { ...cors(env), 'Content-Type': 'application/json' }
          });
        } else {
          console.log(`✅ Walidacja OK dla ${name}. Przystępuję do wykonania narzędzia...`);
          
          // === WYKONANIE NARZĘDZIA MCP (KROK 3.d) ===
          try {
            console.log(`🔧 Wywołuję narzędzie MCP: ${name} z argumentami:`, JSON.stringify(args, null, 2));
            
            // Wywołaj narzędzie MCP
            const mcpResult = await callMcpToolDirect(env, name, args);
            
            // Sprawdź, czy wywołanie zakończyło się sukcesem
            if (mcpResult.error) {
              console.error(`❌ Błąd wykonania narzędzia ${name}:`, mcpResult.error);
              
              // Zwróć błąd wykonania do LLM
              const toolErrorResponse = {
                role: 'tool',
                tool_call_id: responseJson.tool_call.id || 'unknown',
                name: name,
                content: `Błąd wykonania narzędzia: ${mcpResult.error.message || JSON.stringify(mcpResult.error)}`
              };
              
              return new Response(JSON.stringify(toolErrorResponse), { 
                status: 500, 
                headers: { ...cors(env), 'Content-Type': 'application/json' }
              });
            }
            
            // Wynik sukcesu - wyciągnij treść z odpowiedzi MCP
            let toolResultText = '';
            if (mcpResult.result?.content) {
              // Format MCP: { result: { content: [{ type: 'text', text: '...' }] }}
              const contentArray = Array.isArray(mcpResult.result.content) 
                ? mcpResult.result.content 
                : [mcpResult.result.content];
              toolResultText = contentArray
                .map((item: any) => item.text || JSON.stringify(item))
                .join('\n');
            } else if (mcpResult.result) {
              // Bezpośredni wynik (np. dla search_shop_catalog)
              toolResultText = typeof mcpResult.result === 'string' 
                ? mcpResult.result 
                : JSON.stringify(mcpResult.result);
            }
            
            console.log(`✅ Narzędzie ${name} wykonane. Wynik:`, toolResultText.substring(0, 200) + '...');
            
            // === PRZEKAZANIE WYNIKU DO LLM (KROK 3.e) ===
            // Zamiast zwracać wynik bezpośrednio do klienta, przekaż go do LLM
            const toolSuccessResponse = {
              role: 'tool' as const,
              tool_call_id: responseJson.tool_call.id || 'unknown',
              name: name,
              content: toolResultText
            };
            
            console.log(`🔄 Przekazuję wynik narzędzia z powrotem do LLM...`);
            
            // Dodaj wynik narzędzia do historii wiadomości
            messages.push(toolSuccessResponse);
            
            // Wywołaj LLM ponownie z wynikiem narzędzia, aby uzyskał finalną odpowiedź
            // LLM otrzyma: [system, history..., user_query, tool_call, tool_response]
            // i wygeneruje naturalną odpowiedź dla użytkownika
            
            if (payload.stream) {
              // Dla streaming: zwróć strumień z LLM
              console.log(`📡 Streamuję finalną odpowiedź LLM po wykonaniu narzędzia...`);
              const stream = await streamGroqResponse(
                messages,
                (env as any).GROQ_MODEL ?? 'openai/gpt-oss-120b',
                env as { GROQ_API_KEY: string }
              );
              
              return new Response(stream, {
                headers: {
                  ...cors(env),
                  'Content-Type': 'text/event-stream',
                  'Cache-Control': 'no-cache',
                  'Connection': 'keep-alive',
                },
              });
            } else {
              // Dla non-streaming: pobierz pełną odpowiedź
              console.log(`📝 Pobieram finalną odpowiedź LLM po wykonaniu narzędzia...`);
              const finalResponse = await getGroqResponse(
                messages,
                (env as any).GROQ_MODEL ?? 'openai/gpt-oss-120b',
                env as { GROQ_API_KEY: string }
              );
              
              // Parsuj finalną odpowiedź (powinna być JSON lub czysty tekst)
              let finalReply = finalResponse;
              try {
                const finalJson = JSON.parse(finalResponse);
                finalReply = finalJson.reply || finalResponse;
              } catch {
                // Jeśli nie jest JSON, użyj surowej odpowiedzi
                finalReply = finalResponse;
              }
              
              // Zapisz finalną odpowiedź do historii w SessionDO
              await stub.fetch('https://session/append', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  role: 'assistant', 
                  content: finalReply, 
                  session_id: sessionId 
                }),
              });
              
              console.log(`✅ Finalna odpowiedź LLM zapisana do sesji.`);
              
              return new Response(JSON.stringify({ 
                reply: finalReply, 
                session_id: sessionId,
                _debug: {
                  tool_executed: name,
                  tool_result_length: toolResultText.length,
                  llm_called_again: true
                }
              }), { 
                status: 200, 
                headers: { ...cors(env), 'Content-Type': 'application/json' }
              });
            }
            
          } catch (executionError: any) {
            console.error(`💥 Wyjątek podczas wykonania narzędzia ${name}:`, executionError.message);
            
            const toolExceptionResponse = {
              role: 'tool',
              tool_call_id: responseJson.tool_call.id || 'unknown',
              name: name,
              content: `Wyjątek podczas wykonania: ${executionError.message}`
            };
            
            return new Response(JSON.stringify(toolExceptionResponse), { 
              status: 500, 
              headers: { ...cors(env), 'Content-Type': 'application/json' }
            });
          }
        }
      }
    }
    // === KONIEC BLOKU WALIDACJI ===
    
    // Jeśli model zwrócił odpowiedź konwersacyjną (reply), użyj jej
    reply = responseJson?.reply || modelResponse;
  } else {
    reply = await generateAIResponse(history, payload.message, env, ragContext);
  }

  await stub.fetch('https://session/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'assistant', content: reply, session_id: sessionId }),
  });

  return new Response(JSON.stringify({ reply, session_id: sessionId }), {
    headers: { ...cors(env), 'Content-Type': 'application/json' },
  });
}

function streamAssistantResponse(
  sessionId: string,
  userMessage: string,
  stub: DurableObjectStub,
  env: Env,
): Response {
  const { readable, writable } = new TransformStream();
  (async () => {
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    try {
      // 1. Fetch history and cartId
      const historyResp = await stub.fetch('https://session/history');
      const historyRaw = await historyResp.json().catch(() => []);
      const history = ensureHistoryArray(historyRaw);
      const cartIdResp = await stub.fetch('https://session/cart-id');
      const cartIdData = await cartIdResp.json().catch(() => ({ cart_id: null }));
      const cartId = (cartIdData as { cart_id?: string | null }).cart_id;

      // 2. RAG/MCP context (unchanged)
      let ragContext: string | undefined;
      const lowerMsg = userMessage.toLowerCase();
      const isConversational = /^(jak|co|kiedy|dlaczego|czy|pamietasz|pamiętasz|jak mam na imię|kim jestem|znasz mnie|przypomnij|co ostatnio|czego szukałem|co mówiłem|co pytałem)/i.test(lowerMsg)
        || /(jak się masz|jak tam|co słychać|co u ciebie|jak leci|jak minął dzień|dobrze się czujesz)/i.test(lowerMsg);
      const isFollowUp = /^(ten|ta|to|go|je|ją|chciałbym|chce|możesz|pokaz|pokaż mi|wyślij|link)/i.test(lowerMsg.trim());
      let entityFromHistory: string | undefined;
      if (isFollowUp && history.length > 0) {
        const lastAssistant = [...history].reverse().find(h => h.role === 'assistant');
        if (lastAssistant) {
          const productMatch = lastAssistant.content.match(/"([^"]+)"|„([^"]+)"|'([^']+)'/);
          if (productMatch) {
            entityFromHistory = productMatch[1] || productMatch[2] || productMatch[3];
          }
        }
      }
      const isCartIntent = /koszyk|dodaj do koszyka|usuń z koszyka|cart|add to cart/.test(lowerMsg);
      const isOrderIntent = /zamówienie|status zamówienia|order|tracking/.test(lowerMsg);
      const isProductIntent = /produkt|pierścionek|naszyjnik|kolczyki|bransoletka|biżuteria|szukam|pokaż|product|ring|necklace|earring|bracelet|jewelry|opal|tanzanit|motyw|wzór|styl/.test(lowerMsg);
      if (env.SHOP_DOMAIN && !isConversational) {
        const { searchProductsAndCartWithMCP } = await import('./rag');
        let intent: 'search' | 'cart' | 'order' | undefined;
        if (isCartIntent) intent = 'cart';
        else if (isOrderIntent) intent = 'order';
        else if (isProductIntent || isFollowUp) intent = 'search';
        const searchQuery = entityFromHistory || userMessage;
        const mcpResult = await searchProductsAndCartWithMCP(
          searchQuery,
          env.SHOP_DOMAIN,
          env,
          cartId,
          intent,
          env.VECTOR_INDEX,
          env.AI
        );
        if (mcpResult) ragContext = mcpResult;
      }
      if (!ragContext || ragContext.trim().length === 0) {
        if (env.VECTOR_INDEX && env.AI) {
          const ragResult = await searchShopPoliciesAndFaqs(userMessage, env.VECTOR_INDEX, env.AI, 3);
          if (ragResult.results.length > 0) ragContext = formatRagContextForPrompt(ragResult);
        }
      }
      const intent = detectMcpIntent(userMessage);
      const mcpContext = await fetchMcpContextIfNeeded(
        intent,
        cartId,
        env,
        get_cart,
        get_most_recent_order_status
      );

      // 3. MoE complexity classifier for prompt
      const complexity = classifyQueryComplexity(userMessage);
      const devConstraints: DeveloperConstraints = {
        reasoning_mode: complexity,
        max_cot_tokens: complexity === 'high' ? 256 : 64,
      };
      // 4. Build Harmony messages
      const promptData = {
        systemPersona: LUXURY_SYSTEM_PROMPT,
        chatHistory: history.filter(h => h.role === 'user' || h.role === 'assistant').map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
        ragContext: Array.isArray(ragContext) ? ragContext : [],
        userQuery: userMessage
      };
      const harmonyMessages = buildHarmonyMessages(promptData, devConstraints);

      // 5. Harmony streaming loop
      if (env.GROQ_API_KEY) {
        const groqMessages = harmonyMessages
          .filter(m => m.role !== 'developer')
          .map(m => ({ role: m.role as 'system' | 'user' | 'assistant' | 'tool', content: m.content, tool_call_id: m.tool_call_id, name: m.name }));
        const eventStream = await streamGroqHarmonyEvents(
          groqMessages,
          (env as any).GROQ_MODEL ?? 'openai/gpt-oss-120b',
          env as { GROQ_API_KEY: string }
        );
        // TODO: Write eventStream to writer as needed
      }
    } catch (err) {
      console.error('Error in streamAssistantResponse:', err);
    } finally {
      writer.close();
    }
  })();
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
export const AI_CONFIG = {
  mcpServerUrl: process.env.MCP_SERVER_URL || 'https://prod-mcp-server.epir-art-jewellery.local',
  shopifyDocsEndpoint: '/shopify/docs',
  shopifyApiSchemaEndpoint: '/shopify/api-schema',
  shopifyGuidesEndpoint: '/shopify/guides',
  autoFetchDocs: false, // AI automatycznie pobiera dokumentację i schematy
  autoSearchGuides: false, // AI automatycznie przeszukuje wskazówki programistyczne
};

// Przykład użycia w kodzie AI:
// import { AI_CONFIG } from './index';
// async function fetchShopifyDocs() {
//   const res = await fetch(`${AI_CONFIG.mcpServerUrl}${AI_CONFIG.shopifyDocsEndpoint}`);
//   return await res.json();
// }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors(env) });
    }

    const url = new URL(request.url);

    // Healthchecks
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/ping' || url.pathname === '/health')) {
      return new Response('ok', { status: 200, headers: cors(env) });
    }

    // [NOWE] Globalny stra┼╝nik HMAC dla App Proxy: wszystkie POST-y pod /apps/assistant/*
    if (url.pathname.startsWith('/apps/assistant/') && request.method === 'POST') {
      if (!env.SHOPIFY_APP_SECRET) {
        return new Response('Server misconfigured', { status: 500, headers: cors(env) });
      }
      const result = await verifyAppProxyHmac(request, env.SHOPIFY_APP_SECRET);
      if (!result.ok) {
        console.warn('HMAC verification failed:', result.reason);
        return new Response('Unauthorized: Invalid HMAC signature', { status: 401, headers: cors(env) });
      }

      // [NOWE] Replay protection: sprawdź czy signature nie by┼éa ju┼╝ u┼╝yta
      const signature = url.searchParams.get('signature') ?? request.headers.get('x-shopify-hmac-sha256') ?? '';
      const timestamp = url.searchParams.get('timestamp') ?? '';
      if (signature && timestamp) {
        const doId = env.SESSION_DO.idFromName('replay-protection-global');
        const stub = env.SESSION_DO.get(doId);
        const replayResult = await replayCheck(stub, signature, timestamp);
        if (!replayResult.ok) {
          console.warn('Replay check failed:', replayResult.reason);
          return new Response('Unauthorized: Signature already used', { status: 401, headers: cors(env) });
        }
      }
    }

    // [ZABEZPIECZONY] Chat przez App Proxy
    if (url.pathname === '/apps/assistant/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    // (opcjonalnie) lokalny endpoint bez App Proxy, np. do test├│w
    if (url.pathname === '/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    // MCP server (JSON-RPC 2.0) ÔÇô narz─Ödzia Shopify
    if (request.method === 'POST' && (url.pathname === '/mcp/tools/call' || url.pathname === '/apps/assistant/mcp')) {
      return handleMcpRequest(request, env);
    }

    return new Response('Not Found', { status: 404, headers: cors(env) });
  },
};

// Export for testing
export {
  parseAppendPayload,
  parseChatRequestBody,
  parseEndPayload,
  ensureHistoryArray,
  cors,
  generateAIResponse,
  generateAIResponseStream,
  handleChat,
  streamAssistantResponse,
  verifyAppProxyHmac,
  handleMcpRequest,
  getGroqResponse,
  RateLimiterDO,
};
// Logging utility functions
export function logInfo(message: string, data?: any) {
  console.log(`[INFO] ${message}`, data || '');
}

export function logDebug(message: string, data?: any) {
  console.debug(`[DEBUG] ${message}`, data || '');
}

export function logError(message: string, data?: any) {
  console.error(`[ERROR] ${message}`, data || '');
}


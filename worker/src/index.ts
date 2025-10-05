/// <reference types="@cloudflare/workers-types" />
import { verifyAppProxyHmac } from './auth';

type ChatRole = 'user' | 'assistant';

interface HistoryEntry {
  role: ChatRole;
  content: string;
  ts: number;
}

interface AppendPayload {
  role: ChatRole;
  content: string;
  session_id?: string;
}

interface ChatRequestBody {
  message: string;
  session_id?: string;
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
  ALLOWED_ORIGIN?: string;
  AI?: WorkersAI;
  SHOPIFY_STOREFRONT_TOKEN?: string;
  SHOP_DOMAIN?: string;
  SHOPIFY_APP_SECRET?: string;
  DEV_BYPASS?: string; // '1' to bypass HMAC in dev
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
  const stream = typeof maybe.stream === 'boolean' ? maybe.stream : true;
  return {
    message: String(maybe.message),
    session_id: sessionId,
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
  if (!Array.isArray(input)) return [];
  const out: HistoryEntry[] = [];
  for (const candidate of input) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const raw = candidate as Record<string, unknown>;
    if (!isChatRole(raw.role) || !isNonEmptyString(raw.content)) continue;
    const ts = typeof raw.ts === 'number' ? raw.ts : now();
    out.push({ role: raw.role, content: String(raw.content), ts });
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
  private lastRequestTimestamp = 0;
  private requestsInWindow = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    this.state.blockConcurrencyWhile(async () => {
      const rawHistory = await this.state.storage.get<unknown>('history');
      this.history = ensureHistoryArray(rawHistory);
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
    await this.state.storage.put('history', JSON.stringify(this.history));
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
    await this.state.storage.delete('history');
    await this.state.storage.delete('session_id');
  }
}

async function generateAIResponse(history: HistoryEntry[], userMessage: string, env: Env): Promise<string> {
  const ai = env.AI;
  if (!ai || typeof ai.run !== 'function') {
    return `Echo: ${userMessage}`;
  }

  const recentHistory = history.slice(-10);
  const messages = [
    {
      role: 'system',
      content: 'Jesteś pomocnym asystentem sklepu jubilerskiego EPIR. Odpowiadasz na pytania konkretnie i kulturalnie.',
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

  return 'Przepraszam, nie udało mi się wygenerować odpowiedzi. Spróbuj ponownie.';
}

/**
 * If the configured env.AI supports streaming, try to obtain a ReadableStream<string>
 * that yields incremental text chunks. Return null if not available.
 */
async function generateAIResponseStream(history: HistoryEntry[], userMessage: string, env: Env): Promise<ReadableStream<string> | null> {
  // Build messages same as non-streaming
  const recentHistory = history.slice(-10);
  const messages = [
    {
      role: 'system',
      content: 'Jesteś pomocnym asystentem sklepu jubilerskiego EPIR. Odpowiadasz na pytania konkretnie i kulturalnie.',
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

  if (payload.stream) {
    return streamAssistantResponse(sessionId, payload.message, stub, env);
  }

  const historyResp = await stub.fetch('https://session/history');
  const historyData = await historyResp.json().catch(() => []);
  const history = ensureHistoryArray(historyData);
  const reply = await generateAIResponse(history, payload.message, env);

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
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const historyResp = await stub.fetch('https://session/history');
      const historyRaw = await historyResp.json().catch(() => []);
      const history = ensureHistoryArray(historyRaw);

      // Try to obtain a real streaming source from the AI binding
      const stream = await generateAIResponseStream(history, userMessage, env);

      // Send initial session_id event
      await writer.write(encoder.encode(`data: ${JSON.stringify({ session_id: sessionId, done: false })}\n\n`));

      if (stream) {
        // Real streaming: pipe tokens/deltas as they arrive
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // value may be string or Uint8Array
          const chunkStr = typeof value === 'string' ? value : decoder.decode(value as any);
          const evt = JSON.stringify({ delta: chunkStr, session_id: sessionId, done: false });
          await writer.write(encoder.encode(`data: ${evt}\n\n`));
        }

        // After streaming finishes, optionally reconstruct final reply if needed
        // Note: some streaming APIs provide final aggregated value; here we rely on DO append logic below
      } else {
        // Fallback: generate full reply and split into deltas for UX
        const reply = await generateAIResponse(history, userMessage, env);
        const parts = reply.split(/(\s+)/);
        for (const part of parts) {
          const evt = JSON.stringify({ delta: part, session_id: sessionId, done: false });
          await writer.write(encoder.encode(`data: ${evt}\n\n`));
          await new Promise((resolve) => setTimeout(resolve, 30));
        }

        // Append final conversation record
        await stub.fetch('https://session/append', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'assistant', content: reply, session_id: sessionId }),
        });

        // Send final full content for fallback clients
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ content: reply, session_id: sessionId, done: true })}\n\n`),
        );
      }

      // Signal done for streaming path as well
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors(env) });
    }

    const url = new URL(request.url);

    // Lightweight health endpoints for quick availability checks (no HMAC required)
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/ping' || url.pathname === '/health')) {
      return new Response('ok', { status: 200, headers: cors(env) });
    }

    if (url.pathname.endsWith('/chat')) {
      const bypassEnabled = env.DEV_BYPASS === '1';
      const bypassHeader = request.headers.get('x-dev-bypass') === '1';
      if (!(bypassEnabled && bypassHeader)) {
        if (!env.SHOPIFY_APP_SECRET) {
          return new Response('Server misconfigured', { status: 500, headers: cors(env) });
        }
        const cloned = new Request(request);
        const valid = await verifyAppProxyHmac(cloned, env.SHOPIFY_APP_SECRET);
        if (!valid) {
          return new Response('Unauthorized: Invalid HMAC signature', { status: 401, headers: cors(env) });
        }
      }
    }

    if (url.pathname === '/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    return new Response('Not Found', { status: 404, headers: cors(env) });
  },
};

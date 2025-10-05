/// <reference types="@cloudflare/workers-types" />
import { verifyAppProxyHmac } from './auth';

export interface Env {
  DB: D1Database;
  SESSIONS_KV: KVNamespace;
  SESSION_DO: DurableObjectNamespace;
  ALLOWED_ORIGIN?: string;
  AI?: any;
  SHOPIFY_STOREFRONT_TOKEN?: string;
  SHOP_DOMAIN?: string;
  SHOPIFY_APP_SECRET?: string;
  DEV_BYPASS?: string; // set to '1' to bypass HMAC in dev
}

function cors(env: Env){
  const o = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Shop-Signature'
  };
}

export class SessionDO {
  state: DurableObjectState;
  env: Env;
  history: Array<{role:string; content:string; ts:number}> = [];
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  
  constructor(state: DurableObjectState, env: Env){
    this.state = state; this.env = env;
    this.state.blockConcurrencyWhile(async ()=>{
      const raw = await this.state.storage.get<string>('history');
      if(raw){ try{ this.history = JSON.parse(raw); } catch{ this.history = []; } }
    });
  }
  async fetch(request: Request) {
    const url = new URL(request.url);
    
    // Rate limit: max 20 requests per minute per session
    const now = Date.now();
    if (now - this.lastRequestTime < 60000) {
      this.requestCount++;
      if (this.requestCount > 20) {
        return new Response('Rate limit exceeded', { status: 429 });
      }
    } else {
      this.requestCount = 1;
      this.lastRequestTime = now;
    }
    
    if (url.pathname.endsWith('/history')) {
      return new Response(JSON.stringify(this.history), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname.endsWith('/append') && request.method === 'POST') {
      const { role, content } = await request.json() as any;
      if (!role || !content) return new Response('Bad Request', { status: 400 });
      await this.append(role, content);
      return new Response('ok');
    }
    if (url.pathname.endsWith('/end') && request.method === 'POST') {
      const { session_id } = await request.json().catch(() => ({})) as any;
      await this.end(session_id || 'unknown');
      return new Response('ended');
    }
    return new Response('Not Found', { status: 404 });
  }
  async append(role:string, content:string){
    this.history.push({role, content, ts: Date.now()});
    if(this.history.length > 50){ await this.flushPartial(); }
    await this.state.storage.put('history', JSON.stringify(this.history));
  }
  async flushPartial(){
    // opcjonalnie: przenieś najstarsze wpisy do D1
  }
  async end(sessionId:string){
    const tx = this.env.DB.prepare('INSERT INTO conversations (session_id, started_at, ended_at) VALUES (?, ?, ?)')
      .bind(sessionId, this.history[0]?.ts ?? Date.now(), Date.now());
    await tx.run();
    const convId = (await this.env.DB.prepare('SELECT last_insert_rowid() as id').first())?.id;
    if(convId){
      const stmt = this.env.DB.prepare('INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4)');
      for(const m of this.history){ await stmt.bind(convId, m.role, m.content, m.ts).run(); }
    }
    this.history = [];
    await this.state.storage.delete('history');
  }
}

async function generateAIResponse(
  history: Array<{role:string; content:string; ts:number}>, 
  userMessage: string,
  env: Env
): Promise<string> {
  if (!env.AI) {
    console.warn('AI binding not configured, falling back to echo');
    return `Echo: ${userMessage}`;
  }

  try {
    const recentHistory = history.slice(-10);
    const messages = [
      {
        role: 'system',
        content: 'Jesteś pomocnym asystentem sklepu jubilerskiego EPIR. Pomagasz klientom w wyborze biżuterii, odpowiadasz na pytania o produkty, materiały, rozmiary i dostępność. Bądź uprzejmy, profesjonalny i konkretny.'
      },
      ...recentHistory.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user' as const, content: userMessage }
    ];

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages,
      max_tokens: 512,
      temperature: 0.7,
      top_p: 0.9
    });

    return response?.response || 'Przepraszam, nie mogłem wygenerować odpowiedzi. Spróbuj ponownie.';
  } catch (error: any) {
    console.error('AI generation error:', error);
    return `Przepraszam, wystąpił błąd podczas generowania odpowiedzi: ${error?.message || 'Unknown error'}`;
  }
}

async function handleChat(req: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await req.json() as any;
  } catch (e) {
    console.error('JSON parse error:', e);
    return new Response('Bad Request: Invalid JSON', {status:400, headers: cors(env)});
  }
  
  const { message, session_id, stream } = body || {};
  if(!message){ 
    console.error('Missing message in body:', body);
    return new Response('Bad Request: message required', {status:400, headers: cors(env)});
  }
  
  const sid = session_id || crypto.randomUUID();
  const id = env.SESSION_DO.idFromName(sid);
  const stub = env.SESSION_DO.get(id);
  
  await stub.fetch('https://do/append', { method:'POST', body: JSON.stringify({ role:'user', content: message })});

  if (stream) {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        const historyResp = await stub.fetch('https://do/history');
        const history = await historyResp.json() as any as Array<{role:string; content:string; ts:number}>;
        
        const reply = await generateAIResponse(history, message, env);
        
        const words = reply.split(' ');
        let accumulated = '';
        for (let i = 0; i < words.length; i++) {
          accumulated += (i > 0 ? ' ' : '') + words[i];
          await writer.write(encoder.encode(`data: ${JSON.stringify({
            content: accumulated,
            session_id: sid,
            done: false
          })}\n\n`));
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        await stub.fetch('https://do/append', { 
          method:'POST', 
          body: JSON.stringify({ role:'assistant', content: reply })
        });
        
        await writer.write(encoder.encode(`data: ${JSON.stringify({
          content: reply,
          session_id: sid,
          done: true
        })}\n\n`));
        await writer.write(encoder.encode(`data: [DONE]\n\n`));
      } catch (error: any) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({
          error: error?.message || 'Unknown error',
          session_id: sid
        })}\n\n`));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        ...cors(env),
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });
  }

  const historyResp = await stub.fetch('https://do/history');
  const history = await historyResp.json() as any as Array<{role:string; content:string; ts:number}>;
  
  const reply = await generateAIResponse(history, message, env);

  await stub.fetch('https://do/append', { method:'POST', body: JSON.stringify({ role:'assistant', content: reply })});

  return new Response(JSON.stringify({ reply, session_id: sid }), { headers: { ...cors(env), 'Content-Type':'application/json' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if(request.method === 'OPTIONS') return new Response(null, { headers: cors(env) });

    const url = new URL(request.url);

    if (url.pathname.endsWith('/chat')) {
      const devBypassEnabled = String(env.DEV_BYPASS || '') === '1';
      const hasDevBypassHeader = request.headers.get('x-dev-bypass') === '1';
      if (!(devBypassEnabled && hasDevBypassHeader)) {
        if (!env.SHOPIFY_APP_SECRET) {
          console.error("SHOPIFY_APP_SECRET is not configured.");
          return new Response('Internal Server Error: App not configured', { status: 500 });
        }
        const isValid = await verifyAppProxyHmac(request.clone() as any, env.SHOPIFY_APP_SECRET || '');
        if (!isValid) {
          return new Response('Unauthorized: Invalid HMAC signature', { status: 401, headers: cors(env) });
        }
      } else {
        console.log('DEV_BYPASS active: skipping HMAC verification');
      }
    }

    if(url.pathname === '/chat' && request.method === 'POST') return handleChat(request, env);
    return new Response('Not Found', { status:404, headers: cors(env) });
  }
}
/// <reference types="@cloudflare/workers-types" />
import { verifyAppProxyHmac } from './auth';

export interface Env {
  DB: D1Database;
  SESSIONS_KV: KVNamespace;
  SESSION_DO: DurableObjectNamespace;
  ALLOWED_ORIGIN?: string;
  AI?: any;
  SHOPIFY_STOREFRONT_TOKEN?: string;
  SHOP_DOMAIN?: string;
  SHOPIFY_APP_SECRET?: string;
}

function cors(env: Env){
  const o = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Shop-Signature'
  };
}

export class SessionDO {
  state: DurableObjectState;
  env: Env;
  history: Array<{role:string; content:string; ts:number}> = [];
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  
  constructor(state: DurableObjectState, env: Env){
    this.state = state; this.env = env;
    this.state.blockConcurrencyWhile(async ()=>{
      const raw = await this.state.storage.get<string>('history');
      if(raw){ try{ this.history = JSON.parse(raw); } catch{ this.history = []; } }
    });
  }
  async fetch(request: Request) {
    const url = new URL(request.url);
    
    // Rate limit: max 20 requests per minute per session
    const now = Date.now();
    if (now - this.lastRequestTime < 60000) {
      this.requestCount++;
      if (this.requestCount > 20) {
        return new Response('Rate limit exceeded', { status: 429 });
      }
    } else {
      this.requestCount = 1;
      this.lastRequestTime = now;
    }
    
    if (url.pathname.endsWith('/history')) {
      return new Response(JSON.stringify(this.history), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname.endsWith('/append') && request.method === 'POST') {
      const { role, content } = await request.json();
      if (!role || !content) return new Response('Bad Request', { status: 400 });
      await this.append(role, content);
      return new Response('ok');
    }
    if (url.pathname.endsWith('/end') && request.method === 'POST') {
      const { session_id } = await request.json().catch(() => ({}));
      await this.end(session_id || 'unknown');
      return new Response('ended');
    }
    return new Response('Not Found', { status: 404 });
  }
  async append(role:string, content:string){
    this.history.push({role, content, ts: Date.now()});
    if(this.history.length > 50){ await this.flushPartial(); }
    await this.state.storage.put('history', JSON.stringify(this.history));
  }
  async flushPartial(){
    // opcjonalnie: przenieś najstarsze wpisy do D1
  }
  async end(sessionId:string){
    const tx = this.env.DB.prepare('INSERT INTO conversations (session_id, started_at, ended_at) VALUES (?, ?, ?)')
      .bind(sessionId, this.history[0]?.ts ?? Date.now(), Date.now());
    await tx.run();
    const convId = (await this.env.DB.prepare('SELECT last_insert_rowid() as id').first())?.id;
    if(convId){
      const stmt = this.env.DB.prepare('INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4)');
      for(const m of this.history){ await stmt.bind(convId, m.role, m.content, m.ts).run(); }
    }
    this.history = [];
    await this.state.storage.delete('history');
  }
}

async function generateAIResponse(
  history: Array<{role:string; content:string; ts:number}>, 
  userMessage: string,
  env: Env
): Promise<string> {
  if (!env.AI) {
    console.warn('AI binding not configured, falling back to echo');
    return `Echo: ${userMessage}`;
  }

  try {
    // Prepare messages for LLM (last 10 messages for context)
    const recentHistory = history.slice(-10);
    const messages = [
      {
        role: 'system',
        content: 'Jesteś pomocnym asystentem sklepu jubilerskiego EPIR. Pomagasz klientom w wyborze biżuterii, odpowiadasz na pytania o produkty, materiały, rozmiary i dostępność. Bądź uprzejmy, profesjonalny i konkretny.'
      },
      ...recentHistory.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user' as const, content: userMessage }
    ];

    // Call Workers AI through AI Gateway
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages,
      max_tokens: 512,
      temperature: 0.7,
      top_p: 0.9
    });

    return response?.response || 'Przepraszam, nie mogłem wygenerować odpowiedzi. Spróbuj ponownie.';
  } catch (error: any) {
    console.error('AI generation error:', error);
    return `Przepraszam, wystąpił błąd podczas generowania odpowiedzi: ${error?.message || 'Unknown error'}`;
  }
}

async function handleChat(req: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    console.error('JSON parse error:', e);
    return new Response('Bad Request: Invalid JSON', {status:400, headers: cors(env)});
  }
  
  const { message, session_id, stream } = body || {};
  if(!message){ 
    console.error('Missing message in body:', body);
    return new Response('Bad Request: message required', {status:400, headers: cors(env)});
  }
  
  const sid = session_id || crypto.randomUUID();
  const id = env.SESSION_DO.idFromName(sid);
  const stub = env.SESSION_DO.get(id);
  
  // Append user msg
  await stub.fetch('https://do/append', { method:'POST', body: JSON.stringify({ role:'user', content: message })});

  // If streaming requested
  if (stream) {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Start async processing
    (async () => {
      try {
        // Get conversation history
        const historyResp = await stub.fetch('https://do/history');
        const history = await historyResp.json() as Array<{role:string; content:string; ts:number}>;
        
        // Generate AI response
        const reply = await generateAIResponse(history, message, env);
        
        // Stream response word by word (better UX than char-by-char)
        const words = reply.split(' ');
        let accumulated = '';
        for (let i = 0; i < words.length; i++) {
          accumulated += (i > 0 ? ' ' : '') + words[i];
          await writer.write(encoder.encode(`data: ${JSON.stringify({
            content: accumulated,
            session_id: sid,
            done: false
          })}\n\n`));
          // Small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // Save assistant response to history
        await stub.fetch('https://do/append', { 
          method:'POST', 
          body: JSON.stringify({ role:'assistant', content: reply })
        });
        
        // Send done signal
        await writer.write(encoder.encode(`data: ${JSON.stringify({
          content: reply,
          session_id: sid,
          done: true
        })}\n\n`));
        await writer.write(encoder.encode(`data: [DONE]\n\n`));
      } catch (error: any) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({
          error: error?.message || 'Unknown error',
          session_id: sid
        })}\n\n`));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        ...cors(env),
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });
  }

  // Non-streaming fallback (backward compatibility)
  // Get conversation history
  const historyResp = await stub.fetch('https://do/history');
  const history = await historyResp.json() as Array<{role:string; content:string; ts:number}>;
  
  // Generate AI response
  const reply = await generateAIResponse(history, message, env);

  await stub.fetch('https://do/append', { method:'POST', body: JSON.stringify({ role:'assistant', content: reply })});

  return new Response(JSON.stringify({ reply, session_id: sid }), { headers: { ...cors(env), 'Content-Type':'application/json' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if(request.method === 'OPTIONS') return new Response(null, { headers: cors(env) });

    const url = new URL(request.url);

    // App Proxy HMAC verification for relevant paths
    // Accept both '/chat' and '/assistant/chat' (app proxy may forward with subpath)
    if (url.pathname.endsWith('/chat')) {
      // Development bypass: set DEV_BYPASS=1 in wrangler/env and send header 'x-dev-bypass: 1' from client
      const devBypassEnabled = String(env.DEV_BYPASS || '') === '1';
      const hasDevBypassHeader = request.headers.get('x-dev-bypass') === '1';
      if (!(devBypassEnabled && hasDevBypassHeader)) {
        if (!env.SHOPIFY_APP_SECRET) {
          console.error("SHOPIFY_APP_SECRET is not configured.");
          return new Response('Internal Server Error: App not configured', { status: 500 });
        }
        const isValid = await verifyAppProxyHmac(request.clone(), env.SHOPIFY_APP_SECRET);
        if (!isValid) {
          return new Response('Unauthorized: Invalid HMAC signature', { status: 401, headers: cors(env) });
        }
      } else {
        // Log that we are bypassing HMAC for dev testing
        console.log('DEV_BYPASS active: skipping HMAC verification');
      }
    }

    if(url.pathname === '/chat' && request.method === 'POST') return handleChat(request, env);
    return new Response('Not Found', { status:404, headers: cors(env) });
  }
}

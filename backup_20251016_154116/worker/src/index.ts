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
  constructor(state: DurableObjectState, env: Env){
    this.state = state; this.env = env;
    this.state.blockConcurrencyWhile(async ()=>{
      const raw = await this.state.storage.get<string>('history');
      if(raw){ try{ this.history = JSON.parse(raw); } catch{ this.history = []; } }
    });
  }
  async fetch(request: Request) {
    const url = new URL(request.url);
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

async function handleChat(req: Request, env: Env): Promise<Response> {
  const { message, session_id } = await req.json().catch(()=>({}));
  if(!message){ return new Response('Bad Request', {status:400, headers: cors(env)}); }
  const sid = session_id || crypto.randomUUID();
  const id = env.SESSION_DO.idFromName(sid);
  const stub = env.SESSION_DO.get(id);
  // Append user msg
  await stub.fetch('https://do/append', { method:'POST', body: JSON.stringify({ role:'user', content: message })});

  // Tu: RAG/Vectorize/Shopify tools/LLM — placeholder
  const reply = `Echo: ${message}`;

  await stub.fetch('https://do/append', { method:'POST', body: JSON.stringify({ role:'assistant', content: reply })});

  return new Response(JSON.stringify({ reply, session_id: sid }), { headers: { ...cors(env), 'Content-Type':'application/json' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if(request.method === 'OPTIONS') return new Response(null, { headers: cors(env) });

    const url = new URL(request.url);

    // App Proxy HMAC verification for relevant paths
    if (url.pathname.startsWith('/chat')) {
      if (!env.SHOPIFY_APP_SECRET) {
        console.error("SHOPIFY_APP_SECRET is not configured.");
        return new Response('Internal Server Error: App not configured', { status: 500 });
      }
      const isValid = await verifyAppProxyHmac(request.clone(), env.SHOPIFY_APP_SECRET);
      if (!isValid) {
        return new Response('Unauthorized: Invalid HMAC signature', { status: 401, headers: cors(env) });
      }
    }

    if(url.pathname === '/chat' && request.method === 'POST') return handleChat(request, env);
    return new Response('Not Found', { status:404, headers: cors(env) });
  }
}

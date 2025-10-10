// MCP Server (JSON-RPC 2.0) dla narzędzi Shopify w trybie single-store.
// Sekrety (SHOPIFY_APP_SECRET, SHOPIFY_ADMIN_TOKEN) pochodzą TYLKO z Cloudflare Secrets.
// ŻADNYCH sekretów w wrangler.toml [vars] ani w kodzie.
// Endpointy:
// - POST /mcp/tools/call (dev/test bez HMAC)
// - POST /apps/assistant/mcp (App Proxy + HMAC)
// Narzędzia: get_product, search_products (Shopify Admin GraphQL 2024-07)

import { verifyAppProxyHmac } from './auth';

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id?: JsonRpcId;
}

interface JsonRpcSuccess {
  jsonrpc: '2.0';
  result: any;
  id: JsonRpcId;
}

interface JsonRpcError {
  jsonrpc: '2.0';
  error: { code: number; message: string; data?: any };
  id: JsonRpcId;
}

export interface Env {
  SHOP_DOMAIN?: string;              // niesekretne: ustaw w wrangler.toml [vars]
  SHOPIFY_ADMIN_TOKEN?: string;      // SEKRET: wrangler secret put SHOPIFY_ADMIN_TOKEN
  SHOPIFY_APP_SECRET?: string;       // SEKRET: wrangler secret put SHOPIFY_APP_SECRET
}

function json(headers: HeadersInit = {}) {
  return { 'Content-Type': 'application/json', ...headers };
}

function rpcResult(id: JsonRpcId, result: any): Response {
  const body: JsonRpcSuccess = { jsonrpc: '2.0', result, id: id ?? null };
  return new Response(JSON.stringify(body), { status: 200, headers: json() });
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: any): Response {
  const body: JsonRpcError = { jsonrpc: '2.0', error: { code, message, data }, id: id ?? null };
  return new Response(JSON.stringify(body), { status: 200, headers: json() });
}

async function adminGraphql<T = any>(env: Env, query: string, variables?: Record<string, any>): Promise<T> {
  if (!env.SHOP_DOMAIN) throw new Error('Brak SHOP_DOMAIN (ustaw w wrangler.toml [vars])');
  if (!env.SHOPIFY_ADMIN_TOKEN) throw new Error('Brak SHOPIFY_ADMIN_TOKEN (ustaw przez wrangler secret put)');

  const endpoint = `https://${env.SHOP_DOMAIN}/admin/api/2024-07/graphql.json`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '<no body>');
    throw new Error(`Shopify GraphQL ${res.status}: ${txt}`);
  }

  const data = await res.json().catch(() => ({}));
  if (data?.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`);
  }
  return data.data as T;
}

async function toolGetProduct(env: Env, args: any) {
  const id = String(args?.id || '').trim();
  if (!id) throw new Error('get_product: Missing "id"');
  const data = await adminGraphql<{ product: any }>(
    env,
    `query Product($id: ID!) {
      product(id: $id) {
        id title handle descriptionHtml onlineStoreUrl vendor tags
        variants(first: 10) { edges { node { id title price } } }
        featuredImage { url altText }
      }
    }`,
    { id }
  );
  return data.product;
}

async function toolSearchProducts(env: Env, args: any) {
  const query = String(args?.query || '').trim();
  if (!query) throw new Error('search_products: Missing "query"');
  const data = await adminGraphql<{ products: { edges: { node: any }[] } }>(
    env,
    `query Search($query: String!) {
      products(first: 10, query: $query) {
        edges { node { id title handle vendor onlineStoreUrl featuredImage { url altText } } }
      }
    }`,
    { query }
  );
  return data.products?.edges?.map(e => e.node) ?? [];
}

async function handleToolsCall(env: Env, req: Request): Promise<Response> {
  let rpc: JsonRpcRequest | null = null;
  try {
    rpc = (await req.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, 'Parse error');
  }

  if (!rpc || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
    return rpcError(rpc?.id ?? null, -32600, 'Invalid Request');
  }

  if (rpc.method !== 'tools/call') {
    return rpcError(rpc.id ?? null, -32601, `Method not found: ${rpc.method}`);
  }

  const name = rpc.params?.name as string | undefined;
  const args = rpc.params?.arguments ?? {};
  if (!name) {
    return rpcError(rpc.id ?? null, -32602, 'Invalid params: "name" required');
  }

  try {
    switch (name) {
      case 'get_product': {
        const result = await toolGetProduct(env, args);
        return rpcResult(rpc.id ?? null, result);
      }
      case 'search_products': {
        const result = await toolSearchProducts(env, args);
        return rpcResult(rpc.id ?? null, result);
      }
      default:
        return rpcError(rpc.id ?? null, -32601, `Unknown tool: ${name}`);
    }
  } catch (err: any) {
    console.error('MCP tool error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return rpcError(rpc.id ?? null, -32000, 'Tool execution failed', { message });
  }
}

export async function handleMcpRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const isAppProxy = url.pathname === '/apps/assistant/mcp';
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: json() });
  }

  if (isAppProxy) {
    if (!env.SHOPIFY_APP_SECRET) {
      return new Response('Server misconfigured', { status: 500, headers: json() });
    }
    const valid = await verifyAppProxyHmac(request, env.SHOPIFY_APP_SECRET);
    if (!valid) return new Response('Invalid signature', { status: 401, headers: json() });
  }

  return handleToolsCall(env, request);
}
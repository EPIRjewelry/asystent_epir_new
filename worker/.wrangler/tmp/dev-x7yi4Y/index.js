var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/auth.ts
async function verifyAppProxyHmac(request, envOrSecret) {
  const secret = typeof envOrSecret === "string" ? envOrSecret : envOrSecret.SHOPIFY_APP_SECRET;
  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);
  const receivedSignature = params.get("signature");
  if (!receivedSignature) return false;
  const paramMap = /* @__PURE__ */ new Map();
  for (const [key2, value] of params.entries()) {
    if (key2 !== "signature") {
      if (!paramMap.has(key2)) paramMap.set(key2, []);
      paramMap.get(key2).push(value);
    }
  }
  const sortedPairs = [];
  const sortedKeys = Array.from(paramMap.keys()).sort();
  for (const key2 of sortedKeys) {
    const values = paramMap.get(key2);
    const joinedValues = values.join(",");
    sortedPairs.push(`${key2}=${joinedValues}`);
  }
  const canonicalized = sortedPairs.join("");
  console.log("Canonicalized string:", canonicalized);
  console.log("Received signature:", receivedSignature);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(canonicalized));
  const calculatedSignature = Array.from(new Uint8Array(signatureBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  let receivedBytes;
  try {
    receivedBytes = hexToBytes(receivedSignature);
  } catch {
    return false;
  }
  return timingSafeEqual(signatureBytes, receivedBytes);
}
__name(verifyAppProxyHmac, "verifyAppProxyHmac");
function timingSafeEqual(a, b) {
  const aBytes = a instanceof Uint8Array ? a : new Uint8Array(a);
  const bBytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (aBytes.length !== bBytes.length) return false;
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}
__name(timingSafeEqual, "timingSafeEqual");
function hexToBytes(hex) {
  const clean = hex.replace(/[^0-9a-f]/gi, "");
  if (clean.length % 2 !== 0) throw new Error("Invalid hex length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}
__name(hexToBytes, "hexToBytes");

// src/rag.ts
async function callMcpTool(requestOrigin, toolName, args) {
  try {
    const url = `${requestOrigin}/mcp/tools/call`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: toolName, arguments: args },
        id: Date.now()
      })
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "<no body>");
      throw new Error(`MCP tool ${toolName} error ${res.status}: ${txt}`);
    }
    const j = await res.json().catch(() => null);
    return j?.result ?? null;
  } catch (err) {
    console.error("callMcpTool error:", err);
    return null;
  }
}
__name(callMcpTool, "callMcpTool");
async function searchProductCatalogWithMCP(query, shopDomain, shopAdminToken, storefrontToken) {
  try {
    const origin = typeof shopDomain === "string" && shopDomain.length ? `https://${shopDomain}` : "";
    const result = await callMcpTool(origin || "", "search_products", { query });
    if (!result) return void 0;
    const products = Array.isArray(result) ? result : result.products ?? [];
    const items = products.slice(0, 5).map((p) => {
      const title = p.title || p.name || p.handle || "produkt";
      const url = p.onlineStoreUrl || p.url || p.handle ? `https://${shopDomain}/products/${p.handle}` : void 0;
      return `- ${title}${url ? ` (${url})` : ""}`;
    });
    return items.length ? `Znalezione produkty:
${items.join("\n")}` : void 0;
  } catch (e) {
    console.error("searchProductCatalogWithMCP error:", e);
    return void 0;
  }
}
__name(searchProductCatalogWithMCP, "searchProductCatalogWithMCP");
async function searchShopPoliciesAndFaqsWithMCP(query, shopDomain, vectorIndex, aiBinding, topK = 3) {
  try {
    const origin = `https://${shopDomain}`;
    const mcpRes = await callMcpTool(origin, "search_shop_policies_and_faqs", { query, topK });
    if (mcpRes && Array.isArray(mcpRes.faqs) && mcpRes.faqs.length > 0) {
      const results = mcpRes.faqs.slice(0, topK).map((f, i) => ({
        id: f.id ?? `mcp-faq-${i}`,
        title: f.question ?? f.title ?? `FAQ ${i + 1}`,
        text: (f.answer || "").slice(0, 500),
        // Dodane dla kompatybilności
        snippet: (f.answer || "").slice(0, 500),
        source: f.source || "mcp",
        score: f.score ?? void 0,
        full: f
      }));
      return { results };
    }
    if (vectorIndex) {
      try {
        const vres = await vectorIndex.query(query, { topK });
        const results = vres.map((r) => ({
          id: r.id,
          title: r.payload?.title ?? r.id,
          text: (r.payload?.text ?? "").slice(0, 500),
          // Dodane dla kompatybilności
          snippet: (r.payload?.text ?? "").slice(0, 500),
          source: r.payload?.source ?? "vectorize",
          score: r.score,
          metadata: r.payload?.metadata,
          // Dodane dla kompatybilności
          full: r.payload
        }));
        return { results };
      } catch (ve) {
        console.warn("Vectorize query failed, falling back", ve);
      }
    }
    return { results: [] };
  } catch (err) {
    console.error("searchShopPoliciesAndFaqsWithMCP error:", err);
    return { results: [] };
  }
}
__name(searchShopPoliciesAndFaqsWithMCP, "searchShopPoliciesAndFaqsWithMCP");
async function searchShopPoliciesAndFaqs(query, vectorIndex, aiBinding, topK = 3) {
  try {
    if (vectorIndex) {
      const result = await searchShopPoliciesAndFaqsWithMCP(query, "", vectorIndex, aiBinding, topK);
      return { query, results: result.results };
    }
    return { query, results: [] };
  } catch (err) {
    console.error("searchShopPoliciesAndFaqs error:", err);
    return { query, results: [] };
  }
}
__name(searchShopPoliciesAndFaqs, "searchShopPoliciesAndFaqs");
function formatRagContextForPrompt(rag) {
  if (!rag || !Array.isArray(rag.results) || rag.results.length === 0) return "";
  let output = "";
  if (rag.query) {
    output += `Context (retrieved documents for query: "${rag.query}")

`;
  }
  const parts = rag.results.map((r, index) => {
    const docNum = index + 1;
    const title = r.title ? `${r.title}: ` : "";
    const text = r.text || r.snippet || "";
    const score = r.score ? `${(r.score * 100).toFixed(1)}%` : "";
    const metadata = r.metadata ? `
${JSON.stringify(r.metadata)}` : "";
    return `[Doc ${docNum}] ${score ? `(${score}) ` : ""}${title}${text}${metadata}`;
  });
  output += parts.join("\n\n");
  if (rag.results.length > 0) {
    output += "\n\nOdpowiedz u\u017Cywaj\u0105c powy\u017Cszego kontekstu. Je\u015Bli brak wystarczaj\u0105cych informacji, powiedz to wprost.";
  }
  return output;
}
__name(formatRagContextForPrompt, "formatRagContextForPrompt");

// src/groq.ts
var LUXURY_SYSTEM_PROMPT = `Jeste\u015B eleganckim, wyrafinowanym doradc\u0105 marki EPIR-ART-JEWELLERY. Twoim zadaniem jest udziela\u0107 precyzyjnych, rzeczowych rekomendacji produktowych i odpowiedzi obs\u0142ugi klienta, zawsze w tonie luksusowym, kulturalnym i zwi\u0119z\u0142ym.

ZASADY:
- U\u017Cywaj tylko materia\u0142\xF3w dostarczonych przez system retrieval (retrieved_docs). Nie halucynuj.
- Cytuj \u017Ar\xF3d\u0142o przy istotnych faktach: [doc_id] lub kr\xF3tki fragment.
- Je\u015Bli brak wystarczaj\u0105cych informacji \u2014 powiedz kr\xF3tko "Nie mam wystarczaj\u0105cych informacji" i zaproponuj 2 dalsze kroki (np. poprosi\u0107 o szczeg\xF3\u0142y, sprawdzi\u0107 stan magazynu).
- Dla rekomendacji produkt\xF3w: podawaj kr\xF3tkie uzasadnienie i (je\u015Bli dost\u0119pne) nazw\u0119 produktu, cen\u0119.
- Maksymalna d\u0142ugo\u015B\u0107 odpowiedzi: 2-4 zdania, opcjonalnie 1-2 punkty z opcjami.
- Ton: profesjonalny, ciep\u0142y, luksusowy - jakby\u015B by\u0142 osobistym doradc\u0105 w butiku jubilerskim.

J\u0118ZYK: Zawsze odpowiadaj po polsku.`;
async function streamGroqResponse(messages, apiKey, model = "llama-3.3-70b-versatile") {
  if (!apiKey) throw new Error("Missing GROQ API key");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 0.9
    })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "<no body>");
    throw new Error(`Groq API error (${res.status}): ${txt}`);
  }
  if (!res.body) throw new Error("Groq response has no body");
  const textStream = res.body.pipeThrough(new TextDecoderStream()).pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        const lines = chunk.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === "data: [DONE]" || trimmed === "[DONE]") {
            continue;
          }
          const prefix = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
          try {
            const parsed = JSON.parse(prefix);
            const content = parsed?.choices?.[0]?.delta?.content;
            const messageContent = parsed?.choices?.[0]?.message?.content;
            if (typeof content === "string") controller.enqueue(content);
            else if (typeof messageContent === "string") controller.enqueue(messageContent);
          } catch (e) {
            if (prefix && prefix.length < 1e3) controller.enqueue(prefix);
          }
        }
      }
    })
  );
  return textStream;
}
__name(streamGroqResponse, "streamGroqResponse");
async function getGroqResponse(messages, apiKey, model = "llama-3.3-70b-versatile") {
  if (!apiKey) throw new Error("Missing GROQ API key");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 0.9
    })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "<no body>");
    throw new Error(`Groq API error (${res.status}): ${txt}`);
  }
  const json2 = await res.json().catch(() => null);
  const content = json2?.choices?.[0]?.message?.content ?? json2?.choices?.[0]?.text;
  if (!content) throw new Error("Groq API returned empty response");
  return String(content);
}
__name(getGroqResponse, "getGroqResponse");
function buildGroqMessages(history, userMessage, ragContext) {
  const systemContent = ragContext && ragContext.length ? `${LUXURY_SYSTEM_PROMPT}

Kontekst:
${ragContext}` : LUXURY_SYSTEM_PROMPT;
  const messages = [
    { role: "system", content: systemContent },
    ...history.slice(-10).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage }
  ];
  return messages;
}
__name(buildGroqMessages, "buildGroqMessages");

// src/mcp_server.ts
function json(headers = {}) {
  return { "Content-Type": "application/json", ...headers };
}
__name(json, "json");
function rpcResult(id, result) {
  const body = { jsonrpc: "2.0", result, id: id ?? null };
  return new Response(JSON.stringify(body), { status: 200, headers: json() });
}
__name(rpcResult, "rpcResult");
function rpcError(id, code, message, data) {
  const body = { jsonrpc: "2.0", error: { code, message, data }, id: id ?? null };
  return new Response(JSON.stringify(body), { status: 200, headers: json() });
}
__name(rpcError, "rpcError");
async function adminGraphql(env, query, variables) {
  if (!env.SHOP_DOMAIN) throw new Error("Brak SHOP_DOMAIN (ustaw w wrangler.toml [vars])");
  if (!env.SHOPIFY_ADMIN_TOKEN) throw new Error("Brak SHOPIFY_ADMIN_TOKEN (ustaw przez wrangler secret put)");
  const endpoint = `https://${env.SHOP_DOMAIN}/admin/api/2024-07/graphql.json`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "<no body>");
    throw new Error(`Shopify GraphQL ${res.status}: ${txt}`);
  }
  const data = await res.json().catch(() => ({}));
  if (data?.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}
__name(adminGraphql, "adminGraphql");
async function toolGetProduct(env, args) {
  const id = String(args?.id || "").trim();
  if (!id) throw new Error('get_product: Missing "id"');
  const data = await adminGraphql(
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
__name(toolGetProduct, "toolGetProduct");
async function toolSearchProducts(env, args) {
  const query = String(args?.query || "").trim();
  if (!query) throw new Error('search_products: Missing "query"');
  const data = await adminGraphql(
    env,
    `query Search($query: String!) {
      products(first: 10, query: $query) {
        edges { node { id title handle vendor onlineStoreUrl featuredImage { url altText } } }
      }
    }`,
    { query }
  );
  return data.products?.edges?.map((e) => e.node) ?? [];
}
__name(toolSearchProducts, "toolSearchProducts");
async function handleToolsCall(env, req) {
  let rpc = null;
  try {
    rpc = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
    return rpcError(rpc?.id ?? null, -32600, "Invalid Request");
  }
  if (rpc.method !== "tools/call") {
    return rpcError(rpc.id ?? null, -32601, `Method not found: ${rpc.method}`);
  }
  const name = rpc.params?.name;
  const args = rpc.params?.arguments ?? {};
  if (!name) {
    return rpcError(rpc.id ?? null, -32602, 'Invalid params: "name" required');
  }
  try {
    switch (name) {
      case "get_product": {
        const result = await toolGetProduct(env, args);
        return rpcResult(rpc.id ?? null, result);
      }
      case "search_products": {
        const result = await toolSearchProducts(env, args);
        return rpcResult(rpc.id ?? null, result);
      }
      default:
        return rpcError(rpc.id ?? null, -32601, `Unknown tool: ${name}`);
    }
  } catch (err) {
    console.error("MCP tool error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return rpcError(rpc.id ?? null, -32e3, "Tool execution failed", { message });
  }
}
__name(handleToolsCall, "handleToolsCall");
async function handleMcpRequest(request, env) {
  const url = new URL(request.url);
  const isAppProxy = url.pathname === "/apps/assistant/mcp";
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: json() });
  }
  if (isAppProxy) {
    if (!env.SHOPIFY_APP_SECRET) {
      return new Response("Server misconfigured", { status: 500, headers: json() });
    }
    const valid = await verifyAppProxyHmac(request, env.SHOPIFY_APP_SECRET);
    if (!valid) return new Response("Invalid signature", { status: 401, headers: json() });
  }
  return handleToolsCall(env, request);
}
__name(handleMcpRequest, "handleMcpRequest");

// src/index.ts
var RATE_LIMIT_WINDOW_MS = 6e4;
var RATE_LIMIT_MAX_REQUESTS = 20;
var MODEL_NAME = "@cf/meta/llama-3.1-8b-instruct";
var MAX_HISTORY = 200;
function now() {
  return Date.now();
}
__name(now, "now");
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
__name(isNonEmptyString, "isNonEmptyString");
function isChatRole(value) {
  return value === "user" || value === "assistant";
}
__name(isChatRole, "isChatRole");
function parseAppendPayload(input) {
  if (typeof input !== "object" || input === null) return null;
  const maybe = input;
  if (!isChatRole(maybe.role) || !isNonEmptyString(maybe.content)) return null;
  const sessionId = typeof maybe.session_id === "string" && maybe.session_id.length > 0 ? maybe.session_id : void 0;
  return { role: maybe.role, content: String(maybe.content), session_id: sessionId };
}
__name(parseAppendPayload, "parseAppendPayload");
function parseChatRequestBody(input) {
  if (typeof input !== "object" || input === null) return null;
  const maybe = input;
  if (!isNonEmptyString(maybe.message)) return null;
  const sessionId = typeof maybe.session_id === "string" && maybe.session_id.length > 0 ? maybe.session_id : void 0;
  const stream = typeof maybe.stream === "boolean" ? maybe.stream : true;
  return {
    message: String(maybe.message),
    session_id: sessionId,
    stream
  };
}
__name(parseChatRequestBody, "parseChatRequestBody");
function parseEndPayload(input) {
  if (typeof input !== "object" || input === null) return null;
  const maybe = input;
  const sessionId = typeof maybe.session_id === "string" && maybe.session_id.length > 0 ? maybe.session_id : void 0;
  return { session_id: sessionId };
}
__name(parseEndPayload, "parseEndPayload");
function ensureHistoryArray(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const candidate of input) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const raw = candidate;
    if (!isChatRole(raw.role) || !isNonEmptyString(raw.content)) continue;
    const ts = typeof raw.ts === "number" ? raw.ts : now();
    out.push({ role: raw.role, content: String(raw.content), ts });
  }
  return out.slice(-MAX_HISTORY);
}
__name(ensureHistoryArray, "ensureHistoryArray");
function cors(env) {
  const origin = env.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Shop-Signature"
  };
}
__name(cors, "cors");
var SessionDO = class {
  static {
    __name(this, "SessionDO");
  }
  state;
  env;
  history = [];
  lastRequestTimestamp = 0;
  requestsInWindow = 0;
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      const rawHistory = await this.state.storage.get("history");
      this.history = ensureHistoryArray(rawHistory);
    });
  }
  async fetch(request) {
    if (!this.rateLimitOk()) {
      return new Response("Rate limit exceeded", { status: 429 });
    }
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();
    if (method === "GET" && pathname.endsWith("/history")) {
      return new Response(JSON.stringify(this.history), {
        headers: { "Content-Type": "application/json" }
      });
    }
    if (method === "POST" && pathname.endsWith("/append")) {
      const payload = parseAppendPayload(await request.json().catch(() => null));
      if (!payload) {
        return new Response("Bad Request", { status: 400 });
      }
      if (payload.session_id) {
        await this.state.storage.put("session_id", payload.session_id);
      }
      await this.append(payload);
      return new Response("ok");
    }
    if (method === "POST" && pathname.endsWith("/end")) {
      const payload = parseEndPayload(await request.json().catch(() => null));
      const sessionId = payload?.session_id ?? "unknown";
      await this.end(sessionId);
      return new Response("ended");
    }
    return new Response("Not Found", { status: 404 });
  }
  rateLimitOk() {
    const current = now();
    if (current - this.lastRequestTimestamp > RATE_LIMIT_WINDOW_MS) {
      this.requestsInWindow = 1;
      this.lastRequestTimestamp = current;
      return true;
    }
    this.requestsInWindow += 1;
    return this.requestsInWindow <= RATE_LIMIT_MAX_REQUESTS;
  }
  async append(payload) {
    this.history.push({ role: payload.role, content: payload.content, ts: now() });
    this.history = this.history.slice(-MAX_HISTORY);
    await this.state.storage.put("history", JSON.stringify(this.history));
  }
  async end(sessionId) {
    if (this.history.length === 0) {
      await this.state.storage.delete("history");
      await this.state.storage.delete("session_id");
      return;
    }
    if (this.env.DB) {
      const started = this.history[0]?.ts ?? now();
      const ended = this.history[this.history.length - 1]?.ts ?? started;
      await this.env.DB.prepare(
        "INSERT INTO conversations (session_id, started_at, ended_at) VALUES (?1, ?2, ?3)"
      ).bind(sessionId, started, ended).run();
      const row = await this.env.DB.prepare("SELECT last_insert_rowid() AS id").first();
      const conversationId = row?.id;
      if (conversationId !== void 0) {
        const stmt = this.env.DB.prepare(
          "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4)"
        );
        for (const entry of this.history) {
          await stmt.bind(conversationId, entry.role, entry.content, entry.ts).run();
        }
      }
    }
    this.history = [];
    await this.state.storage.delete("history");
    await this.state.storage.delete("session_id");
  }
};
async function generateAIResponse(history, userMessage, env) {
  const ai = env.AI;
  if (!ai || typeof ai.run !== "function") {
    return `Echo: ${userMessage}`;
  }
  const recentHistory = history.slice(-10);
  const messages = [
    {
      role: "system",
      content: "Jeste\u015B pomocnym asystentem sklepu jubilerskiego EPIR. Odpowiadasz na pytania konkretnie i kulturalnie."
    },
    ...recentHistory.map((entry) => ({ role: entry.role, content: entry.content })),
    { role: "user", content: userMessage }
  ];
  const response = await ai.run(MODEL_NAME, {
    messages,
    max_tokens: 512,
    temperature: 0.7,
    top_p: 0.9
  }).catch((error) => {
    console.error("AI error", error);
    return null;
  });
  if (response && typeof response.response === "string" && response.response.trim().length > 0) {
    return response.response.trim();
  }
  return "Przepraszam, nie uda\u0142o mi si\u0119 wygenerowa\u0107 odpowiedzi. Spr\xF3buj ponownie.";
}
__name(generateAIResponse, "generateAIResponse");
async function generateAIResponseStream(history, userMessage, env) {
  const recentHistory = history.slice(-10);
  const messages = [
    {
      role: "system",
      content: "Jeste\u015B pomocnym asystentem sklepu jubilerskiego EPIR. Odpowiadasz na pytania konkretnie i kulturalnie."
    },
    ...recentHistory.map((entry) => ({ role: entry.role, content: entry.content })),
    { role: "user", content: userMessage }
  ];
  try {
    const ai = env.AI;
    if (!ai) return null;
    if (typeof ai.stream === "function") {
      return await ai.stream(MODEL_NAME, { messages, max_tokens: 512, temperature: 0.7, top_p: 0.9 });
    }
    if (typeof ai.runStream === "function") {
      return await ai.runStream(MODEL_NAME, { messages, max_tokens: 512, temperature: 0.7, top_p: 0.9 });
    }
    if (typeof ai.run === "function") {
      const maybe = await ai.run(MODEL_NAME, { messages, max_tokens: 512, temperature: 0.7, top_p: 0.9 });
      if (maybe && typeof maybe === "object" && maybe.readable) return maybe.readable;
    }
  } catch (e) {
    console.warn("AI streaming not available or failed to start", e);
    return null;
  }
  return null;
}
__name(generateAIResponseStream, "generateAIResponseStream");
async function handleChat(request, env) {
  const payload = parseChatRequestBody(await request.json().catch(() => null));
  if (!payload) {
    return new Response("Bad Request: message required", { status: 400, headers: cors(env) });
  }
  const sessionId = payload.session_id ?? crypto.randomUUID();
  const doId = env.SESSION_DO.idFromName(sessionId);
  const stub = env.SESSION_DO.get(doId);
  const appendResponse = await stub.fetch("https://session/append", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "user", content: payload.message, session_id: sessionId })
  });
  if (!appendResponse.ok) {
    return new Response("Internal Error: session append failed", { status: 500, headers: cors(env) });
  }
  if (payload.stream) {
    return streamAssistantResponse(sessionId, payload.message, stub, env);
  }
  const historyResp = await stub.fetch("https://session/history");
  const historyData = await historyResp.json().catch(() => []);
  const history = ensureHistoryArray(historyData);
  let reply;
  let ragContext;
  if (isProductQuery(payload.message) && env.SHOP_DOMAIN) {
    const productContext = await searchProductCatalogWithMCP(
      payload.message,
      env.SHOP_DOMAIN,
      env.SHOPIFY_ADMIN_TOKEN,
      env.SHOPIFY_STOREFRONT_TOKEN
    );
    if (productContext) {
      ragContext = productContext;
    }
  }
  if (!ragContext) {
    if (env.SHOP_DOMAIN) {
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
  if (env.GROQ_API_KEY) {
    const messages = buildGroqMessages(history, payload.message, ragContext);
    reply = await getGroqResponse(messages, env.GROQ_API_KEY);
  } else {
    reply = await generateAIResponse(history, payload.message, env);
  }
  await stub.fetch("https://session/append", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "assistant", content: reply, session_id: sessionId })
  });
  return new Response(JSON.stringify({ reply, session_id: sessionId }), {
    headers: { ...cors(env), "Content-Type": "application/json" }
  });
}
__name(handleChat, "handleChat");
function streamAssistantResponse(sessionId, userMessage, stub, env) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  (async () => {
    try {
      const historyResp = await stub.fetch("https://session/history");
      const historyRaw = await historyResp.json().catch(() => []);
      const history = ensureHistoryArray(historyRaw);
      let ragContext;
      if (isProductQuery(userMessage) && env.SHOP_DOMAIN) {
        const productContext = await searchProductCatalogWithMCP(
          userMessage,
          env.SHOP_DOMAIN,
          env.SHOPIFY_ADMIN_TOKEN,
          env.SHOPIFY_STOREFRONT_TOKEN
        );
        if (productContext) {
          ragContext = productContext;
        }
      }
      if (!ragContext) {
        if (env.SHOP_DOMAIN) {
          const ragResult = await searchShopPoliciesAndFaqsWithMCP(
            userMessage,
            env.SHOP_DOMAIN,
            env.VECTOR_INDEX,
            env.AI,
            3
          );
          if (ragResult.results.length > 0) {
            ragContext = formatRagContextForPrompt(ragResult);
          }
        } else if (env.VECTOR_INDEX && env.AI) {
          const ragResult = await searchShopPoliciesAndFaqs(
            userMessage,
            env.VECTOR_INDEX,
            env.AI,
            3
          );
          if (ragResult.results.length > 0) {
            ragContext = formatRagContextForPrompt(ragResult);
          }
        }
      }
      let fullReply = "";
      await writer.write(encoder.encode(`data: ${JSON.stringify({ session_id: sessionId, done: false })}

`));
      if (env.GROQ_API_KEY) {
        const messages = buildGroqMessages(history, userMessage, ragContext);
        const stream = await streamGroqResponse(messages, env.GROQ_API_KEY);
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = typeof value === "string" ? value : decoder.decode(value);
          fullReply += chunk;
          const evt = JSON.stringify({ delta: chunk, session_id: sessionId, done: false });
          await writer.write(encoder.encode(`data: ${evt}

`));
        }
      } else {
        const stream = await generateAIResponseStream(history, userMessage, env);
        if (stream) {
          const reader = stream.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunkStr = typeof value === "string" ? value : decoder.decode(value);
            fullReply += chunkStr;
            const evt = JSON.stringify({ delta: chunkStr, session_id: sessionId, done: false });
            await writer.write(encoder.encode(`data: ${evt}

`));
          }
        } else {
          fullReply = await generateAIResponse(history, userMessage, env);
          const parts = fullReply.split(/(\s+)/);
          for (const part of parts) {
            const evt = JSON.stringify({ delta: part, session_id: sessionId, done: false });
            await writer.write(encoder.encode(`data: ${evt}

`));
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
        }
      }
      await stub.fetch("https://session/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: fullReply, session_id: sessionId })
      });
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ content: fullReply, session_id: sessionId, done: true })}

`)
      );
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch (error) {
      console.error("Streaming error", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: message, session_id: sessionId })}

`));
    } finally {
      await writer.close();
    }
  })();
  return new Response(readable, {
    headers: {
      ...cors(env),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
__name(streamAssistantResponse, "streamAssistantResponse");
var src_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors(env) });
    }
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/ping" || url.pathname === "/health")) {
      return new Response("ok", { status: 200, headers: cors(env) });
    }
    if (url.pathname.startsWith("/apps/assistant/") && request.method === "POST") {
      if (!env.SHOPIFY_APP_SECRET) {
        return new Response("Server misconfigured", { status: 500, headers: cors(env) });
      }
      const ok = await verifyAppProxyHmac(request, env);
      if (!ok) {
        return new Response("Unauthorized: Invalid HMAC signature", { status: 401, headers: cors(env) });
      }
    }
    if (url.pathname === "/apps/assistant/chat" && request.method === "POST") {
      return handleChat(request, env);
    }
    if (url.pathname === "/chat" && request.method === "POST") {
      return handleChat(request, env);
    }
    if (request.method === "POST" && (url.pathname === "/mcp/tools/call" || url.pathname === "/apps/assistant/mcp")) {
      return handleMcpRequest(request, env);
    }
    return new Response("Not Found", { status: 404, headers: cors(env) });
  }
};

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-mRhDL5/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-mRhDL5/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  SessionDO,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map

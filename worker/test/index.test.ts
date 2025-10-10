import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  SessionDO, 
  type Env,
  parseAppendPayload,
  parseChatRequestBody,
  parseEndPayload,
  ensureHistoryArray,
  cors,
  generateAIResponse,
  generateAIResponseStream,
  handleChat,
  streamAssistantResponse,
  verifyAppProxyHmac,  it('default fetch: 404', async () => {
    const request = new Request('https://example.com/unknown', { method: 'GET' });
    const response = await (await import('../src/index')).default.fetch(request, mockEnv);
    expect(response.status).toBe(404);
  });

  it('Integration test: ring recommendation', async () => {
    const request = new Request('https://example.com/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Poleć mi pierścionek', stream: false }),
    });

    // Mock AI response for ring recommendation
    (mockEnv.AI as any).run.mockResolvedValue({
      response: 'EPIR oferuje piękne pierścionki z diamentami i złotem. Polecam nasz pierścionek zaręczynowy "Eternal Love" z białym diamentem 1ct w oprawie z białego złota 18k. Cena: 4500 zł. Jest to doskonały wybór dla osób szukających eleganckiej biżuterii.'
    });

    const stub = { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify([]))) };
    vi.mocked(mockEnv.SESSION_DO.get).mockReturnValue(stub as any);

    const response = await (await import('../src/index')).default.fetch(request, mockEnv);
    expect(response.status).toBe(200);

    const result = await response.json();
    console.log('🧪 Test odpowiedzi na pytanie o pierścionek:');
    console.log('Odpowiedź:', result.reply);
    console.log('Session ID:', result.session_id);

    expect(result.reply).toContain('pierścionek');
    expect(result.session_id).toBeDefined();
  });
});dleMcpRequest,
  getGroqResponse,
  streamGroqResponse,
} from '../src/index'; // Adjust import as needed

// Mock Date.now globally
const mockNow = 1000000000;
vi.spyOn(Date, 'now').mockReturnValue(mockNow);

// Mock external dependencies
vi.mock('../src/security', () => ({
  verifyAppProxyHmac: vi.fn(),
  replayCheck: vi.fn(),
}));
vi.mock('../src/rag', () => ({
  searchShopPoliciesAndFaqs: vi.fn(),
  searchShopPoliciesAndFaqsWithMCP: vi.fn().mockResolvedValue({ results: [] }),
  searchProductCatalogWithMCP: vi.fn().mockResolvedValue('product context'),
  formatRagContextForPrompt: vi.fn(),
}));
vi.mock('../src/mcp', () => ({
  isProductQuery: vi.fn(),
}));
vi.mock('../src/groq', () => ({
  streamGroqResponse: vi.fn(),
  buildGroqMessages: vi.fn(),
  getGroqResponse: vi.fn(),
}));
vi.mock('../src/mcp_server', () => ({
  handleMcpRequest: vi.fn(),
}));

// Mock Cloudflare types
const mockStorage = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};
const mockState = {
  storage: mockStorage,
  blockConcurrencyWhile: vi.fn((fn) => fn()),
};
const mockAI = { run: vi.fn(), stream: vi.fn() };
const mockEnv: Env = {
  DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ run: vi.fn() })), first: vi.fn() })) } as any,
  SESSIONS_KV: {} as any,
  SESSION_DO: { idFromName: vi.fn(() => 'mock-id'), get: vi.fn(() => ({ fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify([]))) })) } as any,
  VECTOR_INDEX: {} as any,
  SHOPIFY_APP_SECRET: 'secret',
  ALLOWED_ORIGIN: 'http://example.com',
  AI: mockAI as any,
  SHOPIFY_STOREFRONT_TOKEN: 'token',
  SHOPIFY_ADMIN_TOKEN: 'token',
  SHOP_DOMAIN: 'example.shopify.com',
  GROQ_API_KEY: 'key',
  DEV_BYPASS: '0',
};

describe('Parsing Functions', () => {
  it('parseAppendPayload: valid payload', () => {
    const input = { role: 'user', content: 'test', session_id: '123' };
    expect(parseAppendPayload(input)).toEqual({ role: 'user', content: 'test', session_id: '123' });
  });

  it('parseAppendPayload: invalid role', () => {
    const input = { role: 'invalid', content: 'test' };
    expect(parseAppendPayload(input)).toBeNull();
  });

  it('parseAppendPayload: missing content', () => {
    const input = { role: 'user' };
    expect(parseAppendPayload(input)).toBeNull();
  });

  it('parseChatRequestBody: valid payload', () => {
    const input = { message: 'hello', session_id: '123', stream: true };
    expect(parseChatRequestBody(input)).toEqual({ message: 'hello', session_id: '123', stream: true });
  });

  it('parseChatRequestBody: default stream false', () => {
    const input = { message: 'hello' };
    expect(parseChatRequestBody(input)).toEqual({ message: 'hello', session_id: undefined, stream: false });
  });

  it('parseChatRequestBody: invalid message', () => {
    const input = { message: '' };
    expect(parseChatRequestBody(input)).toBeNull();
  });

  it('parseEndPayload: valid payload', () => {
    const input = { session_id: '123' };
    expect(parseEndPayload(input)).toEqual({ session_id: '123' });
  });

  it('parseEndPayload: invalid input', () => {
    const input = null;
    expect(parseEndPayload(input)).toBeNull();
  });

  it('ensureHistoryArray: valid array', () => {
    const input = [{ role: 'user', content: 'test', ts: 123 }];
    expect(ensureHistoryArray(input)).toEqual([{ role: 'user', content: 'test', ts: 123 }]);
  });

  it('ensureHistoryArray: filters invalid entries', () => {
    const input = [{ role: 'user', content: 'test' }, { role: 'invalid', content: 'test' }];
    expect(ensureHistoryArray(input)).toEqual([{ role: 'user', content: 'test', ts: expect.any(Number) }]);
  });

  it('ensureHistoryArray: empty input', () => {
    expect(ensureHistoryArray(null)).toEqual([]);
  });
});

describe('Utility Functions', () => {
  it('cors: with ALLOWED_ORIGIN', () => {
    expect(cors(mockEnv)).toEqual({
      'Access-Control-Allow-Origin': 'http://example.com',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Shop-Signature',
    });
  });

  it('cors: without ALLOWED_ORIGIN', () => {
    const env = { ...mockEnv, ALLOWED_ORIGIN: undefined };
    expect(cors(env)['Access-Control-Allow-Origin']).toBe('*');
  });
});

describe('SessionDO Class', () => {
  let sessionDO: SessionDO;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.get.mockResolvedValue([]);
    sessionDO = new SessionDO(mockState as any, mockEnv);
  });

  it('constructor: initializes history', async () => {
    mockStorage.get.mockResolvedValue([{ role: 'user', content: 'test', ts: 123 }]);
    const newDO = new SessionDO(mockState as any, mockEnv);
    await new Promise(resolve => setTimeout(resolve, 0)); // Wait for blockConcurrencyWhile
    expect(newDO['history']).toEqual([{ role: 'user', content: 'test', ts: 123 }]);
  });

  it('fetch: GET /history', async () => {
    const request = new Request('https://example.com/history', { method: 'GET' });
    const response = await sessionDO.fetch(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('fetch: POST /append valid', async () => {
    const request = new Request('https://example.com/append', {
      method: 'POST',
      body: JSON.stringify({ role: 'user', content: 'test' }),
    });
    const response = await sessionDO.fetch(request);
    expect(response.status).toBe(200);
    expect(mockStorage.put).toHaveBeenCalledWith('history', expect.stringContaining('test'));
  });

  it('fetch: POST /append invalid', async () => {
    const request = new Request('https://example.com/append', {
      method: 'POST',
      body: JSON.stringify({ role: 'invalid' }),
    });
    const response = await sessionDO.fetch(request);
    expect(response.status).toBe(400);
  });

  it('fetch: POST /end', async () => {
    sessionDO['history'] = [{ role: 'user', content: 'test', ts: 123 }];
    const request = new Request('https://example.com/end', {
      method: 'POST',
      body: JSON.stringify({ session_id: '123' }),
    });
    const response = await sessionDO.fetch(request);
    expect(response.status).toBe(200);
    expect(mockStorage.delete).toHaveBeenCalledWith('history');
  });

  it('fetch: POST /replay-check used', async () => {
    mockStorage.get.mockResolvedValue(true);
    const request = new Request('https://example.com/replay-check', {
      method: 'POST',
      body: JSON.stringify({ signature: 'sig', timestamp: 'ts' }),
    });
    const response = await sessionDO.fetch(request);
    expect(await response.json()).toEqual({ used: true });
  });

  it('rateLimitOk: within window', () => {
    expect(sessionDO['rateLimitOk']()).toBe(true);
    expect(sessionDO['rateLimitOk']()).toBe(true);
  });

  it('rateLimitOk: exceeds limit', () => {
    for (let i = 0; i < 20; i++) sessionDO['rateLimitOk']();
    expect(sessionDO['rateLimitOk']()).toBe(false);
  });

  it('append: adds to history', async () => {
    await sessionDO['append']({ role: 'user', content: 'test' });
    expect(sessionDO['history']).toHaveLength(1);
    expect(mockStorage.put).toHaveBeenCalled();
  });

  it('end: saves to DB and clears', async () => {
    sessionDO['history'] = [{ role: 'user', content: 'test', ts: 123 }];
    await sessionDO['end']('123');
    expect(mockEnv.DB.prepare).toHaveBeenCalled();
    expect(sessionDO['history']).toEqual([]);
  });
});

describe('AI Response Functions', () => {
  it('generateAIResponseStream: stream available', async () => {
    const mockStream = new ReadableStream();
    (mockEnv.AI as any).stream.mockResolvedValue(mockStream);
    const stream = await generateAIResponseStream([], 'test', mockEnv);
    expect(stream).toBe(mockStream);
  });

  it('generateAIResponseStream: no stream', async () => {
    (mockEnv.AI as any).stream = undefined;
    const stream = await generateAIResponseStream([], 'test', mockEnv);
    expect(stream).toBeNull();
  });
});

describe('Main Handlers', () => {
  it('handleChat: valid non-stream', async () => {
    const request = new Request('https://example.com/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'test' }),
    });
    const stub = { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify([]))) };
    vi.mocked(mockEnv.SESSION_DO.get).mockReturnValue(stub as any);
    vi.mocked(getGroqResponse).mockResolvedValue('reply');
    const response = await handleChat(request, mockEnv);
    expect(response.status).toBe(200);
    expect(stub.fetch).toHaveBeenCalledTimes(3); // append user, history, append assistant
  });

  it('handleChat: invalid payload', async () => {
    const request = new Request('https://example.com/chat', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await handleChat(request, mockEnv);
    expect(response.status).toBe(400);
  });

  it('streamAssistantResponse: emits events', async () => {
    const { readable } = new TransformStream();
    const writer = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn() };
    const mockTransformStream = vi.fn(() => ({ readable, writable: { getWriter: vi.fn(() => writer) } }));
    (global as any).TransformStream = mockTransformStream;
    const stub = { fetch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue([]) }) };
    vi.mocked(streamGroqResponse).mockResolvedValue(new ReadableStream({
      start(controller) {
        controller.enqueue('chunk');
        controller.close();
      },
    }));
    const response = streamAssistantResponse('123', 'test', stub as any, mockEnv);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
  });

  it('default fetch: OPTIONS', async () => {
    const request = new Request('https://example.com/', { method: 'OPTIONS' });
    const response = await (await import('../src/index')).default.fetch(request, mockEnv);
    expect(response.status).toBe(200);
  });

  it('default fetch: healthcheck', async () => {
    const request = new Request('https://example.com/ping', { method: 'GET' });
    const response = await (await import('../src/index')).default.fetch(request, mockEnv);
    expect(await response.text()).toBe('ok');
  });

  it('default fetch: HMAC failure', async () => {
    vi.mocked(verifyAppProxyHmac).mockResolvedValue({ ok: false, reason: 'invalid' });
    const request = new Request('https://example.com/apps/assistant/chat', { method: 'POST' });
    const response = await (await import('../src/index')).default.fetch(request, mockEnv);
    expect(response.status).toBe(401);
  });

  it('default fetch: chat route', async () => {
    vi.mocked(verifyAppProxyHmac).mockResolvedValue({ ok: true });
    const request = new Request('https://example.com/apps/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'test' }),
    });
    const response = await (await import('../src/index')).default.fetch(request, mockEnv);
    expect(response.status).toBe(200);
  });

  it('default fetch: MCP route', async () => {
    vi.mocked(handleMcpRequest).mockResolvedValue(new Response('ok'));
    const request = new Request('https://example.com/mcp/tools/call', { method: 'POST' });
    const response = await (await import('../src/index')).default.fetch(request, mockEnv);
    expect(response).toBeDefined();
  });

  it('default fetch: 404', async () => {
    const request = new Request('https://example.com/invalid', { method: 'GET' });
    const response = await (await import('../src/index')).default.fetch(request, mockEnv);
    expect(response.status).toBe(404);
  });
});
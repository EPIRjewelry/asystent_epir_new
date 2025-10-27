import { describe, it, expect, vi } from 'vitest';
import { streamAssistantResponse } from '../src/index';

// Mock the ai-client module's streamGroqResponse to return a ReadableStream that yields a plain text chunk
vi.mock('../src/ai-client', () => ({
  streamGroqResponse: async () => {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('Niestety, nie mogę znaleźć tego produktu.'));
        controller.close();
      }
    });
  }
}));

describe('streamAssistantResponse - fallback on non-JSON LLM output', () => {
  it('does not throw and appends fallback error to session', async () => {
    // Minimal stub for DurableObjectStub used in streamAssistantResponse
    const appendCalls: any[] = [];
    const stub = {
      fetch: vi.fn()
        // history
        .mockResolvedValueOnce({ json: async () => [] })
        // cart-id
        .mockResolvedValueOnce({ json: async () => ({ cart_id: null }) })
        // append (capture)
        .mockImplementation(async (url: string, opts: any) => {
          if (url.endsWith('/session/append')) {
            const body = JSON.parse(opts.body);
            appendCalls.push(body);
            return { ok: true };
          }
          return { json: async () => ({}) };
        })
    } as any;

    const env = { GROQ_API_KEY: 'test-key', SHOP_DOMAIN: 'example.myshopify.com' } as any;

    const resp = streamAssistantResponse('session-test', 'poznajesz mnie?', stub, env);

    // Read SSE response
    const reader = (await resp).body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        full += decoder.decode(value, { stream: !done });
      }
    }

    // Expect that append was called with an assistant message containing an error object
    expect(appendCalls.length).toBeGreaterThan(0);
    const lastAppend = appendCalls[appendCalls.length - 1];
    expect(lastAppend).toHaveProperty('role', 'assistant');
    expect(lastAppend).toHaveProperty('content');
    expect(typeof lastAppend.content).toBe('object');
    expect(lastAppend.content).toHaveProperty('error');

    // Validate the SSE response content before parsing
    expect(full).toContain('"error"');
    // Process multi-line SSE response
    const lines = full.split(/\r?\n/);
    const dataLines = lines.filter(line => line.startsWith('data:'));
    // Filter out non-JSON lines like [DONE]
    const jsonChunks = dataLines
      .map(line => line.replace('data: ', '').trim())
      .filter(chunk => chunk !== '[DONE]');

    // Concatenate and parse the JSON chunks
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(jsonChunks.join(''));
    } catch (e) {
      throw new Error(`Invalid JSON in SSE response chunks: ${jsonChunks.join('')}`);
    }

    // Ensure the parsed response contains the expected structure
    expect(parsedResponse).toHaveProperty('error');

    // Refactor to handle partial JSON fragments with detailed buffer logging
    let buffer = '';
    const parsedChunks: Array<Record<string, any>> = [];

    jsonChunks.forEach((chunk, index) => {
      buffer += chunk; // Append chunk to buffer
      console.log(`Buffer after chunk ${index}:`, buffer);
      try {
        const parsed = JSON.parse(buffer);
        parsedChunks.push(parsed);
        console.log(`Chunk ${index} parsed successfully:`, parsed);
        buffer = ''; // Clear buffer after successful parse
      } catch (e) {
        if (e instanceof SyntaxError) {
          console.warn(`Incomplete JSON at chunk ${index}, buffering...`);
        } else {
          console.error(`Unexpected error at chunk ${index}:`, e);
        }
      }
    });

    if (buffer) {
      console.warn('Unprocessed buffer remains:', buffer);
    }

    // Validate the structure of the last valid chunk
    if (parsedChunks.length === 0) {
      throw new Error('No valid JSON chunks found in SSE response.');
    }

    const lastChunk = parsedChunks[parsedChunks.length - 1];
    expect(lastChunk).toHaveProperty('content');
    expect(lastChunk.content).toHaveProperty('error');
  });
});

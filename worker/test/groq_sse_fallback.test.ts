import { describe, it, expect } from 'vitest';
import { streamGroqWithFallback, makeSseFallbackStream } from '../src/groq';

async function readStreamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) result += decoder.decode(value, { stream: !done });
  }
  return result;
}

describe('streamGroqWithFallback', () => {
  it('returns fallback stream when factory returns null', async () => {
    const callFn = async () => null;
    const stream = await streamGroqWithFallback(callFn, { timeoutMs: 50, fallbackEventName: 'fb', fallbackReason: 'test' });
    const txt = await readStreamToString(stream);
    expect(txt).toContain('event: fb');
    expect(txt).toContain('"reason":"test"');
    expect(txt).toContain('data: [DONE]');
  });

  it('returns original stream when factory provides a stream', async () => {
    const okStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: data\n'));
        controller.enqueue(new TextEncoder().encode('data: "ok"\n\n'));
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      }
    });
    const callFn = async () => okStream;
    const stream = await streamGroqWithFallback(callFn, { timeoutMs: 100 });
    const txt = await readStreamToString(stream);
    expect(txt).toContain('event: data');
    expect(txt).toContain('ok');
    expect(txt).toContain('data: [DONE]');
  });
});

import { describe, it, expect } from 'vitest';
import { __test as aiTest } from '../src/ai-client';

function makeStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    }
  });
}

describe('Harmony SSE parser', () => {
  it('emits text, tool_call and usage events from SSE lines', async () => {
    const sseLines = [
      'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Hello ' } }] }) + '\n',
      'data: ' + JSON.stringify({ choices: [{ delta: { content: '<|call|>{"name":"get_cart","arguments":{"id":"abc"}}<|end|>' } }] }) + '\n',
      'data: ' + JSON.stringify({ choices: [{ delta: { content: 'world' } }] }) + '\n',
      'data: ' + JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 3 } }) + '\n',
      'data: [DONE]\n',
    ];

    const readable = makeStream(sseLines)
      .pipeThrough(aiTest.createHarmonyTransform());

    const reader = readable.getReader();
    const events: any[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      events.push(value);
    }

    // Expect sequence: text("Hello "), tool_call, text("world"), usage
    expect(events.length).toBe(4);
    expect(events[0]).toEqual({ type: 'text', delta: 'Hello ' });
    expect(events[1]).toEqual({ type: 'tool_call', name: 'get_cart', arguments: { id: 'abc' } });
    expect(events[2]).toEqual({ type: 'text', delta: 'world' });
    expect(events[3]).toEqual({ type: 'usage', prompt_tokens: 10, completion_tokens: 3 });
  });
});

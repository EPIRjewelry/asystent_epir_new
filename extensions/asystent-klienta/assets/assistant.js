// extensions/asystent-klienta/assets/chat.ts
// Lekki, poprawiony klient czatu z obsługą streaming SSE/JSON + fallback.
// Kompiluj do JS (np. tsc) przed użyciem w Theme App Extension.

// Minimal initializer: bind toggle button to open/close the assistant
document.addEventListener('DOMContentLoaded', () => {
  try {
    const section = document.getElementById('epir-assistant-section');
    if (!section) return;
    const toggle = document.getElementById('assistant-toggle-button');
    const content = document.getElementById('assistant-content');
    const startClosed = section.dataset.startClosed === 'true' || section.getAttribute('data-start-closed') === 'true';
    if (startClosed && content) content.classList.add('is-closed');
    if (!toggle) return;
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      const isClosed = content?.classList.toggle('is-closed');
      // update ARIA
      toggle.setAttribute('aria-expanded', isClosed ? 'false' : 'true');
    });
  } catch (e) {
    console.warn('Assistant init error', e);
  }
});

/* Typy */
type MessageElement = { id: string; el: HTMLElement };
type StreamPayload = { content?: string; delta?: string; session_id?: string; error?: string; done?: boolean };

/* Pomocnicze UI */
export function createAssistantMessage(messagesEl: HTMLElement): MessageElement {
  const id = `msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const div = document.createElement('div');
  div.className = 'msg msg-assistant msg-typing';
  div.id = id;
  div.setAttribute('role', 'status');
  div.textContent = '...';
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return { id, el: div };
}

export function updateAssistantMessage(id: string, text: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  const parent = el.parentElement;
  if (parent) parent.scrollTop = parent.scrollHeight;
}

export function finalizeAssistantMessage(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('msg-typing');
  // accessibility: usuń aria-busy jeśli ustawione, pozostaw role=status
  el.removeAttribute('aria-busy');
  el.setAttribute('role', 'status');
}

export function createUserMessage(messagesEl: HTMLElement, text: string): void {
  const div = document.createElement('div');
  div.className = 'msg msg-user';
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* Robustny parser SSE/JSONL z obsługą delta (nowy) i content (fallback) */
export async function processSSEStream(
  body: ReadableStream<Uint8Array>,
  msgId: string,
  sessionIdKey: string,
  onUpdate: (content: string) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Procesuj pełne eventy (oddzielone pustą linią)
      let index: number;
      while ((index = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        // Złóż wszystkie linie 'data:' w rawEvent
        const lines = rawEvent.split(/\r?\n/);
        const dataLines = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5));
        const dataStr = dataLines.join('\n').trim();
        if (!dataStr) continue;

        if (dataStr === '[DONE]') return;

        let parsed: StreamPayload;
        try {
          parsed = JSON.parse(dataStr) as StreamPayload;
        } catch (e) {
          console.error('SSE JSON parse error', e, dataStr);
          throw new Error('Błąd komunikacji: otrzymano nieprawidłowe dane strumienia.');
        }

        if (parsed.error) throw new Error(parsed.error);

        if (parsed.session_id) {
          try { sessionStorage.setItem(sessionIdKey, parsed.session_id); } catch (e) { /* silent */ }
        }

        // Nowa obsługa: delta (incremental) lub content (full replacement)
        if (parsed.delta !== undefined) {
          accumulated += parsed.delta;
          onUpdate(accumulated);
        } else if (parsed.content !== undefined) {
          accumulated = parsed.content;
          onUpdate(accumulated);
        }

        if (parsed.done) return;
      }
    }

    // Po zakończeniu odczytu: spróbuj przetworzyć pozostałości w bufferze
    if (buffer.trim()) {
      const lines = buffer.split(/\r?\n/);
      const dataLines = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5));
      const dataStr = dataLines.join('\n').trim();
      if (dataStr && dataStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(dataStr) as StreamPayload;
          if (parsed.session_id) try { sessionStorage.setItem(sessionIdKey, parsed.session_id); } catch {}
          if (parsed.delta !== undefined) {
            accumulated += parsed.delta;
            onUpdate(accumulated);
          } else if (parsed.content !== undefined) {
            accumulated = parsed.content;
            onUpdate(accumulated);
          }
        } catch (e) {
          console.warn('Nieparsowalny ostatni event SSE', e);
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

/* Główna funkcja wysyłki z fallbackiem JSON */
export async function sendMessageToWorker(
  text: string,
  endpoint: string,
  sessionIdKey: string,
  messagesEl: HTMLElement,
  setLoading: (b: boolean) => void,
  controller: AbortController
): Promise<void> {
  setLoading(true);
  createUserMessage(messagesEl, text);
  const { id: msgId } = createAssistantMessage(messagesEl);
  let accumulated = '';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream, application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        message: text,
        session_id: (() => { try { return sessionStorage.getItem(sessionIdKey); } catch { return null; } })(),
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await (async () => { try { return await res.text(); } catch { return ''; } })();
      console.error('Server error:', res.status, errText);
      throw new Error(`Serwer zwrócił błąd (${res.status}).`);
    }

    const contentType = res.headers.get('content-type') || '';
    const hasStreamAPI = res.body && typeof (res.body as any).getReader === 'function';

    if (hasStreamAPI && contentType.includes('text/event-stream')) {
      // streaming SSE
      await processSSEStream(res.body as ReadableStream<Uint8Array>, msgId, sessionIdKey, (content) => {
        accumulated = content;
        updateAssistantMessage(msgId, accumulated);
      });
    } else if (hasStreamAPI && contentType.includes('application/ndjson')) {
      // ewentualne inne formy newline-delimited json - można dodać parser
      await processSSEStream(res.body as ReadableStream<Uint8Array>, msgId, sessionIdKey, (content) => {
        accumulated = content;
        updateAssistantMessage(msgId, accumulated);
      });
    } else {
      // fallback JSON (serwer buforuje / starsze przeglądarki)
      const data = await res.json().catch((e) => { throw new Error('Nieprawidłowa odpowiedź serwera.'); });
      if (data.error) throw new Error(data.error);
      accumulated = (data.reply as string) || 'Otrzymano pustą odpowiedź.';
      updateAssistantMessage(msgId, accumulated);
      if (data.session_id) {
        try { sessionStorage.setItem(sessionIdKey, data.session_id); } catch {}
      }
    }
  } catch (err: any) {
    console.error('Błąd czatu:', err);
    const safeMsg = err instanceof Error ? err.message : 'Nieznany błąd.';
    const finalText = accumulated.length > 0 ? `${accumulated} (Błąd: ${safeMsg})` : 'Przepraszam, wystąpił błąd. Spróbuj ponownie.';
    updateAssistantMessage(msgId, finalText);
    const el = document.getElementById(msgId);
    if (el) el.classList.add('msg-error');
  } finally {
    finalizeAssistantMessage(msgId);
    setLoading(false);
  }
}

export default {
  createAssistantMessage,
  updateAssistantMessage,
  finalizeAssistantMessage,
  createUserMessage,
  processSSEStream,
  sendMessageToWorker,
};

// DODANE: fix przeładowania strony (preventDefault) i wywołanie /apps/assistant/chat
document.addEventListener('DOMContentLoaded', () => {
  try {
    const form = document.querySelector('#assistant-form');
    if (!form) {
      console.warn('assistant.js: #assistant-form not found');
      return;
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const input = document.querySelector('#assistant-input') as HTMLInputElement | null;
      const messagesEl = document.querySelector('#assistant-messages') as HTMLElement | null;
      const text = input?.value?.trim() || '';
      if (!text || !messagesEl) {
        console.warn('assistant.js: input or messages container not found');
        return;
      }
      input.value = '';
      const controller = new AbortController();
      const setLoading = (b: boolean) => {
        if (!messagesEl) return;
        if (b) messagesEl.classList.add('is-loading'); else messagesEl.classList.remove('is-loading');
      };
      try {
        await sendMessageToWorker(text, '/apps/assistant/chat', 'epir-assistant-session', messagesEl, setLoading, controller);
      } catch (err) {
        console.error('Fetch error:', err);
      }
    });
  } catch (e) {
    console.error('assistant.js DOMContentLoaded submit handler error:', e);
  }
});
﻿// extensions/asystent-klienta/assets/chat.ts
// Lekki, poprawiony klient czatu z obsĹ‚ugÄ… streaming SSE/JSON + fallback.
// Kompiluj do JS (np. tsc) przed uĹĽyciem w Theme App Extension.

/* ===== CART INTEGRATION ===== */

/**
 * Pobiera cart_id z Shopify Cart API (localStorage lub /cart.js)
 * Zwraca cart_id w formacie gid://shopify/Cart/xyz lub null
 */
export async function getShopifyCartId() {
  try {
    // Shopify cart token jest dostÄ™pny w localStorage lub przez /cart.js
    const cartRes = await fetch('/cart.js', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!cartRes.ok) {
      console.warn('Failed to fetch Shopify cart:', cartRes.status);
      return null;
    }
    
    const cartData = await cartRes.json();
    // Shopify cart response: { token: "...", items: [...], ... }
    if (cartData && cartData.token) {
      // Convert token to GID format
      return `gid://shopify/Cart/${cartData.token}`;
    }
    
    return null;
  } catch (e) {
    console.error('Error fetching Shopify cart ID:', e);
    return null;
  }
}

/**
 * Parsuje odpowiedĹş asystenta i wykrywa specjalne akcje (koszyk, checkout)
 * Zwraca obiekt z parsed text + extracted actions
 */
export function parseAssistantResponse(text) {
  const actions = {
    hasCheckoutUrl: false,
    checkoutUrl: null,
    hasCartUpdate: false,
    cartItems: [],
    hasOrderStatus: false,
    orderDetails: null
  };
  
  let cleanedText = text;
  
  // Wykryj checkout URL
  const checkoutUrlMatch = text.match(/https:\/\/[^\s]+\/checkouts\/[^\s]+/);
  if (checkoutUrlMatch) {
    actions.hasCheckoutUrl = true;
    actions.checkoutUrl = checkoutUrlMatch[0];
  }
  
  // Wykryj akcje koszyka w formacie [CART_UPDATED: ...]
  const cartActionMatch = text.match(/\[CART_UPDATED:([^\]]+)\]/);
  if (cartActionMatch) {
    actions.hasCartUpdate = true;
    cleanedText = cleanedText.replace(/\[CART_UPDATED:[^\]]+\]/, '').trim();
  }
  
  // Wykryj status zamĂłwienia w formacie [ORDER_STATUS: ...]
  const orderStatusMatch = text.match(/\[ORDER_STATUS:([^\]]+)\]/);
  if (orderStatusMatch) {
    actions.hasOrderStatus = true;
    try {
      actions.orderDetails = JSON.parse(orderStatusMatch[1]);
    } catch (e) {
      console.warn('Failed to parse order details:', e);
    }
    cleanedText = cleanedText.replace(/\[ORDER_STATUS:[^\]]+\]/, '').trim();
  }
  
  return { text: cleanedText, actions };
}

/**
 * Renderuje specjalny widget checkout button jeĹ›li wykryto URL
 */
export function renderCheckoutButton(checkoutUrl, messageEl) {
  const btn = document.createElement('a');
  btn.href = checkoutUrl;
  btn.className = 'epir-checkout-button';
  btn.textContent = 'PrzejdĹş do kasy â†'';
  btn.setAttribute('target', '_blank');
  btn.setAttribute('rel', 'noopener noreferrer');
  btn.style.cssText = 'display:inline-block;margin-top:10px;padding:10px 20px;background:#000;color:#fff;text-decoration:none;border-radius:4px;font-weight:bold;';
  
  messageEl.appendChild(document.createElement('br'));
  messageEl.appendChild(btn);
}

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
      const isClosed = content && content.classList.toggle('is-closed');
      // update ARIA
      toggle.setAttribute('aria-expanded', isClosed ? 'false' : 'true');
    });
  } catch (e) {
    console.warn('Assistant init error', e);
  }
});

/* Typy - usuniÄ™te dla kompatybilnoĹ›ci z przeglÄ…darkÄ… (TypeScript â†’ JavaScript) */
// type MessageElement = { id; el };
// type StreamPayload = { content?; delta?; session_id?; error?; done? };

/* Pomocnicze UI */
export function createAssistantMessage(messagesEl) {
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

export function updateAssistantMessage(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  const parent = el.parentElement;
  if (parent) parent.scrollTop = parent.scrollHeight;
}

export function finalizeAssistantMessage(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('msg-typing');
  // accessibility: usuĹ„ aria-busy jeĹ›li ustawione, pozostaw role=status
  el.removeAttribute('aria-busy');
  el.setAttribute('role', 'status');
}

export function createUserMessage(messagesEl, text) {
  const div = document.createElement('div');
  div.className = 'msg msg-user';
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* Robustny parser SSE/JSONL z obsĹ‚ugÄ… delta (nowy) i content (fallback) */
export async function processSSEStream(
  body,
  msgId,
  sessionIdKey,
  onUpdate
) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Procesuj peĹ‚ne eventy (oddzielone pustÄ… liniÄ…)
      let index;
      while ((index = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        // ZĹ‚ĂłĹĽ wszystkie linie 'data:' w rawEvent
        const lines = rawEvent.split(/\r?\n/);
        const dataLines = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5));
        const dataStr = dataLines.join('\n').trim();
        if (!dataStr) continue;

        if (dataStr === '[DONE]') return;

        let parsed;
        try {
          parsed = JSON.parse(dataStr);
        } catch (e) {
          console.error('SSE JSON parse error', e, dataStr);
          throw new Error('BĹ‚Ä…d komunikacji: otrzymano nieprawidĹ‚owe dane strumienia.');
        }

        if (parsed.error) throw new Error(parsed.error);

        if (parsed.session_id) {
          try { sessionStorage.setItem(sessionIdKey, parsed.session_id); } catch (e) { /* silent */ }
        }

        // Nowa obsĹ‚uga: delta (incremental) lub content (full replacement)
        if (parsed.delta !== undefined) {
          accumulated += parsed.delta;
          onUpdate(accumulated, parsed);
        } else if (parsed.content !== undefined) {
          accumulated = parsed.content;
          onUpdate(accumulated, parsed);
        }

        if (parsed.done) return;
      }
    }

    // Po zakoĹ„czeniu odczytu: sprĂłbuj przetworzyÄ‡ pozostaĹ‚oĹ›ci w bufferze
    if (buffer.trim()) {
      const lines = buffer.split(/\r?\n/);
      const dataLines = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5));
      const dataStr = dataLines.join('\n').trim();
      if (dataStr && dataStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.session_id) try { sessionStorage.setItem(sessionIdKey, parsed.session_id); } catch {}
          if (parsed.delta !== undefined) {
            accumulated += parsed.delta;
            onUpdate(accumulated, parsed);
          } else if (parsed.content !== undefined) {
            accumulated = parsed.content;
            onUpdate(accumulated, parsed);
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

/* GĹ‚Ăłwna funkcja wysyĹ‚ki z fallbackiem JSON */
export async function sendMessageToWorker(
  text,
  endpoint,
  sessionIdKey,
  messagesEl,
  setLoading,
  controller
) {
  setLoading(true);
  createUserMessage(messagesEl, text);
  const { id: msgId, el: msgEl } = createAssistantMessage(messagesEl);
  let accumulated = '';
  let lastParsedActions = null;

  try {
    // Pobierz cart_id z Shopify przed wysĹ‚aniem
    const cartId = await getShopifyCartId();
    console.log('[Assistant] Cart ID:', cartId);
    
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
        cart_id: cartId, // WyĹ›lij cart_id w sesji
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await (async () => { try { return await res.text(); } catch { return ''; } })();
      console.error('Server error:', res.status, errText);
      throw new Error(`Serwer zwrĂłciĹ‚ bĹ‚Ä…d (${res.status}).`);
    }

    const contentType = res.headers.get('content-type') || '';
    const hasStreamAPI = res.body && typeof (res.body).getReader === 'function';

    if (hasStreamAPI && contentType.includes('text/event-stream')) {
      // streaming SSE
      await processSSEStream(res.body, msgId, sessionIdKey, (content, parsed) => {
        accumulated = content;
        
        // Parsuj odpowiedĹş i wykryj akcje (checkout URL, cart updates)
        const { text: cleanedText, actions } = parseAssistantResponse(accumulated);
        updateAssistantMessage(msgId, cleanedText);
        
        // Zapisz akcje do renderowania po zakoĹ„czeniu streamu
        if (actions.hasCheckoutUrl || actions.hasCartUpdate || actions.hasOrderStatus) {
          lastParsedActions = actions;
        }
      });
    } else if (hasStreamAPI && contentType.includes('application/ndjson')) {
      // ewentualne inne formy newline-delimited json - moĹĽna dodaÄ‡ parser
      await processSSEStream(res.body, msgId, sessionIdKey, (content, parsed) => {
        accumulated = content;
        const { text: cleanedText, actions } = parseAssistantResponse(accumulated);
        updateAssistantMessage(msgId, cleanedText);
        if (actions.hasCheckoutUrl || actions.hasCartUpdate || actions.hasOrderStatus) {
          lastParsedActions = actions;
        }
      });
    } else {
      // fallback JSON (serwer buforuje / starsze przeglÄ…darki)
      const data = await res.json().catch((e) => { throw new Error('NieprawidĹ‚owa odpowiedĹş serwera.'); });
      if (data.error) throw new Error(data.error);
      accumulated = (data.reply) || 'Otrzymano pustÄ… odpowiedĹş.';
      
      // Parsuj odpowiedĹş w trybie non-streaming
      const { text: cleanedText, actions } = parseAssistantResponse(accumulated);
      updateAssistantMessage(msgId, cleanedText);
      if (actions.hasCheckoutUrl || actions.hasCartUpdate || actions.hasOrderStatus) {
        lastParsedActions = actions;
      }
      
      if (data.session_id) {
        try { sessionStorage.setItem(sessionIdKey, data.session_id); } catch {}
      }
    }
    
    // Po zakoĹ„czeniu streamu: renderuj specjalne akcje (checkout button, cart status)
    if (lastParsedActions) {
      const msgElement = document.getElementById(msgId);
      if (msgElement) {
        if (lastParsedActions.hasCheckoutUrl && lastParsedActions.checkoutUrl) {
          console.log('[Assistant] Rendering checkout button:', lastParsedActions.checkoutUrl);
          renderCheckoutButton(lastParsedActions.checkoutUrl, msgElement);
        }
        
        if (lastParsedActions.hasCartUpdate) {
          console.log('[Assistant] Cart was updated');
          // Opcjonalnie: odĹ›wieĹĽ licznik koszyka na stronie
          try {
            // Shopify theme moĹĽe mieÄ‡ event do odĹ›wieĹĽenia cart drawer
            document.dispatchEvent(new CustomEvent('cart:refresh'));
          } catch (e) {
            console.warn('Failed to dispatch cart:refresh event', e);
          }
        }
        
        if (lastParsedActions.hasOrderStatus && lastParsedActions.orderDetails) {
          console.log('[Assistant] Order status:', lastParsedActions.orderDetails);
          // MoĹĽna dodaÄ‡ rendering szczegĂłĹ‚Ăłw zamĂłwienia
        }
      }
    }
  } catch (err) {
    console.error('BĹ‚Ä…d czatu:', err);
    const safeMsg = err instanceof Error ? err.message : 'Nieznany bĹ‚Ä…d.';
    const finalText = accumulated.length > 0 ? `${accumulated} (BĹ‚Ä…d: ${safeMsg})` : 'Przepraszam, wystÄ…piĹ‚ bĹ‚Ä…d. SprĂłbuj ponownie.';
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

// DODANE: fix przeĹ‚adowania strony (preventDefault) i wywoĹ‚anie /apps/assistant/chat
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
      const input = document.querySelector('#assistant-input');
      const messagesEl = document.querySelector('#assistant-messages');
      const text = (input && input.value && input.value.trim()) || '';
      if (!text || !messagesEl) {
        console.warn('assistant.js: input or messages container not found');
        return;
      }
      input.value = '';
      const controller = new AbortController();
      const setLoading = (b) => {
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



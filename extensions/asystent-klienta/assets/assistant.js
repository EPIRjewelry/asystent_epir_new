/**
 * EPIR AI Assistant - Frontend Logic
 * Architektura: POST do App Proxy (/apps/assistant/chat) → Cloudflare Worker
 * Session ID w localStorage, retry logic, typing indicator, accessibility
 * @module EPIRAssistant
 */

(function () {
  'use strict';

  /**
   * @typedef {Object} ChatMessage
   * @property {string} role - 'user' lub 'assistant'
   * @property {string} content - treść wiadomości
   */

  /**
   * @typedef {Object} ChatResponse
   * @property {string} reply - odpowiedź asystenta
   * @property {string} [session_id] - ID sesji (jeśli nowa)
   * @property {string} [error] - komunikat błędu (opcjonalnie)
   */

  // ========================================
  // CONFIG & STATE
  // ========================================
  const CONFIG = {
    WORKER_URL: '/apps/assistant/chat', // App Proxy endpoint
    SESSION_KEY: 'epir_assistant_session_id',
    MAX_RETRIES: 2,
    RETRY_DELAY: 1000, // ms
    AUTO_OPEN_DELAY: 2000, // ms (opóźnienie auto-open)
  };

  let isProcessing = false;
  let sessionId = localStorage.getItem(CONFIG.SESSION_KEY) || null;

  // ========================================
  // DOM ELEMENTS
  // ========================================
  const widget = document.getElementById('epir-assistant-widget');
  if (!widget) {
    console.warn('[EPIR Assistant] Widget element not found');
    return;
  }

  const chatBox = document.getElementById('epir-chat-box');
  const messagesContainer = document.getElementById('epir-messages');
  const form = document.getElementById('epir-form');
  const input = document.getElementById('epir-input');
  const toggleBtn = document.getElementById('epir-chat-toggle');
  const closeBtn = document.getElementById('epir-chat-close');

  const position = widget.dataset.position || 'bottom-right';
  const greetingMessage = widget.dataset.greeting || 'Witaj! Jak mogę pomóc?';
  const autoOpen = widget.dataset.autoOpen === 'true';
  const workerUrl = widget.dataset.workerUrl || CONFIG.WORKER_URL;

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================

  /**
   * Generuje UUID v4 dla nowej sesji (fallback jeśli backend nie zwróci session_id)
   * @returns {string}
   */
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Sleep helper (dla retry delay)
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Sanitize HTML (podstawowa ochrona przed XSS)
   * @param {string} text
   * @returns {string}
   */
  function sanitizeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Scroll do końca kontenera wiadomości
   */
  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  // ========================================
  // MESSAGE RENDERING
  // ========================================

  /**
   * Dodaje wiadomość do UI
   * @param {'user'|'assistant'} role
   * @param {string} content
   */
  function addMessage(role, content) {
    if (!messagesContainer) return;

    const messageEl = document.createElement('div');
    messageEl.className = `epir-message epir-message--${role}`;
    messageEl.setAttribute('role', 'listitem');

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'epir-message__bubble';
    bubbleEl.innerHTML = sanitizeHTML(content);

    messageEl.appendChild(bubbleEl);
    messagesContainer.appendChild(messageEl);
    scrollToBottom();
  }

  /**
   * Tworzy pustą wiadomość asystenta (używana przy streamingu tokenów)
   * @param {string} [initialContent]
   * @returns {{ messageEl: HTMLElement, bubbleEl: HTMLElement } | null}
   */
  function createAssistantMessage(initialContent = '') {
    if (!messagesContainer) return null;

    const messageEl = document.createElement('div');
    messageEl.className = 'epir-message epir-message--assistant';
    messageEl.setAttribute('role', 'listitem');

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'epir-message__bubble';
    bubbleEl.innerHTML = sanitizeHTML(initialContent);

    messageEl.appendChild(bubbleEl);
    messagesContainer.appendChild(messageEl);
    scrollToBottom();

    return { messageEl, bubbleEl };
  }

  /**
   * Aktualizuje treść bąbelka asystenta (używana podczas streamingu)
   * @param {HTMLElement | null | undefined} bubbleEl
   * @param {string} content
   */
  function updateAssistantMessage(bubbleEl, content) {
    if (!bubbleEl) return;
    bubbleEl.innerHTML = sanitizeHTML(content);
    scrollToBottom();
  }

  /**
   * Pokazuje typing indicator (3 animowane kropki)
   * @returns {HTMLElement} element typing indicator (do późniejszego usunięcia)
   */
  function showTypingIndicator() {
    if (!messagesContainer) return null;

    const messageEl = document.createElement('div');
    messageEl.className = 'epir-message epir-message--assistant epir-message--typing';
    messageEl.setAttribute('role', 'status');
    messageEl.setAttribute('aria-label', 'Asystent pisze odpowiedź');

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'epir-message__bubble';
    bubbleEl.innerHTML = `
      <div class="epir-typing-dot"></div>
      <div class="epir-typing-dot"></div>
      <div class="epir-typing-dot"></div>
    `;

    messageEl.appendChild(bubbleEl);
    messagesContainer.appendChild(messageEl);
    scrollToBottom();

    return messageEl;
  }

  /**
   * Usuwa typing indicator
   * @param {HTMLElement} el
   */
  function removeTypingIndicator(el) {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  // ========================================
  // API COMMUNICATION
  // ========================================

  /**
   * Wysyła wiadomość do Cloudflare Worker z retry logic
   * @param {string} message
   * @param {number} [retryCount=0]
   * @returns {Promise<ChatResponse>}
   */
  async function sendMessageToWorker(message, onChunk, retryCount = 0) {
    try {
      // Generuj session_id jeśli nie istnieje
      if (!sessionId) {
        sessionId = generateUUID();
        localStorage.setItem(CONFIG.SESSION_KEY, sessionId);
      }

      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message.trim(),
          session_id: sessionId,
        }),
      });

      if (!response.ok) {
        // Jeśli 401/403 → prawdopodobnie problem HMAC (backend odrzucił)
        if (response.status === 401 || response.status === 403) {
          throw new Error('Unauthorized - sprawdź konfigurację App Proxy i HMAC.');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const responseBody = response.body;
      let aggregatedText = '';
      let streamed = false;

      /**
       * Przetwarza payload (string lub JSON) i aktualizuje stan odpowiedzi
       * @param {unknown} payload
       */
      const handlePayload = (payload) => {
        if (payload == null) {
          return;
        }

        /** @type {string | undefined} */
        let chunkText;

        if (typeof payload === 'string') {
          chunkText = payload;
        } else if (typeof payload === 'object') {
          const dataObj = /** @type {Record<string, unknown>} */ (payload);

          const maybeSessionId =
            typeof dataObj.session_id === 'string'
              ? dataObj.session_id
              : typeof dataObj.sessionId === 'string'
              ? dataObj.sessionId
              : undefined;
          if (maybeSessionId && maybeSessionId !== sessionId) {
            sessionId = maybeSessionId;
            localStorage.setItem(CONFIG.SESSION_KEY, sessionId);
          }

          if (Array.isArray(dataObj.tokens)) {
            chunkText = dataObj.tokens.join('');
          } else if (typeof dataObj.token === 'string') {
            chunkText = dataObj.token;
          } else if (typeof dataObj.partial === 'string') {
            chunkText = dataObj.partial;
          } else if (typeof dataObj.reply === 'string') {
            chunkText = dataObj.reply;
          }
        }

        if (typeof chunkText === 'string' && chunkText.length > 0) {
          streamed = true;
          aggregatedText += chunkText;
          if (typeof onChunk === 'function') {
            onChunk(chunkText);
          }
        }
      };

      /**
       * Przetwarza bufor tekstowy, dzieląc po newline/SSE i zwracając pozostałość
       * @param {string} buffer
       * @returns {string}
       */
      const processBuffer = (buffer) => {
        let working = buffer;
        while (true) {
          const newlineIndex = working.indexOf('\n');
          if (newlineIndex === -1) break;

          const line = working.slice(0, newlineIndex).trim();
          working = working.slice(newlineIndex + 1);

          if (!line) {
            continue;
          }

          let payloadText = line;
          if (payloadText.startsWith('data:')) {
            payloadText = payloadText.slice(5).trim();
          }

          if (!payloadText) {
            continue;
          }

          try {
            const jsonPayload = JSON.parse(payloadText);
            handlePayload(jsonPayload);
          } catch (jsonError) {
            handlePayload(payloadText);
          }
        }

        return working;
      };

      const shouldStream =
        responseBody && typeof responseBody.getReader === 'function' &&
        (!contentType ||
          contentType.includes('text/event-stream') ||
          contentType.includes('application/jsonl') ||
          contentType.includes('application/x-ndjson') ||
          contentType.includes('application/octet-stream'));

      if (shouldStream) {
        const reader = responseBody.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          buffer = processBuffer(buffer);
        }

        buffer += decoder.decode();
        buffer = processBuffer(buffer);

        const finalRemainder = buffer.trim();
        if (finalRemainder) {
          try {
            const finalJson = JSON.parse(finalRemainder);
            handlePayload(finalJson);
          } catch (finalError) {
            handlePayload(finalRemainder);
          }
        }

        return { reply: aggregatedText, streamed };
      }

      const data = await response.json();

      if (typeof data === 'object' && data) {
        const dataObj = /** @type {Record<string, unknown>} */ (data);
        const maybeSessionId =
          typeof dataObj.session_id === 'string'
            ? dataObj.session_id
            : typeof dataObj.sessionId === 'string'
            ? dataObj.sessionId
            : undefined;
        if (maybeSessionId && maybeSessionId !== sessionId) {
          sessionId = maybeSessionId;
          localStorage.setItem(CONFIG.SESSION_KEY, sessionId);
        }

        if (typeof dataObj.reply === 'string' && typeof onChunk === 'function') {
          onChunk(dataObj.reply);
        }
      }

      return data;
    } catch (error) {
      console.error('[EPIR Assistant] Error sending message:', error);

      // Retry logic (max 2 próby)
      if (retryCount < CONFIG.MAX_RETRIES) {
        console.warn(`[EPIR Assistant] Retrying (${retryCount + 1}/${CONFIG.MAX_RETRIES})...`);
        await sleep(CONFIG.RETRY_DELAY);
        return sendMessageToWorker(message, onChunk, retryCount + 1);
      }

      // Jeśli wszystkie próby zawiodły
      throw error;
    }
  }

  // ========================================
  // FORM SUBMIT HANDLER
  // ========================================

  /**
   * Obsługuje wysłanie formularza
   * @param {Event} e
   */
  async function handleFormSubmit(e) {
    e.preventDefault();

    if (isProcessing || !input) return;

    const message = input.value.trim();
    if (!message) return;

    // Zablokuj input podczas przetwarzania
    isProcessing = true;
    input.disabled = true;
    const sendBtn = form.querySelector('.epir-assistant__send-btn');
    if (sendBtn) sendBtn.disabled = true;

    // Dodaj wiadomość użytkownika
    addMessage('user', message);
    input.value = '';

    // Pokaż typing indicator
    const typingIndicator = showTypingIndicator();

    // Utwórz pustą wiadomość asystenta (do streamingu)
    const assistantEntry = createAssistantMessage('');
    const assistantBubble = assistantEntry ? assistantEntry.bubbleEl : null;
    let aggregatedResponse = '';

    try {
      const result = await sendMessageToWorker(
        message,
        (chunk) => {
          aggregatedResponse += chunk;
          updateAssistantMessage(assistantBubble, aggregatedResponse);
        }
      );

      removeTypingIndicator(typingIndicator);

      if (!aggregatedResponse) {
        let finalMessage = '';
        if (result && typeof result === 'object' && typeof result.reply === 'string') {
          finalMessage = result.reply;
        } else if (result && typeof result === 'object' && typeof result.error === 'string') {
          finalMessage = `Błąd: ${result.error}`;
        } else {
          finalMessage = 'Przepraszam, nie otrzymałem odpowiedzi.';
        }

        if (assistantBubble) {
          updateAssistantMessage(assistantBubble, finalMessage);
        } else {
          addMessage('assistant', finalMessage);
        }
      }
    } catch (error) {
      removeTypingIndicator(typingIndicator);
      const errorMessage =
        'Przepraszam, wystąpił problem z połączeniem. Spróbuj ponownie za chwilę.';

      if (assistantBubble) {
        updateAssistantMessage(assistantBubble, errorMessage);
      } else {
        addMessage('assistant', errorMessage);
      }

      console.error('[EPIR Assistant] Error:', error);
    } finally {
      // Odblokuj input
      isProcessing = false;
      input.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
    }
  }

  // ========================================
  // TOGGLE/OPEN/CLOSE (floating mode)
  // ========================================

  /**
   * Otwiera chat box (floating mode)
   */
  function openChat() {
    if (!chatBox || position === 'inline') return;

    chatBox.classList.remove('epir-assistant__chat-box--hidden');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'true');
    }
    if (input) {
      setTimeout(() => input.focus(), 100);
    }
  }

  /**
   * Zamyka chat box (floating mode)
   */
  function closeChat() {
    if (!chatBox || position === 'inline') return;

    chatBox.classList.add('epir-assistant__chat-box--hidden');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
  }

  /**
   * Toggle chat box
   */
  function toggleChat() {
    if (!chatBox || position === 'inline') return;

    if (chatBox.classList.contains('epir-assistant__chat-box--hidden')) {
      openChat();
    } else {
      closeChat();
    }
  }

  // ========================================
  // EVENT LISTENERS
  // ========================================

  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleChat);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeChat);
  }

  // Keyboard shortcut: Escape zamyka chat (floating)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && position !== 'inline' && chatBox) {
      if (!chatBox.classList.contains('epir-assistant__chat-box--hidden')) {
        closeChat();
      }
    }
  });

  // ========================================
  // INITIALIZATION
  // ========================================

  /**
   * Inicjalizacja widgetu
   */
  function init() {
    console.log('[EPIR Assistant] Initialized');

    // Dodaj greeting message (jeśli kontener pusty)
    if (messagesContainer && messagesContainer.children.length === 0) {
      addMessage('assistant', greetingMessage);
    }

    // Auto-open (jeśli włączone w settings)
    if (autoOpen && position !== 'inline') {
      setTimeout(() => {
        openChat();
      }, CONFIG.AUTO_OPEN_DELAY);
    }

    // Focus input w inline mode
    if (position === 'inline' && input) {
      input.focus();
    }
  }

  // Uruchom inicjalizację
  init();
})();

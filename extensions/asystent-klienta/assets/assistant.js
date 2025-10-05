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
  async function sendMessageToWorker(message, retryCount = 0) {
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

      const data = await response.json();

      // Zaktualizuj session_id jeśli backend zwrócił nowy
      if (data.session_id && data.session_id !== sessionId) {
        sessionId = data.session_id;
        localStorage.setItem(CONFIG.SESSION_KEY, sessionId);
      }

      return data;
    } catch (error) {
      console.error('[EPIR Assistant] Error sending message:', error);

      // Retry logic (max 2 próby)
      if (retryCount < CONFIG.MAX_RETRIES) {
        console.warn(`[EPIR Assistant] Retrying (${retryCount + 1}/${CONFIG.MAX_RETRIES})...`);
        await sleep(CONFIG.RETRY_DELAY);
        return sendMessageToWorker(message, retryCount + 1);
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

    try {
      const data = await sendMessageToWorker(message);

      // Usuń typing indicator
      removeTypingIndicator(typingIndicator);

      // Dodaj odpowiedź asystenta
      if (data.reply) {
        addMessage('assistant', data.reply);
      } else if (data.error) {
        addMessage('assistant', `Błąd: ${data.error}`);
      } else {
        addMessage('assistant', 'Przepraszam, nie otrzymałem odpowiedzi.');
      }
    } catch (error) {
      removeTypingIndicator(typingIndicator);
      addMessage(
        'assistant',
        'Przepraszam, wystąpił problem z połączeniem. Spróbuj ponownie za chwilę.'
      );
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

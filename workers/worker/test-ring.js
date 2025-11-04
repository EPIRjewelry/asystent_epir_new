import { handleChat } from './src/index';

// Mock environment for testing
const mockEnv = {
  DB: null,
  SESSIONS_KV: null,
  SESSION_DO: {
    idFromName: function(id) { return { id }; },
    get: function() {
      return {
        fetch: async function(url, options) {
          if (url.includes('/history')) {
            return new Response(JSON.stringify([]));
          }
          return new Response('ok');
        }
      };
    }
  },
  VECTOR_INDEX: null,
  SHOPIFY_APP_SECRET: 'test-secret',
  ALLOWED_ORIGIN: '*',
  AI: {
    run: async function() {
      return {
        response: 'EPIR oferuje piękne pierścionki z diamentami i złotem. Polecam nasz pierścionek zaręczynowy "Eternal Love" z białym diamentem 1ct w oprawie z białego złota 18k. Cena: 4500 zł.'
      };
    }
  },
  SHOPIFY_STOREFRONT_TOKEN: null,
  SHOPIFY_ADMIN_TOKEN: null,
  SHOP_DOMAIN: null,
  GROQ_API_KEY: null,
  DEV_BYPASS: '0',
};

async function testRingQuestion() {
  console.log('🧪 Testowanie pytania o pierścionek...\n');

  const request = new Request('https://example.com/chat', {
    method: 'POST',
    body: JSON.stringify({
      message: 'Poleć mi pierścionek',
      stream: false
    }),
  });

  try {
    const response = await handleChat(request, mockEnv);
    const result = await response.json();

    console.log('📨 Odpowiedź systemu:');
    console.log('Status:', response.status);
    console.log('Treść:', result.reply);
    console.log('Session ID:', result.session_id);

  } catch (error) {
    console.error('❌ Błąd:', error);
  }
}

testRingQuestion();
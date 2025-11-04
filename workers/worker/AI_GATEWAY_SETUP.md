# Cloudflare AI Gateway Setup (Opcjonalne)

## Co to jest AI Gateway?
AI Gateway to proxy Cloudflare dla API wywołań AI, które daje:
- **Analytics** - monitorowanie użycia, kosztów, latencji
- **Caching** - cache'owanie identycznych requestów
- **Rate limiting** - kontrola kosztów
- **Logs** - pełne logi requestów i odpowiedzi

## Jak skonfigurować (opcjonalne, ale zalecane):

### 1. Utwórz AI Gateway w Cloudflare Dashboard
1. Zaloguj się do [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Przejdź do **AI** → **AI Gateway**
3. Kliknij **Create Gateway**
4. Nazwa: `epir-jewellery-ai`
5. Slug: `epir-jewellery-ai`
6. Skopiuj endpoint URL (będzie wyglądał jak: `https://gateway.ai.cloudflare.com/v1/{account_id}/epir-jewellery-ai/workers-ai`)

### 2. Zaktualizuj wrangler.toml
Jeśli chcesz używać AI Gateway, dodaj do `wrangler.toml`:

```toml
[ai]
binding = "AI"
gateway = "epir-jewellery-ai"  # Twój AI Gateway slug
```

### 3. Alternatywnie - bezpośrednie użycie Workers AI (obecna konfiguracja)
Obecna konfiguracja używa Workers AI **bezpośrednio** (bez gateway):
```toml
[ai]
binding = "AI"
```

To jest prostsze i działa od razu. AI Gateway możesz dodać później gdy będziesz chciał analytics.

## Konfiguracja obecna
✅ Workers AI binding dodany
✅ Model: `@cf/meta/llama-3.1-8b-instruct`
✅ System prompt: Asystent jubilerski EPIR
✅ Max tokens: 512
✅ Temperature: 0.7

## Next steps (po deployment):
1. Deploy worker: `wrangler deploy`
2. Test non-streaming: POST do `/chat` z `{"message":"test","stream":false}`
3. Test streaming: POST do `/chat` z `{"message":"test","stream":true}`
4. (Opcjonalne) Dodaj AI Gateway dla analytics

## Rate Limits Workers AI (Free tier):
- 10,000 Neurons/day (1 neuron ≈ 1 token)
- Llama 3.1 8b: ~100-500 neurons per request
- Wystarczy na ~20-100 konwersacji dziennie

Jeśli przekroczysz limit, możesz:
1. Upgrade do płatnego planu Workers AI
2. Użyć zewnętrznego API (OpenAI, Anthropic) przez AI Gateway
3. Dodać caching w AI Gateway

/**
 * Dev test: podpisz query App Proxy jak Shopify i wyślij POST do /apps/assistant/chat z poprawnym HMAC.
 *
 * Jak użyć:
 * 1) Uruchom backend: `npm run dev` w katalogu worker (wrangler dev na :8787)
 * 2) Ustaw sekret w środowisku shell:
 *    - macOS/Linux:  export SHOPIFY_APP_SECRET="twój_app_secret"
 *    - Windows (PowerShell):  $env:SHOPIFY_APP_SECRET="twój_app_secret"
 * 3) Uruchom skrypt:
 *    - npx tsx worker/scripts/hmac_proxy_test.ts
 *
 * Zmienne środowiskowe (opcjonalne):
 * - BASE_URL (default: http://127.0.0.1:8787)
 * - PATH (default: /apps/assistant/chat)
 * - SHOP (default: epir-art-silver-jewellery.myshopify.com)
 */

type ParamMap = Record<string, string[] | string | undefined>;

function toArray(v: string[] | string | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function canonicalizeForSignature(params: ParamMap): string {
  // Wg spec Shopify App Proxy:
  // - klucze i wartości są traktowane po DEKODOWANIU URL (tu już mamy wartości zdefiniowane bez encodowania)
  // - usuń 'signature'
  // - multi-values łączymy przecinkiem, bez spacji
  // - sortujemy klucze alfabetycznie
  // - łączymy pary key=value bez separatorów pomiędzy parami
  const map = new Map<string, string[]>();
  for (const [k, v] of Object.entries(params)) {
    if (!k || k.toLowerCase() === 'signature' || v === undefined) continue;
    const arr = toArray(v);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(...arr);
  }
  const keys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
  const parts: string[] = [];
  for (const k of keys) {
    const joined = map.get(k)!.join(',');
    parts.push(`${k}=${joined}`);
  }
  return parts.join('');
}

async function hmacSha256Hex(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

function buildQueryString(params: ParamMap): string {
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    const vals = toArray(v);
    for (const val of vals) {
      pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(val)}`);
    }
  }
  return pairs.join('&');
}

async function main() {
  const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8787';
  const ENDPOINT_PATH = process.env.ENDPOINT_PATH || '/apps/assistant/chat';
  const SHOP = process.env.SHOP || 'epir-art-silver-jewellery.myshopify.com';
  const APP_SECRET = process.env.SHOPIFY_APP_SECRET;

  if (!APP_SECRET) {
    console.error('Brak SHOPIFY_APP_SECRET w env. Ustaw: export SHOPIFY_APP_SECRET="..."');
    process.exit(1);
  }

  // Przykładowe parametry jak z App Proxy (możesz dodać swoje)
  const params: ParamMap = {
    shop: SHOP,
    timestamp: String(Math.floor(Date.now() / 1000)),
    logged_in_customer_id: '', // pusta wartość też jest brana pod uwagę
    extra: ['1', '2'], // test multi-value -> "extra=1,2"
  };

  // 1) Zbuduj kanoniczny string wg Shopify i policz HMAC (hex)
  const canonical = canonicalizeForSignature(params);
  const signature = await hmacSha256Hex(APP_SECRET, canonical);

  // 2) Zbuduj realny query string do URL (z podpisem jako 'signature')
  const qs = buildQueryString({ ...params, signature });

  const url = `${BASE_URL}${ENDPOINT_PATH}?${qs}`;
  console.log('POST', url);

  const body = { message: 'Test HMAC – dzień dobry z dev skryptu!' };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Uwaga: nie wysyłamy X-Shopify-Hmac-Sha256 – chcemy przetestować ścieżkę z query signature
    body: JSON.stringify(body),
  });

  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Body:', text);

  if (res.status !== 200) {
    console.error('Błąd żądania – sprawdź HMAC, query i backend (wrangler dev).');
    process.exit(2);
  }
}

main().catch((e) => {
  console.error('Skrypt zakończył się błędem:', e);
  process.exit(3);
});
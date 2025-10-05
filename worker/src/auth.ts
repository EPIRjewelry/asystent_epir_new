export function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return new Uint8Array();
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return out;
}

export async function verifyAppProxyHmac(request: Request, secret: string): Promise<boolean> {
  if (!secret) return false;

  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);
  const received = params.get('signature');
  if (!received) return false;

  // 1) Usuń signature
  params.delete('signature');

  // 2) Zbuduj wiadomość: posortowane alfabetycznie klucze; key=value; bez separatorów
  const keys = Array.from(new Set(Array.from(params.keys()))).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const values = params.getAll(k);
    const joined = values.length > 1 ? values.join(',') : (values[0] ?? '');
    parts.push(`${k}=${joined}`);
  }
  let message = parts.join(''); // brak & i innych separatorów

  // 3) Dodaj body (jeśli istnieje) do wiadomości
  try {
    const clonedRequest = request.clone();
    const body = await clonedRequest.text();
    if (body) {
      message += body;
    }
  } catch (e) {
    // Jeśli nie można odczytać body, kontynuuj z samymi query params
    console.warn('Could not read request body for HMAC verification:', e);
  }

  // 4) Weryfikacja stałoczasowa via WebCrypto
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const sig = hexToBytes(received);
  if (sig.length === 0) return false;

  return crypto.subtle.verify('HMAC', cryptoKey, sig, enc.encode(message));
}

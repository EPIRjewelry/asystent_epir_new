// Przykład: worker/src/security.ts
// Funkcja weryfikująca HMAC przychodzący przez App Proxy.
// Uwaga: dostosuj nazwy headerów/parametrów do finalnej specyfikacji projektu.
// Nie umieszczaj tajnych kluczy w kodzie — używaj ENV (wrangler secrets).

export async function verifyAppProxyHmac(request: Request, secret: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    // 1) Pobierz podpis (header lub query param)
    const headerSig = request.headers.get('x-shopify-hmac-sha256') ?? undefined;
    const url = new URL(request.url);
    const querySig = url.searchParams.get('signature') ?? url.searchParams.get('hmac') ?? undefined;
    const signatureBase64 = headerSig ?? querySig;
    if (!signatureBase64) return { ok: false, reason: 'missing_signature' };

    // 2) Sprawdź timestamp (opcjonalnie) - chroni przed replay
    const tsParam = url.searchParams.get('timestamp');
    if (tsParam) {
      const ts = Number(tsParam);
      if (Number.isNaN(ts)) return { ok: false, reason: 'invalid_timestamp' };
      const now = Date.now();
      const delta = Math.abs(now - ts * 1000);
      const MAX_MS = 5 * 60 * 1000; // 5 minut
      if (delta > MAX_MS) return { ok: false, reason: 'timestamp_out_of_range' };
    }

    // 3) Zbuduj canonical string z paramów (usuń signature/hmac)
    const params = [...url.searchParams.entries()]
      .filter(([k]) => k !== 'signature' && k !== 'hmac')
      .sort((a, b) => a[0].localeCompare(b[0]));
    // PER SPEC: łączymy pary jako "key=value" bez dodatkowych separatorów (doprecyzować w specyfikacji)
    const canonicalParams = params.map(([k, v]) => `${k}=${v}`).join(''); // <- "bez &" zgodnie z PR
    const encoder = new TextEncoder();
    const paramsBytes = encoder.encode(canonicalParams);

    // 4) Pobierz raw body jako ArrayBuffer (nie parsuj jeszcze)
    const cloned = request.clone();
    const bodyBuffer = await cloned.arrayBuffer();
    const bodyBytes = new Uint8Array(bodyBuffer);

    // 5) Połącz params + body (paramsBytes potem bodyBytes)
    const combined = new Uint8Array(paramsBytes.length + bodyBytes.length);
    combined.set(paramsBytes, 0);
    combined.set(bodyBytes, paramsBytes.length);

    // 6) Przygotuj klucz i podpis
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // hex -> Uint8Array
    if (!/^[0-9a-fA-F]+$/.test(signatureBase64) || signatureBase64.length % 2 !== 0) {
      return { ok: false, reason: 'invalid_hex_signature' };
    }
    const sigRaw = new Uint8Array(signatureBase64.length / 2);
    for (let i = 0; i < signatureBase64.length; i += 2) {
      sigRaw[i / 2] = parseInt(signatureBase64.substr(i, 2), 16);
    }

    // 7) Verify HMAC (crypto.subtle.verify zwraca boolean)
    const verified = await crypto.subtle.verify('HMAC', key, sigRaw.buffer, combined.buffer);
    if (!verified) return { ok: false, reason: 'hmac_mismatch' };

    // 8) (Opcjonalnie) Replay protection: odnotuj signature/timestamp w Durable Object (nie tutaj).
    return { ok: true };
  } catch (err) {
    // Nie logujemy secretów ani raw signature
    console.error('verifyAppProxyHmac error', (err as Error).message);
    return { ok: false, reason: 'internal_error' };
  }
}

/**
 * Funkcja do sprawdzania replay attack poprzez Durable Object.
 * Wywołuje DO SessionDO z endpointem '/replay-check'.
 * @param sessionDo DurableObjectStub dla sesji
 * @param signature Podpis do sprawdzenia
 * @param timestamp Timestamp z requestu
 * @returns Promise<{ok: boolean, reason?: string}>
 */
export async function replayCheck(
  sessionDo: DurableObjectStub,
  signature: string,
  timestamp: string
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const response = await sessionDo.fetch('/replay-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature, timestamp }),
    });
    if (!response.ok) {
      return { ok: false, reason: `DO error: ${response.status}` };
    }
    const data = await response.json() as { used?: boolean; error?: string };
    if (data.error) return { ok: false, reason: data.error };
    if (data.used) return { ok: false, reason: 'signature_already_used' };
    return { ok: true };
  } catch (err) {
    console.error('replayCheck error', (err as Error).message);
    return { ok: false, reason: 'internal_error' };
  }
}
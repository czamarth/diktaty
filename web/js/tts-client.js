// Klient lokální TTS služby. Jediný cíl je stejný původ (127.0.0.1); žádná vzdálená služba.

export class TtsError extends Error {
  constructor(code, message, hint = null, status = 0) {
    super(message);
    this.code = code;
    this.hint = hint;
    this.status = status;
  }
}

async function readError(res) {
  try {
    const body = await res.json();
    const e = body?.error ?? {};
    return new TtsError(e.code ?? 'tts_error', e.message ?? `Služba odpověděla chybou ${res.status}.`, e.hint ?? null, res.status);
  } catch {
    return new TtsError('tts_error', `Služba odpověděla chybou ${res.status}.`, null, res.status);
  }
}

export async function getHealth(fetchFn = fetch) {
  try {
    const res = await fetchFn('/api/health', { cache: 'no-store' });
    if (!res.ok) throw await readError(res);
    return await res.json();
  } catch (e) {
    if (e instanceof TtsError) throw e;
    throw new TtsError('service_unreachable', 'Lokální služba pro hlas neodpovídá.', 'Spusťte ji příkazem „python3 server/diktaty_server.py“ a obnovte stránku.');
  }
}

// Vrací funkci pro přehrávač. Text se posílá společně s identitou a kontrolním součtem
// diktátu, aby služba mohla odmítnout nesoulad verzí.
export function makeFetchAudio({ dictation, readPunctuation = false }, fetchFn = fetch) {
  return async (request, signal) => {
    const body = {
      purpose: request.kind,
      length_scale: request.rate,
      read_punctuation: readPunctuation && request.kind !== 'check',
      segment: { id: request.id, text: request.text },
    };
    if (request.kind !== 'check') {
      body.dictation = { id: dictation.id, version: dictation.version, content_sha256: dictation.content_sha256, text: dictation.text };
    }
    let res;
    try {
      res = await fetchFn('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      throw new TtsError('service_unreachable', 'Lokální služba pro hlas neodpovídá.', 'Zkontrolujte, že běží „python3 server/diktaty_server.py“.');
    }
    if (!res.ok) throw await readError(res);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return { url, release: () => URL.revokeObjectURL(url) };
  };
}

// Přehrávač diktátu po větách (nezávislý na DOM, aby šel testovat).
//
// Záruky:
//  - existuje jediný audio element, takže se nikdy nepřehrávají dvě nahrávky najednou;
//  - každý příkaz zvýší „token“; asynchronní krok (stažení zvuku, play()) po svém dokončení
//    ověří, že token platí, jinak výsledek zahodí – pozdní odpověď staré věty nic nespustí;
//  - pozastavení, ukončení a změna diktátu zastaví skutečně hrající zvuk i rozpracované stahování;
//  - po přehrání věty se čeká na tlačítko „Další věta“ (automatický postup je jen volitelné
//    nastavení dospělého a je nezávislé na tempu čtení).

export const NORMAL_RATE = 1.0;

export class DictationPlayer {
  #deps;
  #audio;
  #segments = [];
  #token = 0;
  #audioToken = -1;
  #abort = null;
  #handle = null;
  #timer = null;
  #afterFull = 'idle';
  #held = null; // { request, hasAudio } při pozastavení
  #state;
  #opts = { lengthScale: NORMAL_RATE, autoAdvanceMs: 0 };
  #currentRequest = null;

  constructor(deps, onState = () => {}) {
    this.#deps = deps;
    this.#audio = deps.createAudio();
    this.#audio.addEventListener('ended', () => this.#onEnded());
    this.#audio.addEventListener('error', () => this.#onAudioError());
    this.onState = onState;
    this.#state = this.#snapshot({ phase: 'idle', mode: 'segment', index: 0 });
  }

  get state() { return this.#state; }

  setOptions(opts) {
    this.#opts = { ...this.#opts, ...opts };
  }

  // Nový diktát: zruší vše rozpracované. Starý požadavek, který dorazí později, se nepřehraje.
  load(segments) {
    this.#halt();
    this.#segments = segments.map((s) => ({ id: s.id, text: s.text }));
    this.#held = null;
    this.#set({ phase: 'idle', mode: 'segment', index: 0, error: null });
  }

  // --- příkazy ---------------------------------------------------------------

  play() {
    const { phase, mode } = this.#state;
    if (phase === 'loading' || phase === 'playing') return; // opakované kliknutí nic nespouští
    if (phase === 'paused' && this.#held) return this.#resume();
    if (phase === 'finished') return;
    if (mode !== 'segment') this.#set({ mode: 'segment' });
    return this.#start(this.#segmentRequest(this.#state.index));
  }

  repeat() {
    if (this.#state.phase === 'finished' || this.#segments.length === 0) return;
    this.#held = null;
    return this.#start(this.#segmentRequest(this.#state.index));
  }

  // Přeskočit větu, kterou dítě ještě neslyšelo, nejde: z výchozího stavu a po chybě je třeba větu přehrát.
  next() {
    const { index, phase } = this.#state;
    if (!['waiting', 'playing', 'paused', 'loading'].includes(phase) || index >= this.#segments.length - 1) return;
    this.#held = null;
    return this.#start(this.#segmentRequest(index + 1), 'segment', { index: index + 1 });
  }

  previous() {
    const { index, phase } = this.#state;
    if (phase === 'finished' || index <= 0) return;
    this.#held = null;
    return this.#start(this.#segmentRequest(index - 1), 'segment', { index: index - 1 });
  }

  pause() {
    const { phase } = this.#state;
    if (phase === 'playing') {
      this.#audio.pause();
      this.#cancelTimer();
      this.#held = { request: this.#currentRequest, hasAudio: true };
      this.#set({ phase: 'paused' });
    } else if (phase === 'loading') {
      const request = this.#currentRequest;
      this.#halt();
      this.#held = { request, hasAudio: false };
      this.#set({ phase: 'paused' });
    } else if (phase === 'waiting') {
      this.#cancelTimer();
      this.#set({ countdown: null });
    }
  }

  // Celý text přirozeným tempem (úvod nebo kontrola na konci).
  playFull(fullText) {
    const { phase } = this.#state;
    this.#afterFull = phase === 'finished' ? 'finished' : phase === 'idle' ? 'idle' : 'waiting';
    this.#held = null;
    return this.#start({ kind: 'full', id: 'full', text: fullText, rate: NORMAL_RATE }, 'full');
  }

  soundCheck(text) {
    this.#afterFull = 'idle';
    this.#held = null;
    return this.#start({ kind: 'check', id: 'sound-check', text, rate: NORMAL_RATE }, 'check');
  }

  finish() {
    this.#halt();
    this.#held = null;
    this.#set({ phase: 'finished', mode: 'segment', countdown: null });
  }

  // Ukončení: zastaví zvuk a nic dalšího nenaplánuje.
  stop() {
    this.#halt();
    this.#held = null;
    this.#set({ phase: 'idle', mode: 'segment', index: 0, error: null, countdown: null });
  }

  // --- vnitřek ---------------------------------------------------------------

  #segmentRequest(index) {
    const seg = this.#segments[index];
    return { kind: 'segment', id: seg.id, text: seg.text, index, rate: this.#opts.lengthScale };
  }

  #snapshot(patch) {
    const merged = { error: null, countdown: null, ...this.#state, ...patch };
    const count = this.#segments.length;
    return Object.freeze({
      ...merged,
      count,
      label: count ? `Věta ${merged.index + 1} ze ${count}` : '',
      isLast: merged.index >= count - 1,
    });
  }

  #set(patch) {
    this.#state = this.#snapshot(patch);
    this.onState(this.#state);
  }

  // Zastaví zvuk, zruší stahování i časovač a zneplatní všechny rozpracované kroky.
  #halt() {
    this.#token++;
    this.#cancelTimer();
    this.#abort?.abort();
    this.#abort = null;
    this.#audio.pause();
    this.#releaseAudio();
    this.#currentRequest = null;
  }

  #releaseAudio() {
    this.#deps.resetAudio(this.#audio);
    this.#handle?.release?.();
    this.#handle = null;
    this.#audioToken = -1;
  }

  #cancelTimer() {
    if (this.#timer !== null) {
      this.#deps.scheduler.clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  async #start(request, mode = 'segment', patch = {}) {
    this.#halt();
    const token = this.#token;
    this.#currentRequest = request;
    const ac = new AbortController();
    this.#abort = ac;
    this.#set({ phase: 'loading', mode, error: null, countdown: null, ...patch });

    let handle;
    try {
      handle = await this.#deps.fetchAudio(request, ac.signal);
    } catch (e) {
      if (token !== this.#token) return; // zrušeno, o chybě už nikdo nestojí
      this.#fail(e);
      return;
    }
    if (token !== this.#token) {
      handle?.release?.(); // pozdní odpověď staré žádosti: nic se nepřehraje
      return;
    }
    this.#handle = handle;
    this.#audio.src = handle.url;
    try {
      await this.#audio.play();
    } catch (e) {
      if (token !== this.#token) return;
      this.#fail(e);
      return;
    }
    if (token !== this.#token) {
      this.#audio.pause();
      return;
    }
    this.#audioToken = token;
    this.#set({ phase: 'playing' });
  }

  async #resume() {
    const held = this.#held;
    if (!held.hasAudio) {
      this.#held = null;
      return this.#start(held.request, held.request.kind === 'segment' ? 'segment' : held.request.kind);
    }
    this.#held = null;
    const token = ++this.#token;
    this.#set({ phase: 'loading' });
    try {
      await this.#audio.play();
    } catch (e) {
      if (token !== this.#token) return;
      this.#fail(e);
      return;
    }
    if (token !== this.#token) {
      this.#audio.pause();
      return;
    }
    this.#audioToken = token;
    this.#set({ phase: 'playing' });
  }

  #fail(e) {
    this.#audio.pause();
    this.#releaseAudio();
    this.#set({
      phase: 'error',
      error: { code: e?.code ?? 'playback_failed', message: e?.message ?? 'Zvuk se nepodařilo přehrát.', hint: e?.hint ?? null },
    });
  }

  #onAudioError() {
    if (this.#audioToken !== this.#token || this.#state.phase !== 'playing') return;
    this.#fail({ code: 'audio_decode', message: 'Prohlížeč nedokázal zvuk přehrát.', hint: 'Zkuste větu zopakovat.' });
  }

  #onEnded() {
    if (this.#audioToken !== this.#token || this.#state.phase !== 'playing') return; // zastaralá událost
    const { mode } = this.#state;
    this.#audioToken = -1;
    if (mode === 'segment') {
      this.#set({ phase: 'waiting' });
      this.#armAutoAdvance();
    } else {
      this.#set({ phase: this.#afterFull, mode: mode === 'check' ? 'check-done' : 'segment' });
    }
  }

  #armAutoAdvance() {
    const ms = this.#opts.autoAdvanceMs;
    if (!(ms > 0) || this.#state.isLast) return;
    const token = this.#token;
    let remaining = Math.ceil(ms / 1000);
    const tick = () => {
      if (token !== this.#token || this.#state.phase !== 'waiting') return;
      if (remaining <= 0) {
        this.#timer = null;
        this.next();
        return;
      }
      this.#set({ countdown: remaining });
      remaining -= 1;
      this.#timer = this.#deps.scheduler.setTimeout(tick, 1000);
    };
    tick();
  }
}

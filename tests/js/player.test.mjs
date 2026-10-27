import test from 'node:test';
import assert from 'node:assert/strict';
import { DictationPlayer } from '../../web/js/player.js';
import { TtsError } from '../../web/js/tts-client.js';

// --- testovací dvojníci (jen pro logiku přehrávače, žádný skutečný zvuk) -------

class FakeAudio {
  constructor() { this.src = ''; this.paused = true; this.playCalls = []; this.listeners = {}; this.maxConcurrent = 0; }
  addEventListener(n, f) { (this.listeners[n] ??= []).push(f); }
  removeAttribute() { this.src = ''; }
  load() {}
  async play() { this.paused = false; this.playCalls.push(this.src); }
  pause() { this.paused = true; }
  fire(n) { (this.listeners[n] ?? []).forEach((f) => f()); }
  // dohrálo: skutečný prohlížeč při 'ended' zvuk zastaví
  finish() { this.paused = true; this.fire('ended'); }
}

function setup({ segments = ['Věta jedna.', 'Věta dvě.', 'Věta tři.'], autoAdvanceMs = 0 } = {}) {
  const audios = [];
  const requests = []; // { request, signal, resolve, reject, released }
  const timers = new Map();
  let timerId = 0;
  const player = new DictationPlayer({
    createAudio: () => { const a = new FakeAudio(); audios.push(a); return a; },
    resetAudio: (a) => { a.removeAttribute('src'); a.load(); },
    fetchAudio: (request, signal) => new Promise((resolve, reject) => {
      const rec = { request, signal, released: false };
      const n = requests.length;
      rec.resolve = () => resolve({ url: `blob:${request.id}#${n}`, release: () => { rec.released = true; } });
      rec.reject = reject;
      requests.push(rec);
    }),
    scheduler: {
      setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
      clearTimeout: (id) => timers.delete(id),
    },
  });
  player.setOptions({ autoAdvanceMs });
  player.load(segments.map((text, i) => ({ id: `T-S0${i + 1}`, text })));
  const tick = () => { const [id, t] = [...timers.entries()][0]; timers.delete(id); t.fn(); };
  const flush = () => new Promise((r) => setImmediate(r));
  return { player, audio: audios[0], audios, requests, timers, tick, flush };
}

// Dokončí první nevyřízený požadavek a počká, až přehrávač dojde do stavu playing.
async function answer(ctx, i = ctx.requests.length - 1) {
  ctx.requests[i].resolve();
  await ctx.flush();
}

test('použije jediný audio element; po přehrání věty se čeká na tlačítko Další věta', async () => {
  const c = setup();
  assert.equal(c.audios.length, 1);
  assert.equal(c.player.state.phase, 'idle');
  assert.equal(c.player.state.label, 'Věta 1 ze 3');
  c.player.play();
  assert.equal(c.player.state.phase, 'loading');
  await answer(c);
  assert.equal(c.player.state.phase, 'playing');
  assert.equal(c.audio.paused, false);
  c.audio.finish();
  assert.equal(c.player.state.phase, 'waiting');
  assert.equal(c.requests.length, 1, 'samo od sebe se další věta nespustí');
  c.player.next();
  await answer(c);
  assert.equal(c.player.state.label, 'Věta 2 ze 3');
  assert.equal(c.player.state.phase, 'playing');
  assert.equal(c.requests[1].request.text, 'Věta dvě.');
});

test('opakované kliknutí na Přehrát za přehrávání nespustí druhou nahrávku', async () => {
  const c = setup();
  c.player.play();
  c.player.play();
  c.player.play();
  assert.equal(c.requests.length, 1);
  await answer(c);
  c.player.play();
  assert.equal(c.requests.length, 1);
  assert.equal(c.audio.playCalls.length, 1);
});

test('rychlé opakované Zopakovat: přehraje se jen poslední, starší stahování se zruší a nic nepřehraje', async () => {
  const c = setup();
  c.player.play();
  c.player.repeat();
  c.player.repeat();
  assert.equal(c.requests.length, 3);
  assert.deepEqual(c.requests.map((r) => r.signal.aborted), [true, true, false]);
  // pozdní dokončení starších požadavků v obráceném pořadí
  c.requests[1].resolve();
  c.requests[0].resolve();
  await c.flush();
  assert.equal(c.audio.playCalls.length, 0, 'zastaralá odpověď nic nespustila');
  assert.deepEqual([c.requests[0].released, c.requests[1].released], [true, true], 'zastaralé zdroje se uvolnily');
  await answer(c, 2);
  assert.equal(c.audio.playCalls.length, 1);
  assert.match(c.audio.playCalls[0], /#2$/);
  assert.equal(c.player.state.phase, 'playing');
});

test('Další věta za hrající věty nahradí zvuk (nikdy nehrají dvě)', async () => {
  const c = setup();
  c.player.play();
  await answer(c);
  c.player.next();
  assert.equal(c.audio.paused, true, 'původní zvuk je zastaven ještě před načtením nové věty');
  await answer(c);
  assert.equal(c.audio.playCalls.length, 2);
  assert.equal(c.audio.paused, false);
  assert.equal(c.audios.length, 1);
});

test('Pozastavit zastaví skutečně hrající zvuk; zpožděná událost ended stav nezmění', async () => {
  const c = setup();
  c.player.play();
  await answer(c);
  c.player.pause();
  assert.equal(c.audio.paused, true);
  assert.equal(c.player.state.phase, 'paused');
  c.audio.fire('ended');
  assert.equal(c.player.state.phase, 'paused', 'pozastavená věta se nepovažuje za dohranou');
  assert.equal(c.timers.size, 0);
});

test('událost ended po pauze, která nepatří ke hrajícímu zvuku, je ignorována', async () => {
  const c = setup();
  c.player.play();
  await answer(c);
  c.player.pause();
  // simulace zastaralé události z minulého zvuku: token už neodpovídá
  c.player.repeat();
  c.audio.fire('ended'); // přišla dřív, než se nové stahování vyřídilo
  assert.equal(c.player.state.phase, 'loading');
  await answer(c);
  assert.equal(c.player.state.phase, 'playing');
});

test('pozastavení a pokračování', async () => {
  const c = setup();
  c.player.play();
  await answer(c);
  c.player.pause();
  assert.equal(c.audio.paused, true);
  c.player.play();
  await c.flush();
  assert.equal(c.audio.paused, false);
  assert.equal(c.player.state.phase, 'playing');
  assert.equal(c.requests.length, 1, 'pokračování nestahuje zvuk znovu');
  c.audio.finish();
  assert.equal(c.player.state.phase, 'waiting');
});

test('Pozastavit během načítání: po dorazení zvuku se nic nespustí; Přehrát načte znovu', async () => {
  const c = setup();
  c.player.play();
  c.player.pause();
  assert.equal(c.player.state.phase, 'paused');
  assert.equal(c.requests[0].signal.aborted, true);
  c.requests[0].resolve();
  await c.flush();
  assert.equal(c.audio.playCalls.length, 0);
  assert.equal(c.requests[0].released, true);
  c.player.play();
  assert.equal(c.requests.length, 2);
  await answer(c);
  assert.equal(c.audio.playCalls.length, 1);
});

test('změna diktátu za letu: pozdní odpověď staré věty obnovu přehrávání nevyvolá', async () => {
  const c = setup();
  c.player.play();
  c.player.load([{ id: 'X-S01', text: 'Jiný text.' }, { id: 'X-S02', text: 'Druhá.' }, { id: 'X-S03', text: 'Třetí.' }]);
  c.requests[0].resolve();
  await c.flush();
  assert.equal(c.audio.playCalls.length, 0);
  assert.equal(c.player.state.phase, 'idle');
  assert.equal(c.player.state.index, 0);
  assert.equal(c.requests[0].released, true);
});

test('změna diktátu za hraní zastaví zvuk', async () => {
  const c = setup();
  c.player.play();
  await answer(c);
  assert.equal(c.audio.paused, false);
  c.player.load([{ id: 'X-S01', text: 'Jiný text.' }, { id: 'X-S02', text: 'Druhá.' }, { id: 'X-S03', text: 'Třetí.' }]);
  assert.equal(c.audio.paused, true);
  c.audio.fire('ended');
  assert.equal(c.player.state.phase, 'idle');
});

test('Ukončit zastaví zvuk, zruší stahování a nechá čistý stav', async () => {
  const c = setup();
  c.player.play();
  await answer(c);
  c.player.next();
  c.player.stop();
  assert.equal(c.audio.paused, true);
  assert.equal(c.requests[1].signal.aborted, true);
  c.requests[1].resolve();
  await c.flush();
  assert.equal(c.audio.playCalls.length, 1, 'po ukončení se nic dalšího nespustí');
  assert.equal(c.player.state.phase, 'idle');
  assert.equal(c.player.state.index, 0);
});

test('Předchozí věta; z výchozího stavu a po chybě nelze větu přeskočit', async () => {
  const c = setup();
  c.player.next();
  assert.equal(c.requests.length, 0, 'z výchozího stavu Další věta nic nedělá');
  c.player.play();
  await answer(c);
  c.audio.finish();
  c.player.next();
  await answer(c);
  c.player.previous();
  await answer(c);
  assert.equal(c.player.state.label, 'Věta 1 ze 3');
  assert.equal(c.requests.at(-1).request.text, 'Věta jedna.');
  c.player.previous();
  assert.equal(c.requests.length, 3, 'před první větou už není kam jít');
});

test('na poslední větě Další věta nic neudělá; dokončení je samostatný krok', async () => {
  const c = setup({ segments: ['A.', 'B.', 'C.'] });
  c.player.play(); await answer(c); c.audio.finish();
  c.player.next(); await answer(c); c.audio.finish();
  c.player.next(); await answer(c); c.audio.finish();
  assert.equal(c.player.state.isLast, true);
  c.player.next();
  assert.equal(c.requests.length, 3);
  c.player.finish();
  assert.equal(c.player.state.phase, 'finished');
  c.player.play();
  assert.equal(c.requests.length, 3, 'po dokončení se věty samy nepřehrávají');
});

test('chyba služby se ohlásí srozumitelně a Přehrát zkusí totéž znovu', async () => {
  const c = setup();
  c.player.play();
  c.requests[0].reject(new TtsError('model_missing', 'Chybí model hlasu.', 'Spusťte fetch_model.py.', 503));
  await c.flush();
  assert.equal(c.player.state.phase, 'error');
  assert.equal(c.player.state.error.code, 'model_missing');
  assert.equal(c.player.state.error.hint, 'Spusťte fetch_model.py.');
  c.player.play();
  assert.equal(c.requests.length, 2);
  await answer(c);
  assert.equal(c.player.state.phase, 'playing');
  assert.equal(c.player.state.error, null);
});

test('celý text: přirozené tempo bez ohledu na pomalé nastavení, po dohrání návrat do původního stavu', async () => {
  const c = setup();
  c.player.setOptions({ lengthScale: 1.6 });
  c.player.playFull('Věta jedna. Věta dvě. Věta tři.');
  await answer(c);
  assert.equal(c.requests[0].request.rate, 1.0);
  assert.equal(c.requests[0].request.kind, 'full');
  c.audio.finish();
  assert.equal(c.player.state.phase, 'idle');
  assert.equal(c.player.state.index, 0);
  c.player.play();
  assert.equal(c.requests[1].request.rate, 1.6, 'tempo diktování je samostatné nastavení');
});

test('ověření zvuku na začátku nezmění stav diktátu', async () => {
  const c = setup();
  c.player.soundCheck('Zvuk funguje.');
  await answer(c);
  assert.equal(c.requests[0].request.kind, 'check');
  c.audio.finish();
  assert.equal(c.player.state.mode, 'check-done');
  assert.equal(c.player.state.phase, 'idle');
  assert.equal(c.player.state.index, 0);
});

test('automatický postup (volba dospělého) je nezávislý na tempu a Pozastavit jej zastaví', async () => {
  const c = setup({ autoAdvanceMs: 3000 });
  c.player.setOptions({ lengthScale: 1.3 });
  c.player.play(); await answer(c); c.audio.finish();
  assert.equal(c.player.state.phase, 'waiting');
  assert.equal(c.player.state.countdown, 3);
  c.tick();
  assert.equal(c.player.state.countdown, 2);
  c.player.pause();
  assert.equal(c.timers.size, 0, 'časovač je zrušen');
  assert.equal(c.player.state.countdown, null);
  assert.equal(c.requests.length, 1);

  const d = setup({ autoAdvanceMs: 2000 });
  d.player.play(); await answer(d); d.audio.finish();
  d.tick(); d.tick();
  await d.flush();
  assert.equal(d.requests.length, 2, 'po uplynutí času se postoupí na další větu');
  assert.equal(d.player.state.index, 1);
});

test('výchozí nastavení: žádný časový limit – bez zásahu dospělého se po větě jen čeká', async () => {
  const c = setup();
  c.player.play(); await answer(c); c.audio.finish();
  assert.equal(c.timers.size, 0);
  assert.equal(c.player.state.countdown, null);
});

test('zvuk, který přestal hrát během ended z minulého kola, nespustí časovač ani stav waiting', async () => {
  const c = setup({ autoAdvanceMs: 5000 });
  c.player.play(); await answer(c);
  c.player.stop();
  c.audio.fire('ended');
  assert.equal(c.player.state.phase, 'idle');
  assert.equal(c.timers.size, 0);
});

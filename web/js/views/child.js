// Dětská obrazovka: ověření zvuku → celý text → diktování po větách.
// Správné znění se nezobrazuje (jen výslovně povolená předvyplněná místa podporované varianty).

import { clear, announce, h } from '../dom.js';
import { DictationPlayer } from '../player.js';
import { TEMPOS, store, update } from '../store.js';
import { makeFetchAudio } from '../tts-client.js';

const STATUS = {
  idle: 'Stiskni Přehrát.',
  loading: 'Načítám větu…',
  playing: 'Poslouchej.',
  paused: 'Pozastaveno. Stiskni Přehrát, věta bude pokračovat.',
};

export function renderChild(main, { id }) {
  const item = store.catalog.usable.find((i) => i.dictation.id === id);
  const run = store.run;
  if (!item || !run || run.dictationId !== id || store.confirmedDictationId !== id || !store.profile.confirmed || !store.health?.ready) {
    // Dětská obrazovka se nikdy neotevře bez potvrzení dospělého.
    location.replace(`#/prepare/${encodeURIComponent(id)}`);
    return () => {};
  }
  const d = item.dictation;
  const prefills = run.prefills ?? [];
  let step = 'check';
  let alive = false; // zpětné volání přehrávače se aktivuje až po inicializaci obrazovky
  let lastPhase = null;

  const player = new DictationPlayer({
    createAudio: () => new Audio(),
    resetAudio: (a) => { a.removeAttribute('src'); a.load(); },
    fetchAudio: makeFetchAudio({ dictation: d, readPunctuation: store.settings.readPunctuation }),
    scheduler: { setTimeout: (f, ms) => window.setTimeout(f, ms), clearTimeout: (t) => window.clearTimeout(t) },
  }, () => { if (alive) draw(); });
  player.setOptions({ lengthScale: TEMPOS[store.settings.tempo].lengthScale, autoAdvanceMs: store.settings.autoAdvanceSec * 1000 });
  player.load(d.tts_segments.map((s) => ({ id: s.id, text: s.text })));

  const onHide = () => player.stop();
  window.addEventListener('pagehide', onHide);

  const btn = (label, onClick, { enabled = true, kind = '', hint = null } = {}) => h('button', {
    type: 'button', class: `btn big ${kind}`, 'aria-disabled': enabled ? 'false' : 'true', 'data-action': label,
    onclick: () => { if (enabled) onClick(); },
  }, label, hint ? h('small', {}, hint) : null);

  function checkStep(s) {
    const heard = s.mode === 'check-done';
    return [
      h('h1', {}, 'Nejdřív vyzkoušíme zvuk'),
      h('p', { class: 'lead' }, 'Zapni zvuk na počítači a stiskni tlačítko. Uslyšíš krátkou větu.'),
      s.phase === 'error' ? errorBox(s) : null,
      h('p', { class: 'status', role: 'status' }, s.phase === 'loading' ? 'Načítám…' : s.phase === 'playing' ? 'Poslouchej.' : heard ? 'Slyšel(a) jsi hlas?' : ''),
      h('div', { class: 'row' },
        btn(heard ? 'Přehrát zvuk znovu' : 'Vyzkoušet zvuk', () => player.soundCheck(store.health.sound_check_text), { enabled: s.phase !== 'loading' && s.phase !== 'playing', kind: 'primary' }),
        heard ? btn('Ano, slyším', () => { step = 'intro'; player.stop(); draw(); }, { kind: 'primary' }) : null,
        btn('Zpět k dospělému', leave)),
    ];
  }

  function introStep(s) {
    return [
      h('h1', {}, 'Poslechni si celý text'),
      h('p', { class: 'lead' }, 'Nejdřív si celý text poslechneš jednou v klidu. Potom budeš psát větu po větě na papír.'),
      s.phase === 'error' ? errorBox(s) : null,
      h('p', { class: 'status', role: 'status' }, s.phase === 'loading' ? 'Načítám…' : s.phase === 'playing' ? 'Poslouchej celý text.' : ''),
      h('div', { class: 'row' },
        btn('Přehrát celý text', () => player.playFull(d.text), { enabled: s.phase !== 'loading' && s.phase !== 'playing' }),
        btn('Začít diktovat', () => { step = 'dictate'; player.stop(); draw(); }, { kind: 'primary' }),
        btn('Ukončit', leave)),
    ];
  }

  function errorBox(s) {
    return h('div', { class: 'child-error', role: 'alert' }, h('strong', {}, 'Něco se nepovedlo. '), s.error.message, ' ', s.error.hint ?? '',
      h('p', {}, 'Zavolej dospělého. Až bude hotovo, stiskni Přehrát a zkusíme to znovu.'));
  }

  function dictateStep(s) {
    const busy = s.phase === 'loading' || s.phase === 'playing';
    const waiting = s.phase === 'waiting';
    const pre = prefills.filter((p) => p.sentence_index === s.index);
    let status = STATUS[s.phase] ?? '';
    if (waiting) status = s.isLast ? 'Poslední věta dohrála. Až budeš hotov(á), stiskni Dokončit diktát.' : 'Věta dohrála. Až budeš mít napsáno, stiskni Další věta.';
    return [
      h('h1', { class: 'counter', 'aria-live': 'polite' }, s.label),
      pre.length ? h('p', { class: 'prefill' }, `Předvyplněné slovo v této větě: `, pre.map((p) => h('strong', {}, p.span)), '. Napiš ho tak, jak je tady, přemýšlet o něm nemusíš.') : null,
      s.phase === 'error' ? errorBox(s) : h('p', { class: 'status', role: 'status' }, status),
      s.countdown ? h('p', { class: 'status' }, `Další věta se spustí za ${s.countdown} s. Tlačítkem Pozastavit to zastavíš.`) : null,
      h('div', { class: 'controls' },
        btn('Přehrát', () => player.play(), { enabled: !busy && s.phase !== 'finished', kind: 'primary' }),
        btn('Zopakovat', () => player.repeat(), { enabled: s.phase !== 'finished' }),
        btn('Další věta', () => player.next(), { enabled: ['waiting', 'playing', 'paused', 'loading'].includes(s.phase) && !s.isLast }),
        btn('Pozastavit', () => player.pause(), { enabled: busy || (waiting && !!s.countdown) })),
      h('div', { class: 'row secondary' },
        btn('Předchozí věta', () => player.previous(), { enabled: s.index > 0 }),
        s.isLast && waiting ? btn('Dokončit diktát', finish, { kind: 'primary' }) : null,
        btn('Ukončit', leave)),
      h('p', { class: 'hint' }, 'Ovládání funguje i klávesnicí: klávesou Tab vybereš tlačítko, klávesou Enter nebo mezerník ho stiskneš.'),
    ];
  }

  function leave() {
    if (!confirm('Opravdu ukončit diktát? Diktování se přeruší.')) return;
    player.stop();
    location.hash = `#/prepare/${encodeURIComponent(id)}`;
  }

  function finish() {
    player.finish();
    update({ run: { ...store.run, finished: true } });
    location.hash = `#/solution/${encodeURIComponent(id)}`;
  }

  function draw() {
    const s = player.state;
    const focusAction = document.activeElement?.getAttribute?.('data-action');
    const body = step === 'check' ? checkStep(s) : step === 'intro' ? introStep(s) : dictateStep(s);
    clear(main).append(h('div', { class: 'child' }, body));
    if (focusAction) main.querySelector(`[data-action="${CSS.escape(focusAction)}"]`)?.focus({ preventScroll: true });
    if (s.phase !== lastPhase) {
      lastPhase = s.phase;
      if (step === 'dictate') announce(`${s.label}. ${s.phase === 'playing' ? 'Přehrávám' : s.phase === 'waiting' ? 'Věta dohrála' : s.phase === 'paused' ? 'Pozastaveno' : ''}`);
    }
  }

  alive = true;
  draw();
  return () => {
    alive = false;
    window.removeEventListener('pagehide', onHide);
    player.stop(); // zastaví skutečně hrající zvuk i rozpracované stahování
  };
}

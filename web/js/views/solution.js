// Řešení po dokončení diktátu: správné znění a cílová místa. Nic se neznámkuje.

import { clear, h } from '../dom.js';
import { DictationPlayer, NORMAL_RATE } from '../player.js';
import { store } from '../store.js';
import { makeFetchAudio } from '../tts-client.js';
import { errorPanel, labelOf, markLegend, markedText } from './common.js';

export function renderSolution(main, { id }) {
  const item = store.catalog.usable.find((i) => i.dictation.id === id);
  const run = store.run;
  if (!item || !run || run.dictationId !== id || !run.finished) {
    // Správné znění se neukazuje dřív, než je diktát dokončen.
    location.replace(`#/prepare/${encodeURIComponent(id)}`);
    return () => {};
  }
  const d = item.dictation;
  let alive = false; // zpětné volání přehrávače se aktivuje až po inicializaci obrazovky
  const player = new DictationPlayer({
    createAudio: () => new Audio(),
    resetAudio: (a) => { a.removeAttribute('src'); a.load(); },
    fetchAudio: makeFetchAudio({ dictation: d, readPunctuation: false }),
    scheduler: { setTimeout: (f, ms) => window.setTimeout(f, ms), clearTimeout: (t) => window.clearTimeout(t) },
  }, () => { if (alive) draw(); });
  player.setOptions({ lengthScale: NORMAL_RATE });
  player.load(d.tts_segments.map((s) => ({ id: s.id, text: s.text })));

  const spansOf = (featureId, role) => d.annotations.filter((a) => a.feature_id === featureId && a.role === role)
    .map((a) => a.span);
  const uniq = (list) => [...new Set(list)];

  function featureList(title, list, role) {
    return h('div', {}, h('h3', {}, title), list.length
      ? h('ul', {}, list.map((f) => h('li', {}, h('strong', {}, labelOf(f.id)), ': ', uniq(spansOf(f.id, role)).join(' · ') || '(výskyty nejsou označeny)')))
      : h('p', {}, 'Žádné.'));
  }

  function draw() {
    const s = player.state;
    clear(main).append(
      h('h1', {}, 'Správné znění'),
      h('p', { class: 'lead' }, `Diktát ${d.id} je hotový. Podívejte se spolu, jak má text vypadat.`),
      h('section', { class: 'panel solution' }, markedText(d), markLegend()),
      h('section', { class: 'panel' },
        featureList('Cílové jevy a místa', d.target_features, 'target'),
        featureList('Vedlejší jevy', d.incidental_features, 'incidental'),
        run.prefills?.length ? h('div', {}, h('h3', {}, 'Předvyplněná místa'), h('ul', {}, run.prefills.map((p) => h('li', {}, `Věta ${p.sentence_index + 1}: „${p.span}“`)))) : null,
        h('p', { class: 'hint' }, 'Aplikace diktát nehodnotí ani neznámkuje. Kontrola a případné hodnocení je na dospělém.')),
      h('section', { class: 'panel' },
        h('h2', {}, 'Poslech pro kontrolu'),
        s.phase === 'error' ? errorPanel('Zvuk se nepodařilo přehrát', [s.error.message], s.error.hint) : null,
        h('p', { 'aria-live': 'polite' }, s.phase === 'loading' ? 'Načítám…' : s.phase === 'playing' ? 'Přehrává se celý text.' : ''),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', onclick: () => player.playFull(d.text) }, 'Přehrát celý text'),
          h('button', { type: 'button', class: 'btn', onclick: () => player.stop() }, 'Zastavit'))),
      h('p', { class: 'row' },
        h('a', { class: 'btn', href: `#/prepare/${encodeURIComponent(id)}` }, 'Zopakovat tento diktát'),
        h('a', { class: 'btn primary', href: '#/' }, 'Zpět na výběr')));
  }

  alive = true;
  draw();
  return () => { alive = false; player.stop(); };
}

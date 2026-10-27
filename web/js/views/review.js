// Poslechová kontrola hlasu: rodič/učitel poslechne každý diktát normálně i zpomaleně
// a zaznamená výsledek. Neovlivňuje teacher_approved ani review_status diktátu.

import { clear, h } from '../dom.js';
import { DictationPlayer } from '../player.js';
import { CHECKLIST, STATUS_LABEL, audioReviewStatus, emptyRecord } from '../review-model.js';
import { fetchReviews, saveReviews } from '../reviews-api.js';
import { TEMPOS, store } from '../store.js';
import { makeFetchAudio } from '../tts-client.js';
import { badge, errorPanel } from './common.js';

const CHECK_LABEL = { unset: 'Neposouzeno', ok: 'V pořádku', problem: 'Problém' };

export function renderReview(main) {
  let doc = null;
  let loadError = null;
  let alive = true;
  let message = null;
  const open = new Set();
  const drafts = new Map();
  const players = new Map();
  let active = null;
  const modelSha = () => store.health?.model?.sha256 ?? null;

  function playerFor(d) {
    if (!players.has(d.id)) {
      players.set(d.id, new DictationPlayer({
        createAudio: () => new Audio(),
        resetAudio: (a) => { a.removeAttribute('src'); a.load(); },
        fetchAudio: makeFetchAudio({ dictation: d, readPunctuation: false }),
        scheduler: { setTimeout: (f, ms) => window.setTimeout(f, ms), clearTimeout: (t) => window.clearTimeout(t) },
      }, () => { if (alive) paintPlayState(d.id); }));
    }
    return players.get(d.id);
  }

  function play(d, segment, tempo) {
    if (active && active !== playerFor(d)) active.stop(); // nikdy nehrají dva zvuky
    const p = playerFor(d);
    active = p;
    p.setOptions({ lengthScale: TEMPOS[tempo].lengthScale });
    if (segment === 'full') {
      p.load(d.tts_segments.map((s) => ({ id: s.id, text: s.text })));
      p.setOptions({ lengthScale: TEMPOS.normal.lengthScale });
      p.playFull(d.text);
    } else {
      p.load([{ id: segment.id, text: segment.text }]);
      p.play();
    }
  }

  function paintPlayState(id) {
    const el = main.querySelector(`[data-playstate="${CSS.escape(id)}"]`);
    if (!el) return;
    const s = players.get(id).state;
    el.textContent = s.phase === 'loading' ? 'Načítám zvuk…' : s.phase === 'playing' ? 'Přehrává se…' : s.phase === 'error' ? `Chyba: ${s.error.message} ${s.error.hint ?? ''}` : '';
  }

  function draftOf(d) {
    if (!drafts.has(d.id)) {
      const saved = doc.items[d.id];
      const stale = saved && audioReviewStatus(saved, d, modelSha()) === 'stale';
      drafts.set(d.id, structuredClone(saved && !stale ? saved : emptyRecord(d, modelSha())));
    }
    return drafts.get(d.id);
  }

  async function save(d) {
    const rec = { ...draftOf(d), content_sha256: d.content_sha256, model_sha256: modelSha(), saved_at: new Date().toISOString() };
    const next = { schema: 1, items: { ...doc.items, [d.id]: rec } };
    try {
      await saveReviews(next);
      doc = next;
      drafts.delete(d.id);
      message = `Hodnocení ${d.id} uloženo.`;
    } catch (e) {
      message = `Uložení selhalo: ${e.message}`;
    }
    draw();
  }

  function block(d) {
    const draft = draftOf(d);
    const saved = doc.items[d.id];
    const status = audioReviewStatus(saved, d, modelSha());
    const ready = store.health?.ready;
    return h('details', { open: open.has(d.id), ontoggle: (e) => { if (e.target.open) open.add(d.id); else open.delete(d.id); } },
      h('summary', {}, `${d.id} – ${d.title} `, badge(STATUS_LABEL[status], status === 'reviewed_ok' ? 'ok' : status === 'needs_fix' ? 'bad' : 'warn')),
      !ready ? h('p', { class: 'warn-text' }, 'Hlas není k dispozici (viz stránka Stav); poslech nelze spustit.') : null,
      h('table', { class: 'lib' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Věta'), h('th', { scope: 'col' }, 'Poslech'))),
        h('tbody', {}, d.tts_segments.map((seg, i) => h('tr', {},
          h('td', {}, `${i + 1}. ${seg.text}`),
          h('td', {},
            h('button', { type: 'button', class: 'btn small', 'aria-disabled': ready ? 'false' : 'true', onclick: () => ready && play(d, seg, 'normal') }, 'Normálně'), ' ',
            h('button', { type: 'button', class: 'btn small', 'aria-disabled': ready ? 'false' : 'true', onclick: () => ready && play(d, seg, 'slow') }, 'Zpomaleně')))))),
      h('p', {}, h('button', { type: 'button', class: 'btn small', 'aria-disabled': ready ? 'false' : 'true', onclick: () => ready && play(d, 'full', 'normal') }, 'Celý text'), ' ',
        h('button', { type: 'button', class: 'btn small', onclick: () => players.get(d.id)?.stop() }, 'Zastavit'), ' ',
        h('span', { 'data-playstate': d.id, 'aria-live': 'polite' })),
      h('fieldset', {},
        h('legend', {}, 'Co jsem poslechl(a)'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: draft.listened.normal, onchange: (e) => { draft.listened.normal = e.target.checked; } }), ' Všechny věty normálním tempem'), ' ',
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: draft.listened.slow, onchange: (e) => { draft.listened.slow = e.target.checked; } }), ' Všechny věty zpomaleně')),
      h('table', { class: 'lib' },
        h('caption', {}, 'Kontrolní seznam výslovnosti'),
        h('tbody', {}, CHECKLIST.map((c) => h('tr', {},
          h('th', { scope: 'row' }, c.label),
          h('td', {}, h('select', { 'aria-label': c.label, onchange: (e) => { draft.checks[c.key] = e.target.value; } },
            Object.entries(CHECK_LABEL).map(([v, t]) => h('option', { value: v, selected: draft.checks[c.key] === v }, t))))))) ),
      h('label', { class: 'field' }, 'Kdo poslech provedl: ', h('input', { type: 'text', value: draft.reviewer, onchange: (e) => { draft.reviewer = e.target.value; } })),
      h('label', { class: 'field' }, 'Poznámka: ', h('textarea', { rows: 2, onchange: (e) => { draft.note = e.target.value; } }, draft.note)),
      saved?.saved_at ? h('p', { class: 'hint' }, `Naposledy uloženo ${new Date(saved.saved_at).toLocaleString('cs-CZ')}.`) : null,
      h('p', {}, h('button', { type: 'button', class: 'btn primary', onclick: () => save(d) }, 'Uložit hodnocení')));
  }

  function draw() {
    if (!alive) return;
    if (loadError) {
      clear(main).append(h('h1', {}, 'Poslechová kontrola'), errorPanel('Záznam kontroly nelze načíst', [loadError], 'Zkontrolujte soubor user_data/audio-review.json, případně jej odstraňte.'));
      return;
    }
    if (!doc) { clear(main).append(h('h1', {}, 'Poslechová kontrola'), h('p', { role: 'status' }, 'Načítám…')); return; }
    const usable = store.catalog.usable;
    const counts = usable.reduce((acc, i) => { const s = audioReviewStatus(doc.items[i.dictation.id], i.dictation, modelSha()); acc[s] = (acc[s] ?? 0) + 1; return acc; }, {});
    clear(main).append(
      h('h1', {}, 'Poslechová kontrola hlasu'),
      h('p', {}, `Poslech v pořádku: ${counts.reviewed_ok ?? 0} z ${usable.length}. Vyžaduje opravu: ${counts.needs_fix ?? 0}. Zastaralé: ${counts.stale ?? 0}.`),
      h('p', { class: 'hint' }, 'Kontrola hlasu je samostatná: neznamená, že je text pedagogicky schválen. Záznam platí pro konkrétní verzi textu a konkrétní model hlasu; po změně jednoho z nich je označen jako zastaralý. Zvažte zejména délky samohlásek, di/ti/ni, dě/tě/ně, bě/pě/vě/mě, vlastní jména, souhláskové skupiny a členění podle interpunkce.'),
      message ? h('p', { role: 'status', class: 'ok-text' }, message) : null,
      usable.map((i) => block(i.dictation)));
  }

  draw();
  fetchReviews().then((d) => { doc = d; draw(); }).catch((e) => { loadError = e.message; draw(); });
  return () => { alive = false; players.forEach((p) => p.stop()); };
}

// Společné části obrazovek.

import { h } from '../dom.js';
import { cps } from '../text.js';
import { store } from '../store.js';

export const TIER_LABEL = {
  approved: 'Schváleno učitelem',
  checked: 'Kontrolovaný návrh (nebylo schváleno učitelem)',
  sample: 'Ukázka',
};
export const TIER_SHORT = { approved: 'Schváleno', checked: 'Kontrolovaný návrh', sample: 'Ukázka' };
export const LEVEL_LABEL = { not_taught: 'Zatím neprobráno', taught: 'Probráno', mastered: 'Zvládnuto' };
export const ROLE_LABEL = { target: 'cílový', incidental: 'vedlejší' };
export const COMPLETENESS_LABEL = { partial: 'Anotace neúplná – před použitím zkontroluje dospělý', complete: 'Anotace úplná' };
export const MODE_LABEL = { strict: 'Přísná', supported: 'Podporovaná' };

export const badge = (text, kind = '') => h('span', { class: `badge ${kind}` }, text);

export const tierBadge = (tier) => badge(TIER_SHORT[tier], `tier-${tier}`);

export function labelOf(featureId) {
  return store.taxonomy?.label(featureId) ?? featureId;
}

// Rozdělí větu na úseky podle anotací. Cílová místa mají přednost před vedlejšími,
// překrývající se úseky se nevnořují.
export function markedSentence(sentence, annotations, { roles = ['target', 'incidental'] } = {}) {
  const chars = cps(sentence);
  const wanted = annotations
    .filter((a) => roles.includes(a.role))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'target' ? -1 : 1) || (b.end - b.start) - (a.end - a.start));
  const taken = [];
  for (const a of wanted) {
    if (!taken.some((t) => a.start < t.end && t.start < a.end)) taken.push(a);
  }
  taken.sort((a, b) => a.start - b.start);
  const out = [];
  let pos = 0;
  for (const a of taken) {
    if (a.start > pos) out.push(chars.slice(pos, a.start).join(''));
    const roleText = a.role === 'target' ? 'cílové místo' : 'vedlejší jev';
    out.push(h('mark', { class: `m-${a.role}`, title: `${roleText}: ${labelOf(a.feature_id)}` }, chars.slice(a.start, a.end).join('')));
    pos = a.end;
  }
  if (pos < chars.length) out.push(chars.slice(pos).join(''));
  return out;
}

export function markedText(d, opts) {
  return h('ol', { class: 'sentences' }, d.sentences.map((s, i) =>
    h('li', {}, markedSentence(s, d.annotations.filter((a) => a.sentence_index === i), opts))));
}

export const markLegend = () => h('p', { class: 'hint' },
  'Značení: ', h('mark', { class: 'm-target' }, 'cílové místo'), ' je tučně a podtržené plnou čarou, ',
  h('mark', { class: 'm-incidental' }, 'vedlejší jev'), ' je podtržený čárkovaně.');

const STATUS_TEXT = {
  ok: (r) => `Potvrzeno v profilu (${LEVEL_LABEL[r.have].toLowerCase()})`,
  covered_by_form: () => 'Pokryto potvrzeným slovním tvarem',
  support: () => 'Nepotvrzeno – místo se předvyplní (podporovaná varianta)',
  missing: () => 'CHYBÍ v profilu',
};

// Vysvětlení vhodnosti: co text vyžaduje, co je v profilu potvrzeno a co chybí.
export function explainTable(ev, { onConfirm = null } = {}) {
  const rows = ev.rows.map((r) => h('tr', { class: `row-${r.status}` },
    h('td', {}, labelOf(r.feature_id)),
    h('td', {}, ROLE_LABEL[r.role]),
    h('td', {}, LEVEL_LABEL[r.need]),
    h('td', {}, STATUS_TEXT[r.status](r)),
    h('td', {}, r.occurrences.length ? r.occurrences.map((a) => a.span).join(' · ') : '–'),
    onConfirm ? h('td', {}, r.status === 'missing' || r.status === 'support'
      ? h('button', { type: 'button', class: 'btn small', onclick: () => onConfirm(r) }, 'Označit jako probráno')
      : '') : null));
  return h('table', { class: 'explain' },
    h('caption', {}, 'Jevy v textu a jejich pokrytí profilem'),
    h('thead', {}, h('tr', {}, ['Jev', 'Druh', 'Potřebný stav', 'Pokrytí', 'Výskyty'].map((t) => h('th', { scope: 'col' }, t)), onConfirm ? h('th', { scope: 'col' }, 'Akce') : null)),
    h('tbody', {}, rows));
}

export function missingSummary(ev) {
  const parts = [
    ...ev.missing.map((m) => labelOf(m.feature_id)),
    ...ev.missingForms.map((f) => `slovní tvar „${f.form}“`),
    ...(ev.missingGraphemes.length ? [`písmena: ${ev.missingGraphemes.join(' ')}`] : []),
  ];
  return parts;
}

export function errorPanel(title, lines, hint = null) {
  return h('section', { class: 'panel error', role: 'alert' },
    h('h2', {}, title),
    lines.length ? h('ul', {}, lines.map((l) => h('li', {}, l))) : null,
    hint ? h('p', {}, hint) : null);
}

export const pill = (text) => h('span', { class: 'pill' }, text);

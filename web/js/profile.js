// Znalostní profil dítěte. Ročník jen nabídne výchozí hodnoty; jediné, co se počítá,
// jsou stavy, které dospělý skutečně potvrdí (viz selection.js).

import { LEVELS } from './taxonomy.js';
import { CZECH_LOWER, CZECH_UPPER } from './text.js';

export const PROFILE_SCHEMA = 1;
export const STYLES = { block: 'Hůlkové / tiskací písmo', cursive: 'Psací písmo' };

export function defaultProfile(grade, taxonomy) {
  const knowledge = {};
  for (const f of taxonomy.raw.features) {
    const assumed = f.default_policy === 'by_grade' && f.typical_grade < grade;
    knowledge[f.id] = { state: assumed ? 'taught' : 'not_taught', origin: 'default' };
  }
  return {
    schema: PROFILE_SCHEMA,
    grade,
    confirmed: false,
    writingStyle: 'block',
    checkGraphemes: grade === 1,
    graphemes: { block: [], cursive: [] },
    knowledge,
    knownForms: [],
    incidentalLevel: 'taught',
  };
}

const touch = (p, patch) => ({ ...p, ...patch, confirmed: false });

export const stateOf = (p, id) => p.knowledge[id]?.state ?? 'not_taught';

export function setFeatureState(p, id, state) {
  if (!LEVELS.includes(state)) throw new Error(`Neplatný stav: ${state}`);
  return touch(p, { knowledge: { ...p.knowledge, [id]: { state, origin: 'adult' } } });
}

export function setGroupState(p, taxonomy, groupId, state) {
  let next = p;
  for (const f of taxonomy.featuresOfGroup(groupId)) next = setFeatureState(next, f.id, state);
  return next;
}

export function setGrapheme(p, grapheme, known) {
  const style = p.writingStyle;
  const set = new Set(p.graphemes[style]);
  if (known) set.add(grapheme); else set.delete(grapheme);
  return touch(p, { graphemes: { ...p.graphemes, [style]: [...set] } });
}

export function setGraphemeBulk(p, list, known) {
  let next = p;
  for (const g of list) next = setGrapheme(next, g, known);
  return next;
}

export const setWritingStyle = (p, style) => touch(p, { writingStyle: style in STYLES ? style : p.writingStyle });
export const setCheckGraphemes = (p, on) => touch(p, { checkGraphemes: !!on });
export const setIncidentalLevel = (p, level) => touch(p, { incidentalLevel: level === 'mastered' ? 'mastered' : 'taught' });

export function parseForms(text) {
  const forms = text.split(/[\n,;]+/).map((s) => s.trim().normalize('NFC')).filter(Boolean);
  return [...new Set(forms)];
}
export const setKnownForms = (p, forms) => touch(p, { knownForms: [...new Set(forms)] });

export const confirmProfile = (p) => ({ ...p, confirmed: true });

export function knownGraphemes(p) {
  return new Set(p.graphemes[p.writingStyle] ?? []);
}

export const ALPHABET = { lower: CZECH_LOWER, upper: CZECH_UPPER, diacritics: [...CZECH_LOWER, ...CZECH_UPPER].filter((g) => !/^[a-zA-Z]+$/.test(g) || g === 'ch' || g === 'Ch') };

// Obnova z localStorage: cokoli neplatného se zahodí a nahradí výchozí hodnotou,
// ale nikdy se nic nepovažuje za potvrzené, pokud to v datech výslovně není.
export function restoreProfile(raw, taxonomy) {
  const notes = [];
  if (!raw || typeof raw !== 'object' || raw.schema !== PROFILE_SCHEMA || !Number.isInteger(raw.grade) || raw.grade < 1 || raw.grade > 9) {
    return { profile: null, notes: ['Uložený profil je neplatný, použije se nový.'] };
  }
  const base = defaultProfile(raw.grade, taxonomy);
  for (const [id, v] of Object.entries(raw.knowledge ?? {})) {
    if (!taxonomy.has(id)) { notes.push(`Zahozen neznámý jev ${id}.`); continue; }
    if (LEVELS.includes(v?.state)) base.knowledge[id] = { state: v.state, origin: v.origin === 'adult' ? 'adult' : 'default' };
  }
  for (const style of Object.keys(STYLES)) {
    const list = raw.graphemes?.[style];
    if (Array.isArray(list)) base.graphemes[style] = list.filter((g) => typeof g === 'string' && g.length <= 2);
  }
  if (raw.writingStyle in STYLES) base.writingStyle = raw.writingStyle;
  if (typeof raw.checkGraphemes === 'boolean') base.checkGraphemes = raw.checkGraphemes;
  if (Array.isArray(raw.knownForms)) base.knownForms = raw.knownForms.filter((f) => typeof f === 'string' && f.trim() !== '').map((f) => f.normalize('NFC'));
  if (raw.incidentalLevel === 'mastered') base.incidentalLevel = 'mastered';
  base.confirmed = raw.confirmed === true;
  return { profile: base, notes };
}

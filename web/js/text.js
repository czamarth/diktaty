// Práce s textem diktátů. Offsety v datech jsou v kódových bodech Unicode
// (offset_unit: unicode_code_points), proto se vždy dělí přes Array.from.

export const cps = (s) => Array.from(s);
export const cpLen = (s) => cps(s).length;
export const cpSlice = (s, start, end) => cps(s).slice(start, end).join('');
export const isNFC = (s) => s === s.normalize('NFC');

export async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const WORD_RE = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
export const words = (s) => s.match(WORD_RE) ?? [];

// Grafém = písmeno; „ch“ je v české abecedě jedno písmeno. Rozlišuje se velikost
// písmen i diakritika, protože ji dítě zná po jednotlivých tvarech.
export function graphemesOf(text) {
  const out = new Set();
  const chars = cps(text);
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (!/\p{L}/u.test(c)) continue;
    const next = chars[i + 1];
    if ((c === 'c' || c === 'C') && (next === 'h' || next === 'H')) {
      if (c === 'c' && next === 'h') out.add('ch');
      else if (c === 'C' && next === 'h') out.add('Ch');
      else if (c === 'C' && next === 'H') out.add('CH');
      else out.add('cH');
      i++;
      continue;
    }
    out.add(c);
  }
  return out;
}

export const CZECH_LOWER = ['a', 'á', 'b', 'c', 'č', 'd', 'ď', 'e', 'é', 'ě', 'f', 'g', 'h', 'ch', 'i', 'í', 'j', 'k', 'l', 'm', 'n', 'ň', 'o', 'ó', 'p', 'q', 'r', 'ř', 's', 'š', 't', 'ť', 'u', 'ú', 'ů', 'v', 'w', 'x', 'y', 'ý', 'z', 'ž'];
export const CZECH_UPPER = CZECH_LOWER.map((g) => (g === 'ch' ? 'Ch' : g.toUpperCase()));

// Hlasový vstup smí obsahovat jen běžný text. Piper bere „[[ ... ]]“ jako surové
// fonémy a technické značky (anotace, HTML, markdown) nesmí do syntézy proniknout.
const SPEAKABLE_CHARS = /^[\p{L}\p{N}\s.,!?;:…„“”"'’‘()–—\-]*$/u;

export function speakableProblems(text) {
  const problems = [];
  if (typeof text !== 'string' || text.trim() === '') return ['text je prázdný'];
  if (!SPEAKABLE_CHARS.test(text)) {
    const bad = cps(text).filter((c) => !SPEAKABLE_CHARS.test(c));
    problems.push(`nepovolené znaky pro hlasový vstup: ${[...new Set(bad)].map((c) => JSON.stringify(c)).join(' ')}`);
  }
  if (text.includes('[[') || text.includes(']]')) problems.push('obsahuje značku [[ ]]');
  return problems;
}

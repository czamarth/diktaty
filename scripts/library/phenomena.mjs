// Detektory pravopisných jevů v jedné větě. Pracují po slovech a jsou záměrně přísné:
//  - auto:   jev, který se pozná z tvaru slova a označí se automaticky (celé slovo);
//  - needs:  místo, kde jde o rozhodnutí, které automat neumí zařadit (koncovka, minulý čas, předpona,
//            vlastní jméno, mě/mně) – autor ho musí označit ručně příslušným jevem;
//  - errors: slovo, které se v knihovně nesmí objevit (výjimka, kterou taxonomie nepokrývá, nebo chyba).
// Nejde o důkaz správnosti češtiny; je to pojistka, aby text neskrýval jevy, které žák ještě neznat nemusí.

import { FIRST_NAMES, FIXED_FORMS, FUNC, LIST_STEMS, NOT_VERB, PLACE_NAMES, PREFIX_SZ_WORDS, SPECIAL } from './lexicon.mjs';

export const F = {
  sb: 'orth.sentence_boundaries',
  vq: 'orth.vowel_quantity',
  ul: 'orth.u_long_basic',
  pg: 'orth.palatal_groups_basic',
  sc: 'orth.soft_consonants_basic',
  hc: 'orth.hard_consonants_basic',
  vf: 'orth.voicing_final',
  vi: 'orth.voicing_internal',
  lb: 'orth.listed_words_b', ll: 'orth.listed_words_l', lm: 'orth.listed_words_m', lp: 'orth.listed_words_p',
  ls: 'orth.listed_words_s', lv: 'orth.listed_words_v', lz: 'orth.listed_words_z',
  lr: 'orth.listed_words_review',
};
export const LISTED_BY_LETTER = { b: F.lb, l: F.ll, m: F.lm, p: F.lp, s: F.ls, v: F.lv, z: F.lz };

// Které ruční jevy smějí „vyřešit“ místo, které automat označil jako needs.
export const NEED_ACCEPTS = {
  ending: [
    'orth.noun_endings_pan', 'orth.noun_endings_hrad', 'orth.noun_endings_zena', 'orth.noun_endings_review',
    'orth.adjective_hard_endings', 'orth.adjective_endings_review', 'orth.pronoun_me_mne',
    'syntax.agreement_simple_plural', 'syntax.past_singular', 'syntax.agreement_unexpressed', 'syntax.agreement_review',
  ],
  past: ['syntax.past_singular', 'syntax.agreement_simple_plural', 'syntax.agreement_unexpressed', 'syntax.agreement_review'],
  prefix: ['orth.prefixes_s_z_vz', 'orth.prefixes_review'],
  proper: ['orth.proper_names_geographic'],
  me: ['orth.pronoun_me_mne'],
};

const TOKEN = /\p{L}+(?:-\p{L}+)*/gu;
const VOICED = new Set(['b', 'd', 'ď', 'g', 'h', 'z', 'ž']);
const VOICELESS = new Set(['p', 't', 'ť', 'k', 'f', 's', 'š', 'c', 'č', 'ch']);
const SOFT_LETTERS = new Set(['ž', 'š', 'č', 'ř', 'c', 'j']);
const HARD_LETTERS = new Set(['h', 'k', 'r', 'ch']);
const PALATAL_BASE = new Set(['d', 't', 'n']);
const AMBIGUOUS = new Set(['b', 'l', 'm', 'p', 's', 'v', 'z']);
const EXCEPTION_LETTERS = new Set(['f', 'g', 'q', 'w', 'x']);

// Jméno osoby i se skloňovací koncovkou (Petrem, Annou, Olgou, Karlem). Zeměpisná jména sem nepatří.
const NAME_SUFFIXES = new Set(['', 'a', 'e', 'o', 'u', 'y', 'i', 'ě', 'ou', 'em', 'ovi', 'ům', 'ím']);
const NAME_STEMS = (() => {
  const stems = new Set(['karl']);
  for (const n of FIRST_NAMES) stems.add(n.replace(/[aeiouyěí]$/u, ''));
  return stems;
})();
export function isPersonName(w) {
  if (FIRST_NAMES.has(w)) return true;
  for (let cut = 2; cut <= w.length; cut++) {
    if (NAME_STEMS.has(w.slice(0, cut)) && NAME_SUFFIXES.has(w.slice(cut))) return true;
  }
  return false;
}

const units = (w) => {
  const out = [];
  for (let i = 0; i < w.length; i++) {
    if (w[i] === 'c' && w[i + 1] === 'h') { out.push('ch'); i++; } else out.push(w[i]);
  }
  return out;
};

function stemCovers(w, letter, index) {
  for (const stem of LIST_STEMS[letter] ?? []) {
    const s = stem.toLowerCase();
    for (let from = 0; ;) {
      const k = w.indexOf(s, from);
      if (k < 0) break;
      if (k <= index && index < k + s.length) return true;
      from = k + 1;
    }
  }
  return false;
}

// Analýza jednoho slova (malými písmeny) → množina jevů + požadavky + chyby.
export function analyzeWord(orig, { sentenceFirst }) {
  const w = orig.toLowerCase();
  const features = new Set();
  const needs = [];
  const errors = [];
  const err = (code, message) => errors.push({ code, message: `${message} („${orig}“)` });
  const need = (kind, message) => needs.push({ kind, message: `${message} („${orig}“)` });

  if (/\d/.test(orig)) err('digit', 'Číslice nejsou povoleny, číslovku napište slovy');

  // Velké písmeno uvnitř věty: jméno osoby je v pořádku, vše ostatní vyžaduje označení.
  const capitalized = orig[0] !== w[0];
  if (capitalized && (PLACE_NAMES.has(w) || (!sentenceFirst && !isPersonName(w)))) {
    need('proper', 'Velké písmeno (vlastní jméno) vyžaduje označení');
  }

  if (w === 'mě' || w === 'mne' || w === 'mně') need('me', 'Tvar zájmena já (mě/mně) vyžaduje označení');
  if (w.startsWith('vz') || PREFIX_SZ_WORDS.has(w)) need('prefix', 'Slovo s předponou s-/z-/vz- vyžaduje označení');

  if (SPECIAL.has(w)) {
    for (const code of SPECIAL.get(w)) {
      features.add(code === 'palatal' ? F.pg : code === 'hard' ? F.hc : LISTED_BY_LETTER[code]);
    }
    return { features, needs, errors };
  }

  const isFunc = FUNC.has(w);
  const chars = Array.from(w);

  // ú / ů
  if (/[úů]/u.test(w)) features.add(F.ul);

  // ě
  chars.forEach((c, i) => {
    if (c !== 'ě') return;
    const p = chars[i - 1];
    if (p && 'dtnbpvm'.includes(p)) features.add(F.pg);
    else err('e_caron', 'ě po jiné souhlásce, než je d, t, n, b, p, v, m');
  });

  // i/í/y/ý po souhlásce
  chars.forEach((c, i) => {
    if (!'iíyý'.includes(c)) return;
    const isLong = c === 'í' || c === 'ý';
    const isI = c === 'i' || c === 'í';
    const prev2 = chars.slice(Math.max(0, i - 2), i).join('');
    const p = prev2.endsWith('ch') ? 'ch' : chars[i - 1];
    const isFinal = i === chars.length - 1;
    if (p === undefined) return; // slovo začíná samohláskou i/y (ihned, Iva)
    if (SOFT_LETTERS.has(p)) {
      if (isI) features.add(F.sc);
      else err('y_after_soft', `${p}${c} – výjimka (y po měkké souhlásce)`);
    } else if (HARD_LETTERS.has(p)) {
      if (!isI) features.add(F.hc);
      else err('i_after_hard', `${p}${c} – výjimka (i po tvrdé souhlásce)`);
    } else if (PALATAL_BASE.has(p)) {
      if (isFinal && !FIXED_FORMS.has(w) && !isFunc) need('ending', `Koncové ${p}${c} je volba podle vzoru a vyžaduje označení`);
      else features.add(isI ? F.pg : F.hc);
    } else if (AMBIGUOUS.has(p)) {
      if (isFinal && isFunc) {
        features.add(LISTED_BY_LETTER[p]); // pevné funkční slovo (např. mezi): i/y po obojetné je stále rozhodnutí
      } else if (isFinal) {
        need('ending', `Koncové ${p}${c} po obojetné souhlásce vyžaduje označení`);
      } else if (p === 'v' && i === 1 && !stemCovers(w, 'v', i)) {
        err('prefix_vy', 'Předpona vy-/vý- není povolena (není v taxonomii)');
      } else {
        const covered = stemCovers(w, p, i);
        if (!isI && !covered) err('y_unknown', `${p}${c} – y po „${p}“ není v seznamu vyjmenovaných slov a příbuzných`);
        else if (isI && covered) err('i_in_listed', `${p}${c} – i/í po „${p}“, ale slovo patří mezi vyjmenovaná/příbuzná`);
        else features.add(LISTED_BY_LETTER[p]);
      }
    } else if (EXCEPTION_LETTERS.has(p)) {
      err('foreign', `${p}${c} – cizí slovo/výjimka`);
    }
    void isLong;
  });

  // Znělost
  if (!isFunc) {
    const us = units(w);
    const last = us[us.length - 1];
    if (['b', 'd', 'ď', 'g', 'h', 'z', 'ž', 'v'].includes(last)) features.add(F.vf);
    for (let i = 0; i + 1 < us.length; i++) {
      const a = us[i];
      const b = us[i + 1];
      if ((VOICED.has(a) && VOICELESS.has(b)) || (VOICELESS.has(a) && VOICED.has(b))) features.add(F.vi);
    }
  }

  // Minulý čas / tvary slovesa
  if (/(?:l|la|lo|li|ly)$/u.test(w) && w.length >= 3 && !NOT_VERB.has(w) && !FIRST_NAMES.has(w)) {
    need('past', 'Tvar končící na -l/-la/-lo/-li/-ly (minulý čas) vyžaduje označení');
  }

  return { features, needs, errors };
}

const cpIndex = (s, utf16) => Array.from(s.slice(0, utf16)).length;

// Analýza věty. Offsety jsou v kódových bodech.
export function analyzeSentence(sentence) {
  const tokens = [];
  const auto = [];
  const needs = [];
  const errors = [];
  let index = 0;
  for (const m of sentence.matchAll(TOKEN)) {
    const start = cpIndex(sentence, m.index);
    const end = start + Array.from(m[0]).length;
    const sentenceFirst = index === 0;
    index++;
    tokens.push({ text: m[0], start, end });
    const r = analyzeWord(m[0], { sentenceFirst });
    for (const feature of r.features) auto.push({ start, end, feature, span: m[0] });
    for (const n of r.needs) needs.push({ ...n, start, end, span: m[0] });
    for (const e of r.errors) errors.push({ ...e, start, end, span: m[0] });
  }
  return { tokens, auto, needs, errors };
}

// Sestavení balíčku diktátů ze zdrojového textu knihovny (library-src/*.txt).
//
// Zdroj (jeden soubor = jeden cílový jev, 30 diktátů):
//   feature: orth.u_long_basic          (id cílového jevu z data/profiles.json)
//   code: ul                            (krátký kód do ID: L-ul-01 …)
//   ---
//   # Název diktátu
//   Věta jedna se {značkou|klíč}.       (jedna věta = jeden řádek; 3–5 vět)
//   Věta dvě.
//   (prázdný řádek odděluje diktáty)
//
// Ruční značka {text} nebo {text|klíč} vyznačí výskyt jevu. Bez klíče jde o cílový jev; s klíčem o jev podle
// tabulky MANUAL_KEYS. Co umí rozpoznat automat (viz phenomena.mjs), se značí samo – ruční značky jsou jen pro
// jevy, které automat nepozná (interpunkce, koncovky, shoda, předpony, vlastní jména, mě/mně).
//
// Přísnost: build selže, pokud text
//   - obsahuje jev, který není v seznamu (cílový + povolené vedlejší), tj. žák by jej „ještě neznal“;
//   - obsahuje neoznačené místo, které vyžaduje rozhodnutí (koncovka, minulý čas, předpona, vlastní jméno, …);
//   - obsahuje neoznačenou interpunkci nebo nepovolený znak;
//   - má málo výskytů cílového jevu nebo nevhodnou délku.

import { createHash } from 'node:crypto';
import { analyzeSentence, F, NEED_ACCEPTS } from './phenomena.mjs';
import { cpLen, cpSlice, graphemesOf, words } from '../../web/js/text.js';

export const MANUAL_KEYS = {
  pan: 'orth.noun_endings_pan', hrad: 'orth.noun_endings_hrad', zena: 'orth.noun_endings_zena', nrev: 'orth.noun_endings_review',
  adj: 'orth.adjective_hard_endings', adjrev: 'orth.adjective_endings_review', me: 'orth.pronoun_me_mne',
  pre: 'orth.prefixes_s_z_vz', prerev: 'orth.prefixes_review', geo: 'orth.proper_names_geographic',
  plur: 'syntax.agreement_simple_plural', pas: 'syntax.past_singular', nev: 'syntax.agreement_unexpressed', shrev: 'syntax.agreement_review',
  vyc: 'punct.enumeration', osl: 'punct.vocative', pr: 'punct.direct_speech', od: 'punct.adversative_clause',
  vv: 'punct.subordinate_clause_boundary', vs: 'punct.parenthesis', vlo: 'punct.embedded_subordinate_clause', slo: 'punct.multiple_subordinate_clauses',
};

// Jevy, které se rozpoznávají a označují automaticky (cílem může být kterýkoli z nich).
const AUTO_TARGETS = new Set([F.sb, F.vq, F.ul, F.pg, F.sc, F.hc, F.vf, F.vi, F.lb, F.ll, F.lm, F.lp, F.ls, F.lv, F.lz, F.lr]);
const LETTER_LISTED = new Set([F.lb, F.ll, F.lm, F.lp, F.ls, F.lv, F.lz]);
const LONG_VOWEL = /[áéíóý]/iu;
const OK_PUNCT = new Set(['.', ' ']);

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// --- načtení zdroje ---------------------------------------------------------------------------------
export function parseSource(text) {
  const [head, ...rest] = text.split(/^---\s*$/m);
  if (rest.length === 0) throw new Error('Chybí oddělovač --- za hlavičkou.');
  const meta = {};
  for (const line of head.split('\n')) {
    const m = line.match(/^\s*(\w+)\s*:\s*(.+?)\s*$/);
    if (m) meta[m[1]] = m[2];
  }
  if (!meta.feature || !meta.code) throw new Error('Hlavička musí obsahovat feature: a code:.');
  const blocks = [];
  let cur = null;
  rest.join('---').split('\n').forEach((raw, lineNo) => {
    const line = raw.trim();
    if (line.startsWith('#')) {
      cur = { title: line.replace(/^#+\s*/, ''), lines: [], line: lineNo };
      blocks.push(cur);
    } else if (line === '') {
      cur = null;
    } else if (line.startsWith('//')) {
      // komentář
    } else if (cur) {
      cur.lines.push(line);
    }
  });
  return { meta, blocks };
}

// Rozloží větu se značkami na čistý text a seznam ručních anotací (offsety v kódových bodech).
export function parseMarkedSentence(marked) {
  let plain = '';
  const marks = [];
  for (let i = 0; i < marked.length;) {
    if (marked[i] === '{') {
      const close = marked.indexOf('}', i);
      if (close < 0) throw new Error(`Neuzavřená značka v „${marked}“.`);
      const inner = marked.slice(i + 1, close);
      const bar = inner.lastIndexOf('|');
      const span = bar < 0 ? inner : inner.slice(0, bar);
      const key = bar < 0 ? 't' : inner.slice(bar + 1);
      const start = cpLen(plain);
      plain += span;
      marks.push({ start, end: start + cpLen(span), span, key });
      i = close + 1;
    } else {
      plain += marked[i];
      i++;
    }
  }
  return { plain, marks };
}

// --- pravidla délky -----------------------------------------------------------------------------------
function lengthLimits(grade) {
  if (grade <= 1) return { maxSentenceWords: 6, minWords: 6, maxWords: 22 };
  if (grade === 2) return { maxSentenceWords: 9, minWords: 10, maxWords: 36 };
  if (grade === 3) return { maxSentenceWords: 11, minWords: 12, maxWords: 48 };
  if (grade <= 5) return { maxSentenceWords: 14, minWords: 16, maxWords: 70 };
  return { maxSentenceWords: 20, minWords: 18, maxWords: 100 };
}

const overlaps = (a, b) => a.sentence_index === b.sentence_index && a.start < b.end && b.start < a.end;

// --- sestavení jednoho diktátu --------------------------------------------------------------------------
export function buildDictation({ block, index, meta, taxonomy }) {
  const problems = [];
  const target = meta.feature;
  const tf = taxonomy.features.get(target);
  if (!tf) throw new Error(`Neznámý cílový jev ${target}`);
  const grade = tf.typical_grade;
  const id = `L-${meta.code}-${String(index + 1).padStart(2, '0')}`;
  const where = `${id} „${block.title}“`;
  const bad = (msg) => problems.push(`${where}: ${msg}`);

  if (block.lines.length < 3 || block.lines.length > 5) bad(`počet vět ${block.lines.length}, má být 3–5`);

  const sentences = [];
  const manual = [];
  block.lines.forEach((line, si) => {
    let parsed;
    try { parsed = parseMarkedSentence(line); } catch (e) { bad(e.message); return; }
    sentences.push(parsed.plain);
    for (const mk of parsed.marks) {
      const feature = mk.key === 't' ? target : (MANUAL_KEYS[mk.key] ?? mk.key);
      if (!taxonomy.has(feature)) { bad(`neznámý klíč/jev „${mk.key}“ u „${mk.span}“`); continue; }
      manual.push({ sentence_index: si, start: mk.start, end: mk.end, span: mk.span, feature });
    }
  });
  if (problems.length) return { problems };

  // Automatické anotace a požadavky
  const annotations = [];
  const add = (a) => {
    if (!annotations.some((x) => x.sentence_index === a.sentence_index && x.start === a.start && x.end === a.end && x.feature === a.feature)) annotations.push(a);
  };
  const needs = [];
  const targetIsLetter = LETTER_LISTED.has(target);
  sentences.forEach((s, si) => {
    const r = analyzeSentence(s);
    for (const e of r.errors) bad(`věta ${si + 1}: ${e.message}`);
    for (const n of r.needs) needs.push({ ...n, sentence_index: si });
    for (const a of r.auto) {
      let feature = a.feature;
      if (LETTER_LISTED.has(feature) && target === F.lr) feature = F.lr;
      else if (LETTER_LISTED.has(feature) && !targetIsLetter) feature = F.lr;
      add({ sentence_index: si, start: a.start, end: a.end, span: a.span, feature });
    }
    // hranice vět: první slovo a závěrečná interpunkce
    if (r.tokens.length) {
      const t0 = r.tokens[0];
      add({ sentence_index: si, start: t0.start, end: t0.end, span: t0.text, feature: F.sb });
      const n = cpLen(s);
      add({ sentence_index: si, start: n - 1, end: n, span: cpSlice(s, n - 1, n), feature: F.sb });
    }
    // délka samohlásek: slova s á é í ó ý (ú/ů má vlastní jev)
    for (const t of r.tokens) if (LONG_VOWEL.test(t.text)) add({ sentence_index: si, start: t.start, end: t.end, span: t.text, feature: F.vq });
  });
  for (const m of manual) add(m);

  // Ruční značka ve slově s automatickým targetem je v pořádku (duplicity add() odstraní).

  // Požadavky, které musí někdo označit
  for (const n of needs) {
    const accepted = NEED_ACCEPTS[n.kind];
    const ok = manual.some((m) => m.sentence_index === n.sentence_index && m.start < n.end && n.start < m.end && accepted.includes(m.feature));
    if (!ok) bad(`věta ${n.sentence_index + 1}: ${n.message} – ručně označit {…|klíč} nebo slovo nahradit`);
  }

  // Interpunkce a znaky
  sentences.forEach((s, si) => {
    const chars = Array.from(s);
    chars.forEach((c, i) => {
      if (/[\p{L}\s]/u.test(c) || c === '.') return;
      if (c === '?' || c === '!') {
        if (grade < 2 && i === chars.length - 1) bad(`věta ${si + 1}: „${c}“ není pro 1. ročník povoleno`);
        return;
      }
      const covered = manual.some((m) => m.sentence_index === si && m.start <= i && i < m.end && m.feature.startsWith('punct.'));
      if (!covered) bad(`věta ${si + 1}: znak „${c}“ není pokryt značkou interpunkčního jevu (punct.*)`);
    });
    if (!/[.!?]$/.test(s)) bad(`věta ${si + 1} nekončí tečkou, ? ani !`);
  });

  // Role a uzavřenost množiny jevů
  const full = annotations.map((a) => ({ ...a, role: a.feature === target ? 'target' : 'incidental' }));
  const used = [...new Set(full.map((a) => a.feature))];
  const allowedIncidental = (x) => {
    const f = taxonomy.features.get(x);
    return x !== target && (f.typical_grade < grade || (f.typical_grade === grade && f.default_policy === 'by_grade'));
  };
  for (const x of used) {
    if (x === target) continue;
    if (!allowedIncidental(x)) {
      const f = taxonomy.features.get(x);
      const ex = full.filter((a) => a.feature === x).slice(0, 3).map((a) => `„${a.span}“`).join(', ');
      bad(`jev ${x} (ročník ${f.typical_grade}, ${f.default_policy}) není v textu pro cílový jev ${target} (ročník ${grade}) dovolen – ${ex}`);
    }
  }
  const confirmIncidental = used.filter((x) => x !== target && taxonomy.features.get(x).default_policy === 'adult_confirm');
  if (confirmIncidental.length > 3) bad(`příliš mnoho vedlejších jevů vyžadujících potvrzení dospělým (${confirmIncidental.length}): ${confirmIncidental.join(', ')}`);
  if (used.length - 1 > 9) bad(`příliš mnoho vedlejších jevů (${used.length - 1})`);

  // Čistý test hranic vět: žádná dlouhá samohláska, aby se netestovalo nic jiného
  if (target === F.sb && full.some((a) => a.feature === F.vq)) {
    bad(`text pro hranice vět nemá obsahovat dlouhé samohlásky (${full.filter((a) => a.feature === F.vq).slice(0, 3).map((a) => a.span).join(', ')})`);
  }

  // Dostatek výskytů cíle
  const targetCount = full.filter((a) => a.feature === target).length;
  const minTarget = AUTO_TARGETS.has(target) ? (target === F.sb ? 6 : 3) : 2;
  if (targetCount < minTarget) bad(`cílový jev má jen ${targetCount} výskyt(ů), požadováno aspoň ${minTarget}`);

  // Délka
  const lim = lengthLimits(grade);
  const text = sentences.join(' ');
  const wc = words(text).length;
  if (wc < lim.minWords || wc > lim.maxWords) bad(`počet slov ${wc} mimo rozsah ${lim.minWords}–${lim.maxWords} pro ${grade}. ročník`);
  sentences.forEach((s, si) => { const n = words(s).length; if (n > lim.maxSentenceWords) bad(`věta ${si + 1} má ${n} slov (nejvýše ${lim.maxSentenceWords})`); });

  if (problems.length) return { problems };

  full.sort((a, b) => a.sentence_index - b.sentence_index || a.start - b.start || a.feature.localeCompare(b.feature));
  const annotationsOut = full.map((a) => ({ sentence_index: a.sentence_index, start: a.start, end: a.end, span: a.span, feature_id: a.feature, role: a.role, review_status: 'editorial_proposal' }));
  const featureEntry = (fid) => {
    const ex = [...new Set(full.filter((a) => a.feature === fid).map((a) => a.span))].slice(0, 4);
    return { id: fid, label: taxonomy.label(fid), examples: ex };
  };
  const incidentalIds = used.filter((x) => x !== target);
  const needLabels = [target, ...incidentalIds].map((x) => taxonomy.label(x));

  const dictation = {
    id,
    title: block.title,
    recommended_grade: grade,
    sentences,
    target_features: [featureEntry(target)],
    incidental_features: incidentalIds.map(featureEntry),
    required_known_forms: [],
    support: [],
    learner_profile_note: `Cílový jev: ${taxonomy.label(target)}. Text vyžaduje potvrzené: ${needLabels.join('; ')}. Slova musí dítě významově znát.`,
    teacher_note: 'Text vznikl v knihovně library-src (asistent) a prošel jen automatickou kontrolou (scripts/lint-library.mjs). Lidská redakční kontrola, poslech ani pedagogické schválení neproběhly.',
    version: 1,
    text,
    sentence_count: sentences.length,
    word_count: wc,
    content_sha256: sha256(text),
    origin: 'assistant_generated_lint_checked',
    review_status: 'sample',
    teacher_approved: false,
    annotation_completeness: 'partial',
    audio_review_status: 'not_generated',
    recommended_mode: 'strict_after_profile_confirmation',
    grade_is_advisory: true,
    known_graphemes_required: grade === 1 ? [...graphemesOf(text)].sort() : null,
    curriculum_sources: [],
    annotations: annotationsOut,
    tts_segments: sentences.map((s, si) => ({ id: `${id}-S${String(si + 1).padStart(2, '0')}`, sentence_index: si, text: s })),
  };
  return { dictation, problems: [] };
}

export function buildPack({ meta, blocks, taxonomy }) {
  const dictations = [];
  const problems = [];
  blocks.forEach((block, i) => {
    const r = buildDictation({ block, index: i, meta, taxonomy });
    problems.push(...r.problems);
    if (r.dictation) dictations.push(r.dictation);
  });
  const count = Number(meta.count ?? 30);
  if (blocks.length !== count) problems.push(`${meta.code}: je ${blocks.length} diktátů, očekává se ${count}`);
  const titles = new Set();
  for (const b of blocks) { if (titles.has(b.title)) problems.push(`${meta.code}: duplicitní název „${b.title}“`); titles.add(b.title); }
  const pack = {
    schema_version: 1,
    pack_id: `lib-${meta.code}`,
    pack_version: 1,
    language: 'cs-CZ',
    offset_unit: 'unicode_code_points',
    purpose: 'generated_library_not_teacher_approved',
    text_origin: 'Nové věty sestavené asistentem pro knihovnu; nejde o převzaté texty. Kurikulární zdroje nejsou uvedeny, protože nejsou původem vět.',
    publication_policy: 'Kandidáti (review_status sample): bez lidské redakční kontroly, poslechu i pedagogického schválení.',
    dictations,
  };
  return { pack, problems };
}

// Zápis JSON: objekty v polích (anotace, segmenty, jevy) po jednom řádku, ať jsou diffy čitelné.
export function formatPack(pack) {
  const line = (v) => JSON.stringify(v);
  const dict = (d) => {
    const parts = Object.entries(d).map(([k, v]) => {
      if (['annotations', 'tts_segments', 'target_features', 'incidental_features'].includes(k)) {
        return `    ${line(k)}: [\n${v.map((x) => `      ${line(x)}`).join(',\n')}\n    ]`;
      }
      return `    ${line(k)}: ${line(v)}`;
    });
    return `  {\n${parts.join(',\n')}\n  }`;
  };
  const head = Object.entries(pack).filter(([k]) => k !== 'dictations').map(([k, v]) => `  ${line(k)}: ${line(v)}`);
  return `{\n${head.join(',\n')},\n  "dictations": [\n${pack.dictations.map(dict).join(',\n')}\n  ]\n}\n`;
}

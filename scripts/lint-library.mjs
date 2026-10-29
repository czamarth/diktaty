#!/usr/bin/env node
// Kontrola celé knihovny (data/library/*.json + seed): opakování, podobnost a nezávislé ověření „žák ještě neznal“.
// Použití: node scripts/lint-library.mjs [--report soubor.md]    Návratový kód 1 při chybách.
//
// Kontroly (E = chyba, W = varování):
//   E  duplicitní ID, název nebo věta (po normalizaci) v celé knihovně včetně seedu
//   E  dva texty jsou si příliš podobné (sdílené obsahové slovo ≥ 65 %), W od 50 %
//   E  obsahové slovo se vyskytuje ve více než 8 textech jednoho balíčku (W od 6)
//   W  podobné věty v různých textech (sdílí ≥ 75 % slov)
//   E  jev v textu není dovolen pro cílový ročník (nezávislé zopakování pravidla nad hotovým JSON)
//   E  chybí cílový jev nebo počet diktátů v balíčku není 30

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildTaxonomy } from '../web/js/taxonomy.js';
import { words } from '../web/js/text.js';
import { FUNC } from './library/lexicon.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : null;
const taxonomy = buildTaxonomy(JSON.parse(await readFile(path.join(root, 'data/profiles.json'), 'utf8')));

const LIMITS = { simError: 0.65, simWarn: 0.5, sentWarn: 0.75, wordErr: 8, wordWarn: 6, wordErrG1: 12, wordWarnG1: 9 };
const STOP = new Set([...FUNC, 'jsou', 'byl', 'byla', 'bylo', 'být', 'má', 'mají', 'velká', 'velký', 'malá', 'malé']);
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
const content = (text) => new Set(words(text).map((w) => w.toLowerCase()).filter((w) => w.length >= 3 && !STOP.has(w)));
const jaccard = (a, b) => {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
};

const packs = [];
const seed = JSON.parse(await readFile(path.join(root, 'data/dictations.seed.json'), 'utf8'));
packs.push({ id: 'seed', file: 'seed', dictations: seed.dictations, library: false });
const dir = path.join(root, 'data/library');
for (const f of (await readdir(dir).catch(() => [])).filter((x) => x.endsWith('.json')).sort()) {
  const p = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
  packs.push({ id: p.pack_id, file: f, dictations: p.dictations, library: true });
}

const errors = [];
const warns = [];
const E = (m) => errors.push(m);
const W = (m) => warns.push(m);

// Jedinečnost
const seenId = new Map();
const seenTitle = new Map();
const seenSent = new Map();
for (const p of packs) {
  for (const d of p.dictations) {
    if (seenId.has(d.id)) E(`duplicitní ID ${d.id} (${p.id} a ${seenId.get(d.id)})`);
    seenId.set(d.id, p.id);
    const t = d.title.toLowerCase().trim();
    if (seenTitle.has(t)) E(`duplicitní název „${d.title}“ (${d.id} a ${seenTitle.get(t)})`);
    seenTitle.set(t, d.id);
    d.sentences.forEach((s) => {
      const k = norm(s);
      if (seenSent.has(k) && seenSent.get(k) !== d.id) E(`stejná věta „${s}“ v ${d.id} a ${seenSent.get(k)}`);
      seenSent.set(k, d.id);
    });
  }
}

// Podobnost textů (v celé knihovně) a vět
const all = packs.flatMap((p) => p.dictations.map((d) => ({ d, p, set: content(d.text) })));
for (let i = 0; i < all.length; i++) {
  for (let j = i + 1; j < all.length; j++) {
    const s = jaccard(all[i].set, all[j].set);
    if (s >= LIMITS.simError) E(`texty ${all[i].d.id} a ${all[j].d.id} jsou si příliš podobné (${Math.round(s * 100)} % sdílených slov)`);
    else if (s >= LIMITS.simWarn) W(`texty ${all[i].d.id} a ${all[j].d.id} jsou si podobné (${Math.round(s * 100)} %)`);
  }
}
const sentSets = all.flatMap(({ d }) => d.sentences.map((s) => ({ id: d.id, s, set: new Set(words(s).map((w) => w.toLowerCase())) })));
const byFirst = new Map();
for (const x of sentSets) { const k = [...x.set].sort()[0]; (byFirst.get(k) ?? byFirst.set(k, []).get(k)).push(x); }
for (const group of byFirst.values()) {
  for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
    const a = group[i]; const b = group[j];
    if (a.id === b.id || a.set.size < 4 || b.set.size < 4) continue;
    if (jaccard(a.set, b.set) >= LIMITS.sentWarn) W(`podobné věty: „${a.s}“ (${a.id}) ~ „${b.s}“ (${b.id})`);
  }
}

// Opakování slov uvnitř balíčku
const stats = [];
for (const p of packs.filter((x) => x.library)) {
  const count = new Map();
  for (const d of p.dictations) for (const w of content(d.text)) count.set(w, (count.get(w) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const g1 = p.dictations[0]?.recommended_grade === 1;
  const wordErr = g1 ? LIMITS.wordErrG1 : LIMITS.wordErr;
  const wordWarn = g1 ? LIMITS.wordWarnG1 : LIMITS.wordWarn;
  for (const [w, n] of count) {
    if (n > wordErr) E(`${p.id}: slovo „${w}“ je v ${n} textech z ${p.dictations.length} (nejvýše ${wordErr})`);
    else if (n > wordWarn) W(`${p.id}: slovo „${w}“ je v ${n} textech`);
  }
  const first = new Map();
  for (const d of p.dictations) { const w = d.sentences[0].split(' ').slice(0, 2).join(' ').toLowerCase(); first.set(w, (first.get(w) ?? 0) + 1); }
  for (const [w, n] of first) if (n > 4) W(`${p.id}: ${n} textů začíná „${w}…“`);
  stats.push({ id: p.id, n: p.dictations.length, vocab: count.size, words: Math.round(p.dictations.reduce((a, d) => a + d.word_count, 0) / p.dictations.length * 10) / 10, top });
}

// Nezávislé ověření uzavřenosti jevů nad hotovým JSON
for (const p of packs.filter((x) => x.library)) {
  if (p.dictations.length !== 30) E(`${p.id}: počet diktátů ${p.dictations.length}, očekáváno 30`);
  for (const d of p.dictations) {
    const target = d.target_features[0]?.id;
    const tf = taxonomy.features.get(target);
    if (!tf) { E(`${d.id}: neznámý cílový jev`); continue; }
    if (d.recommended_grade !== tf.typical_grade) E(`${d.id}: ročník ${d.recommended_grade} neodpovídá typickému ročníku cíle ${tf.typical_grade}`);
    if (d.target_features.length !== 1) E(`${d.id}: má ${d.target_features.length} cílových jevů, očekáván 1`);
    for (const f of d.incidental_features) {
      const x = taxonomy.features.get(f.id);
      const ok = x && f.id !== target && (x.typical_grade < tf.typical_grade || (x.typical_grade === tf.typical_grade && x.default_policy === 'by_grade'));
      if (!ok) E(`${d.id}: vedlejší jev ${f.id} není dovolen pro cílový jev ${target}`);
    }
    for (const a of d.annotations) {
      const declared = [...d.target_features, ...d.incidental_features].some((f) => f.id === a.feature_id);
      if (!declared) E(`${d.id}: anotace „${a.span}“ patří k nedeklarovanému jevu ${a.feature_id}`);
    }
    if (d.teacher_approved !== false || d.review_status === 'teacher_approved') E(`${d.id}: položka nesmí být označena jako schválená`);
  }
}

const lines = [];
lines.push(`Balíčků knihovny: ${packs.filter((x) => x.library).length}, diktátů: ${packs.filter((x) => x.library).reduce((a, p) => a + p.dictations.length, 0)}.`);
for (const s of stats) lines.push(`  ${s.id.padEnd(12)} ${s.n} textů, ø ${s.words} slov, ${s.vocab} různých obsahových slov; nejčastější: ${s.top.map(([w, n]) => `${w}×${n}`).join(' ')}`);
console.log(lines.join('\n'));
for (const w of warns.slice(0, 40)) console.log(`W  ${w}`);
if (warns.length > 40) console.log(`W  … a ${warns.length - 40} dalších varování`);
for (const e of errors.slice(0, 60)) console.log(`E  ${e}`);
if (errors.length > 60) console.log(`E  … a ${errors.length - 60} dalších chyb`);
console.log(`\nChyb: ${errors.length}, varování: ${warns.length}`);
if (reportPath) await writeFile(reportPath, `# Zpráva kontroly knihovny\n\n(Generováno scripts/lint-library.mjs; nejde o pedagogické schválení.)\n\n\`\`\`\n${lines.join('\n')}\n\nChyb: ${errors.length}, varování: ${warns.length}\n\`\`\`\n`, 'utf8');
process.exit(errors.length ? 1 : 0);

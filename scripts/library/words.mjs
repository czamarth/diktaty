#!/usr/bin/env node
// Pomůcka pro psaní textů: řekne, která slova jsou pro daný ročník bezpečná (bez skrytých jevů).
// Použití: node scripts/library/words.mjs <ročník> slovo1 slovo2 …   (nebo slova na standardním vstupu)
//   ✓ slovo   – bez problému; v závorce automaticky rozpoznané jevy
//   ✗ slovo   – chyba / vyžaduje označení / jev, který žák ročníku ještě nezná
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildTaxonomy } from '../../web/js/taxonomy.js';
import { analyzeWord } from './phenomena.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tax = buildTaxonomy(JSON.parse(await readFile(path.join(root, 'data/profiles.json'), 'utf8')));
const grade = Number(process.argv[2]);
const lineMode = process.argv.includes('--lines');
let list = process.argv.slice(3).filter((a) => a !== '--lines');
if (list.length === 0 && !lineMode) list = (await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)); process.stdin.on('end', () => r(s)); })).split(/\s+/).filter(Boolean);
const short = (f) => f.split('.')[1];
const allowed = (f) => { const x = tax.features.get(f); return x.typical_grade < grade || (x.typical_grade === grade && x.default_policy === 'by_grade'); };
if (lineMode) {
  // Jedna řádka vstupu = jedna kategorie; vypíše jen bezpečná slova, kategorie zachová.
  const input = list.length ? list.join(' ').split('\n') : (await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)); process.stdin.on('end', () => r(s)); })).split('\n');
  for (const line of input) {
    const good = line.split(/\s+/).filter(Boolean).filter((w) => {
      const r = analyzeWord(w, { sentenceFirst: false });
      return r.errors.length === 0 && r.needs.length === 0 && [...r.features].every(allowed);
    });
    console.log(good.join(' '));
  }
  process.exit(0);
}
const ok = [];
const bad = [];
for (const w of list) {
  const r = analyzeWord(w, { sentenceFirst: false });
  const reasons = [...r.errors.map((e) => e.message), ...r.needs.map((n) => n.message)];
  for (const f of r.features) if (!allowed(f)) reasons.push(`jev ${short(f)} (ročník ${tax.features.get(f).typical_grade}) není dovolen`);
  if (reasons.length) bad.push(`✗ ${w}  — ${reasons.join('; ')}`);
  else ok.push(`${w}${r.features.size ? ` (${[...r.features].map(short).join(',')})` : ''}`);
}
console.log(`OK (${ok.length}): ${ok.join('  ')}`);
if (bad.length) console.log(`\n${bad.join('\n')}`);

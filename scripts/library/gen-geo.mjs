#!/usr/bin/env node
// Vygeneruje library-src/geo.txt (zeměpisná jména). Věty jsou pravdivá tvrzení; každé jméno se značí {…}.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let s = Number(process.argv[2] ?? 3) * 2654435761 % 4294967296;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// město: [1. pád, 2. pád, 6. pád, oblast (6. pád s předložkou)]
const CITIES = [
  ['Praha', 'Prahy', 'Praze', 'v Čechách'], ['Brno', 'Brna', 'Brně', 'na Moravě'], ['Plzeň', 'Plzně', null, 'v Čechách'], ['Liberec', 'Liberce', 'Liberci', 'v Čechách'], ['Pardubice', 'Pardubic', 'Pardubicích', 'v Čechách'],
  ['Cheb', 'Chebu', 'Chebu', 'v Čechách'], ['Tábor', 'Tábora', 'Táboře', 'v Čechách'], ['Kladno', 'Kladna', 'Kladně', 'v Čechách'], ['Beroun', 'Berouna', 'Berouně', 'v Čechách'], ['Kolín', 'Kolína', 'Kolíně', 'v Čechách'],
  ['Olomouc', 'Olomouce', 'Olomouci', 'na Moravě'], ['Zlín', 'Zlína', 'Zlíně', 'na Moravě'], ['Prostějov', 'Prostějova', 'Prostějově', 'na Moravě'], ['Přerov', 'Přerova', 'Přerově', 'na Moravě'],
  ['Jičín', 'Jičína', 'Jičíně', 'v Čechách'], ['Náchod', 'Náchoda', 'Náchodě', 'v Čechách'], ['Trutnov', 'Trutnova', 'Trutnově', 'v Čechách'], ['Písek', 'Písku', 'Písku', 'v Čechách'], ['Strakonice', 'Strakonic', 'Strakonicích', 'v Čechách'],
  ['Sokolov', 'Sokolova', 'Sokolově', 'v Čechách'], ['Louny', 'Loun', 'Lounech', 'v Čechách'], ['Most', 'Mostu', 'Mostě', 'v Čechách'], ['Kroměříž', 'Kroměříže', 'Kroměříži', 'na Moravě'], ['Třebíč', 'Třebíče', 'Třebíči', 'na Moravě'],
  ['Znojmo', 'Znojma', 'Znojmě', 'na Moravě'], ['Hodonín', 'Hodonína', 'Hodoníně', 'na Moravě'], ['Blansko', 'Blanska', 'Blansku', 'na Moravě'],
];
const COUNTRIES = [['Polsko', 'Polska', 'Polsku'], ['Slovensko', 'Slovenska', 'Slovensku'], ['Německo', 'Německa', 'Německu'], ['Rakousko', 'Rakouska', 'Rakousku'], ['Česko', 'Česka', 'Česku'], ['Španělsko', 'Španělska', 'Španělsku']];
const RIVERS = [['Vltava', 'v Čechách'], ['Labe', 'v Čechách'], ['Odra', 'v Polsku'], ['Dunaj', 'v Rakousku'], ['Morava', 'na Moravě'], ['Berounka', 'v Čechách'], ['Sázava', 'v Čechách'], ['Ohře', 'v Čechách'], ['Jizera', 'v Čechách'], ['Dyje', 'na Moravě']];
const MOUNTAINS = [['Sněžka', 'Sněžku', 'Krkonoších'], ['Říp', 'Říp', 'Čechách'], ['Šumava', 'Šumavu', 'Čechách'], ['Jeseníky', 'Jeseníky', 'na Moravě'], ['Krkonoše', 'Krkonoše', 'Čechách']];
const SUBJ = ['Jan', 'Petr', 'Karel', 'Marek', 'Radek', 'Adam', 'Pavel', 'Ota', 'Roman', 'Vojta', 'Eva', 'Olga', 'Anna', 'Dana', 'Lenka', 'Tereza', 'Hana', 'Alena', 'Nela', 'Marta', 'Ema', 'Lara'];
const mk = (w) => `{${w}}`;
const mkRegion = (r) => { const [prep, name] = r.split(' '); return `${prep} ${mk(name)}`; };
const norm = (x) => x.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
const taken = new Set();
for (const f of await readdir(path.join(root, 'library-src'))) {
  if (!f.endsWith('.txt') || f === 'geo.txt') continue;
  for (const line of (await readFile(path.join(root, 'library-src', f), 'utf8')).split('\n')) taken.add(norm(line.replace(/[{}]|\|\w+/g, '')));
}
const fresh = (x) => !taken.has(norm(x.replace(/[{}]/g, '')));
const uses = new Map(); const bump = (k) => uses.set(k, (uses.get(k) ?? 0) + 1); const used = (k) => uses.get(k) ?? 0;
const subj = () => shuffle(SUBJ).find((x) => used(`s:${x}`) < 5) ?? SUBJ[0];
const cv = (list) => { const x = shuffle(list).find((p) => used(`v:${p.split(' ')[0]}`) < 8); if (!x) return null; bump(`v:${x.split(' ')[0]}`); return x; };
const regionOk = (r) => used(`r:${r}`) < 8;
const gens = [
  () => { const c = shuffle(CITIES.filter((x) => regionOk(x[3])))[0]; if (!c) return null; bump(`r:${c[3]}`); const f = shuffle(['je město', 'je velké město', 'je krásné město', 'leží'])[0]; return f === 'leží' ? `${mk(c[0])} leží ${mkRegion(c[3])}.` : `${mk(c[0])} ${f} ${mkRegion(c[3])}.`; },
  () => { const c = shuffle(CITIES)[0]; const sj = subj(); const v = cv(['jede do', 'jde do', 'cestuje do', 'spěchá do']); if (!v) return null; bump(`s:${sj}`); return `${sj} ${v} ${mk(c[1])}.`; },
  () => { const c = shuffle(CITIES.filter((x) => x[2]))[0]; const sj = subj(); const v = cv(['je v', 'pracuje v', 'žije v', 'studuje v', 'čeká v', 'zůstane v']); if (!v) return null; bump(`s:${sj}`); return `${sj} ${v} ${mk(c[2])}.`; },
  () => { const [a, b] = shuffle(CITIES).slice(0, 2); const sj = subj(); const v = cv(['jede z', 'cestuje z', 'jde z', 'spěchá z']); if (!v) return null; bump(`s:${sj}`); return `${sj} ${v} ${mk(a[1])} do ${mk(b[1])}.`; },
  () => { const r = shuffle(RIVERS.filter((x) => regionOk(x[1])))[0]; if (!r) return null; bump(`r:${r[1]}`); return `Řeka ${mk(r[0])} teče ${mkRegion(r[1])}.`; },
  () => { const c = shuffle(COUNTRIES)[0]; const sj = subj(); const v = cv(['jede do', 'cestuje do', 'míří do ✗'.replace(' ✗', '').replace('míří', 'letí')]); if (!v) return null; bump(`s:${sj}`); return `${sj} ${v} ${mk(c[1])}.`; },
  () => { const c = shuffle(COUNTRIES)[0]; return `${mk(c[0])} je země v ${mk('Evropě')}.`; },
  () => { const m = shuffle(MOUNTAINS)[0]; const sj = subj(); const v = cv(['jde na', 'stoupá na', 'jede na']); if (!v) return null; bump(`s:${sj}`); return `${sj} ${v} ${mk(m[1])}.`; },
  () => {
    const m = shuffle(MOUNTAINS)[0];
    const single = ['Sněžka', 'Říp'].includes(m[0]);
    const plural = ['Krkonoše', 'Jeseníky'].includes(m[0]);
    const where = m[0] === 'Sněžka' ? `v ${mk('Krkonoších')}` : m[0] === 'Jeseníky' ? `na ${mk('Moravě')}` : `v ${mk('Čechách')}`;
    if (where.includes('Čechách') && !regionOk('v Čechách')) return null;
    if (where.includes('Čechách')) bump('r:v Čechách');
    return `${mk(m[0])} ${plural ? 'jsou' : 'je'} ${single ? 'hora' : 'pohoří'} ${where}.`;
  },
];
const blocks = [];
for (let i = 0; i < 30; i++) {
  const lines = [];
  for (let t = 0; t < 200 && lines.length < 3; t++) { const l = shuffle(gens)[0](); if (l && fresh(l) && !lines.includes(l)) lines.push(l); }
  for (const l of lines) taken.add(norm(l.replace(/[{}]/g, '')));
  blocks.push(`# Zeměpisná jména ${i + 1}\n${lines.join('\n')}\n`);
}
await writeFile(path.join(root, 'library-src/geo.txt'), `feature: orth.proper_names_geographic\ncode: geo\n---\n${blocks.join('\n')}`, 'utf8');
console.log(`zapsáno ${blocks.length} bloků`);

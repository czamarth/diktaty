#!/usr/bin/env node
// Vygeneruje library-src/pre.txt (předpony s-/z-/vz-). Značí se předponové sloveso: {smaže}, {zhasnout}.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let s = Number(process.argv[2] ?? 3) * 2654435761 % 4294967296;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const cap = (w) => w[0].toUpperCase() + w.slice(1);

// [přítomný/budoucí tvar, infinitiv, vhodné předměty]
const V = [
  ['smaže', 'smazat', ['nápis', 'písmo', 'větu']], ['shrabe', 'shrabat', ['seno', 'trávu', 'dřevo']], ['schová', 'schovat', ['klíč', 'tašku', 'kost', 'kabát']], ['sebere', 'sebrat', ['jablka', 'hrušky', 'dřevo', 'kameny ✗']],
  ['setře', 'setřít', ['stůl', 'okno', 'podlahu']], ['stáhne', 'stáhnout', ['kabát', 'šátek', 'lano']], ['zhasne', 'zhasnout', ['lampu', 'oheň', 'světlo']], ['zvedne', 'zvednout', ['kámen', 'koš', 'tašku', 'vědro', 'lopatu', 'hůl']],
  ['zboří', 'zbořit', ['dům', 'plot', 'most', 'hrad']], ['zbourá', 'zbourat', ['dům', 'plot', 'zeď', 'stodolu']], ['zmenší', 'zmenšit', ['písmo', 'obraz', 'mapu']], ['zlepší', 'zlepšit', ['písmo', 'cestu', 'zahradu']],
  ['zvětší', 'zvětšit', ['písmo', 'mapu', 'obraz', 'dům']], ['vzdá', 'vzdát', ['boj', 'hru', 'závod']], ['spočte', 'spočítat', ['jablka', 'hrušky', 'koláče']], ['strhne', 'strhnout', ['plot', 'střechu', 'lano']],
  ['smotá', 'smotat', ['lano', 'šátek', 'provaz ✗']], ['vzplane', 'vzplanout', []], ['vzlétne', 'vzlétnout', []], ['sjede', 'sjet', ['kopec', 'svah']], ['seskočí', 'seskočit', []],
].map(([a, b, o]) => [a, b, o.filter((x) => !x.includes('✗'))]);
const SUBJ = ['Jan', 'Petr', 'Karel', 'Marek', 'Radek', 'Adam', 'Pavel', 'Ota', 'Roman', 'Vojta', 'Eva', 'Olga', 'Anna', 'Dana', 'Lenka', 'Tereza', 'Hana', 'Alena', 'Nela', 'Marta', 'Ema', 'Lara', 'tesař', 'kovář', 'rolník', 'pekař', 'kuchař', 'soused', 'učitel', 'žák'];
const INTRANS = { vzplane: ['Oheň', 'Sláma ✗', 'Seno'], vzlétne: ['Letadlo', 'Orel', 'Sokol', 'Pták'], seskočí: ['Kluk ze stolu', 'Kočka ze stolu', 'Pes z plotu', 'Žák ze zdi ✗', 'Eva z kopce'] };
for (const k of Object.keys(INTRANS)) INTRANS[k] = INTRANS[k].filter((x) => !x.includes('✗'));
const norm = (x) => x.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
const taken = new Set();
for (const f of await readdir(path.join(root, 'library-src'))) {
  if (!f.endsWith('.txt') || f === 'pre.txt') continue;
  for (const line of (await readFile(path.join(root, 'library-src', f), 'utf8')).split('\n')) taken.add(norm(line.replace(/[{}]|\|\w+/g, '')));
}
const fresh = (x) => !taken.has(norm(x.replace(/[{}]/g, '')));
const uses = new Map(); const bump = (k) => uses.set(k, (uses.get(k) ?? 0) + 1); const used = (k) => uses.get(k) ?? 0;
const makeLine = () => {
  const v = shuffle(V).find(([a]) => used(`v:${a}`) < 8);
  if (!v) return null;
  const [pres, inf, objs] = v;
  const intrans = INTRANS[pres];
  let line;
  if (intrans) {
    const sj = shuffle(intrans)[0];
    const [subj, ...rest] = sj.split(' ');
    line = `${subj} {${pres}}${rest.length ? ` ${rest.join(' ')}` : ''}.`;
  } else {
    const sj = shuffle(SUBJ).find((x) => used(`s:${x}`) < 5) ?? SUBJ[0];
    const o = shuffle(objs)[0];
    const modal = shuffle(['chce', 'může', 'začne', 'má']).find((x) => used(`m:${x}`) < 7);
    const form = rnd() < 0.5 && modal ? `${modal} {${inf}}` : `{${pres}}`;
    if (form.includes(' {')) bump(`m:${modal}`);
    line = `${cap(sj)} ${form} ${o}.`;
    bump(`s:${sj}`);
  }
  bump(`v:${pres}`);
  return line;
};
const blocks = [];
for (let i = 0; i < 30; i++) {
  const lines = [];
  for (let t = 0; t < 80 && lines.length < 4; t++) { const l = makeLine(); if (l && fresh(l) && !lines.includes(l)) lines.push(l); }
  for (const l of lines) taken.add(norm(l.replace(/[{}]/g, '')));
  blocks.push(`# Předpony s-, z-, vz- ${i + 1}\n${lines.join('\n')}\n`);
}
await writeFile(path.join(root, 'library-src/pre.txt'), `feature: orth.prefixes_s_z_vz\ncode: pre\n---\n${blocks.join('\n')}`, 'utf8');
console.log(`zapsáno ${blocks.length} bloků`);

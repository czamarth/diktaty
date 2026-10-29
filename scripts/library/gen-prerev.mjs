#!/usr/bin/env node
// Vygeneruje library-src/prerev.txt (opakování předpon: vy-/vý-, při-/pře-, od-, pod-, před-, roz-, ob-, s-/z-/vz-).
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let s = Number(process.argv[2] ?? 3) * 2654435761 % 4294967296;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const cap = (w) => w[0].toUpperCase() + w.slice(1);
const V = [
  ['vyběhne', 'vyběhnout', ['ven', 'z domu', 'z lesa']], ['vyjede', 'vyjet', ['z města', 'z lesa', 'ze dvora']], ['vynese', 'vynést', ['koš', 'vědro', 'dřevo']], ['vykope', 'vykopat', ['jámu', 'záhon']], ['vybere', 'vybrat', ['jablka', 'hrušky', 'kámen']],
  ['vyloží', 'vyložit', ['dřevo', 'koše', 'seno']], ['vytáhne', 'vytáhnout', ['lano', 'kámen', 'vědro']], ['vydá', 'vydat', ['knihu', 'mapu']], ['přijede', 'přijet', ['domů', 'do města', 'k lesu']], ['přinese', 'přinést', ['koš', 'dřevo', 'mléko', 'chléb']],
  ['přečte', 'přečíst', ['knihu', 'větu', 'pohádku']], ['přeskočí', 'přeskočit', ['plot', 'potok', 'kámen']], ['přenese', 'přenést', ['kámen', 'koš', 'dřevo']], ['přejde', 'přejít', ['cestu', 'potok', 'louku']], ['přidá', 'přidat', ['sůl', 'cukr', 'dřevo']],
  ['přivede', 'přivést', ['psa', 'koně', 'kozu']], ['přeběhne', 'přeběhnout', ['cestu', 'louku', 'dvůr']], ['odejde', 'odejít', ['domů', 'do lesa', 'k potoku']], ['odnese', 'odnést', ['koš', 'vědro', 'dřevo']], ['odjede', 'odjet', ['do města', 'domů', 'k lesu']],
  ['odběhne', 'odběhnout', ['k lesu', 'k potoku', 'domů']], ['podběhne', 'podběhnout', ['plot', 'most']], ['předběhne', 'předběhnout', ['kluka', 'psa', 'tátu']], ['rozběhne se', 'rozběhnout se', ['k lesu', 'k potoku', 'po louce']], ['rozloží', 'rozložit', ['dřevo', 'seno', 'mapu']],
  ['obejde', 'obejít', ['dům', 'plot', 'rybník']], ['smaže', 'smazat', ['nápis', 'písmo', 'větu']], ['zhasne', 'zhasnout', ['lampu', 'oheň']], ['zvedne', 'zvednout', ['kámen', 'koš', 'vědro']], ['vzdá', 'vzdát', ['boj', 'hru', 'závod']],
  ['sebere', 'sebrat', ['jablka', 'hrušky', 'dřevo']], ['schová', 'schovat', ['tašku', 'kost', 'kabát']], ['zbourá', 'zbourat', ['dům', 'plot', 'zeď']], ['zlepší', 'zlepšit', ['písmo', 'cestu', 'zahradu']],
];
const SUBJ = ['Jan', 'Petr', 'Karel', 'Marek', 'Radek', 'Adam', 'Pavel', 'Ota', 'Roman', 'Vojta', 'Eva', 'Olga', 'Anna', 'Dana', 'Lenka', 'Tereza', 'Hana', 'Alena', 'Nela', 'Marta', 'Ema', 'Lara', 'tesař', 'kovář', 'rolník', 'pekař', 'kuchař', 'soused', 'učitel', 'žák', 'pastýř', 'rybář'];
const norm = (x) => x.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
const taken = new Set();
for (const f of await readdir(path.join(root, 'library-src'))) {
  if (!f.endsWith('.txt') || f === 'prerev.txt') continue;
  for (const line of (await readFile(path.join(root, 'library-src', f), 'utf8')).split('\n')) taken.add(norm(line.replace(/[{}]|\|\w+/g, '')));
}
const fresh = (x) => !taken.has(norm(x.replace(/[{}]/g, '')));
const uses = new Map(); const bump = (k) => uses.set(k, (uses.get(k) ?? 0) + 1); const used = (k) => uses.get(k) ?? 0;
const mark = (w) => w.split(' ').map((x, i) => (i === 0 ? `{${x}|t}` : x)).join(' ');
const makeLine = () => {
  const v = shuffle(V).find(([a]) => used(`v:${a}`) < 5);
  if (!v) return null;
  const [pres, inf, objs] = v;
  const sj = shuffle(SUBJ).find((x) => used(`s:${x}`) < 5) ?? SUBJ[0];
  const o = shuffle(objs)[0];
  const modal = shuffle(['chce', 'může', 'začne', 'má']).find((x) => used(`m:${x}`) < 8);
  const useModal = rnd() < 0.4 && modal;
  const form = useModal ? `${modal} ${mark(inf)}` : mark(pres);
  if (useModal) bump(`m:${modal}`);
  bump(`v:${pres}`); bump(`s:${sj}`);
  return `${cap(sj)} ${form} ${o}.`;
};
const blocks = [];
for (let i = 0; i < 30; i++) {
  const lines = [];
  for (let t = 0; t < 120 && lines.length < 4; t++) { const l = makeLine(); if (l && fresh(l) && !lines.includes(l)) lines.push(l); }
  for (const l of lines) taken.add(norm(l.replace(/[{}]/g, '').replace(/\|t/g, '')));
  blocks.push(`# Opakování předpon ${i + 1}\n${lines.join('\n')}\n`);
}
await writeFile(path.join(root, 'library-src/prerev.txt'), `feature: orth.prefixes_review\ncode: prerev\n---\n${blocks.join('\n')}`, 'utf8');
console.log(`zapsáno ${blocks.length} bloků`);

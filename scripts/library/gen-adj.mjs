#!/usr/bin/env node
// Vygeneruje zdroj library-src/adj.txt (koncovky tvrdých přídavných jmen -ý/-y) z ručně sestavených dvojic.
// Deterministické (seed). Výsledek se pak sestaví a zkontroluje stejně jako ručně psané zdroje.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const seed = Number(process.argv[2] ?? 7);
let s = seed * 2654435761 % 4294967296;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// Podstatná jména (mužský rod, jednotné číslo) s přijatelnými přídavnými jmény a slovesnými spojeními.
const ANIMATE = {
  nouns: ['pes', 'kocour', 'kůň', 'soused', 'rolník', 'pastýř', 'tesař', 'kovář', 'pekař', 'kuchař', 'rybář', 'kluk', 'vrabec', 'kohout', 'ježek', 'pták', 'lev', 'slon', 'medvěd', 'vlk'],
  adjs: ['hodný', 'veselý', 'šťastný', 'hladový', 'věrný', 'zdravý', 'starý', 'malý', 'černý', 'hnědý', 'pěkný', 'chytrý', 'hloupý', 'smutný'],
  preds: ['běží lesem', 'sedí u plotu', 'čeká u dveří', 'jde domů', 'hledá kost', 'stojí na louce', 'jde k potoku', 'jde po cestě', 'čeká na kopci'],
};
const PLACE_NOUNS = ['les', 'rybník', 'potok', 'sad', 'hrad', 'dům', 'most', 'plot', 'strom', 'dub'];
const MOVABLE_NOUNS = ['kabát', 'klobouk', 'pohár', 'nůž', 'koš', 'batoh', 'chléb', 'koláč', 'svetr', 'kámen', 'stůl', 'vůz', 'vlak'];
const THINGS = {
  nouns: [...PLACE_NOUNS, ...MOVABLE_NOUNS],
  adjs: ['nový', 'malý', 'černý', 'hnědý', 'zlatý', 'tmavý', 'krásný', 'teplý', 'studený', 'mohutný', 'stříbrný', 'červený', 'zelený', 'hrubý', 'čistý', 'pěkný', 'starý', 'těžký'],
  predsPlace: ['je za městem', 'je za lesem', 'je na kopci', 'je za domem', 'je u řeky', 'je blízko louky'],
  predsMovable: ['leží na stole', 'leží u dveří', 'leží u plotu', 'stojí na stole', 'je na stole', 'leží na louce'],
};
THINGS.preds = [...THINGS.predsPlace, ...THINGS.predsMovable];
// vhodnost: každé přídavné jméno smí jen k podstatným jménům, se kterými dává smysl ('*' = ke všem)
const NATURAL = ['les', 'rybník', 'potok', 'sad', 'strom', 'dub', 'kámen'];
const CLOTHES = ['kabát', 'klobouk', 'svetr'];
const ADJ_OK = {
  nový: ['dům', 'hrad', 'most', 'plot', 'kabát', 'klobouk', 'pohár', 'nůž', 'koš', 'batoh', 'svetr', 'stůl', 'vůz', 'vlak', 'koláč', 'chléb'],
  malý: '*', černý: ['dům', 'most', 'plot', 'kabát', 'klobouk', 'pohár', 'nůž', 'koš', 'batoh', 'svetr', 'stůl', 'vůz', 'vlak', 'kámen', 'chléb', 'les', 'dub'],
  hnědý: ['dub', 'kabát', 'klobouk', 'svetr', 'kámen', 'chléb', 'koš', 'batoh', 'stůl', 'plot', 'dům', 'vůz', 'koláč'],
  zlatý: ['pohár', 'nůž'], tmavý: ['les', 'dům', 'kabát', 'klobouk', 'svetr', 'chléb', 'sad', 'rybník'], krásný: '*',
  teplý: ['kabát', 'svetr', 'koláč', 'chléb'], studený: ['potok', 'rybník', 'koláč', 'kámen'], mohutný: ['dub', 'strom', 'hrad', 'dům', 'most', 'kámen', 'plot'],
  stříbrný: ['pohár', 'nůž'], červený: ['hrad', 'dům', 'kabát', 'klobouk', 'svetr', 'koláč', 'vlak', 'vůz', 'batoh', 'koš'], zelený: ['strom', 'dub', 'sad', 'les', 'vlak', 'batoh', 'kabát', 'svetr', 'klobouk', 'vůz'],
  hrubý: ['kámen', 'kabát', 'svetr', 'chléb', 'plot'], čistý: ['potok', 'rybník', 'kabát', 'klobouk', 'svetr', 'nůž', 'pohár', 'stůl'], pěkný: '*', starý: '*',
  těžký: ['kámen', 'pohár', 'nůž', 'koš', 'batoh', 'stůl', 'vůz', 'plot', 'kabát', 'svetr', 'most', 'hrad'],
  hodný: '*', veselý: '*', šťastný: '*', hladový: '*', věrný: '*', zdravý: '*', chytrý: '*', hloupý: '*', smutný: '*',
};
const bad = (n, a) => { const ok = ADJ_OK[a]; return !(ok === '*' || (Array.isArray(ok) && ok.includes(n))); };
const cap = (w) => w[0].toUpperCase() + w.slice(1);

const norm = (x) => x.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
const taken = new Set();
for (const f of await readdir(path.join(root, 'library-src'))) {
  if (!f.endsWith('.txt') || f === 'adj.txt') continue;
  for (const line of (await readFile(path.join(root, 'library-src', f), 'utf8')).split('\n')) taken.add(norm(line.replace(/[{}]|\|\w+/g, '')));
}
const seedData = JSON.parse(await readFile(path.join(root, 'data/dictations.seed.json'), 'utf8'));
for (const d of seedData.dictations) for (const x of d.sentences) taken.add(norm(x));
const fresh = (sentence) => !taken.has(norm(sentence.replace(/[{}]/g, '')));
const claim = (sentence) => taken.add(norm(sentence.replace(/[{}]/g, '')));
const useCount = new Map();
const bump = (k) => useCount.set(k, (useCount.get(k) ?? 0) + 1);
const used = (k) => useCount.get(k) ?? 0;

const titles = new Set();
const blocks = [];
const order = shuffle([...Array(60).keys()]);
for (let i = 0; i < 30; i++) {
  const group = i % 2 === 0 ? THINGS : ANIMATE;
  const sentences = [];
  const nouns = shuffle(group.nouns).filter((n) => used(`n:${n}`) < 5).slice(0, 3);
  const pickAdj = (n, taken) => shuffle(group.adjs).find((a) => !taken.has(a) && used(`a:${a}`) < 7 && !bad(n, a));
  const takenAdj = new Set();
  // 1. přívlastek + sloveso
  const n1 = nouns[0];
  const a1 = pickAdj(n1, takenAdj); takenAdj.add(a1);
  const predPool = group === THINGS ? (PLACE_NOUNS.includes(n1) ? THINGS.predsPlace : THINGS.predsMovable) : group.preds;
  const stem = n1.slice(0, 3);
  const p1 = shuffle(predPool).find((p) => !p.includes(stem) && used(`p:${p}`) < 5 && used(`pv:${p.split(' ')[0]}`) < 8 && fresh(`${cap(a1)} ${n1} ${p}.`)) ?? predPool[0];
  bump(`p:${p1}`); bump(`pv:${p1.split(' ')[0]}`);
  sentences.push(`{${cap(a1)}} ${n1} ${p1}.`);
  // 2. přívlastek ve 4. pádě (stejný tvar -ý pro neživotné)
  const n2 = nouns[1];
  const a2 = pickAdj(n2, takenAdj); takenAdj.add(a2);
  const verb2 = group === THINGS ? ['kluk hledá', 'dívka vidí ✗'][0] : 'kluk sleduje';
  void verb2;
  const SUBJ = ['Jan', 'Petr', 'Eva', 'Olga', 'Dana', 'Karel', 'Anna', 'Marek', 'Hana', 'Radek', 'Ota', 'Lenka', 'Adam', 'Tereza', 'Pavel', 'Alena', 'Roman', 'Nela', 'Vojta', 'Marta'];
  const VERBS = group === THINGS ? ['hledá', 'nese', 'drží', 'zná', 'bere', 'opravuje', 'ukazuje', 'sleduje', 'maluje'] : ['sleduje', 'hladí', 'hledá', 'zná', 'volá', 'vede', 'kupuje', 'maluje'];
  let subj2; let v2;
  outer: for (const sj of shuffle(SUBJ)) for (const vb of shuffle(VERBS)) {
    if (used(`s:${sj}`) < 3 && used(`v:${vb}`) < 5 && fresh(`${sj} ${vb} ${a2} ${n2}.`)) { subj2 = sj; v2 = vb; break outer; }
  }
  subj2 ??= SUBJ[0]; v2 ??= VERBS[0];
  bump(`s:${subj2}`); bump(`v:${v2}`);
  if (group === THINGS) {
    sentences.push(`${subj2} ${v2} {${a2}} ${n2}.`);
  } else {
    // životná jména: 4. pád má jiný tvar (malého pastýře), proto jen podmět v 1. pádě
    const p2 = shuffle(group.preds).find((p) => used(`p:${p}`) < 5 && fresh(`${cap(a2)} ${n2} ${p}.`)) ?? group.preds[1];
    bump(`p:${p2}`);
    sentences.push(`{${cap(a2)}} ${n2} ${p2}.`);
  }
  // 3. přísudek
  const n3 = nouns[2];
  const a3 = shuffle(group.adjs).find((a) => !takenAdj.has(a) && used(`a:${a}`) < 7 && !bad(n3, a) && fresh(`${cap(n3)} je ${a}.`)) ?? pickAdj(n3, takenAdj); takenAdj.add(a3);
  sentences.push(`${cap(n3)} je {${a3}}.`);
  // 4. přísudek prvního podstatného jména
  const a4 = shuffle(group.adjs).find((a) => !takenAdj.has(a) && used(`a:${a}`) < 7 && !bad(n1, a) && fresh(`${cap(n1)} je ${a}.`));
  if (a4) { takenAdj.add(a4); sentences.push(`${cap(n1)} je {${a4}}.`); }
  for (const x of sentences) claim(x);
  for (const a of takenAdj) bump(`a:${a}`);
  for (const n of nouns) bump(`n:${n}`);
  let title = `${cap(a1)} ${n1}`;
  if (titles.has(title)) title = `${cap(n2)} a ${n1}`;
  if (titles.has(title)) title = `${cap(n3)} a ${n2} (${i + 1})`;
  titles.add(title);
  blocks.push(`# ${title}\n${sentences.join('\n')}\n`);
}
void order;
await writeFile(path.join(root, 'library-src/adj.txt'), `feature: orth.adjective_hard_endings\ncode: adj\n---\n${blocks.join('\n')}`, 'utf8');
console.log(`zapsáno ${blocks.length} bloků`);

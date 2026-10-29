#!/usr/bin/env node
// Vygeneruje library-src/pr.txt (přímá řeč). Uvozovací slovesa jsou v přítomném čase (minulý čas by byl jiný jev).
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let s = Number(process.argv[2] ?? 3) * 2654435761 % 4294967296;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const cap = (w) => w[0].toUpperCase() + w.slice(1);

const SPEAKERS = ['máma', 'táta', 'děda', 'teta', 'sestra', 'bratr', 'soused', 'učitel', 'kamarád', 'dívka', 'kluk', 'pekař', 'kuchař', 'pastýř', 'rybář', 'kovář', 'Eva', 'Petr', 'Anna', 'Jan', 'Dana', 'Karel'];
const VERBS = ['říká', 'volá', 'křičí', 'šeptá', 'dodává', 'poznamenává', 'opakuje', 'přidává', 'pokračuje', 'oznamuje', 'upozorňuje', 'ujišťuje', 'doporučuje', 'navrhuje', 'zdůrazňuje'];
const ASK = ['ptá se', 'zjišťuje', 'chce vědět'];
// [text, typ]  typ: s = oznámení (. ), i = rozkaz (! nebo .), q = otázka (?)
const SPEECH = [
  ['Pojď domů', 'i'], ['Jdi ven', 'i'], ['Nes koš', 'i'], ['Drž lano', 'i'], ['Běž k lesu', 'i'], ['Počkej u dveří', 'i'], ['Čti knihu', 'i'], ['Hledej tašku', 'i'], ['Zavolej tátu', 'i'], ['Podej chléb', 'i'], ['Ukaž cestu', 'i'],
  ['Pojď k potoku', 'i'], ['Nes dřevo', 'i'], ['Zalej záhon', 'i'], ['Vezmi koš ✗', 'i'], ['Otevři okno ✗', 'i'], ['Zavři dveře ✗', 'i'],
  ['Venku sněží', 's'], ['Dnes je sobota', 's'], ['Louka je zelená', 's'], ['Řeka je hluboká', 's'], ['Ráno je mlha', 's'], ['Večer bude klid', 's'], ['Doma je teplo', 's'], ['Pes štěká', 's'], ['Kočka mňouká', 's'],
  ['Les je tichý', 's'], ['Slunce hřeje', 's'], ['Hora je daleko', 's'], ['Cesta je dlouhá', 's'], ['Voda je studená', 's'], ['Koláč voní', 's'], ['Dům je u lesa', 's'], ['Kolo je u plotu', 's'],
  ['Kde stojíš', 'q'], ['Kam jdeš', 'q'], ['Co hledáš', 'q'], ['Co čteš', 'q'], ['Kdo čeká u dveří', 'q'], ['Kde je táta', 'q'], ['Kde je pes', 'q'], ['Kdo nese koš', 'q'], ['Co voní', 'q'], ['Kam běžíš', 'q'], ['Kdo zná cestu', 'q'],
].filter(([x]) => !x.includes('✗'));
const norm = (x) => x.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
const taken = new Set();
for (const f of await readdir(path.join(root, 'library-src'))) {
  if (!f.endsWith('.txt') || f === 'pr.txt') continue;
  for (const line of (await readFile(path.join(root, 'library-src', f), 'utf8')).split('\n')) taken.add(norm(line.replace(/[{}]|\|\w+/g, '')));
}
const fresh = (x) => !taken.has(norm(x.replace(/[{}]/g, '')));
const uses = new Map(); const bump = (k) => uses.set(k, (uses.get(k) ?? 0) + 1); const used = (k) => uses.get(k) ?? 0;
const lower = (x) => x[0].toLowerCase() + x.slice(1);

const pick = (type) => shuffle(SPEECH.filter(([, t]) => !type || t === type)).find(([x, t]) => used(`x:${x}`) < (t === 'q' ? 2 : 4));
const end = (t) => (t === 'q' ? '?' : t === 'i' ? (rnd() < 0.5 ? '!' : '.') : '.');
const makeA = (speaker, verb) => { const sp = pick(); if (!sp) return null; const [x, t] = sp; bump(`x:${x}`); const v = t === 'q' ? (shuffle(ASK).find((a) => used(`v:${a}`) < 8) ?? 'ptá se') : verb; if (t === 'q') bump(`v:${v}`); return `${cap(speaker)} ${v}{: „${x}${end(t)}“}`.replace(/\{: „(.*)“\}$/, (m) => m) + ''; };
const makeB = (speaker, verb) => { const sp = pick(); if (!sp) return null; const [x, t] = sp; bump(`x:${x}`); const v = t === 'q' ? (shuffle(ASK).find((a) => used(`v:${a}`) < 8) ?? 'ptá se') : verb; if (t === 'q') bump(`v:${v}`); const e = end(t); return e === '.' ? `{„${x},“} ${v} ${speaker}.` : `{„${x}${e}“} ${v} ${speaker}.`; };
const makeC = (speaker, verb) => { const a = pick('i') ?? pick(); const b = pick('s'); if (!a || !b) return null; bump(`x:${a[0]}`); bump(`x:${b[0]}`); return `{„${a[0]},“} ${verb} ${speaker}{, „${lower(b[0])}.“}`; };

const blocks = []; const titles = new Set();
for (let i = 0; i < 30; i++) {
  const speakers = shuffle(SPEAKERS).filter((x) => used(`sp:${x}`) < 5).slice(0, 4);
  const makers = shuffle([makeA, makeB, makeC, makeA, makeB]).slice(0, 3);
  const lines = [];
  makers.forEach((mkf, j) => {
    let line; for (let tries = 0; tries < 60; tries++) {
      const verb = shuffle(VERBS).find((x) => used(`v:${x}`) < 7) ?? VERBS[0];
      line = mkf(speakers[j], verb);
      if (line && fresh(line) && !lines.includes(line)) { bump(`v:${verb}`); break; }
      line = null;
    }
    if (line) { lines.push(line); bump(`sp:${speakers[j]}`); }
  });
  for (const l of lines) taken.add(norm(l.replace(/[{}]/g, '')));
  let title = `Přímá řeč ${i + 1}`; titles.add(title);
  blocks.push(`# ${title}\n${lines.join('\n')}\n`);
}
await writeFile(path.join(root, 'library-src/pr.txt'), `feature: punct.direct_speech\ncode: pr\n---\n${blocks.join('\n')}`, 'utf8');
console.log(`zapsáno ${blocks.length} bloků`);

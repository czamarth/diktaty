#!/usr/bin/env node
// Vygeneruje library-src/pas.txt (minulý čas v jednotném čísle, shoda podmětu s přísudkem).
// Značí se podmět + přísudek: {Petr četl}, {Eva četla}, {Dítě stálo}.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let s = Number(process.argv[2] ?? 3) * 2654435761 % 4294967296;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const cap = (w) => w[0].toUpperCase() + w.slice(1);

const SUBJ = {
  m: ['Petr', 'Jan', 'Karel', 'Marek', 'Radek', 'Adam', 'Pavel', 'Ota', 'Roman', 'Vojta', 'kluk', 'pes', 'kocour', 'soused', 'pastýř', 'tesař', 'kovář', 'pekař', 'kuchař', 'rybář', 'dědeček', 'táta', 'učitel'],
  f: ['Eva', 'Olga', 'Anna', 'Dana', 'Lenka', 'Tereza', 'Hana', 'Alena', 'Nela', 'Marta', 'dívka', 'kočka', 'máma', 'teta', 'sestra', 'sousedka', 'kuchařka', 'učitelka', 'koza', 'kráva', 'husa'],
  n: ['dítě', 'štěně', 'kotě', 'hříbě', 'tele', 'prase'],
};
// slovesa v minulém čase: [m, f, n, předmět-hodící-se]
const V = [
  ['nesl', 'nesla', 'neslo', ['koš', 'vědro', 'tašku', 'kabát', 'dřevo', 'mléko']], ['četl', 'četla', 'četlo', ['knihu', 'větu', 'pohádku', 'mapu']], ['vedl', 'vedla', 'vedlo', ['koně', 'psa', 'kozu']],
  ['hledal', 'hledala', 'hledalo', ['kost', 'tašku', 'kabát', 'sekeru', 'lopatu', 'kolo']], ['volal', 'volala', 'volalo', ['psa', 'mámu', 'tátu']], ['čekal', 'čekala', 'čekalo', ['u dveří', 'u plotu', 'na vlak', 'na louce']],
  ['kopal', 'kopala', 'kopalo', ['jámu', 'zahradu']], ['pekl', 'pekla', 'peklo', ['koláč', 'chléb']], ['vařil', 'vařila', 'vařilo', ['polévku', 'rýži']], ['šel', 'šla', 'šlo', ['domů', 'do lesa', 'k potoku', 'k lesu']],
  ['jel', 'jela', 'jelo', ['domů', 'do města', 'na kole', 'za tátou']], ['běžel', 'běžela', 'běželo', ['domů', 'k lesu', 'po louce', 'ven']], ['stál', 'stála', 'stálo', ['u okna', 'u plotu', 'na louce', 'u dveří']],
  ['ležel', 'ležela', 'leželo', ['na stole', 'u plotu', 'na louce', 'u dveří']], ['seděl', 'seděla', 'sedělo', ['u okna', 'u stolu', 'u řeky', 'na plotě']], ['plaval', 'plavala', 'plavalo', ['v rybníku', 'v řece', 'v jezeru']],
  ['hrál', 'hrála', 'hrálo', ['na louce', 'na dvoře', 'před domem']], ['dělal', 'dělala', 'dělalo', ['dřevo ✗']], ['držel', 'držela', 'drželo', ['lopatu', 'psa', 'tašku', 'lano']],
  ['maloval', 'malovala', 'malovalo', ['obraz', 'dům', 'plot']], ['kupoval', 'kupovala', 'kupovalo', ['chléb', 'mléko', 'koláč']], ['pracoval', 'pracovala', 'pracovalo', ['na zahradě', 'v dílně', 'na poli ✗']],
  ['znal', 'znala', 'znalo', ['cestu', 'les', 'řeku']], ['chodil', 'chodila', 'chodilo', ['po lese', 'po louce', 'ke škole']], ['honil', 'honila', 'honilo', ['psa', 'kozu']], ['hladil', 'hladila', 'hladilo', ['kočku', 'psa', 'koně']],
  ['otevřel', 'otevřela', 'otevřelo', ['okno', 'dveře', 'brašnu ✗']], ['upekl', 'upekla', 'upeklo', ['koláč', 'chléb']], ['ukázal', 'ukázala', 'ukázalo', ['cestu', 'mapu', 'knihu']], ['podal', 'podala', 'podalo', ['chléb', 'mléko', 'koláč']],
].map(([m, f, n, o]) => [m, f, n, o.filter((x) => !x.includes('✗'))]).filter((v) => v[3].length);
const TIME = ['Včera', 'Ráno', 'Večer', 'Odpoledne', 'V pátek', 'V sobotu', 'V úterý', 'Ve středu', 'Ve čtvrtek', 'V noci', 'Po obědě', 'Před obědem', 'Po škole', 'Před školou', 'Cestou domů', 'Na jaře', 'V létě', 'Dříve'];
const ANIMATE_ONLY = new Set(['nesl', 'četl', 'vedl', 'hledal', 'volal', 'kopal', 'pekl', 'vařil', 'držel', 'maloval', 'kupoval', 'pracoval', 'znal', 'honil', 'hladil', 'otevřel', 'upekl', 'ukázal', 'podal', 'dělal']);
const NEUTER_OK = new Set(['běžel', 'stál', 'ležel', 'seděl', 'plaval', 'hrál', 'jel', 'čekal', 'chodil']);
const ANIMAL_OK = new Set(['běžel', 'stál', 'ležel', 'seděl', 'plaval', 'hrál', 'čekal', 'chodil', 'jel']);

const norm = (x) => x.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
const taken = new Set();
for (const f of await readdir(path.join(root, 'library-src'))) {
  if (!f.endsWith('.txt') || f === 'pas.txt') continue;
  for (const line of (await readFile(path.join(root, 'library-src', f), 'utf8')).split('\n')) taken.add(norm(line.replace(/[{}]|\|\w+/g, '')));
}
const hasDupWord = (x) => { const seen = new Set(); for (const w of (x.replace(/[{}]|\|\w+/g, '').toLowerCase().match(/\p{L}{4,}/gu) ?? [])) { if (seen.has(w)) return true; seen.add(w); } return false; };
const fresh = (x) => !taken.has(norm(x.replace(/[{}]/g, '')));
const uses = new Map();
const bump = (k) => uses.set(k, (uses.get(k) ?? 0) + 1);
const used = (k) => uses.get(k) ?? 0;
const ANIMALS = new Set(['pes', 'kocour', 'kočka', 'koza', 'kráva', 'husa', 'štěně', 'kotě', 'hříbě', 'tele', 'prase']);
const PEOPLE_ONLY = (subj) => !ANIMALS.has(subj) && !['auto', 'slunce', 'kolo'].includes(subj);

const blocks = [];
const titles = new Set();
for (let i = 0; i < 30; i++) {
  const sentences = [];
  const gens = shuffle(['m', 'f', 'm', 'f', 'n']).slice(0, 4);
  const seenSubj = new Set();
  for (const g of gens) {
    let made = null;
    for (let tries = 0; tries < 200 && !made; tries++) {
      const subj = shuffle(SUBJ[g])[0];
      if (seenSubj.has(subj) || used(`s:${subj}`) >= 4) continue;
      const v = shuffle(V)[0];
      const base = v[0];
      if (g === 'n' && !(NEUTER_OK.has(base))) continue;
      if (g !== 'n' && !PEOPLE_ONLY(subj) && !ANIMAL_OK.has(base)) continue;
      if (used(`v:${base}`) >= 5) continue;
      const verb = g === 'm' ? v[0] : g === 'f' ? v[1] : v[2];
      const obj = shuffle(v[3]).find((o) => used(`o:${o}`) < 6);
      if (!obj) continue;
      const t = shuffle(TIME).find((x) => used(`t:${x}`) < 4) ?? TIME[0];
      const sub = /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(subj) ? subj : subj;
      const useTime = rnd() < 0.6;
      const body = `{${useTime ? sub : cap(sub)} ${verb}} ${obj}.`;
      const sentence = useTime ? `${t} ${body}` : body;
      if (!fresh(sentence) || hasDupWord(sentence)) continue;
      made = { sentence, subj, base, obj, t: useTime ? t : null };
    }
    if (made) { sentences.push(made.sentence); seenSubj.add(made.subj); bump(`s:${made.subj}`); bump(`v:${made.base}`); bump(`o:${made.obj}`); if (made.t) bump(`t:${made.t}`); taken.add(norm(made.sentence.replace(/[{}]/g, ''))); }
  }
  let title = `Včera ${sentences[0].replace(/[{}.]/g, '').split(' ').slice(-3).join(' ')}`;
  title = `Minulý čas ${i + 1}`;
  titles.add(title);
  blocks.push(`# ${title}\n${sentences.join('\n')}\n`);
}
await writeFile(path.join(root, 'library-src/pas.txt'), `feature: syntax.past_singular\ncode: pas\n---\n${blocks.join('\n')}`, 'utf8');
console.log(`zapsáno ${blocks.length} bloků`);

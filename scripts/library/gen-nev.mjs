#!/usr/bin/env node
// Vygeneruje library-src/nev.txt (shoda s nevyjádřeným podmětem) a library-src/shrev.txt (opakování shody).
// Použití: gen-nev.mjs <seed> nev|shrev
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.argv[3] ?? 'nev';
let s = Number(process.argv[2] ?? 3) * 2654435761 % 4294967296;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const cap = (w) => w[0].toUpperCase() + w.slice(1);

// [m, f, n, předměty]; mn. č.: m → -li, f/n → -ly
const V = [
  ['nesl', 'nesla', 'neslo', ['koš', 'vědro', 'tašku', 'kabát', 'dřevo']], ['četl', 'četla', 'četlo', ['knihu', 'větu', 'pohádku', 'mapu']], ['vedl', 'vedla', 'vedlo', ['koně', 'psa', 'kozu']],
  ['hledal', 'hledala', 'hledalo', ['kost', 'tašku', 'kabát', 'sekeru', 'lopatu', 'kolo']], ['volal', 'volala', 'volalo', ['psa', 'mámu', 'tátu']], ['čekal', 'čekala', 'čekalo', ['u dveří', 'u plotu', 'na vlak', 'na louce']],
  ['kopal', 'kopala', 'kopalo', ['jámu', 'zahradu']], ['pekl', 'pekla', 'peklo', ['koláč', 'chléb']], ['vařil', 'vařila', 'vařilo', ['polévku', 'rýži']], ['šel', 'šla', 'šlo', ['domů', 'do lesa', 'k potoku', 'k lesu']],
  ['jel', 'jela', 'jelo', ['domů', 'do města', 'na kole', 'za tátou']], ['běžel', 'běžela', 'běželo', ['domů', 'k lesu', 'po louce', 'ven']], ['stál', 'stála', 'stálo', ['u okna', 'u plotu', 'na louce', 'u dveří']],
  ['seděl', 'seděla', 'sedělo', ['u okna', 'u stolu', 'u řeky', 'na plotě']], ['plaval', 'plavala', 'plavalo', ['v rybníku', 'v řece', 'v jezeru']], ['hrál', 'hrála', 'hrálo', ['na louce', 'na dvoře', 'před domem']],
  ['držel', 'držela', 'drželo', ['lopatu', 'psa', 'tašku', 'lano']], ['maloval', 'malovala', 'malovalo', ['obraz', 'dům', 'plot']], ['kupoval', 'kupovala', 'kupovalo', ['chléb', 'mléko', 'koláč']],
  ['znal', 'znala', 'znalo', ['cestu', 'les', 'řeku']], ['chodil', 'chodila', 'chodilo', ['po lese', 'po louce', 'ke škole']], ['honil', 'honila', 'honilo', ['psa', 'kozu']], ['hladil', 'hladila', 'hladilo', ['kočku', 'psa', 'koně']],
  ['otevřel', 'otevřela', 'otevřelo', ['okno', 'dveře']], ['upekl', 'upekla', 'upeklo', ['koláč', 'chléb']], ['ukázal', 'ukázala', 'ukázalo', ['cestu', 'mapu', 'knihu']], ['podal', 'podala', 'podalo', ['chléb', 'mléko', 'koláč']],
];
const PEOPLE = new Set(['nesl', 'četl', 'vedl', 'hledal', 'volal', 'kopal', 'pekl', 'vařil', 'držel', 'maloval', 'kupoval', 'znal', 'honil', 'hladil', 'otevřel', 'upekl', 'ukázal', 'podal', 'šel', 'jel', 'čekal', 'seděl', 'stál', 'chodil', 'hrál', 'běžel', 'plaval']);
const SUBJ = {
  m: ['kluci', 'žáci', 'rolníci', 'řidiči', 'kováři', 'pekaři', 'tesaři', 'kuchaři', 'rybáři', 'sousedé', 'učitelé', 'Petr a Jan', 'Karel a Marek', 'Radek a Adam', 'Pavel a Ota', 'Petr a Eva', 'Jan a Dana', 'Karel a Hana', 'Roman a Lenka'],
  f: ['dívky', 'sestry', 'kuchařky', 'učitelky', 'sousedky', 'Eva a Dana', 'Anna a Olga', 'Lenka a Tereza', 'Hana a Alena', 'Nela a Marta', 'holky'],
};
const ADV = ['Potom', 'Pak', 'Cestou', 'Večer', 'Ráno', 'Odpoledne', 'Později', 'Nakonec', 'Brzy', 'Zatím', 'Dnes', 'Včera', 'O hodinu později ✗'].filter((x) => !x.includes('✗'));
const norm = (x) => x.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
const code = mode;
const taken = new Set();
for (const f of await readdir(path.join(root, 'library-src'))) {
  if (!f.endsWith('.txt') || f === `${code}.txt`) continue;
  for (const line of (await readFile(path.join(root, 'library-src', f), 'utf8')).split('\n')) taken.add(norm(line.replace(/[{}]|\|\w+/g, '')));
}
const fresh = (x) => !taken.has(norm(x.replace(/[{}]|\|\w+/g, '')));
const uses = new Map(); const bump = (k) => uses.set(k, (uses.get(k) ?? 0) + 1); const used = (k) => uses.get(k) ?? 0;
const pl = (v, g) => (g === 'm' ? `${v[0]}i` : v[1].replace(/la$/, 'ly'));
const sg = (v, g) => (g === 'm' ? v[0] : v[1]);
const keyExpr = mode === 'nev' ? 'plur' : 'shrev';
const keyOmit = mode === 'nev' ? 'nev' : 'shrev';
const keySg = 'shrev';
const pickVerb = (taken2) => shuffle(V).find((v) => PEOPLE.has(v[0]) && !taken2.has(v[0]) && used(`v:${v[0]}`) < 6);

const blocks = [];
for (let i = 0; i < 30; i++) {
  const g = rnd() < 0.5 ? 'm' : 'f';
  const subj = shuffle(SUBJ[g]).find((x) => used(`s:${x}`) < 5) ?? SUBJ[g][0];
  bump(`s:${subj}`);
  const lines = [];
  const seenVerbs = new Set();
  for (let step = 0; step < 6 && lines.length < 4; step++) {
    const v = pickVerb(seenVerbs); if (!v) break;
    const obj = shuffle(v[3])[0];
    let line;
    if (lines.length === 0) line = `{${cap(subj)} ${pl(v, g)}|${keyExpr}} ${obj}.`;
    else if (mode === 'shrev' && rnd() < 0.4) {
      // jednotné číslo s vyjádřeným podmětem
      const one = shuffle(['Petr', 'Jan', 'Karel', 'Marek', 'Radek', 'Adam', 'Pavel', 'Ota', 'kluk', 'soused', 'pekař', 'kuchař', 'Eva', 'Olga', 'Anna', 'Dana', 'Lenka', 'Hana', 'dívka', 'sousedka', 'teta', 'sestra'])[0];
      const sgG = ['Eva', 'Olga', 'Anna', 'Dana', 'Lenka', 'Hana', 'dívka', 'sousedka', 'teta', 'sestra'].includes(one) ? 'f' : 'm';
      line = `{${cap(one)} ${sg(v, sgG)}|${keySg}} ${obj}.`;
    } else {
      const adv = shuffle(ADV).find((a) => used(`a:${a}`) < 8) ?? ADV[0]; bump(`a:${adv}`);
      line = `${adv} {${pl(v, g)}|${keyOmit}} ${obj}.`;
    }
    if (!fresh(line) || lines.includes(line)) continue;
    lines.push(line); seenVerbs.add(v[0]); bump(`v:${v[0]}`);
  }
  for (const l of lines) taken.add(norm(l.replace(/[{}]|\|\w+/g, '')));
  blocks.push(`# ${mode === 'nev' ? 'Nevyjádřený podmět' : 'Shoda podmětu s přísudkem'} ${i + 1}\n${lines.join('\n')}\n`);
}
const feature = mode === 'nev' ? 'syntax.agreement_unexpressed' : 'syntax.agreement_review';
await writeFile(path.join(root, `library-src/${code}.txt`), `feature: ${feature}\ncode: ${code}\n---\n${blocks.join('\n')}`, 'utf8');
console.log(`zapsáno ${blocks.length} bloků (${mode})`);

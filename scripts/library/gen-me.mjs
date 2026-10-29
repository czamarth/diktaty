#!/usr/bin/env node
// Vygeneruje library-src/me.txt (zájmeno já: mě / mně). Značí se {mě} a {mně}.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let s = Number(process.argv[2] ?? 3) * 2654435761 % 4294967296;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

const SUBJ = ['Máma', 'Táta', 'Děda', 'Teta', 'Sestra', 'Bratr', 'Soused', 'Pes', 'Kočka', 'Učitel', 'Kamarád', 'Dědeček', 'Strýc', 'Sousedka', 'Učitelka', 'Pekař', 'Kuchař', 'Pastýř', 'Rybář', 'Kovář'];
const ACC = ['volá', 'sleduje', 'hladí', 'zná', 'vede', 'drží', 'hledá', 'honí', 'čeká'];  // slovesa s 4. pádem
const ACC_EXTRA = { volá: ['domů', 'ke stolu', 'z okna', 'od dveří'], sleduje: ['z okna', 'od plotu', 'z kopce', 'celé ráno'], hladí: ['po hlavě', 'po ruce'], zná: ['dobře', 'od malička ✗'.replace(' ✗', '')], vede: ['do lesa', 'k potoku', 'za ruku', 'domů'], drží: ['za ruku', 'pevně'], hledá: ['v lese', 'na louce', 'všude', 'u plotu'], honí: ['po dvoře', 'po louce', 'po zahradě'], čeká: [] };
const DAT = [['dává', ['chléb', 'koláč', 'mléko', 'kost ✗', 'čaj']], ['nese', ['koš', 'vědro', 'tašku', 'kabát']], ['ukazuje', ['cestu', 'mapu', 'knihu', 'les']], ['podává', ['chléb', 'koláč', 'mléko']], ['pomáhá', ['nést koš', 'hledat tašku', 'kopat zahradu']], ['čte', ['knihu', 'pohádku', 'větu']], ['kupuje', ['chléb', 'kolo', 'tašku', 'kabát']], ['peče', ['koláč', 'chléb']]];
const PREP_ACC = ['pro', 'bez', 'ode', 'u', 'od', 'vedle'];  // 2. pád: mě
const PREP_DAT = ['ke', 'o', 'při', 'proti', 'k'];
const PREP_PHR = {
  pro: ['Táta má dárek pro', 'Máma peče koláč pro', 'Děda nese koš pro'], bez: ['Kluci nejdou bez', 'Učitel nezačne bez', 'Táta nejede bez'], ode: ['Dostal jsi tu knihu ✗'], u: ['Pes sedí u', 'Kočka leží u'], vedle: ['Pes leží vedle', 'Sestra sedí vedle'],
};
const norm = (x) => x.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
const taken = new Set();
for (const f of await readdir(path.join(root, 'library-src'))) {
  if (!f.endsWith('.txt') || f === 'me.txt') continue;
  for (const line of (await readFile(path.join(root, 'library-src', f), 'utf8')).split('\n')) taken.add(norm(line.replace(/[{}]|\|\w+/g, '')));
}
const fresh = (x) => !taken.has(norm(x.replace(/[{}]/g, '')));
const uses = new Map(); const bump = (k) => uses.set(k, (uses.get(k) ?? 0) + 1); const used = (k) => uses.get(k) ?? 0;

const mk = {
  acc: (subj) => {
    const v = shuffle(ACC).find((x) => used(`v:${x}`) < 6);
    const extra = shuffle(ACC_EXTRA[v].length ? ACC_EXTRA[v] : ['']).filter((x) => !x.includes('✗'))[0];
    bump(`v:${v}`);
    if (v === 'čeká') return `${subj} čeká na {mě}.`;
    return `${subj} ${v} {mě}${extra ? ` ${extra}` : ''}.`;
  },
  dat: (subj) => {
    const [v, objs] = shuffle(DAT).find(([x]) => used(`v:${x}`) < 6);
    bump(`v:${v}`);
    const o = shuffle(objs.filter((x) => !x.includes('✗')))[0];
    return `${subj} ${v} {mně} ${o}.`;
  },
  prepGen: (subj) => shuffle([`${subj} sedí vedle {mě}.`, `${subj} má dárek pro {mě}.`, `${subj} nezačne bez {mě}.`, `${subj} stojí u {mě}.`, `${subj} je daleko od {mě}.`, `${subj} jde bez {mě} domů.`, `${subj} pracuje pro {mě}.`])[0],
  prepDat: (subj) => shuffle([`${subj} jde ke {mně}.`, `${subj} hovoří o {mně}.`, `${subj} stojí proti {mně}.`, `${subj} sedí při {mně}.`, `${subj} běží ke {mně}.`, `${subj} čte o {mně}.`])[0],
};
const blocks = []; const titles = new Set();
for (let i = 0; i < 30; i++) {
  const subs = shuffle(SUBJ).filter((x) => used(`s:${x}`) < 7).slice(0, 4);
  const kinds = shuffle(['acc', 'dat', 'acc', 'dat', 'prepGen', 'prepDat']).slice(0, 4);
  const lines = [];
  kinds.forEach((k, j) => {
    let line; for (let t = 0; t < 40; t++) { line = mk[k](subs[j]); if (fresh(line) && !lines.includes(line)) break; }
    lines.push(line); bump(`s:${subs[j]}`);
  });
  for (const l of lines) taken.add(norm(l.replace(/[{}]/g, '')));
  let title = `Já a ${subs[0].toLowerCase()}`; if (titles.has(title)) title = `Já a ${subs[0].toLowerCase()} (${i + 1})`; titles.add(title);
  blocks.push(`# ${title}\n${lines.join('\n')}\n`);
}
await writeFile(path.join(root, 'library-src/me.txt'), `feature: orth.pronoun_me_mne\ncode: me\n---\n${blocks.join('\n')}`, 'utf8');
console.log(`zapsáno ${blocks.length} bloků`);

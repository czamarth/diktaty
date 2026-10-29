#!/usr/bin/env node
// Vygeneruje library-src/osl.txt (čárka při oslovení). Čárky se značí v rámci oslovení: {Evo,} … {, Evo} … {, Petře,}.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let s = Number(process.argv[2] ?? 5) * 2654435761 % 4294967296;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const cap = (w) => w[0].toUpperCase() + w.slice(1);

const VOC = ['Evo', 'Anno', 'Dano', 'Olgo', 'Lenko', 'Terezo', 'Hano', 'Aleno', 'Marto', 'Nelo', 'Emo', 'Laro', 'Soňo', 'Aneto', 'Jitko', 'Zuzano', 'Jane', 'Petře', 'Karle', 'Marku', 'Radku', 'Adame', 'Pavle', 'Oto',
  'Romane', 'Vojto', 'Alane', 'Honzo', 'Jirko', 'Jakube', 'Tomáši', 'Martine', 'mámo', 'tati', 'dědo', 'sestro', 'bratře', 'kluku', 'holko', 'pane', 'teto', 'sousede', 'strýčku', 'pastýři', 'kováři', 'rybáři'];
const IMP = ['nes', 'hledej', 'drž', 'ukaž', 'podej', 'počkej', 'běž', 'čti', 'jdi', 'dej', 'zavolej', 'pomoz'];
const OBJ = { nes: ['koš', 'vědro', 'tašku', 'kabát', 'dřevo', 'mléko'], drž: ['lano', 'tašku', 'koš', 'psa', 'tyč', 'lopatu'], hledej: ['kost', 'tašku', 'kabát', 'sekeru', 'lopatu', 'kolo'],
  ukaž: ['knihu', 'tašku', 'mapu', 'ruku', 'sešit', 'obraz'], podej: ['chléb', 'mléko', 'koláč', 'vědro', 'čaj', 'sekeru'], počkej: ['na vlak', 'u dveří', 'u plotu', 'na louce', 'na mámu'],
  běž: ['domů', 'ven', 'k lesu', 'k potoku', 'do lesa', 'ke škole'], čti: ['knihu', 'větu', 'píseň ✗', 'pohádku', 'mapu', 'novou knihu'], jdi: ['domů', 'ven', 'do lesa', 'k potoku', 'ke škole', 'ke dveřím'],
  dej: ['kost', 'chléb', 'mléko', 'koláč', 'čaj', 'tužku'], zavolej: ['psa', 'mámu', 'tátu', 'učitele', 'kluky', 'dívky'], pomoz: ['mámě', 'tátovi', 'dědovi', 'sousedovi', 'kamarádovi', 'sestře'] };
OBJ.čti = OBJ.čti.filter((x) => !x.includes('✗'));
OBJ.pomoz = ['mámě', 'sestře', 'teto ✗'].filter((x) => !x.includes('✗'));
const STATEMENT = ['dnes jedeme do města', 'dnes jdeme do lesa', 'venku je tma', 'dnes je sobota', 'ráno je mlha', 'venku sněží', 'doma je teplo', 'večer bude klid', 'louka je zelená', 'les je tichý', 'řeka je hluboká'];
const QUEST = ['Kde jsi', 'Kam jdeš', 'Kde je tvůj kabát', 'Kde je tvoje taška', 'Kam běžíš', 'Co hledáš', 'Co nese', 'Kdo čeká u dveří'];
void QUEST;

const taken = new Set();
const norm = (x) => x.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
for (const f of await readdir(path.join(root, 'library-src'))) {
  if (!f.endsWith('.txt') || f === 'osl.txt') continue;
  for (const line of (await readFile(path.join(root, 'library-src', f), 'utf8')).split('\n')) taken.add(norm(line.replace(/[{}]|\|\w+/g, '')));
}
const fresh = (x) => !taken.has(norm(x.replace(/[{}]/g, '')));
const useVoc = new Map();
const blocks = [];
const titles = new Set();
for (let i = 0; i < 30; i++) {
  const names = shuffle(VOC).filter((v) => (useVoc.get(v) ?? 0) < 4).slice(0, 4);
  const sentences = [];
  const make = {
    start: (v, imp) => { const o = shuffle(OBJ[imp])[0]; return `{${cap(v)},} ${imp} ${o}!`; },
    end: (v, imp) => { const o = shuffle(OBJ[imp])[0]; return `${cap(imp)} ${o}{, ${v}}!`; },
    mid: (v) => { const st = shuffle(STATEMENT)[0]; const [first, ...rest] = st.split(' '); return `${cap(first)}{, ${v},} ${rest.join(' ')}.`; },
    ask: (v) => { const q = shuffle(['Kde stojíš', 'Kam jdeš', 'Kam běžíš', 'Co hledáš', 'Co čteš', 'Co tu děláš', 'Kde je pes', 'Kde je koš', 'Kdo čeká u dveří', 'Co voní', 'Kdo zná cestu', 'Kde je táta', 'Kdo nese koš', 'Co nese máma'])[0]; return `${q}{, ${v}}?`; },
  };
  const kinds = shuffle(['start', 'end', 'mid', 'ask']);
  kinds.forEach((k, j) => {
    const v = names[j];
    let sentence;
    for (let tries = 0; tries < 30; tries++) {
      const imp = shuffle(IMP)[0];
      sentence = make[k](v, imp);
      if (fresh(sentence) && !sentences.some((x) => x.replace(/[{}]/g, '') === sentence.replace(/[{}]/g, ''))) break;
    }
    sentences.push(sentence);
    useVoc.set(v, (useVoc.get(v) ?? 0) + 1);
  });
  for (const x of sentences) taken.add(norm(x.replace(/[{}]/g, '')));
  let title = `Oslovení ${cap(names[0])}`;
  if (titles.has(title)) title = `Oslovení ${cap(names[0])} a ${names[1]}`;
  titles.add(title);
  blocks.push(`# ${title}\n${shuffle(sentences).join('\n')}\n`);
}
await writeFile(path.join(root, 'library-src/osl.txt'), `feature: punct.vocative\ncode: osl\n---\n${blocks.join('\n')}`, 'utf8');
console.log(`zapsáno ${blocks.length} bloků`);

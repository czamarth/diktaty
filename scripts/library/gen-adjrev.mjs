#!/usr/bin/env node
// Vygeneruje library-src/adjrev.txt (opakování tvarů přídavných jmen: -ý, -ým, -ých, -ými, měkké -ní/-cí).
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let s = Number(process.argv[2] ?? 3) * 2654435761 % 4294967296;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const cap = (w) => w[0].toUpperCase() + w.slice(1);

// kmen → tvary: [nom sg m, instr sg m, gen/loc pl, instr pl]
const HARD = {
  nov: ['nový', 'novým', 'nových', 'novými'], mal: ['malý', 'malým', 'malých', 'malými'], tmav: ['tmavý', 'tmavým', 'tmavých', 'tmavými'], zlat: ['zlatý', 'zlatým', 'zlatých', 'zlatými'],
  zelen: ['zelený', 'zeleným', 'zelených', 'zelenými'], cern: ['černý', 'černým', 'černých', 'černými'], cerven: ['červený', 'červeným', 'červených', 'červenými'], studen: ['studený', 'studeným', 'studených', 'studenými'],
  tepl: ['teplý', 'teplým', 'teplých', 'teplými'], mohutn: ['mohutný', 'mohutným', 'mohutných', 'mohutnými'], krasn: ['krásný', 'krásným', 'krásných', 'krásnými'], pekn: ['pěkný', 'pěkným', 'pěkných', 'pěknými'],
  star: ['starý', 'starým', 'starých', 'starými'], hezk: ['hezký', 'hezkým', 'hezkých', 'hezkými'], dlouh: ['dlouhý', 'dlouhým', 'dlouhých', 'dlouhými'], tezk: ['těžký', 'těžkým', 'těžkých', 'těžkými'],
  chytr: ['chytrý', 'chytrým', 'chytrých', 'chytrými'], hrub: ['hrubý', 'hrubým', 'hrubých', 'hrubými'], zdrav: ['zdravý', 'zdravým', 'zdravých', 'zdravými'], vesel: ['veselý', 'veselým', 'veselých', 'veselými'],
};
const SOFT = ['lesní', 'ranní', 'noční', 'jarní', 'hlavní', 'první', 'polní', 'horní', 'dolní', 'domácí'];
const OK = { // které kmeny sedí ke kterým podstatným jménům
  things_sg: ['dům', 'hrad', 'most', 'plot', 'kabát', 'klobouk', 'pohár', 'nůž', 'koš', 'batoh', 'svetr', 'stůl', 'vůz', 'vlak', 'koláč', 'chléb', 'strom', 'dub', 'kámen'],
  things_pl: ['stromech', 'domech', 'stolech', 'mostech', 'plotech', 'vlacích', 'vozech', 'kabátech', 'klobouscích ✗'],
};
const ADJ_NOUN = { nov: ['dům', 'most', 'plot', 'kabát', 'klobouk', 'pohár', 'nůž', 'koš', 'batoh', 'svetr', 'stůl', 'vůz', 'vlak', 'koláč', 'chléb'], mal: ['dům', 'strom', 'dub', 'pes', 'kocour', 'kluk', 'koš', 'stůl', 'vlak', 'kámen', 'pták'], tmav: ['les', 'dům', 'kabát', 'klobouk', 'svetr', 'chléb', 'sad'],
  zlat: ['pohár', 'nůž'], zelen: ['strom', 'dub', 'sad', 'vlak', 'batoh', 'kabát', 'svetr', 'klobouk', 'vůz'], cern: ['pes', 'kocour', 'dům', 'most', 'plot', 'kabát', 'klobouk', 'koš', 'batoh', 'svetr', 'stůl', 'vůz', 'kámen', 'chléb'],
  cerven: ['dům', 'kabát', 'klobouk', 'svetr', 'koláč', 'vlak', 'vůz', 'batoh', 'koš'], studen: ['potok', 'koláč', 'kámen', 'chléb'], tepl: ['kabát', 'svetr', 'koláč', 'chléb'], mohutn: ['dub', 'strom', 'hrad', 'dům', 'most', 'kámen', 'plot'],
  krasn: ['dům', 'strom', 'dub', 'sad', 'kabát', 'pohár', 'koláč', 'vlak', 'vůz'], pekn: ['dům', 'strom', 'dub', 'sad', 'kabát', 'pohár', 'koláč', 'klobouk', 'stůl', 'pes'], star: ['dům', 'strom', 'dub', 'hrad', 'most', 'plot', 'kabát', 'stůl', 'vůz', 'pes', 'kluk'],
  hezk: ['dům', 'strom', 'dub', 'sad', 'kabát', 'pohár', 'koláč', 'klobouk', 'stůl', 'pes', 'kluk', 'kocour'], dlouh: ['most', 'plot', 'vlak', 'stůl', 'nůž'], tezk: ['kámen', 'pohár', 'koš', 'batoh', 'stůl', 'vůz', 'kabát', 'svetr'],
  chytr: ['pes', 'kocour', 'kluk', 'pták'], hrub: ['kámen', 'kabát', 'svetr', 'chléb', 'plot'], zdrav: ['pes', 'kocour', 'kluk', 'pták', 'strom', 'dub'], vesel: ['pes', 'kocour', 'kluk', 'pták'] };
const SUBJ = ['Jan', 'Petr', 'Karel', 'Marek', 'Radek', 'Adam', 'Pavel', 'Ota', 'Roman', 'Eva', 'Olga', 'Anna', 'Dana', 'Lenka', 'Tereza', 'Hana', 'Alena', 'Nela', 'Marta', 'Ema'];
const SOFT_NOUN = { lesní: ['cesta', 'zvěř ✗', 'stezka', 'louka', 'tráva'], ranní: ['mlha', 'tma', 'rosa', 'cesta ✗'], noční: ['obloha', 'tma', 'cesta ✗'], jarní: ['louka', 'tráva', 'rosa'], hlavní: ['cesta', 'brána ✗'], první: ['cesta', 'louka ✗'], polní: ['cesta', 'tráva', 'stezka'], horní: ['louka', 'cesta ✗'], dolní: ['louka', 'cesta ✗'], domácí: ['zahrada', 'louka ✗'] };
for (const k of Object.keys(SOFT_NOUN)) SOFT_NOUN[k] = SOFT_NOUN[k].filter((x) => !x.includes('✗'));
const PLACES = ['za městem', 'za lesem', 'na kopci', 'u řeky', 'za domem', 'u plotu'];
const norm = (x) => x.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
const taken = new Set();
for (const f of await readdir(path.join(root, 'library-src'))) {
  if (!f.endsWith('.txt') || f === 'adjrev.txt') continue;
  for (const line of (await readFile(path.join(root, 'library-src', f), 'utf8')).split('\n')) taken.add(norm(line.replace(/[{}]|\|\w+/g, '')));
}
const fresh = (x) => !taken.has(norm(x.replace(/[{}]/g, '')));
const uses = new Map(); const bump = (k) => uses.set(k, (uses.get(k) ?? 0) + 1); const used = (k) => uses.get(k) ?? 0;
const PL_NOUN = { dům: 'domech', most: 'mostech', plot: 'plotech', stůl: 'stolech', strom: 'stromech', kabát: 'kabátech', vůz: 'vozech', vlak: 'vlacích', kámen: 'kamenech', dub: 'dubech' };
const ANIMATE = new Set(['pes', 'kocour', 'kluk', 'pták']);
const m = (w) => `{${w}}`;
const capped = (list) => { const x = shuffle(list).find((p) => used(`v:${p.split(' ')[0]}`) < 6) ?? shuffle(list)[0]; bump(`v:${x.split(' ')[0]}`); return x; };
const frames = [
  (st, n) => `${m(cap(HARD[st][0]))} ${n} stojí ${shuffle(PLACES)[0]}.`,
  (st, n) => `${shuffle(SUBJ)[0]} jde s ${m(HARD[st][1])} ${n}em.`.replace(/(\S+)em\./, (mm, w) => `${w}em.`),
  (st, n) => { const nn = PL_NOUN[n]; return nn && !ANIMATE.has(n) ? `Na ${m(HARD[st][2])} ${nn} leží sníh.` : null; },
  (st, n) => { const nn = PL_NOUN[n]; return nn && !ANIMATE.has(n) ? `Děti si hrají mezi ${m(HARD[st][3])} ${nn}.`.replace('mezi', 'před') : null; },
];
const withEm = (n) => (n === 'kámen' ? 'kamenem' : n === 'pták' ? 'ptákem' : n === 'kluk' ? 'klukem' : `${n}em`);
const gens = {
  nom: (st) => {
    const n = shuffle(ADJ_NOUN[st])[0];
    const place = ['dům', 'hrad', 'most', 'plot', 'strom', 'dub', 'sad', 'les', 'vlak', 'vůz'];
    const pred = ANIMATE.has(n) ? capped(['sedí u plotu', 'běží po louce', 'čeká u dveří', 'je u plotu', 'jde k potoku'])
      : place.includes(n) ? capped(PLACES.flatMap((p) => [`stojí ${p}`, `je ${p}`]).filter((x) => !x.includes(n.slice(0, 3)))) : capped(['leží na stole', 'leží u dveří', 'leží u plotu', 'je na stole', 'je u dveří', 'je u okna', 'stojí u okna']);
    return `${m(cap(HARD[st][0]))} ${n} ${pred}.`;
  },
  instr: (st) => { const n = shuffle(ADJ_NOUN[st])[0]; const subj = shuffle(SUBJ)[0]; const vb = ANIMATE.has(n) ? capped(['jde s', 'běží s', 'sedí s', 'čeká s', 'stojí s']) : capped(['jde za', 'stojí před', 'sedí pod', 'čeká za', 'běží za', 'stojí za']); return `${subj} ${vb} ${m(HARD[st][1])} ${withEm(n)}.`; },
  loc: (st) => { const n = shuffle(ADJ_NOUN[st].filter((x) => PL_NOUN[x]))[0]; return n ? `${shuffle(['Žáci', 'Děti', 'Učitelé', 'Rolníci'])[0]} ${capped(['čtou o', 'hovoří o', 'sní o'])} ${m(HARD[st][2])} ${PL_NOUN[n]}.` : null; },
  soft: () => { const a = shuffle(SOFT).find((x) => used(`a:${x}`) < 6); if (!a) return null; const n = shuffle(SOFT_NOUN[a])[0]; bump(`a:${a}`); const PRED = { cesta: 'vede k potoku', stezka: 'vede k lesu', louka: 'je zelená', tráva: 'je mokrá', mlha: 'leží nad loukou', tma: 'je v lese', rosa: 'leží na trávě', obloha: 'je modrá', zahrada: 'voní' }; return `${m(cap(a))} ${n} ${PRED[n] ?? 'je tichá'}.`; },
  soft2: () => { const a = shuffle(SOFT).find((x) => used(`a:${x}`) < 6); if (!a) return null; const n = shuffle(SOFT_NOUN[a])[0]; bump(`a:${a}`); return `${shuffle(SUBJ)[0]} ${capped(['zná', 'hledá', 'sleduje', 'ukazuje', 'maluje'])} ${m(a)} ${n === 'cesta' ? 'cestu' : n === 'louka' ? 'louku' : n === 'stezka' ? 'stezku' : n === 'tráva' ? 'trávu' : n === 'mlha' ? 'mlhu' : n === 'tma' ? 'tmu' : n === 'rosa' ? 'rosu' : n === 'obloha' ? 'oblohu' : n === 'zahrada' ? 'zahradu' : n}.`; },
};
void frames;
const blocks = [];
for (let i = 0; i < 30; i++) {
  const stems = shuffle(Object.keys(HARD)).filter((x) => used(`st:${x}`) < 7).slice(0, 4);
  const kinds = shuffle(['nom', 'instr', 'loc', 'soft', 'soft2', 'nom']);
  const lines = [];
  for (const k of kinds) {
    if (lines.length >= 4) break;
    let line = null;
    for (let t = 0; t < 30 && !line; t++) {
      const st = shuffle(stems)[0];
      const cand = (k === 'soft' || k === 'soft2') ? gens[k]() : gens[k](st);
      if (cand && fresh(cand) && !lines.includes(cand)) { line = cand; if (k !== 'soft' && k !== 'soft2') bump(`st:${st}`); }
    }
    if (line) lines.push(line);
  }
  for (const l of lines) taken.add(norm(l.replace(/[{}]/g, '')));
  blocks.push(`# Tvary přídavných jmen ${i + 1}\n${lines.join('\n')}\n`);
}
await writeFile(path.join(root, 'library-src/adjrev.txt'), `feature: orth.adjective_endings_review\ncode: adjrev\n---\n${blocks.join('\n')}`, 'utf8');
console.log(`zapsáno ${blocks.length} bloků`);

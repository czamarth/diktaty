#!/usr/bin/env node
// Vygeneruje library-src/nrev.txt (opakování koncovek podstatných jmen: pán, hrad, žena). Koncové -i/-y se značí {…}.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let s = Number(process.argv[2] ?? 3) * 2654435761 % 4294967296;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const cap = (w) => w[0].toUpperCase() + w.slice(1);

// třídy podstatných jmen: nom = 1. pád mn. č., acc = 4. pád mn. č. (nebo 2. pád j. č. u žen), dat = 3. pád j. č. (jen pán)
const C = {
  birds: { nom: ['holubi', 'kosi', 'vrabci', 'ptáci', 'sokoli', 'orli'], acc: ['holuby', 'kosy', 'ptáky', 'orly', 'sokoly'], dat: ['holubovi', 'kosovi'], pl: ['letí nad lesem', 'sedí na střeše', 'hledají zrno', 'sedí na plotě', 'letí k řece'], obj: ['sleduje', 'hledá', 'zná'] },
  people: { nom: ['kluci', 'žáci', 'hoši', 'bratři', 'rybáři', 'lékaři', 'pekaři', 'tesaři', 'kuchaři', 'rolníci', 'řidiči', 'chlapci', 'kamarádi'], acc: ['kluky', 'žáky', 'bratry', 'rolníky', 'kamarády', 'hochy'], dat: ['klukovi', 'žákovi', 'tátovi', 'dědovi', 'pánovi', 'bratrovi', 'kamarádovi', 'rolníkovi', 'chlapcovi', 'hochovi'], pl: ['jdou do lesa', 'čekají u dveří', 'pracují na zahradě', 'jdou domů', 'jdou ke škole', 'čekají na vlak'], obj: ['volá', 'zná', 'hledá', 'čeká na ✗'] },
  animals: { nom: ['psi', 'vlci', 'lvi', 'medvědi', 'tygři', 'sloni', 'zajíci', 'pavouci'], acc: ['psy', 'vlky', 'lvy', 'medvědy', 'tygry', 'slony', 'pavouky'], dat: ['psovi', 'vlkovi', 'lvovi', 'medvědovi'], pl: ['běží po louce', 'žijí v lese', 'jdou k řece', 'běží k lesu'], obj: ['sleduje', 'hladí', 'zná', 'honí'] },
  buildings: { nom: ['hrady', 'domy', 'mosty', 'ploty', 'sady', 'rybníky', 'mlýny', 'stodoly ✗'], acc: ['hrady', 'domy', 'mosty', 'ploty', 'sady', 'rybníky'], dat: [], pl: ['stojí za městem', 'stojí na kopci', 'jsou za lesem', 'jsou u řeky'], obj: ['opravuje', 'zná', 'maluje', 'sleduje'] },
  plants: { nom: ['stromy', 'duby', 'hřiby', 'keře ✗'], acc: ['stromy', 'duby', 'hřiby'], dat: [], pl: ['rostou v lese', 'rostou na kopci', 'rostou u řeky', 'rostou v sadu'], obj: ['sleduje', 'zná', 'hledá', 'maluje'] },
  things: { nom: ['stoly', 'vozy', 'kameny', 'chleby', 'poháry', 'batohy', 'kabáty', 'svetry', 'klobouky', 'čluny', 'pluhy', 'zámky', 'plody'], acc: ['stoly', 'vozy', 'kameny', 'chleby', 'poháry', 'batohy', 'kabáty', 'svetry', 'klobouky', 'čluny', 'pluhy', 'zámky', 'plody'], dat: [], pl: ['leží u dveří', 'leží na stole', 'leží na louce', 'leží u plotu', 'stojí u domu'], obj: ['nese', 'hledá', 'opravuje', 'kupuje', 'drží'] },
  fem: { nom: ['ryby', 'krávy', 'kozy', 'husy', 'kachny', 'tety', 'sousedky', 'dívky', 'ženy', 'kočky'], acc: ['ryby', 'krávy', 'kozy', 'husy', 'kachny', 'tety', 'sousedky', 'dívky', 'ženy', 'kočky'], dat: [], pl: ['jdou k řece', 'jsou na louce', 'jdou domů', 'čekají u dveří'], obj: ['zná', 'sleduje', 'hladí', 'hledá'] },
  fem2: { nom: ['lampy', 'mapy', 'knihy', 'tužky', 'tašky', 'hrušky', 'jahody', 'okurky', 'lopaty', 'sekery', 'polévky', 'stěny', 'střechy'], acc: ['lampy', 'mapy', 'knihy', 'tužky', 'tašky', 'hrušky', 'jahody', 'okurky', 'lopaty', 'sekery', 'polévky', 'stěny', 'střechy'], dat: [], pl: ['leží na stole', 'leží u dveří', 'jsou na stole', 'jsou u okna'], obj: ['nese', 'hledá', 'kupuje', 'drží'] },
};
for (const c of Object.values(C)) { for (const k of ['nom', 'acc', 'dat', 'pl', 'obj']) c[k] = c[k].filter((x) => !x.includes('✗')); }
const ADJ = ['velké', 'malé', 'staré', 'nové', 'dlouhé', 'krátké', 'těžké', 'lehké', 'hezké', 'krásné', 'tiché', 'čerstvé', 'zelené', 'teplé'];
const SUBJ = ['Jan', 'Petr', 'Karel', 'Marek', 'Radek', 'Adam', 'Pavel', 'Ota', 'Roman', 'Vojta', 'Eva', 'Olga', 'Anna', 'Dana', 'Lenka', 'Tereza', 'Hana', 'Alena', 'Nela', 'Marta', 'Ema', 'Lara'];
const norm = (x) => x.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
const taken = new Set();
for (const f of await readdir(path.join(root, 'library-src'))) {
  if (!f.endsWith('.txt') || f === 'nrev.txt') continue;
  for (const line of (await readFile(path.join(root, 'library-src', f), 'utf8')).split('\n')) taken.add(norm(line.replace(/[{}]|\|\w+/g, '')));
}
const fresh = (x) => !taken.has(norm(x.replace(/[{}]/g, '')));
const uses = new Map(); const bump = (k) => uses.set(k, (uses.get(k) ?? 0) + 1); const used = (k) => uses.get(k) ?? 0;
const NEEDS_MARK = (w) => /(?:[blmpsvzdtn][yi]|[blmpsvzdtn]ý)$/u.test(w) || /[kgrh]y$|chy$/u.test(w) || /(?:ci|či|ři|ši|ži|zi|ni)$/u.test(w);
const m = (w) => `{${w}}`;

const gens = {
  nom: (cls) => { const n = shuffle(C[cls].nom).find((x) => used(`n:${x}`) < 3); const p = shuffle(C[cls].pl)[0]; if (!n) return null; bump(`n:${n}`); const a = ['buildings', 'plants', 'things', 'fem2'].includes(cls) && rnd() < 0.5 ? shuffle(ADJ)[0] : null; return a ? `${cap(a)} ${m(n)} ${p}.` : `${m(cap(n))} ${p}.`; },
  acc: (cls) => { const n = shuffle(C[cls].acc).find((x) => used(`n:${x}`) < 3); if (!n) return null; bump(`n:${n}`); const sj = shuffle(SUBJ).find((x) => used(`s:${x}`) < 5); bump(`s:${sj}`); const v = shuffle(C[cls].obj).find((x) => used(`v:${x}`) < 4) ?? C[cls].obj[0]; bump(`v:${v}`); return `${sj} ${v} ${m(n)}.`; },
  dat: (cls) => { const n = shuffle(C[cls].dat).find((x) => used(`n:${x}`) < 3); if (!n) return null; bump(`n:${n}`); const sj = shuffle(SUBJ).find((x) => used(`s:${x}`) < 5); bump(`s:${sj}`); const [v, o] = shuffle([['dává', 'chléb'], ['nese', 'koš'], ['ukazuje', 'cestu'], ['podává', 'vědro'], ['čte', 'knihu'], ['kupuje', 'kabát'], ['pomáhá', ''], ['peče', 'koláč'], ['vede', 'psa']]).find(([x]) => used(`v:${x}`) < 4); bump(`v:${v}`); return `${sj} ${v} ${m(n)}${o ? ` ${o}` : ''}.`; },
};
const blocks = [];
for (let i = 0; i < 30; i++) {
  const classes = shuffle(Object.keys(C)).slice(0, 4);
  const lines = [];
  for (const cls of classes) {
    const kinds = shuffle(['nom', 'acc', C[cls].dat.length ? 'dat' : 'acc']);
    let line = null;
    for (const k of kinds) { for (let t = 0; t < 12 && !line; t++) { const cand = gens[k](cls); if (cand && fresh(cand) && !lines.includes(cand)) line = cand; } if (line) break; }
    if (line) lines.push(line);
  }
  for (const l of lines) taken.add(norm(l.replace(/[{}]/g, '')));
  blocks.push(`# Koncovky podstatných jmen ${i + 1}\n${lines.join('\n')}\n`);
}
void NEEDS_MARK;
await writeFile(path.join(root, 'library-src/nrev.txt'), `feature: orth.noun_endings_review\ncode: nrev\n---\n${blocks.join('\n')}`, 'utf8');
console.log(`zapsáno ${blocks.length} bloků`);

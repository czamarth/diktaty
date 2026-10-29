#!/usr/bin/env node
// Vygeneruje library-src/od.txt (čárka před odporovacím spojením ale/však). Značí se {, ale} / {, však}.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let s = Number(process.argv[2] ?? 3) * 2654435761 % 4294967296;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

const PAIRS = [
  ['Kluk chce hrát venku', 'prší'], ['Dívka chce jít ven', 'je tma'], ['Máma peče koláč', 'nemá mouku'], ['Táta jede do města', 'auto nejede'], ['Děda čte knihu', 'nemá brýle'],
  ['Pes běží k potoku', 'potok je daleko'], ['Pastýř hledá koně', 'kůň je pryč'], ['Rybář sedí u řeky', 'ryby nekoušou'], ['Kuchař vaří polévku', 'nemá sůl'], ['Tesař opravuje plot', 'nemá lopatu'],
  ['Kovář kope zahradu', 'země je tvrdá'], ['Soused hledá psa', 'pes je doma'], ['Učitel čte pohádku', 'děti nechtějí poslouchat'], ['Teta pere kabát', 'voda je studená'], ['Sestra maluje obraz', 'nemá barvy'],
  ['Bratr jede na kole', 'kolo je mokré'], ['Eva chce jít na louku', 'louka je mokrá'], ['Petr nese koš', 'koš je těžký'], ['Jan volá psa', 'pes nechce jít'], ['Olga hledá tašku', 'taška je doma'],
  ['Hana čeká na vlak', 'vlak nejede'], ['Karel hraje na louce', 'začíná mrznout'], ['Dana chce péct chléb', 'pec je studená'], ['Marek kope jámu', 'kámen je tvrdý'], ['Anna čte větu', 'nezná písmo'],
  ['Radek chce plavat', 'voda je studená'], ['Lenka jde k lesu', 'les je daleko'], ['Adam hledá dřevo', 'dřevo je mokré'], ['Tereza otevírá okno', 'okno je zavřené'], ['Pavel čeká u dveří', 'nikdo neotvírá'],
  ['Ota chce jet domů', 'cesta je dlouhá'], ['Roman nese vědro', 'vědro je prázdné'], ['Alena krájí chléb', 'nůž je tupý'], ['Vojta chce jet na kole', 'kolo nejede'],
  ['Slunce hřeje', 'vítr je studený'], ['Zima je dlouhá', 'jaro bude brzy'], ['Louka je zelená', 'tráva je ještě mokrá'], ['Hora je krásná', 'cesta je těžká'], ['Rybník je hluboký', 'voda je čistá'],
  ['Kočka sedí u okna', 'pes štěká'], ['Kohout kokrhá', 'nikdo nevstává'], ['Kráva pase na louce', 'tráva je suchá'], ['Koza hledá trávu', 'louka je pryč'], ['Husa plave v rybníku', 'kachna je na břehu'],
  ['Kniha leží na stole', 'nikdo ji nečte'], ['Hodiny tikají', 'nikdo je neposlouchá'], ['Zvon zvoní', 'nikdo ho neslyší'], ['Okno je otevřené', 'v pokoji je zima'],
  ['Chleba voní', 'nikdo ho nechce'], ['Pohár je zlatý', 'je prázdný'], ['Batoh je nový', 'je těžký'], ['Kabát je teplý', 'je malý'], ['Kámen je tvrdý', 'je lehký'],
  ['Pekař peče chléb', 'mouky je málo'], ['Kuchařka hledá sůl', 'sůl je v kuchyni ✗'], ['Rolník orá pole', 'pole je mokré'], ['Pastýř pase ovce', 'ovce jsou daleko'], ['Řidič jede pomalu', 'cesta je suchá'],
  ['Žák zná cestu', 'nezná les'], ['Učitelka čte knihu', 'knihu už zná'], ['Sousedka zve kluky', 'kluci nemají čas'], ['Rodina chce jet k moři', 'moře je daleko'], ['Dítě chce hrát hru', 'hra je těžká'],
  ['Máma volá děti domů', 'děti jsou venku'], ['Táta nese dřevo', 'dřevo je mokré'], ['Kluk běží k lesu', 'les je daleko'], ['Sestra čeká na autobus', 'autobus nejede'], ['Soused seká trávu', 'tráva je mokrá'],
  ['Děda sedí u okna', 'okno je zavřené'], ['Pes hlídá dům', 'dům je prázdný'], ['Kočka hledá myš', 'myš je pryč'], ['Eva čeká na mámu', 'máma je v práci'], ['Karel hledá klobouk', 'klobouk je doma'],
  ['Marta peče chléb', 'chléb je tvrdý'], ['Olga zná cestu', 'cesta je dlouhá'], ['Dana chce jít domů', 'je pozdě'], ['Hana nese tašku', 'taška je těžká'], ['Lenka čeká u dveří', 'dveře jsou zavřené'],
  ['Adam maluje plot', 'nemá barvu'], ['Pavel opravuje kolo', 'nemá klíč'], ['Roman kope jámu', 'jáma je hluboká'], ['Alan hledá psa', 'pes je v lese'], ['Alena vaří polévku', 'polévka je horká'],
  ['Tereza chce jít ven', 'venku je zima'], ['Nela pere šátek', 'šátek je velký'], ['Lara hraje na louce', 'louka je mokrá'], ['Ivo chce plavat', 'řeka je studená'],
  ['Oto jde do města', 'vlak nejede'], ['Pastýř vede ovce', 'ovce nechtějí jít'], ['Tesař řeže prkno', 'pila je tupá'], ['Rolník nese pytel', 'pytel je těžký'], ['Rybář chytá rybu', 'ryba je malá'],
  ['Učitel ukazuje mapu', 'mapa je stará'], ['Pekař nese housky', 'housky jsou horké'], ['Řezník krájí maso', 'maso je tvrdé'], ['Okno je malé', 'pokoj je tmavý'], ['Zahrada je krásná', 'plot je starý'],
  ['Strom je vysoký', 'větve jsou krátké'], ['Dub je mohutný', 'list je malý'], ['Louka je široká', 'potok je úzký'],
].filter(([a, b]) => !b.includes('✗'));
const ADJ = ['tmavý', 'mohutný', 'studený', 'tvrdý', 'tupý', 'zlatý', 'prázdný', 'teplý', 'malý', 'nový', 'těžký', 'hluboký'];
const ZENA = ['ryby', 'barvy', 'jahody', 'hodiny'];
const mark = (line) => {
  let out = line;
  for (const w of ADJ) out = out.replace(new RegExp(`(?<![\\p{L}{])${w}(?![\\p{L}|])`, 'giu'), '{$&|adj}');
  for (const w of ZENA) out = out.replace(new RegExp(`(?<![\\p{L}{])${w}(?![\\p{L}|])`, 'giu'), '{$&|zena}');
  return out;
};
const norm = (x) => x.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
const taken = new Set();
for (const f of await readdir(path.join(root, 'library-src'))) {
  if (!f.endsWith('.txt') || f === 'od.txt') continue;
  for (const line of (await readFile(path.join(root, 'library-src', f), 'utf8')).split('\n')) taken.add(norm(line.replace(/[{}]|\|\w+/g, '')));
}
const fresh = (x) => !taken.has(norm(x.replace(/[{}]/g, '')));
const uses = new Map(); const bump = (k) => uses.set(k, (uses.get(k) ?? 0) + 1); const used = (k) => uses.get(k) ?? 0;
const blocks = [];
for (let i = 0; i < 30; i++) {
  const lines = [];
  for (const [a, b] of shuffle(PAIRS)) {
    if (lines.length >= 3) break;
    if (used(`p:${a}`) >= 1) continue;
    const text = `${a} ${b}`;
    const hasAdj = ADJ.some((w) => text.includes(w)); const hasZ = ZENA.some((w) => text.includes(w));
    if (hasAdj && lines.some((l) => l.includes('|adj}'))) continue;
    if (hasZ && lines.some((l) => l.includes('|zena}'))) continue;
    if ((/\bchce\b/.test(text) && used('w:chce') >= 7) || (/\bhledá\b/.test(text) && used('w:hledá') >= 7)) continue;
    const conj = rnd() < 0.3 ? 'však' : 'ale';
    const line = mark(`${a}{, ${conj}} ${b}.`);
    if (!fresh(line) || lines.includes(line)) continue;
    lines.push(line); bump(`p:${a}`); if (/\bchce\b/.test(text)) bump('w:chce'); if (/\bhledá\b/.test(text)) bump('w:hledá');
  }
  for (const l of lines) taken.add(norm(l.replace(/[{}]/g, '')));
  blocks.push(`# Čárka před ale ${i + 1}\n${lines.join('\n')}\n`);
}
await writeFile(path.join(root, 'library-src/od.txt'), `feature: punct.adversative_clause\ncode: od\n---\n${blocks.join('\n')}`, 'utf8');
console.log(`zapsáno ${blocks.length} bloků`);

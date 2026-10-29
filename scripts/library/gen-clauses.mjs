#!/usr/bin/env node
// Vygeneruje balíčky složitější interpunkce: vv (hranice vedlejší věty), vs (vsuvka), vlo (vložená vedlejší věta),
// slo (více vedlejších vět). Použití: gen-clauses.mjs <seed> vv|vs|vlo|slo
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.argv[3] ?? 'vv';
let s = Number(process.argv[2] ?? 3) * 2654435761 % 4294967296;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const cap = (w) => w[0].toUpperCase() + w.slice(1);
const lower = (w) => w[0].toLowerCase() + w.slice(1);

const PEOPLE = ['Kluk', 'Dívka', 'Máma', 'Táta', 'Děda', 'Sestra', 'Bratr', 'Soused', 'Učitel', 'Pekař', 'Kuchař', 'Rolník', 'Pastýř', 'Rybář', 'Tesař', 'Kovář', 'Eva', 'Petr', 'Anna', 'Karel', 'Olga', 'Jan', 'Dana', 'Marek', 'Hana', 'Pavel', 'Lenka', 'Adam'];
const SAY = ['říká', 'doufá', 'křičí', 'šeptá', 'volá', 'tvrdí ✗', 'dodává'].filter((x) => !x.includes('✗'));
const STATE = ['prší', 'sněží', 'je pozdě', 'bude teplo', 'vlak jede', 'cesta je dlouhá', 'les je tichý', 'louka je mokrá', 'voda je studená', 'pes štěká', 'slunce hřeje', 'okno je zavřené', 'dveře jsou otevřené', 'je tma', 'fouká vítr', 'je ticho', 'řeka je hluboká', 'kočka sedí u okna', 'zvon zvoní', 'kohout kokrhá', 'pekař peče chléb', 'mlha leží nad loukou', 'kráva pase na louce', 'koza hledá trávu', 'husa plave v rybníku', 'ptáci létají nad lesem', 'žába kváká v potoce', 'vlk vyje v lese', 'hora je daleko', 'tráva je zelená', 'pole je suché', 'most je dlouhý', 'plot je starý', 'dům je tichý', 'zahrada voní', 'koláč voní', 'polévka je horká', 'mléko je studené', 'káva je horká', 'okno je otevřené', 'taška je těžká', 'lampa je stará', 'mapa je nová', 'kniha je tlustá', 'tužka je krátká', 'kočka mňouká u dveří', 'pes leží u plotu', 'kluk běží po louce', 'dívka čte knihu', 'děda sedí u okna', 'máma peče chléb', 'táta jede do města', 'sestra čeká na vlak', 'bratr kope zahradu', 'soused opravuje plot', 'učitel ukazuje mapu', 'potok bublá v lese', 'voda teče z hory', 'déšť padá na střechu', 'oheň praská v kamnech', 'zvonek cinká u dveří', 'čmelák bzučí nad květem', 'kráva bučí na louce', 'osel hýká na dvoře', 'kůň řehtá ve stáji', 'žába skáče do potoka', 'veverka šplhá na strom', 'list padá ze stromu', 'sníh klouže ze střechy', 'kouř stoupá z komína', 'voda klesá v rybníku', 'tráva roste na louce', 'jabloň kvete v zahradě', 'ježek šplhá na pařez', 'sova letí nad lesem', 'ryba plave pod mostem'];
const ACT = ['jdeme domů', 'zůstaneme doma', 'čekáme na vlak', 'běžíme domů', 'zavřeme okno', 'zhasneme lampu', 'jedeme do města', 'sedíme u okna', 'jdeme do lesa', 'zavoláme tátu', 'čteme knihu', 'hledáme tašku', 'jdeme ke škole', 'pomáháme mámě', 'kopeme zahradu', 'zalijeme záhon', 'upečeme koláč', 'uvaříme polévku', 'otevřeme okno', 'zavřeme dveře', 'zamkneme dům', 'spočítáme jablka', 'přečteme větu', 'počkáme u dveří', 'pojedeme domů', 'půjdeme k lesu', 'zůstaneme venku', 'zavoláme mámu', 'najdeme tašku', 'poběžíme ke škole', 'ohřejeme polévku', 'nakrájíme chléb', 'přeskočíme potok', 'odneseme koš', 'otevřeme dveře', 'uvaříme čaj', 'natrháme jablka', 'natrháme hrušky', 'sníme koláč', 'přečteme pohádku', 'zahrajeme hru', 'zavoláme psa', 'upečeme chléb', 'zalijeme trávu'];
const CAUSE = ['prší', 'je tma', 'sněží', 'fouká vítr', 'je zima', 'je pozdě', 'slunce hřeje', 'vlak jede', 'někdo jde', 'je ticho', 'pes štěká', 'zvon zvoní', 'je mráz', 'stoupá mlha', 'je horko', 'bouchají dveře', 'kokrhá kohout', 'voda stoupá', 'pes štěká na louce', 'vlk vyje v lese', 'potok bublá', 'déšť padá', 'oheň praská', 'zvonek cinká', 'kráva bučí', 'kůň řehtá', 'osel hýká', 'voda teče', 'list padá', 'kouř stoupá', 'sníh klouže'];
const WHATDO = ['Pes štěká', 'Kluk běží domů', 'Máma zavře okno', 'Táta zhasne lampu', 'Děti čekají u dveří', 'Pekař vstává brzy', 'Rolník nese vědro', 'Kočka sedí u okna', 'Dívka nese kabát', 'Soused jede do města', 'Kuchař vaří polévku', 'Pastýř vede ovce', 'Pekař peče chléb', 'Kuchař vaří rýži', 'Tesař řeže prkno', 'Kovář kuje podkovu', 'Rybář chytá rybu', 'Pastýř pase ovce', 'Učitel čte pohádku', 'Soused seká trávu', 'Máma pere kabát', 'Táta kope zahradu', 'Děda zalévá záhon', 'Sestra maluje obraz', 'Bratr hladí psa', 'Dívka otevírá okno', 'Kluk hledá kost', 'Veverka šplhá na strom', 'Žába skáče do potoka', 'Kos sedí na střeše', 'Sova letí nad lesem', 'Ryba plave pod mostem', 'Ježek šplhá na pařez', 'Kůň řehtá ve stáji', 'Osel hýká na dvoře', 'Kráva bučí na louce', 'Čmelák bzučí nad květem', 'Jabloň kvete v zahradě', 'Oheň praská v kamnech'];
const SUBCONJ_B = ['Když', 'Jakmile', 'Dokud', 'Zatímco'];

// vs: základ věty (podmět, přísudek) a vsuvky
const BASE = [['Pes', 'nechce jít domů'], ['Vlak', 'jede pomalu'], ['Kluk', 'hledá tašku'], ['Dívka', 'čte knihu'], ['Máma', 'peče koláč'], ['Táta', 'jede do města'], ['Děda', 'sedí u okna'], ['Sestra', 'nese koš'], ['Bratr', 'kope zahradu'],
  ['Soused', 'opravuje plot'], ['Učitel', 'ukazuje mapu'], ['Pekař', 'peče chléb'], ['Kuchař', 'vaří polévku'], ['Rolník', 'orá pole'], ['Pastýř', 'vede ovce'], ['Rybář', 'chytá rybu'], ['Tesař', 'řeže prkno'], ['Kovář', 'kuje podkovu'],
  ['Eva', 'čeká u dveří'], ['Petr', 'jede na kole'], ['Anna', 'zná cestu'], ['Karel', 'nese dřevo'], ['Olga', 'hraje na louce'], ['Jan', 'běží k lesu'], ['Dana', 'pere kabát'], ['Marek', 'hladí kočku'], ['Hana', 'maluje obraz'], ['Pavel', 'zvedne kámen'],
  ['Lenka', 'otevře okno'], ['Adam', 'volá psa'], ['Kočka', 'sedí na plotě'], ['Kohout', 'kokrhá ráno'], ['Řeka', 'teče lesem'], ['Cesta', 'vede k potoku'], ['Zvon', 'zvoní na věži'], ['Slunce', 'hřeje'], ['Louka', 'voní'], ['Les', 'je tichý'], ['Auto', 'stojí u domu'], ['Kolo', 'leží u plotu']];
const PAR = ['bohužel', 'samozřejmě', 'jak se zdá', 'jak známo', 'například', 'konečně', 'ostatně', 'zkrátka', 'pravda', 'ovšem', 'jistě', 'zřejmě', 'možná', 'vlastně', 'snad'];

// vlo: podmět + vztažná věta + přísudek (shoda v rodě)
const REL = {
  m: { subj: ['Kluk', 'Pes', 'Soused', 'Pastýř', 'Tesař', 'Kovář', 'Rybář', 'Pekař', 'Kuchař', 'Rolník', 'Učitel', 'Kocour', 'Dědeček'], pron: 'který', main: ['je můj bratr', 'je náš soused', 'je můj kamarád', 'má hlad', 'zná cestu', 'jede do města', 'je náš učitel', 'čeká na vlak', 'je můj dědeček', 'pracuje na zahradě', 'zná les', 'zná řeku', 'čeká u plotu', 'spěchá domů', 'běží k lesu'] },
  f: { subj: ['Dívka', 'Teta', 'Sestra', 'Kuchařka', 'Sousedka', 'Učitelka', 'Kočka', 'Kráva', 'Koza'], pron: 'která', main: ['je moje sestra', 'je naše teta', 'je moje kamarádka', 'má hlad', 'zná cestu', 'jede do města', 'je naše učitelka', 'čeká na vlak', 'pracuje na zahradě', 'zná les', 'zná řeku', 'čeká u plotu', 'spěchá domů', 'běží k lesu'] },
  n: { subj: ['Dítě', 'Štěně', 'Tele', 'Kotě', 'Hříbě', 'Prase'], pron: 'které', main: ['má hlad', 'zná cestu', 'čeká na mámu', 'běží domů', 'jde za tátou', 'zná les', 'zná řeku', 'čeká u plotu', 'spěchá domů', 'běží k lesu'] },
};
const MAIN_ACT = ['opravuje střechu', 'pomáhá mámě', 'kupuje chléb', 'krájí maso', 'sleduje cestu', 'maluje obraz', 'zalévá záhon', 'seká trávu', 'nese dřevo', 'peče koláč', 'vaří rýži', 'pere kabát', 'prodává mléko', 'otevírá dveře', 'kope jámu', 'hladí psa', 'volá mámu', 'čte pohádku'];
const REL_PRED = ['běží po louce', 'stojí u okna', 'leží u dveří', 'nese koš', 'čeká na vlak', 'hledá tašku', 'čte knihu', 'kope zahradu', 'vede psa', 'jede na kole', 'sedí u řeky', 'jde k potoku', 'drží lopatu', 'hraje na dvoře', 'pracuje v dílně', 'čeká u plotu', 'spěchá domů', 'kope jámu', 'nese vědro', 'čte pohádku', 'peče chléb', 'vaří polévku', 'pase ovce', 'chytá rybu', 'řeže prkno', 'seká trávu', 'zalévá záhon', 'hladí psa', 'volá mámu', 'otevírá okno', 'pere kabát', 'maluje obraz', 'hledá kost', 'čeká u dveří', 'jde do lesa', 'běží k řece', 'sedí na plotě'];
const ANIMAL_OK = new Set(['běží po louce', 'stojí u okna', 'leží u dveří', 'čeká na vlak', 'sedí u řeky', 'jde k potoku', 'čeká u plotu', 'spěchá domů']);
const ANIMALS = new Set(['Pes', 'Kocour', 'Kočka', 'Kráva', 'Koza', 'Štěně', 'Tele', 'Kotě', 'Hříbě', 'Prase']);

const norm = (x) => x.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
const taken = new Set();
for (const f of await readdir(path.join(root, 'library-src'))) {
  if (!f.endsWith('.txt') || f === `${mode}.txt`) continue;
  for (const line of (await readFile(path.join(root, 'library-src', f), 'utf8')).split('\n')) taken.add(norm(line.replace(/[{}]|\|\w+/g, '')));
}
const hasDupWord = (x) => { const seen = new Set(); for (const w of (x.replace(/[{}]|\|\w+/g, '').toLowerCase().match(/\p{L}{4,}/gu) ?? [])) { if (seen.has(w)) return true; seen.add(w); } return false; };
const wordUse = new Map();
const STRUCT = new Set(['který', 'která', 'které', 'protože', 'když', 'jakmile', 'dokud', 'zatímco', 'bohužel', 'samozřejmě', 'jistě', 'možná', 'zřejmě', 'konečně', 'snad', 'ostatně', 'zkrátka', 'ovšem', 'pravda', 'například', 'vlastně', 'známo']);
const tokensOf = (x) => [...new Set((x.replace(/[{}]|\|\w+/g, '').toLowerCase().match(/\p{L}{4,}/gu) ?? []))].filter((w) => !STRUCT.has(w));
const wordOk = (x) => tokensOf(x).every((w) => (wordUse.get(w) ?? 0) < 10);
const claimWords = (x) => tokensOf(x).forEach((w) => wordUse.set(w, (wordUse.get(w) ?? 0) + 1));
const fresh = (x) => !taken.has(norm(x.replace(/[{}]|\|\w+/g, '')));
const uses = new Map(); const bump = (k) => uses.set(k, (uses.get(k) ?? 0) + 1); const used = (k) => uses.get(k) ?? 0;
const cv = (list, key, cap2 = 7) => { const x = shuffle(list).find((p) => used(`${key}:${p}`) < cap2); if (!x) return null; bump(`${key}:${x}`); return x; };

const makers = {
  vv: [
    () => { const p = cv(PEOPLE, 's', 6), v = cv(SAY, 'v', 12), st = cv(STATE, 'st', 6); if (!p || !v || !st) return null; return `${p} ${v}{, že} ${st}.`; },
    () => { const c = cv(SUBCONJ_B, 'c', 10), st = cv(STATE, 'st', 6), a = cv(ACT, 'a', 6); if (!c || !st || !a) return null; return `${c} ${st}{,} ${a}.`; },
    () => { const w = cv(WHATDO, 'w', 5), ca = cv(CAUSE, 'ca', 6); if (!w || !ca) return null; return `${w}{, protože} ${ca}.`; },
    () => { const p = cv(PEOPLE, 's', 6), st = cv(STATE, 'st', 6); if (!p || !st) return null; return `${p} čeká{, až} ${st}.`; },
  ],
  vs: [
    () => { const b = cv(BASE.map((x) => x.join('|')), 'b', 3), par = cv(PAR, 'p', 8); if (!b || !par) return null; const [sj, pr] = b.split('|'); return `${sj}{, ${par},} ${pr}.`; },
  ],
  vlo: [
    () => {
      const g = shuffle(['m', 'f', 'n', 'm', 'f'])[0]; const R = REL[g]; const sj = cv(R.subj, 's', 9); if (!sj) return null;
      const animal = ANIMALS.has(sj);
      const preds = animal ? REL_PRED.filter((x) => ANIMAL_OK.has(x)) : REL_PRED.filter((x) => !x.includes('plotě'));
      const MAIN_PEOPLE = MAIN_ACT;
      const mains = animal ? ['má hlad', 'běží domů', 'jde k řece', 'hledá cestu', 'spěchá domů', 'čeká u plotu', 'jde k lesu', 'sleduje řeku', 'sleduje les', 'hledá kost ✗'.replace(' ✗', '')] : [...R.main, ...(g === 'n' ? [] : MAIN_PEOPLE)];
      const rp = cv(preds, 'rp', 10); const mp = cv(mains, animal ? 'mpa' : 'mp', 10); if (!rp || !mp) return null;
      return `${sj}{, ${R.pron}} ${rp}{,} ${mp}.`;
    },
  ],
  slo: [
    () => { const c = cv(['Když', 'Jakmile', 'Dokud'], 'c', 12), st = cv(STATE, 'st', 6), a = cv(ACT, 'a', 6), ca = cv(CAUSE, 'ca', 6); if (!c || !st || !a || !ca) return null; return `${c} ${st}{,} ${a}{, protože} ${ca}.`; },
    () => { const p = cv(PEOPLE, 's', 6), v = cv(SAY, 'v', 12), a = cv(ACT, 'a', 6), ca = cv(CAUSE, 'ca', 6); if (!p || !v || !a || !ca) return null; return `${p} ${v}{, že} ${a}{, protože} ${ca}.`; },
    () => { const p = cv(PEOPLE, 's', 6), st = cv(STATE, 'st', 6), st2 = cv(STATE, 'st', 6); if (!p || !st || !st2 || st === st2) return null; return `${p} čeká{, až} ${st}{, a} ${st2}.`.replace('{, a}', ' a'); },
  ],
};
const TITLE = { vv: 'Vedlejší věta', vs: 'Vsuvka', vlo: 'Vložená vedlejší věta', slo: 'Souvětí s více vedlejšími větami' };
const FEATURE = { vv: 'punct.subordinate_clause_boundary', vs: 'punct.parenthesis', vlo: 'punct.embedded_subordinate_clause', slo: 'punct.multiple_subordinate_clauses' };
const need = { vv: 3, vs: 3, vlo: 3, slo: 3 }[mode];
const blocks = [];
for (let i = 0; i < 30; i++) {
  const lines = [];
  for (let t = 0; t < 400 && lines.length < need; t++) {
    const l = shuffle(makers[mode])[0]();
    if (l && fresh(l) && wordOk(l) && !hasDupWord(l) && !lines.includes(l)) { lines.push(l); claimWords(l); }
  }
  for (const l of lines) taken.add(norm(l.replace(/[{}]|\|\w+/g, '')));
  blocks.push(`# ${TITLE[mode]} ${i + 1}\n${lines.join('\n')}\n`);
}
void cap; void lower;
await writeFile(path.join(root, `library-src/${mode}.txt`), `feature: ${FEATURE[mode]}\ncode: ${mode}\n---\n${blocks.join('\n')}`, 'utf8');
console.log(`zapsáno ${blocks.length} bloků (${mode})`);

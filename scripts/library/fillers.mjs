#!/usr/bin/env node
// Navrhne dosud nepoužité, bezpečné „výplňové“ věty pro doplnění krátkých textů.
// Použití: node scripts/library/fillers.mjs <ročník> [počet] [--seed N]
// Věty jsou ve tvaru „Podmět je přídavné jméno.“ z ručně sestavených přirozených dvojic.
// Každá věta se ověří stejnými detektory jako text (žádné neoznačené jevy) a nesmí se už vyskytovat
// v data/library, v seedu ani v library-src.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildTaxonomy } from '../../web/js/taxonomy.js';
import { analyzeSentence } from './phenomena.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const grade = Number(process.argv[2] ?? 2);
const count = Number(process.argv[3] ?? 10);
const seed = Number(process.argv.includes('--seed') ? process.argv[process.argv.indexOf('--seed') + 1] : 1);
const tax = buildTaxonomy(JSON.parse(await readFile(path.join(root, 'data/profiles.json'), 'utf8')));

// podstatné jméno → rod a přijatelná přídavná jména (m/ž/s tvary)
const ADJ = {
  velký: ['velký', 'velká', 'velké'], hezký: ['hezký', 'hezká', 'hezké'], starý: ['starý', 'stará', 'staré'], tichý: ['tichý', 'tichá', 'tiché'],
  dlouhý: ['dlouhý', 'dlouhá', 'dlouhé'], krátký: ['krátký', 'krátká', 'krátké'], těžký: ['těžký', 'těžká', 'těžké'], lehký: ['lehký', 'lehká', 'lehké'],
  sladký: ['sladký', 'sladká', 'sladké'], horký: ['horký', 'horká', 'horké'], široký: ['široký', 'široká', 'široké'], hluboký: ['hluboký', 'hluboká', 'hluboké'],
  dobrý: ['dobrý', 'dobrá', 'dobré'], chytrý: ['chytrý', 'chytrá', 'chytré'], suchý: ['suchý', 'suchá', 'suché'], mokrý: ['mokrý', 'mokrá', 'mokré'],
  zelená: [null, 'zelená', 'zelené'], červená: [null, 'červená', 'červené'], černá: [null, 'černá', 'černé'], šedá: [null, 'šedá', 'šedé'], žlutá: [null, 'žlutá', 'žluté'],
  modrá: [null, 'modrá', 'modré'], hnědá: [null, 'hnědá', 'hnědé'], krásná: [null, 'krásná', 'krásné'], teplá: [null, 'teplá', 'teplé'], studená: [null, 'studená', 'studené'],
  čerstvá: [null, 'čerstvá', 'čerstvé'], hodná: [null, 'hodná', 'hodné'], veselá: [null, 'veselá', 'veselé'], malá: [null, 'malá', 'malé'], úzká: [null, 'úzká', 'úzké'],
};
const NOUNS = [
  ['les', 0, 'velký tichý starý hluboký'], ['plot', 0, 'dlouhý starý krátký'], ['most', 0, 'dlouhý starý široký'], ['sad', 0, 'velký tichý hezký'], ['potok', 0, 'úzká'],
  ['kopec', 0, 'velký hezký'], ['dvůr', 0, 'velký tichý'], ['vlak', 0, 'dlouhý těžký'], ['vůz', 0, 'těžký starý'], ['pes', 0, 'chytrý hodná'], ['kohout', 0, 'velký chytrý'],
  ['ježek', 0, 'malá chytrý'], ['kapr', 0, 'velký'], ['lev', 0, 'velký chytrý'], ['slon', 0, 'velký těžký'], ['kůň', 0, 'velký chytrý starý'], ['stůl', 0, 'dlouhý těžký starý'], ['nůž', 0, 'ostrý'],
  ['kámen', 0, 'těžký tvrdý'], ['batoh', 0, 'těžký lehký'], ['svetr', 0, 'teplá'], ['chléb', 0, 'čerstvá horký'], ['koláč', 0, 'sladký horký čerstvá'],
  ['louka', 1, 'zelená velká hezká mokrá suchá'], ['cesta', 1, 'dlouhá krátká úzká široká suchá mokrá'], ['zahrada', 1, 'velká hezká krásná tichá'], ['řeka', 1, 'hluboká široká dlouhá studená'],
  ['hora', 1, 'velká tichá krásná'], ['škola', 1, 'velká nová stará hezká'], ['třída', 1, 'velká tichá teplá'], ['tráva', 1, 'zelená suchá mokrá čerstvá'], ['kráva', 1, 'hodná velká černá'],
  ['koza', 1, 'hodná chytrá malá'], ['kočka', 1, 'chytrá hodná černá šedá hnědá'], ['husa', 1, 'velká hodná'], ['kachna', 1, 'malá hnědá hodná'], ['noha', 1, 'dlouhá krátká'],
  ['ruka', 1, 'malá velká teplá studená'], ['taška', 1, 'těžká lehká stará nová'], ['mapa', 1, 'stará velká'], ['lampa', 1, 'stará nová'], ['voda', 1, 'studená teplá čerstvá hluboká'],
  ['káva', 1, 'horká sladká teplá čerstvá'], ['polévka', 1, 'horká teplá čerstvá'], ['noc', 1, 'dlouhá krátká tichá studená teplá'], ['obloha', 1, 'modrá šedá krásná'],
  ['pole', 2, 'velké zelené žluté suché mokré'], ['okno', 2, 'velké malé hezké'], ['kolo', 2, 'nové staré'], ['auto', 2, 'nové staré velké'], ['jezero', 2, 'hluboké široké tiché'],
  ['moře', 2, 'hluboké široké modré studené teplé'], ['slunce', 2, 'horké hezké'], ['mléko', 2, 'čerstvé sladké studené teplé'], ['maso', 2, 'čerstvé'], ['jablko', 2, 'sladké čerstvé červené'],
  ['léto', 2, 'teplé krátké hezké'], ['jaro', 2, 'krásné teplé'], ['město', 2, 'velké staré hezké tiché'], ['letadlo', 2, 'velké nové'], ['rádio', 2, 'staré nové tiché'],
];
const adjForm = (key, gender) => {
  const k = ADJ[key] ? key : Object.keys(ADJ).find((x) => ADJ[x].includes(key));
  return k ? ADJ[k][gender] : null;
};
const pairs = [];
for (const [noun, g, adjs] of NOUNS) {
  for (const a of adjs.split(' ')) {
    const f = adjForm(a, g);
    if (f) pairs.push(`${noun[0].toUpperCase()}${noun.slice(1)} je ${f}.`);
  }
}
// Druhý typ vět: jméno osoby + slovesné spojení (v přítomném čase, bez skrytých jevů)
const NAMES = ['Jan', 'Petr', 'Karel', 'Marek', 'Radek', 'Adam', 'Pavel', 'Ota', 'Roman', 'Vojta', 'Alan', 'Oto', 'Ivo', 'Eva', 'Olga', 'Anna', 'Dana', 'Lenka', 'Tereza', 'Hana', 'Alena', 'Nela', 'Marta', 'Ema', 'Lara', 'Soňa', 'Mara', 'Aneta'];
const PREDS = ['čte knihu', 'nese koš', 'hledá tašku', 'kope jámu', 'zná cestu', 'jede na kole', 'jde do lesa', 'běží domů', 'sedí u okna', 'čeká na vlak', 'hraje na louce',
  'volá psa', 'vede koně', 'nese vědro', 'drží lopatu', 'peče koláč', 'vaří polévku', 'hladí kočku', 'krájí chléb', 'maluje obraz', 'seká dřevo', 'pere šátek', 'zalévá záhon',
  'otevírá okno', 'hledá dřevo', 'nese mléko', 'jde na louku', 'jede do města', 'čeká u dveří', 'kope zahradu', 'zná les', 'zná řeku', 'nese kabát', 'hledá ježka', 'sleduje ptáka',
  'jde k potoku', 'sedí na stole', 'sedí u řeky', 'běží k lesu', 'běží po louce', 'jde za psem', 'jede za tátou', 'čeká na mámu', 'nese tašku', 'drží psa', 'hledá kolo'];
for (const n of NAMES) for (const pr of PREDS) pairs.push(`${n} ${pr}.`);
// pseudonáhodné pořadí podle seedu
let s = seed * 2654435761 % 4294967296;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
pairs.sort(() => rnd() - 0.5);

const used = new Set();
const norm = (x) => x.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
const addAll = (arr) => arr.forEach((x) => used.add(norm(x)));
for (const f of ['data/dictations.seed.json', ...(await readdir(path.join(root, 'data/library')).then((l) => l.map((x) => `data/library/${x}`)).catch(() => []))]) {
  const j = JSON.parse(await readFile(path.join(root, f), 'utf8'));
  for (const d of j.dictations) addAll(d.sentences);
}
for (const f of await readdir(path.join(root, 'library-src')).catch(() => [])) {
  if (!f.endsWith('.txt')) continue;
  for (const line of (await readFile(path.join(root, 'library-src', f), 'utf8')).split('\n')) used.add(norm(line.replace(/[{}]|\|\w+/g, '')));
}
const allowed = (id) => { const x = tax.features.get(id); return x.typical_grade < grade || (x.typical_grade === grade && x.default_policy === 'by_grade'); };
const candidates = [];
for (const sentence of pairs) {
  if (used.has(norm(sentence))) continue;
  const r = analyzeSentence(sentence);
  if (r.errors.length || r.needs.length) continue;
  if (r.auto.some((a) => !allowed(a.feature))) continue;
  if (r.auto.some((a) => a.feature.startsWith('orth.listed'))) continue;
  candidates.push(sentence);
}
if (process.argv.includes('--dedupe')) {
  // --dedupe soubor.txt : věty, které se už jinde v knihovně vyskytují (nebo dříve v tomto souboru), nahradí volnými
  const file = process.argv[process.argv.indexOf('--dedupe') + 1];
  const text = await readFile(file, 'utf8');
  const code = text.match(/^code:\s*(\S+)/m)[1];
  const targetFeature = text.match(/^feature:\s*(\S+)/m)[1];
  const carriesTarget = (line) => analyzeSentence(line.replace(/[{}]|\|\w+/g, '')).auto.some((a) => a.feature === targetFeature || (targetFeature === 'orth.listed_words_review' && a.feature.startsWith('orth.listed')));
  const others = new Set();
  for (const f of await readdir(path.join(root, 'library-src'))) {
    if (!f.endsWith('.txt') || path.join(root, 'library-src', f) === path.resolve(file)) continue;
    for (const line of (await readFile(path.join(root, 'library-src', f), 'utf8')).split('\n')) others.add(norm(line.replace(/[{}]|\|\w+/g, '')));
  }
  const seed = JSON.parse(await readFile(path.join(root, 'data/dictations.seed.json'), 'utf8'));
  for (const d of seed.dictations) for (const s of d.sentences) others.add(norm(s));
  const pool = candidates.filter((c) => !others.has(norm(c)));
  const seen = new Set();
  let replaced = 0;
  const out2 = text.split('\n').map((line) => {
    if (!line.trim() || line.startsWith('#') || line.startsWith('//') || /^\w+:/.test(line) || line === '---') return line;
    const k = norm(line.replace(/[{}]|\|\w+/g, ''));
    if ((others.has(k) || seen.has(k)) && !/[{}]/.test(line) && !carriesTarget(line)) {
      const s = pool.shift();
      if (s) { seen.add(norm(s)); replaced++; return s; }
    }
    seen.add(k);
    return line;
  });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(file, out2.join('\n'), 'utf8');
  console.log(`nahrazeno vět: ${replaced} (${code})`);
} else if (process.argv.includes('--pad')) {
  // --pad soubor.txt minSlov : doplní bloky, které mají méně slov, dalšími větami (nejvýše 5 vět)
  const file = process.argv[process.argv.indexOf('--pad') + 1];
  const min = Number(process.argv[process.argv.indexOf('--pad') + 2]);
  const text = await readFile(file, 'utf8');
  const wc = (l) => (l.replace(/[{}]|\|\w+/g, '').match(/\p{L}+/gu) ?? []).length;
  const blocks = text.split('\n# ');
  let added = 0;
  const done = blocks.map((b, i) => {
    if (i === 0) return b;
    const lines = b.replace(/\n+$/, '').split('\n');
    let words = lines.slice(1).reduce((a, l) => a + wc(l), 0);
    while (words < min && lines.length - 1 < 5 && candidates.length) {
      const s = candidates.shift();
      lines.push(s); words += wc(s); added++;
    }
    return lines.join('\n') + '\n';
  });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(file, done.join('\n# '), 'utf8');
  console.log(`doplněno vět: ${added}`);
} else {
  console.log(candidates.slice(0, count).join('\n'));
}

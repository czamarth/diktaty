import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogError, checkImport, loadCatalog } from '../../web/js/catalog.js';
import { makeDictation, seed, taxonomy } from './helpers.mjs';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

function fakeFetch({ seedBody = seed, packs = [], seedStatus = 200, packsStatus = 200 } = {}) {
  return async (url) => {
    if (url === '/data/dictations.seed.json') return seedStatus === 200 ? json(seedBody) : json({}, seedStatus);
    if (url === '/api/packs') return packsStatus === 200 ? json({ packs }) : json({}, packsStatus);
    throw new Error(`neočekávaný požadavek ${url}`);
  };
}

async function validPack(id = 'moje', dictId = 'M01', extra = {}) {
  const d = await makeDictation({
    id: dictId, grade: 2, sentences: ['U domu je úl.', 'Vedle stojí stůl.', 'Táta nese sůl.'], target: ['orth.u_long_basic'],
    ann: [[0, 'úl', 'orth.u_long_basic', 'target'], [1, 'stůl', 'orth.u_long_basic', 'target']],
  });
  return { schema_version: 1, language: 'cs-CZ', offset_unit: 'unicode_code_points', pack_id: id, pack_version: 1, dictations: [d], ...extra };
}

test('vestavěná knihovna: 10 použitelných diktátů, bez problémů', async () => {
  const cat = await loadCatalog(taxonomy, fakeFetch());
  assert.equal(cat.usable.length, 10);
  assert.deepEqual(cat.problems, []);
  assert.ok(cat.items.every((i) => i.source.pack_id === 'seed'));
  assert.equal(cat.seedOk, true);
});

test('poškozený nebo nedostupný základní balíček = srozumitelný chybový stav', async () => {
  await assert.rejects(loadCatalog(taxonomy, fakeFetch({ seedStatus: 404 })), (e) => e instanceof CatalogError && /Základní knihovnu/.test(e.message));
  const broken = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token'); } });
  await assert.rejects(loadCatalog(taxonomy, broken), CatalogError);
});

test('vadná položka v seedu se vyřadí, ostatní zůstanou použitelné', async () => {
  const bad = structuredClone(seed);
  bad.dictations[2].sentences[1] = 'Během dne věje silný větřík.'; // text už nesedí na součet ani segmenty
  const cat = await loadCatalog(taxonomy, fakeFetch({ seedBody: bad }));
  assert.equal(cat.usable.length, 9);
  const item = cat.items.find((i) => i.dictation.id === 'D03');
  assert.equal(item.usable, false);
  assert.ok(item.issues.some((i) => i.code === 'sha_mismatch'));
});

test('importovaný balíček se připojí; poškozený soubor v úložišti nezablokuje ostatní', async () => {
  const good = await validPack();
  const cat = await loadCatalog(taxonomy, fakeFetch({ packs: [{ file: 'moje.json', data: good }, { file: 'rozbity.json', data: null, error: 'Soubor balíčku je poškozený (není platný JSON).' }] }));
  assert.equal(cat.usable.length, 11);
  assert.equal(cat.packs.length, 1);
  assert.ok(cat.problems.some((p) => p.pack === 'rozbity.json' && /poškozený/.test(p.message)));
});

test('nedostupné úložiště balíčků nesmí shodit základní knihovnu', async () => {
  const cat = await loadCatalog(taxonomy, fakeFetch({ packsStatus: 500 }));
  assert.equal(cat.usable.length, 10);
  assert.ok(cat.problems.length === 1);
});

test('kolize ID s vestavěnou knihovnou: importovaná položka se nepoužije', async () => {
  const clash = await validPack('moje', 'D02');
  const cat = await loadCatalog(taxonomy, fakeFetch({ packs: [{ file: 'moje.json', data: clash }] }));
  assert.equal(cat.usable.length, 10);
  assert.equal(cat.usable.filter((i) => i.dictation.id === 'D02').length, 1);
  assert.ok(cat.items.find((i) => i.source.pack_id === 'moje').issues.some((i) => i.code === 'id_collision'));
});

test('import: platný balíček projde, nic nepřidá schváleného automaticky', async () => {
  const cat = await loadCatalog(taxonomy, fakeFetch());
  const pack = await validPack();
  const res = await checkImport(JSON.stringify(pack), taxonomy, cat);
  assert.equal(res.ok, true, JSON.stringify(res.report));
  assert.equal(res.pack.dictations[0].teacher_approved, false);
});

test('import: odmítne prázdný soubor, nesmysl, cizí jazyk, kolizi ID a vyhrazené pack_id', async () => {
  const cat = await loadCatalog(taxonomy, fakeFetch());
  assert.equal((await checkImport('', taxonomy, cat)).ok, false);
  assert.equal((await checkImport('{nejson', taxonomy, cat)).ok, false);
  assert.equal((await checkImport('[]', taxonomy, cat)).ok, false);
  assert.equal((await checkImport('x'.repeat(2 * 1024 * 1024 + 1), taxonomy, cat)).ok, false);
  const sk = await validPack();
  sk.language = 'sk-SK';
  assert.equal((await checkImport(JSON.stringify(sk), taxonomy, cat)).ok, false);
  const clash = await validPack('moje', 'D05');
  const r = await checkImport(JSON.stringify(clash), taxonomy, cat);
  assert.equal(r.ok, false);
  assert.ok(r.report.some((x) => /D05.*už existuje/.test(x.message)));
  const reserved = await validPack('seed', 'M05');
  assert.equal((await checkImport(JSON.stringify(reserved), taxonomy, cat)).ok, false);
});

test('import: balíček s chybnou položkou se neuloží ani částečně', async () => {
  const cat = await loadCatalog(taxonomy, fakeFetch());
  const pack = await validPack();
  const second = structuredClone(pack.dictations[0]);
  second.id = 'M02';
  second.sentences[0] = 'Upraveno bez přepočtu.';
  pack.dictations.push(second);
  const r = await checkImport(JSON.stringify(pack), taxonomy, cat);
  assert.equal(r.ok, false);
  assert.equal(r.pack, null);
});

test('import: nižší verze už nainstalovaného balíčku se odmítne, vyšší nahradí', async () => {
  const installed = await validPack('moje', 'M01', { pack_version: 3 });
  const cat = await loadCatalog(taxonomy, fakeFetch({ packs: [{ file: 'moje.json', data: installed }] }));
  const older = await validPack('moje', 'M01', { pack_version: 2 });
  assert.equal((await checkImport(JSON.stringify(older), taxonomy, cat)).ok, false);
  const newer = await validPack('moje', 'M01', { pack_version: 4 });
  const r = await checkImport(JSON.stringify(newer), taxonomy, cat);
  assert.equal(r.ok, true);
  assert.equal(r.replaces.pack_version, 3);
});

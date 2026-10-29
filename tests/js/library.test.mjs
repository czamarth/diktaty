// Testy vygenerované knihovny (data/library) a jejích kontrol.
// Neověřují pedagogickou vhodnost ani správnost češtiny; ověřují strukturu, uzavřenost jevů
// vůči profilu a to, že kontroly generátoru opravdu odmítají skryté jevy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildTaxonomy } from '../../web/js/taxonomy.js';
import { errorsOf, validatePack } from '../../web/js/schema.js';
import { defaultProfile, setCheckGraphemes, setFeatureState } from '../../web/js/profile.js';
import { evaluate } from '../../web/js/selection.js';
import { analyzeWord } from '../../scripts/library/phenomena.mjs';
import { buildDictation } from '../../scripts/library/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const taxonomy = buildTaxonomy(JSON.parse(await readFile(path.join(root, 'data/profiles.json'), 'utf8')));
const dir = path.join(root, 'data/library');
const packs = [];
for (const f of (await readdir(dir)).filter((x) => x.endsWith('.json')).sort()) packs.push(JSON.parse(await readFile(path.join(dir, f), 'utf8')));

test('knihovna má 38 balíčků po 30 diktátech (jeden cílový jev na balíček)', () => {
  assert.equal(packs.length, 38);
  const targets = new Set();
  for (const p of packs) {
    assert.equal(p.dictations.length, 30, p.pack_id);
    const t = new Set(p.dictations.map((d) => d.target_features.map((f) => f.id).join(',')));
    assert.equal(t.size, 1, `${p.pack_id}: smíšené cílové jevy`);
    targets.add([...t][0]);
  }
  assert.equal(targets.size, 38, 'každý jev z taxonomie má právě jeden balíček');
  for (const f of taxonomy.raw.features) assert.ok(targets.has(f.id), `chybí balíček pro ${f.id}`);
});

test('všechny balíčky projdou validátorem aplikace bez chyb', async () => {
  for (const p of packs) {
    const r = await validatePack(p, taxonomy, { requirePackId: true });
    assert.deepEqual(r.packIssues, [], p.pack_id);
    for (const { id, issues } of r.perDictation) assert.deepEqual(errorsOf(issues), [], `${p.pack_id}/${id}`);
  }
});

test('ID, názvy, kontrolní součty i věty jsou v celé knihovně jedinečné', () => {
  const ids = new Set(); const shas = new Set(); const sentences = new Set();
  for (const p of packs) for (const d of p.dictations) {
    assert.ok(!ids.has(d.id), d.id); ids.add(d.id);
    assert.ok(!shas.has(d.content_sha256), `${d.id}: stejný text jako jiný diktát`); shas.add(d.content_sha256);
    for (const s of d.sentences) { const k = s.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim(); assert.ok(!sentences.has(k), `opakovaná věta: ${s}`); sentences.add(k); }
  }
  assert.equal(ids.size, 1140);
});

test('žádná položka není schválená ani redakčně potvrzená (jen ukázka)', () => {
  for (const p of packs) for (const d of p.dictations) {
    assert.equal(d.teacher_approved, false, d.id);
    assert.equal(d.review_status, 'sample', d.id);
    assert.equal(d.annotation_completeness, 'partial', d.id);
    assert.equal(d.audio_review_status, 'not_generated', d.id);
    assert.ok(d.annotations.every((a) => a.review_status === 'editorial_proposal'), d.id);
  }
});

test('výběr aplikace: profil, který zná jevy do ročníku cíle, přijme všech 30 textů přísně', () => {
  for (const p of packs) {
    const target = p.dictations[0].target_features[0].id;
    const g = taxonomy.features.get(target).typical_grade;
    let profile = setCheckGraphemes(defaultProfile(g, taxonomy), false);
    for (const f of taxonomy.raw.features) if (f.typical_grade <= g) profile = setFeatureState(profile, f.id, 'taught');
    for (const d of p.dictations) assert.equal(evaluate(d, profile).strict.eligible, true, `${d.id} by měl projít`);
  }
});

test('výběr aplikace: bez cílového jevu v profilu se žádný z textů nenabídne', () => {
  for (const p of packs) {
    const target = p.dictations[0].target_features[0].id;
    const g = taxonomy.features.get(target).typical_grade;
    let profile = setCheckGraphemes(defaultProfile(g, taxonomy), false);
    for (const f of taxonomy.raw.features) if (f.typical_grade <= g && f.id !== target) profile = setFeatureState(profile, f.id, 'taught');
    profile = setFeatureState(profile, target, 'not_taught');
    for (const d of p.dictations) assert.equal(evaluate(d, profile).strict.eligible, false, `${d.id} nesmí projít bez ${target}`);
  }
});

test('výběr aplikace: bez kteréhokoli vedlejšího jevu textu se text nenabídne', () => {
  for (const p of packs) {
    const target = p.dictations[0].target_features[0].id;
    const g = taxonomy.features.get(target).typical_grade;
    for (const d of p.dictations.slice(0, 5)) {
      for (const inc of d.incidental_features) {
        let profile = setCheckGraphemes(defaultProfile(g, taxonomy), false);
        for (const f of taxonomy.raw.features) if (f.typical_grade <= g && f.id !== inc.id) profile = setFeatureState(profile, f.id, 'taught');
        profile = setFeatureState(profile, inc.id, 'not_taught');
        assert.equal(evaluate(d, profile).strict.eligible, false, `${d.id} bez ${inc.id}`);
      }
    }
  }
});

test('detektory: skrytá rozhodnutí se nepřehlédnou', () => {
  const feats = (w) => [...analyzeWord(w, { sentenceFirst: false }).features];
  assert.ok(feats('babička').includes('orth.listed_words_b'));
  assert.ok(feats('klíč').includes('orth.listed_words_l'));
  assert.ok(feats('stůl').includes('orth.u_long_basic'));
  assert.ok(feats('dub').includes('orth.voicing_final'));
  assert.ok(feats('tužka').includes('orth.voicing_internal'));
  assert.ok(analyzeWord('zemi', { sentenceFirst: false }).needs.some((n) => n.kind === 'ending'));
  assert.ok(analyzeWord('nesli', { sentenceFirst: false }).needs.length > 0, 'minulý čas vyžaduje označení');
  assert.ok(analyzeWord('Turisté', { sentenceFirst: true }).errors.length > 0, 'výjimka ri');
  assert.ok(analyzeWord('Polsko', { sentenceFirst: false }).needs.some((n) => n.kind === 'proper'));
});

test('generátor odmítne text se skrytým jevem a přijme čistý text', () => {
  const meta = { feature: 'orth.u_long_basic', code: 'zz' };
  const bad = buildDictation({ block: { title: 'Špatný', lines: ['Babička nese úl.', 'U domu je stůl.', 'Na stole leží úkol.'] }, index: 0, meta, taxonomy });
  assert.ok(bad.problems.some((x) => x.includes('listed_words')), 'babička (b+i) musí být odmítnuta pro 2. ročník');
  const good = buildDictation({ block: { title: 'Dobrý', lines: ['Na zahradě je úl.', 'U domu je stůl.', 'Táta jde domů.'] }, index: 0, meta, taxonomy });
  assert.deepEqual(good.problems, []);
  assert.equal(good.dictation.teacher_approved, false);
});

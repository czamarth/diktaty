import test from 'node:test';
import assert from 'node:assert/strict';
import { errorsOf, isApprovedCatalogEntry, tierOf, validateDictation, validatePack, warningsOf } from '../../web/js/schema.js';
import { sha256Hex, speakableProblems } from '../../web/js/text.js';
import { makeDictation, seed, taxonomy } from './helpers.mjs';

const codes = (issues) => errorsOf(issues).map((i) => i.code);
const clone = (i) => structuredClone(seed.dictations[i]);

test('seed: všech 10 diktátů projde strukturálními kontrolami; varování = vnořené anotace a neanotované i/y po obojetných souhláskách', async () => {
  const res = await validatePack(seed, taxonomy);
  assert.equal(res.ok, true, JSON.stringify(res.perDictation.flatMap((p) => errorsOf(p.issues))));
  const warns = res.perDictation.flatMap((p) => warningsOf(p.issues).map((w) => `${p.id}:${w.code}`));
  assert.deepEqual(warns.sort(), ['D01:annotation_nested', 'D02:annotation_nested', 'D07:annotation_nested', 'D09:possible_unannotated_iy', 'D10:possible_unannotated_iy']);
  const iy = res.perDictation.flatMap((p) => warningsOf(p.issues).filter((w) => w.code === 'possible_unannotated_iy').map((w) => w.message));
  assert.ok(iy.some((m) => m.includes('„bylo“')), 'D10: bylo (vyjmenované slovo po B) nemá anotaci');
  assert.ok(iy.some((m) => m.includes('„silně“')), 'D09: silně (si/sy po obojetném s) nemá anotaci');
});

test('heuristika neanotovaného i/y: slovo s anotací varování nevyvolá, slovo bez ní ano', async () => {
  const withAnn = await makeDictation({ sentences: ['Dítě mělo ryby.', 'Táta nese sůl.', 'U domu je úl.'], target: ['orth.listed_words_b'], ann: [[0, 'ryby', 'orth.hard_consonants_basic', 'target']] });
  assert.ok(!warningsOf(await validateDictation(withAnn, taxonomy)).some((w) => w.code === 'possible_unannotated_iy'));
  const without = await makeDictation({ sentences: ['Slabý pes bylo.', 'Táta nese sůl.', 'U domu je úl.'], target: ['orth.u_long_basic'], ann: [[1, 'sůl', 'orth.u_long_basic', 'target']] });
  const w = warningsOf(await validateDictation(without, taxonomy)).filter((x) => x.code === 'possible_unannotated_iy').map((x) => x.message);
  assert.equal(w.length, 2);
});

test('akceptace: knihovna má právě 10 unikátních diktátů, 3–5 vět, všech 9 ročníků, rozložení 1,2,2,3,4,5,6,7,8,9', () => {
  const ds = seed.dictations;
  assert.equal(ds.length, 10);
  assert.equal(new Set(ds.map((d) => d.id)).size, 10);
  assert.equal(new Set(ds.map((d) => d.text)).size, 10);
  assert.ok(ds.every((d) => d.sentences.length >= 3 && d.sentences.length <= 5));
  assert.deepEqual(ds.map((d) => d.recommended_grade), [1, 2, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(new Set(ds.map((d) => d.recommended_grade)).size, 9);
  assert.equal(ds.reduce((n, d) => n + d.sentences.length, 0), 31);
});

test('žádný seed diktát není schválený: stav kontroly se nemění automaticky podle ročníku', () => {
  for (const d of seed.dictations) {
    assert.equal(d.teacher_approved, false);
    assert.equal(tierOf(d), 'checked');
    assert.equal(isApprovedCatalogEntry(d), false);
    assert.equal(d.annotation_completeness, 'partial');
    assert.equal(d.audio_review_status, 'not_generated');
  }
});

test('úprava textu: kontrolní součet a kanonické znění přestanou souhlasit', async () => {
  const d = clone(1);
  d.sentences[0] = 'U domu je úly.';
  const c = codes(await validateDictation(d, taxonomy));
  assert.ok(c.includes('sha_mismatch'));
  assert.ok(c.includes('text_mismatch'));
  assert.ok(c.includes('segments_text_mismatch'));
});

test('chybné offsety, neznámý jev a duplicita anotace jsou chyby', async () => {
  const d = clone(3);
  d.annotations[0].start += 1;
  d.annotations.push({ ...d.annotations[1] });
  d.annotations.push({ ...d.annotations[1], feature_id: 'orth.neexistuje' });
  const c = codes(await validateDictation(d, taxonomy));
  assert.ok(c.includes('annotation_span'));
  assert.ok(c.includes('annotation_duplicate'));
  assert.ok(c.includes('unknown_feature'));
});

test('chybějící teacher_approved se nepovažuje za schváleno', async () => {
  const d = clone(0);
  delete d.teacher_approved;
  assert.ok(codes(await validateDictation(d, taxonomy)).includes('bad_teacher_approved'));
});

test('schválení vyžaduje úplnou potvrzenou anotaci a záznam o schválení', async () => {
  const d = clone(0);
  d.teacher_approved = true;
  d.review_status = 'teacher_approved';
  const c = codes(await validateDictation(d, taxonomy));
  assert.ok(c.includes('approval_incomplete'));
  assert.ok(c.includes('approval_record'));

  const claimsComplete = clone(0);
  claimsComplete.annotation_completeness = 'complete';
  assert.ok(codes(await validateDictation(claimsComplete, taxonomy)).includes('claimed_complete'), 'neúplná anotace se nesmí tvářit jako úplná');
});

test('úplná, potvrzená a schválená položka projde a je v schváleném katalogu', async () => {
  const d = await makeDictation({
    sentences: ['U domu je úl.', 'Vedle stojí stůl.', 'Táta nese sůl.'],
    target: ['orth.u_long_basic'], incidental: ['orth.sentence_boundaries'],
    ann: [[0, 'úl', 'orth.u_long_basic', 'target'], [1, 'stůl', 'orth.u_long_basic', 'target'], [2, 'sůl', 'orth.u_long_basic', 'target'], [0, 'U', 'orth.sentence_boundaries', 'incidental']],
    completeness: 'complete', approved: true, confirmed: true,
  });
  assert.deepEqual(errorsOf(await validateDictation(d, taxonomy)), []);
  assert.equal(tierOf(d), 'approved');
  assert.equal(isApprovedCatalogEntry(d), true);
  // stejná položka s jedinou nepotvrzenou anotací už schválená není
  d.annotations[0].review_status = 'editorial_proposal';
  assert.equal(isApprovedCatalogEntry(d), false);
});

test('první třída: chybějící nebo nesprávný seznam grafémů je chyba', async () => {
  const d = clone(0);
  d.known_graphemes_required = null;
  assert.ok(codes(await validateDictation(d, taxonomy)).includes('graphemes_missing'));
  const e = clone(0);
  e.known_graphemes_required = e.known_graphemes_required.filter((g) => g !== 'á');
  assert.ok(codes(await validateDictation(e, taxonomy)).includes('graphemes_mismatch'));
});

test('hlasový vstup: technické značky a [[fonémy]] se odmítnou', async () => {
  assert.deepEqual(speakableProblems('Máma má maso.'), []);
  assert.deepEqual(speakableProblems('Studenti, kteří se učili, uspěli.'), []);
  assert.ok(speakableProblems('Máma [[mˈaːma]] má maso.').length > 0);
  assert.ok(speakableProblems('Máma <b>má</b> maso.').length > 0);
  assert.ok(speakableProblems('**Máma** má maso.').length > 0);
  const d = clone(0);
  d.sentences[0] = 'Máma [[má]] maso.';
  d.text = d.sentences.join(' ');
  d.tts_segments[0].text = d.sentences[0];
  d.content_sha256 = await sha256Hex(d.text);
  assert.ok(codes(await validateDictation(d, taxonomy)).includes('not_speakable'));
});

test('předvyplnění musí mířit na jednoznačné místo', async () => {
  const d = await makeDictation({
    sentences: ['Slabý pes má slabý hlas.', 'Venku je tma.', 'Doma je teplo.'],
    target: ['orth.adjective_hard_endings'],
    ann: [[0, 'Slabý', 'orth.adjective_hard_endings', 'target']],
  });
  d.support = [{ sentence_index: 0, span: 'slabý', action: 'prefill', reason: 'x', exclude_from_independent_writing: true, start: 13, end: 18 }];
  const c = codes(await validateDictation(d, taxonomy));
  assert.deepEqual(c.filter((x) => x.startsWith('support_')), [], 'v textu je jen jedno „slabý“ malým písmem a pozice sedí');
  d.support[0].span = 'Slabý';
  d.support[0].start = 0;
  d.support[0].end = 5;
  d.sentences[0] = 'Slabý pes má Slabý hlas.';
  d.text = d.sentences.join(' ');
  d.tts_segments[0].text = d.sentences[0];
  assert.ok(codes(await validateDictation(d, taxonomy)).includes('support_ambiguous'));
});

test('text není v NFC: rozložená diakritika se odmítne (rozjely by se offsety)', async () => {
  const d = clone(1);
  d.sentences[0] = 'U domu je úl.';
  const c = codes(await validateDictation(d, taxonomy));
  assert.ok(c.includes('not_nfc'));
});

test('balíček: duplicitní ID, jiný jazyk a chybějící pack_id při importu', async () => {
  const dup = structuredClone(seed);
  dup.dictations.push(structuredClone(dup.dictations[0]));
  const r1 = await validatePack(dup, taxonomy);
  assert.equal(r1.ok, false);
  assert.ok(r1.perDictation.some((p) => p.issues.some((i) => i.code === 'duplicate_id')));

  const wrongLang = structuredClone(seed);
  wrongLang.language = 'sk-SK';
  assert.equal((await validatePack(wrongLang, taxonomy)).ok, false);

  const noId = await validatePack(seed, taxonomy, { requirePackId: true });
  assert.equal(noId.ok, false);
  assert.ok(noId.packIssues.some((i) => i.code === 'pack_id'));
  assert.equal((await validatePack({}, taxonomy)).ok, false);
  assert.equal((await validatePack(null, taxonomy)).ok, false);
});

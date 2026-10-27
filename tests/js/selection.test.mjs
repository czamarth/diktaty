import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, libraryCoverage, selectDictations } from '../../web/js/selection.js';
import {
  ALPHABET, defaultProfile, setCheckGraphemes, setFeatureState, setGrapheme, setGraphemeBulk, setKnownForms, setWritingStyle,
  setIncidentalLevel, restoreProfile, parseForms,
} from '../../web/js/profile.js';
import { lib, makeDictation, seed, seedLibrary, taxonomy } from './helpers.mjs';

const D = (id) => seed.dictations.find((d) => d.id === id);
const blank = () => setCheckGraphemes(defaultProfile(1, taxonomy), false);
const teach = (p, ...ids) => ids.reduce((acc, id) => setFeatureState(acc, id, 'taught'), p);

// ---- výchozí profil --------------------------------------------------------

test('výchozí profil: ročník nabídne jen základní pravopis, vše ostatní musí potvrdit dospělý', () => {
  const g4 = defaultProfile(4, taxonomy);
  assert.equal(g4.knowledge['orth.u_long_basic'].state, 'taught');
  assert.equal(g4.knowledge['orth.listed_words_b'].state, 'not_taught', 'z čísla třídy se skupina B neodvozuje');
  assert.equal(g4.knowledge['punct.adversative_clause'].state, 'not_taught');
  assert.equal(g4.confirmed, false);
  const g2 = defaultProfile(2, taxonomy);
  assert.equal(g2.knowledge['orth.u_long_basic'].state, 'not_taught', 'jev typický pro právě probíraný ročník se nepředpokládá');
  const g1 = defaultProfile(1, taxonomy);
  assert.ok(Object.values(g1.knowledge).every((k) => k.state === 'not_taught'));
  assert.equal(g1.checkGraphemes, true);
  assert.deepEqual(g1.graphemes.block, []);
});

test('úprava profilu zruší jeho potvrzení; stavy probráno / zvládnuto / neprobráno jsou oddělené', () => {
  let p = { ...defaultProfile(3, taxonomy), confirmed: true };
  p = setFeatureState(p, 'orth.listed_words_b', 'taught');
  assert.equal(p.confirmed, false);
  assert.equal(p.knowledge['orth.listed_words_b'].state, 'taught');
  assert.equal(p.knowledge['orth.listed_words_b'].origin, 'adult');
  p = setFeatureState(p, 'orth.listed_words_b', 'mastered');
  assert.equal(p.knowledge['orth.listed_words_b'].state, 'mastered');
  assert.throws(() => setFeatureState(p, 'orth.listed_words_b', 'ok'));
});

test('obnova profilu: neplatná data se zahodí a nic se nepotvrdí navíc', () => {
  assert.equal(restoreProfile({ schema: 99 }, taxonomy).profile, null);
  const raw = { ...defaultProfile(3, taxonomy), confirmed: 'ano', knowledge: { 'orth.neexistuje': { state: 'taught' }, 'orth.listed_words_b': { state: 'mastered', origin: 'adult' }, 'orth.listed_words_l': { state: 'super' } } };
  const { profile, notes } = restoreProfile(raw, taxonomy);
  assert.equal(profile.confirmed, false);
  assert.equal(profile.knowledge['orth.listed_words_b'].state, 'mastered');
  assert.equal(profile.knowledge['orth.listed_words_l'].state, 'not_taught');
  assert.ok(notes.some((n) => n.includes('orth.neexistuje')));
});

// ---- přísná varianta -------------------------------------------------------

test('přísná varianta: nepotvrzené vyjmenované slovo po B vyřadí D04, potvrzení jej zpřístupní', () => {
  const base = defaultProfile(3, taxonomy);
  const without = evaluate(D('D04'), base);
  assert.equal(without.strict.eligible, false);
  assert.deepEqual(without.missing.map((m) => m.feature_id), ['orth.listed_words_b']);
  const withB = evaluate(D('D04'), setFeatureState(base, 'orth.listed_words_b', 'taught'));
  assert.equal(withB.strict.eligible, true);
  assert.equal(withB.best, 'strict');
});

test('kontroluje se celý text: vedlejší jev bez znalosti vyřadí diktát, i když cílový jev dítě zná', () => {
  const p = teach(blank(), 'orth.u_long_basic'); // D02 cílově ú/ů, ostatní nepotvrzeno
  const ev = evaluate(D('D02'), p);
  assert.equal(ev.strict.eligible, false);
  assert.deepEqual(ev.missing.map((m) => m.feature_id).sort(), ['orth.sentence_boundaries', 'orth.vowel_quantity']);
  const ok = evaluate(D('D02'), teach(p, 'orth.vowel_quantity', 'orth.sentence_boundaries'));
  assert.equal(ok.strict.eligible, true);
});

test('vedlejší jevy: „zvládnuto“ lze vyžadovat nastavením, cílové stačí probrané', () => {
  const p = teach(defaultProfile(2, taxonomy), 'orth.u_long_basic', 'orth.vowel_quantity', 'orth.sentence_boundaries');
  assert.equal(evaluate(D('D02'), p).strict.eligible, true);
  const strict = setIncidentalLevel(p, 'mastered');
  const ev = evaluate(D('D02'), strict);
  assert.equal(ev.strict.eligible, false);
  assert.ok(ev.missing.every((m) => m.role === 'incidental'));
});

test('minulý čas se plošně nevyřazuje: D07 je ovlivněn jen konkrétním jevem past_singular', () => {
  let p = defaultProfile(6, taxonomy);
  p = teach(p, 'orth.prefixes_s_z_vz', 'punct.adversative_clause', 'orth.noun_endings_review');
  p = setKnownForms(p, ['film']);
  const ev = evaluate(D('D07'), p);
  assert.deepEqual(ev.missing.map((m) => m.feature_id), ['syntax.past_singular']);
  assert.equal(evaluate(D('D07'), teach(p, 'syntax.past_singular')).strict.eligible, true);
});

test('požadovaný slovní tvar (film) musí být potvrzen; bez něj přísná varianta neprojde', () => {
  let p = teach(defaultProfile(6, taxonomy), 'orth.prefixes_s_z_vz', 'punct.adversative_clause', 'orth.noun_endings_review', 'syntax.past_singular');
  const ev = evaluate(D('D07'), p);
  assert.equal(ev.strict.eligible, false);
  assert.deepEqual(ev.missingForms.map((f) => f.form), ['film']);
  p = setKnownForms(p, ['film']);
  assert.equal(evaluate(D('D07'), p).strict.eligible, true);
});

// ---- podporovaná varianta ----------------------------------------------------

test('D03: přísně ne (koncovka -ý nepotvrzena), podporovaně ano s předvyplněním slova „slabý“', () => {
  const p = teach(defaultProfile(2, taxonomy), 'orth.palatal_groups_basic', 'orth.voicing_final', 'orth.soft_consonants_basic');
  const ev = evaluate(D('D03'), p);
  assert.equal(ev.strict.eligible, false);
  assert.equal(ev.supported.eligible, true);
  assert.equal(ev.best, 'supported');
  assert.deepEqual(ev.supported.prefills.map((s) => s.span), ['slabý']);
  assert.deepEqual(ev.rows.filter((r) => r.status === 'support').map((r) => r.feature_id), ['orth.adjective_hard_endings']);
});

test('D03: potvrzená koncovka nebo konkrétní potvrzený tvar „slabý“ přísnou variantu zpřístupní bez předvyplnění', () => {
  const base = teach(defaultProfile(2, taxonomy), 'orth.palatal_groups_basic', 'orth.voicing_final', 'orth.soft_consonants_basic');
  const byFeature = evaluate(D('D03'), teach(base, 'orth.adjective_hard_endings'));
  assert.equal(byFeature.strict.eligible, true);
  assert.deepEqual(byFeature.supported.prefills, []);
  const byForm = evaluate(D('D03'), setKnownForms(base, ['slabý']));
  assert.equal(byForm.strict.eligible, true);
  assert.equal(byForm.rows.find((r) => r.feature_id === 'orth.adjective_hard_endings').status, 'covered_by_form');
});

test('podporovaná varianta nepovoluje další jevy automaticky: nepodporovaná mezera ji vyřadí', () => {
  const p = teach(defaultProfile(2, taxonomy), 'orth.palatal_groups_basic', 'orth.soft_consonants_basic'); // chybí voicing_final
  const ev = evaluate(D('D03'), p);
  assert.equal(ev.supported.eligible, false);
  assert.deepEqual(ev.missing.map((m) => m.feature_id), ['orth.voicing_final']);
});

// ---- ryba / lyže / hrály ------------------------------------------------------

async function trio() {
  const ryba = await makeDictation({
    id: 'R01', grade: 2, sentences: ['Ryba plave v řece.', 'Táta chytá rybu.', 'Mám rád ryby.'],
    target: ['orth.hard_consonants_basic'],
    ann: [[0, 'Ryba', 'orth.hard_consonants_basic', 'target'], [1, 'rybu', 'orth.hard_consonants_basic', 'target'], [2, 'ryby', 'orth.hard_consonants_basic', 'target']],
  });
  const lyze = await makeDictation({
    id: 'L01', grade: 3, sentences: ['Na lyže čeká sníh.', 'Lyže jsou nové.', 'Zítra půjdeme lyžovat.'],
    target: ['orth.listed_words_l'],
    ann: [[0, 'lyže', 'orth.listed_words_l', 'target'], [1, 'Lyže', 'orth.listed_words_l', 'target'], [2, 'lyžovat', 'orth.listed_words_l', 'target']],
  });
  const hraly = await makeDictation({
    id: 'H01', grade: 5, sentences: ['Děti hrály na hřišti.', 'Holky zpívaly písně.', 'Kluci kreslili obrázky.'],
    target: ['syntax.agreement_simple_plural'],
    ann: [[0, 'Děti hrály', 'syntax.agreement_simple_plural', 'target'], [1, 'Holky zpívaly', 'syntax.agreement_simple_plural', 'target']],
  });
  return { ryba, lyze, hraly };
}

test('ryba, lyže a hrály jsou tři různé jevy: znalost jednoho nezpřístupní zbylé dva', async () => {
  const { ryba, lyze, hraly } = await trio();
  const onlyHard = teach(blank(), 'orth.hard_consonants_basic');
  assert.equal(evaluate(ryba, onlyHard).strict.eligible, true);
  assert.equal(evaluate(lyze, onlyHard).strict.eligible, false);
  assert.equal(evaluate(hraly, onlyHard).strict.eligible, false);

  const onlyListedL = teach(blank(), 'orth.listed_words_l');
  assert.equal(evaluate(lyze, onlyListedL).strict.eligible, true);
  assert.equal(evaluate(ryba, onlyListedL).strict.eligible, false);
  assert.equal(evaluate(hraly, onlyListedL).strict.eligible, false);

  const onlyAgreement = teach(blank(), 'syntax.agreement_simple_plural');
  assert.equal(evaluate(hraly, onlyAgreement).strict.eligible, true, 'minulý čas sám diktát nevyřazuje');
  assert.equal(evaluate(ryba, onlyAgreement).strict.eligible, false);
  assert.equal(evaluate(lyze, onlyAgreement).strict.eligible, false);
});

test('znalost vyjmenovaných slov po B nepokrývá slova po L', async () => {
  const { lyze } = await trio();
  const ev = evaluate(lyze, teach(blank(), 'orth.listed_words_b', 'orth.listed_words_m'));
  assert.equal(ev.strict.eligible, false);
  assert.deepEqual(ev.missing.map((m) => m.feature_id), ['orth.listed_words_l']);
});

// ---- první třída: grafémy ------------------------------------------------------

function grade1Profile(extraGraphemes = []) {
  let p = teach(defaultProfile(1, taxonomy), 'orth.vowel_quantity', 'orth.sentence_boundaries');
  return setGraphemeBulk(p, ['E', 'M', 'O', 'a', 'k', 'l', 'm', 'o', 's', 't', 'á', ...extraGraphemes], true);
}

test('1. třída: text projde, jen když dítě zná všechny grafémy (D01)', () => {
  const ev = evaluate(D('D01'), grade1Profile());
  assert.equal(ev.strict.eligible, true, JSON.stringify(ev.missingGraphemes));
  assert.deepEqual(ev.missingGraphemes, []);
  const empty = evaluate(D('D01'), teach(defaultProfile(1, taxonomy), 'orth.vowel_quantity', 'orth.sentence_boundaries'));
  assert.equal(empty.strict.eligible, false);
  assert.equal(empty.missingGraphemes.length, 11);
});

test('1. třída: diakritika, velká písmena i písmo se porovnávají přesně', () => {
  let p = grade1Profile();
  p = setGrapheme(p, 'á', false);
  assert.deepEqual(evaluate(D('D01'), p).missingGraphemes, ['á'], 'a ≠ á');
  p = setGrapheme(grade1Profile(), 'M', false);
  assert.deepEqual(evaluate(D('D01'), p).missingGraphemes, ['M'], 'm ≠ M');
  const cursive = setWritingStyle(grade1Profile(), 'cursive');
  assert.equal(evaluate(D('D01'), cursive).strict.eligible, false, 'znalost hůlkového písma se nepřenáší na psací');
  assert.equal(evaluate(D('D01'), setGraphemeBulk(cursive, ['E', 'M', 'O', 'a', 'k', 'l', 'm', 'o', 's', 't', 'á'], true)).strict.eligible, true);
});

test('1. třída: seed diktát bez znalosti grafémů nepřejde ani podporovaně (předvyplnění písmena nenahradí)', () => {
  const p = teach(defaultProfile(1, taxonomy), 'orth.vowel_quantity', 'orth.sentence_boundaries');
  const ev = evaluate(D('D01'), p);
  assert.equal(ev.supported.eligible, false);
});

test('kontrola grafémů lze vypnout; „ch“ se počítá jako jedno písmeno', async () => {
  const p = setCheckGraphemes(teach(defaultProfile(1, taxonomy), 'orth.vowel_quantity', 'orth.sentence_boundaries'), false);
  assert.equal(evaluate(D('D01'), p).strict.eligible, true);
  const ch = await makeDictation({ id: 'C01', grade: 1, sentences: ['Chata je tam.', 'Máma je tam.', 'Táta je tam.'], target: ['orth.vowel_quantity'], ann: [[1, 'Máma', 'orth.vowel_quantity', 'target']] });
  const have = setGraphemeBulk(defaultProfile(1, taxonomy), 'Chatejmámt'.split('').filter((g) => g !== 'C' && g !== 'h'), true);
  const missing = evaluate(ch, have).missingGraphemes;
  assert.ok(missing.includes('Ch'), 'Ch je jedno písmeno');
  assert.ok(!missing.includes('C') && !missing.includes('h'));
});

// ---- výběr, okruhy, katalog -----------------------------------------------------

test('okruh filtruje podle cílových jevů a dál kontroluje vedlejší požadavky', () => {
  const library = seedLibrary();
  const p = teach(blank(), 'orth.u_long_basic'); // chybí vedlejší vowel_quantity, sentence_boundaries
  const res = selectDictations(library, p, taxonomy, { groupId: 'u_ou' });
  assert.deepEqual(res.matches.map((m) => m.item.dictation.id), []);
  assert.deepEqual(res.rejected.map((m) => m.item.dictation.id), ['D02']);
  assert.deepEqual(res.rejected[0].ev.missing.map((m) => m.feature_id).sort(), ['orth.sentence_boundaries', 'orth.vowel_quantity']);

  const fixed = teach(p, 'orth.vowel_quantity', 'orth.sentence_boundaries');
  assert.deepEqual(selectDictations(library, fixed, taxonomy, { groupId: 'u_ou' }).matches.map((m) => m.item.dictation.id), ['D02']);
});

test('okruh: vedlejší výskyt se zahrne jen na výslovné přání', () => {
  const library = seedLibrary();
  const p = teach(defaultProfile(3, taxonomy), 'orth.u_long_basic');
  const ids = (r) => [...r.matches, ...r.rejected].map((m) => m.item.dictation.id).sort();
  assert.deepEqual(ids(selectDictations(library, p, taxonomy, { groupId: 'u_ou' })), ['D02']);
  assert.deepEqual(ids(selectDictations(library, p, taxonomy, { groupId: 'u_ou', includeIncidentalTopic: true })), ['D02', 'D04']);
});

test('řazení: nejdřív diktáty vlastního ročníku, výsledek se nikdy nepřiděluje jen podle čísla třídy', () => {
  const library = seedLibrary();
  // výchozí profil 3. ročníku + potvrzená skupina B (ta se z ročníku nepředpokládá)
  const p = teach(defaultProfile(3, taxonomy), 'orth.listed_words_b');
  const res = selectDictations(library, p, taxonomy, { mode: 'strict' });
  assert.deepEqual(res.matches.map((m) => m.item.dictation.id), ['D04', 'D02', 'D01']);
  assert.ok(!res.matches.some((m) => m.item.dictation.id === 'D10'), 'text pro 9. třídu se třeťákovi nepřidělí');
  const supported = selectDictations(library, p, taxonomy, { mode: 'supported' });
  assert.deepEqual(supported.matches.map((m) => m.item.dictation.id), ['D04', 'D02', 'D03', 'D01']);
});

test('prázdný výsledek: knihovna nemá text, odmítnuté kandidáty řadí podle toho, kolik jim chybí', () => {
  const res = selectDictations(seedLibrary(), defaultProfile(1, taxonomy), taxonomy, { mode: 'strict' });
  assert.equal(res.empty, true);
  assert.equal(res.matches.length, 0);
  assert.equal(res.rejected.length, 10);
  assert.equal(res.rejected[0].item.dictation.id, 'D01');
  assert.ok(res.rejected[0].ev.missingGraphemes.length > 0);
});

test('schválený katalog: seed (neúplné anotace, bez učitele) nepřejde, úplná schválená položka ano', async () => {
  const approved = await makeDictation({
    id: 'A01', grade: 2, sentences: ['U domu je úl.', 'Vedle stojí stůl.', 'Táta nese sůl.'],
    target: ['orth.u_long_basic'],
    ann: [[0, 'úl', 'orth.u_long_basic', 'target'], [1, 'stůl', 'orth.u_long_basic', 'target'], [2, 'sůl', 'orth.u_long_basic', 'target']],
    completeness: 'complete', approved: true, confirmed: true,
  });
  const library = [...seedLibrary(), ...lib(approved)];
  const p = teach(defaultProfile(2, taxonomy), 'orth.u_long_basic', 'orth.vowel_quantity', 'orth.sentence_boundaries');
  const all = selectDictations(library, p, taxonomy, { groupId: 'u_ou' });
  assert.deepEqual(all.matches.map((m) => m.item.dictation.id).sort(), ['A01', 'D02']);
  const onlyApproved = selectDictations(library, p, taxonomy, { groupId: 'u_ou', onlyApproved: true });
  assert.deepEqual(onlyApproved.matches.map((m) => m.item.dictation.id), ['A01']);
  assert.equal(onlyApproved.excludedByApproval, 1);
  assert.equal(evaluate(approved, p).needsAdultReview, false);
  assert.equal(evaluate(D('D02'), p).needsAdultReview, true, 'neúplná anotace vyžaduje kontrolu dospělým');
});

test('pokrytí knihovny: poctivě ukáže jevy, pro které text chybí', () => {
  const cov = libraryCoverage(seedLibrary(), taxonomy);
  const get = (id) => cov.find((c) => c.id === id).count;
  assert.equal(get('orth.listed_words_b'), 1);
  assert.equal(get('orth.listed_words_l'), 0);
  assert.equal(get('punct.parenthesis'), 0);
  assert.equal(get('punct.direct_speech'), 0);
  assert.ok(cov.filter((c) => c.count === 0).length > 10);
});

test('parseForms: oddělovače, NFC a duplicity', () => {
  assert.deepEqual(parseForms('film, jsem;\nfilm \n  Turisté '), ['film', 'jsem', 'Turisté']);
  assert.deepEqual(parseForms(''), []);
});

test('abeceda: velká a malá písmena mají stejný počet, ch/Ch je jedno písmeno', () => {
  assert.equal(ALPHABET.lower.length, ALPHABET.upper.length);
  assert.ok(ALPHABET.lower.includes('ch') && ALPHABET.upper.includes('Ch'));
});

// Výběr diktátů podle znalostního profilu.
//
// Pravidla (viz zadání):
//  - kontroluje se CELÝ text: cílové i vedlejší jevy i jevy bez deklarace, které mají anotaci;
//  - jevy se porovnávají po jednotlivých štítcích (i/y v kořeni ≠ koncovka ≠ shoda);
//  - místo je pokryto buď znalostí jevu, nebo konkrétním potvrzeným slovním tvarem;
//  - přísná varianta nesmí mít žádné nepokryté místo;
//  - podporovaná varianta smí mít nepokrytá místa jen uvnitř předvyplněných úseků (support);
//  - neúplná anotace není důvod text skrýt, ale vyžaduje kontrolu dospělým
//    a nikdy z ní nevznikne „schválená“ položka.

import { LEVEL_RANK } from './taxonomy.js';
import { cpLen, graphemesOf } from './text.js';
import { knownGraphemes, stateOf } from './profile.js';
import { isApprovedCatalogEntry, tierOf } from './schema.js';

const trimPunct = (s) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

// Slovní tvar smí pokrýt jen pravopisné jevy vázané na slovo (ne hranice vět, ne interpunkci ani syntax).
const formCoverable = (featureId) => featureId.startsWith('orth.') && featureId !== 'orth.sentence_boundaries';

function coveredByKnownForm(profile, a) {
  if (!formCoverable(a.feature_id)) return false;
  const word = trimPunct(a.span);
  if (word === '' || /\s/u.test(word)) return false;
  return profile.knownForms.includes(word);
}

const inSupport = (d, a) =>
  (d.support ?? []).some((s) => s.sentence_index === a.sentence_index && s.start <= a.start && a.end <= s.end);

// Pozice všech výskytů slova v textu (v kódových bodech), pro kontrolu požadovaných tvarů.
function wordPositions(d, form) {
  const out = [];
  d.sentences.forEach((s, si) => {
    const re = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      if (m[0] === form) {
        const start = cpLen(s.slice(0, m.index));
        out.push({ sentence_index: si, start, end: start + cpLen(m[0]) });
      }
    }
  });
  return out;
}

export function evaluate(d, profile) {
  const needs = new Map();
  for (const f of d.target_features ?? []) needs.set(f.id, 'target');
  for (const f of d.incidental_features ?? []) if (!needs.has(f.id)) needs.set(f.id, 'incidental');
  for (const a of d.annotations ?? []) if (!needs.has(a.feature_id)) needs.set(a.feature_id, a.role);

  const rows = [];
  for (const [featureId, role] of needs) {
    const need = role === 'target' ? 'taught' : profile.incidentalLevel;
    const have = stateOf(profile, featureId);
    const occ = (d.annotations ?? []).filter((a) => a.feature_id === featureId);
    if (LEVEL_RANK[have] >= LEVEL_RANK[need]) {
      rows.push({ feature_id: featureId, role, need, have, status: 'ok', occurrences: occ, uncovered: [] });
      continue;
    }
    const uncovered = occ.filter((a) => !coveredByKnownForm(profile, a));
    if (occ.length > 0 && uncovered.length === 0) {
      rows.push({ feature_id: featureId, role, need, have, status: 'covered_by_form', occurrences: occ, uncovered });
      continue;
    }
    const supported = occ.length > 0 && uncovered.every((a) => inSupport(d, a));
    rows.push({ feature_id: featureId, role, need, have, status: supported ? 'support' : 'missing', occurrences: occ, uncovered });
  }

  const missingFormRows = [];
  for (const form of d.required_known_forms ?? []) {
    if (profile.knownForms.includes(form)) continue;
    const pos = wordPositions(d, form);
    const supported = pos.length > 0 && pos.every((p) => inSupport(d, p));
    missingFormRows.push({ form, supported });
  }

  let missingGraphemes = [];
  if (profile.checkGraphemes) {
    const have = knownGraphemes(profile);
    missingGraphemes = [...graphemesOf(d.text)].filter((g) => !have.has(g)).sort((a, b) => a.localeCompare(b, 'cs'));
  }

  const missing = rows.filter((r) => r.status === 'missing');
  const supportRows = rows.filter((r) => r.status === 'support');
  const strictEligible = missing.length === 0 && supportRows.length === 0 && missingFormRows.length === 0 && missingGraphemes.length === 0;
  const supportedEligible = missing.length === 0 && missingFormRows.every((f) => f.supported) && missingGraphemes.length === 0;

  const neededSupport = (d.support ?? []).filter((s) =>
    [...supportRows.flatMap((r) => r.uncovered)].some((a) => a.sentence_index === s.sentence_index && s.start <= a.start && a.end <= s.end) ||
    missingFormRows.some((f) => f.supported && wordPositions(d, f.form).some((p) => p.sentence_index === s.sentence_index && s.start <= p.start && p.end <= s.end)));

  return {
    id: d.id,
    rows,
    missing,
    missingForms: missingFormRows.filter((f) => !f.supported),
    missingGraphemes,
    strict: { eligible: strictEligible },
    supported: { eligible: supportedEligible, prefills: supportedEligible && !strictEligible ? neededSupport : [] },
    best: strictEligible ? 'strict' : supportedEligible ? 'supported' : null,
    needsAdultReview: d.annotation_completeness !== 'complete',
    tier: tierOf(d),
  };
}

// „Kolik toho chybí“ pro řazení nejbližších kandidátů.
const gap = (ev) => ev.missing.length + ev.missingForms.length + ev.missingGraphemes.length;

export function selectDictations(library, profile, taxonomy, opts = {}) {
  const { mode = 'strict', groupId = null, includeIncidentalTopic = false, onlyApproved = false } = opts;
  const topicFeatures = groupId ? new Set(taxonomy.featuresOfGroup(groupId).map((f) => f.id)) : null;
  const inTopic = (d) => !topicFeatures
    || d.target_features.some((f) => topicFeatures.has(f.id))
    || (includeIncidentalTopic && d.incidental_features.some((f) => topicFeatures.has(f.id)));

  const matches = [];
  const rejected = [];
  let excludedByApproval = 0;
  for (const item of library) {
    const d = item.dictation;
    if (!inTopic(d)) continue;
    if (onlyApproved && !isApprovedCatalogEntry(d)) { excludedByApproval++; continue; }
    const ev = evaluate(d, profile);
    const ok = mode === 'supported' ? ev.supported.eligible : ev.strict.eligible;
    (ok ? matches : rejected).push({ item, ev });
  }
  const rank = (x) => [x.item.dictation.recommended_grade === profile.grade ? 0 : 1, Math.abs(x.item.dictation.recommended_grade - profile.grade), x.item.dictation.id];
  const cmp = (a, b) => { const ra = rank(a); const rb = rank(b); return ra[0] - rb[0] || ra[1] - rb[1] || ra[2].localeCompare(rb[2]); };
  matches.sort(cmp);
  rejected.sort((a, b) => gap(a.ev) - gap(b.ev) || cmp(a, b));
  return { matches, rejected, excludedByApproval, empty: matches.length === 0 };
}

// Které jevy má knihovna pokryté jako cílové (pro poctivé hlášení mezer v knihovně).
export function libraryCoverage(library, taxonomy) {
  const covered = new Map();
  for (const { dictation: d } of library) for (const f of d.target_features) covered.set(f.id, (covered.get(f.id) ?? 0) + 1);
  return taxonomy.raw.features.map((f) => ({ id: f.id, label: f.label, group: f.group, count: covered.get(f.id) ?? 0 }));
}


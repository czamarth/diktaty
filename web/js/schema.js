// Automatické strukturální kontroly datového balíčku.
// Nejde o redakční kontrolu ani o pedagogické schválení – ty se z těchto kontrol
// nikdy neodvozují.

import { cpLen, cpSlice, graphemesOf, isNFC, sha256Hex, speakableProblems, words } from './text.js';

// Heuristika neúplné anotace: i/y po obojetných souhláskách (b l m p s v z) je rozhodnutí, které
// musí být někde označeno. Slovo bez jakékoli anotace tuto kontrolu nese nepovšimnuté.
const AMBIGUOUS_IY = /[blmpsvz][iíyý]/iu;
const WORD_SCAN = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;

export const REVIEW_STATUSES = ['sample', 'editorially_checked_candidate', 'teacher_approved'];
export const ANNOTATION_STATUSES = ['editorial_proposal', 'confirmed'];
export const COMPLETENESS = ['partial', 'complete'];
export const AUDIO_STATUSES = ['not_generated', 'generated', 'reviewed_ok', 'needs_fix'];
export const MODES = ['strict_after_profile_confirmation', 'supported'];
export const ROLES = ['target', 'incidental'];

const ID_RE = /^[A-Za-z][A-Za-z0-9._-]{1,31}$/;
const SENTENCE_END_RE = /[.!?…][„“”"’)]*$/u;
const LIMITS = { dictations: 200, textChars: 2000 };

const issue = (level, code, path, message) => ({ level, code, path, message });

function sameSet(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

// Splňuje anotace nutné podmínky úplnosti? Nutné, ne postačující: skutečnou
// úplnost (že nic nechybí) automat nezjistí, proto ji potvrzuje člověk.
export function completenessProblems(d) {
  const problems = [];
  const annotations = d.annotations ?? [];
  for (const [role, list] of [['target', d.target_features], ['incidental', d.incidental_features]]) {
    for (const f of list ?? []) {
      if (!annotations.some((a) => a.feature_id === f.id && a.role === role)) {
        problems.push(`jev ${f.id} (${role}) nemá žádný označený výskyt`);
      }
    }
  }
  for (const a of annotations) {
    const declared = (a.role === 'target' ? d.target_features : d.incidental_features) ?? [];
    if (!declared.some((f) => f.id === a.feature_id)) {
      problems.push(`výskyt „${a.span}“ patří k jevu ${a.feature_id}, který není v seznamu (${a.role})`);
    }
    if (a.review_status !== 'confirmed') problems.push(`výskyt „${a.span}“ (${a.feature_id}) není potvrzen člověkem`);
  }
  return problems;
}

export function isApprovedCatalogEntry(d) {
  return (
    d.teacher_approved === true &&
    d.review_status === 'teacher_approved' &&
    d.annotation_completeness === 'complete' &&
    typeof d.approval?.by === 'string' && d.approval.by.trim() !== '' &&
    completenessProblems(d).length === 0
  );
}

// Tři úrovně důvěry, které se nesmí míchat: ukázka / kontrolovaný návrh / schváleno.
export function tierOf(d) {
  if (isApprovedCatalogEntry(d)) return 'approved';
  if (d.review_status === 'editorially_checked_candidate') return 'checked';
  return 'sample';
}

export async function validateDictation(d, taxonomy) {
  const out = [];
  const err = (code, path, msg) => out.push(issue('error', code, path, msg));
  const warn = (code, path, msg) => out.push(issue('warning', code, path, msg));
  const isObj = d && typeof d === 'object' && !Array.isArray(d);
  if (!isObj) {
    err('not_object', '', 'Diktát není objekt.');
    return out;
  }

  if (typeof d.id !== 'string' || !ID_RE.test(d.id)) err('bad_id', 'id', 'Chybí stabilní ID (písmena, číslice, tečka, pomlčka; 2–32 znaků).');
  if (typeof d.title !== 'string' || d.title.trim() === '') err('bad_title', 'title', 'Chybí název.');
  if (!Number.isInteger(d.recommended_grade) || d.recommended_grade < 1 || d.recommended_grade > 9) err('bad_grade', 'recommended_grade', 'Doporučený ročník musí být celé číslo 1–9.');
  if (!Number.isInteger(d.version) || d.version < 1) err('bad_version', 'version', 'Verze textu musí být celé číslo ≥ 1.');
  if (typeof d.origin !== 'string' || d.origin.trim() === '') err('bad_origin', 'origin', 'Chybí původ textu.');
  if (!REVIEW_STATUSES.includes(d.review_status)) err('bad_review_status', 'review_status', `Stav kontroly musí být jeden z: ${REVIEW_STATUSES.join(', ')}.`);
  if (typeof d.teacher_approved !== 'boolean') err('bad_teacher_approved', 'teacher_approved', 'teacher_approved musí být true/false (chybějící hodnota se nepovažuje za schváleno).');
  if (!COMPLETENESS.includes(d.annotation_completeness)) err('bad_completeness', 'annotation_completeness', `annotation_completeness musí být: ${COMPLETENESS.join(', ')}.`);
  if (!AUDIO_STATUSES.includes(d.audio_review_status)) err('bad_audio_status', 'audio_review_status', `audio_review_status musí být: ${AUDIO_STATUSES.join(', ')}.`);
  if (!MODES.includes(d.recommended_mode)) err('bad_mode', 'recommended_mode', `recommended_mode musí být: ${MODES.join(', ')}.`);
  if (!Array.isArray(d.curriculum_sources)) err('bad_sources', 'curriculum_sources', 'curriculum_sources musí být pole (může být prázdné).');

  // --- věty a text -------------------------------------------------------
  const sentences = d.sentences;
  const sentencesOk = Array.isArray(sentences) && sentences.every((s) => typeof s === 'string');
  if (!sentencesOk) {
    err('bad_sentences', 'sentences', 'sentences musí být pole řetězců.');
    return out;
  }
  if (sentences.length < 3 || sentences.length > 5) err('sentence_count_range', 'sentences', `Diktát musí mít 3 až 5 vět, má ${sentences.length}.`);
  sentences.forEach((s, i) => {
    if (s.trim() === '' || s !== s.trim()) err('sentence_blank', `sentences[${i}]`, 'Věta je prázdná nebo má okrajové mezery.');
    if (!isNFC(s)) err('not_nfc', `sentences[${i}]`, 'Věta není v normalizaci Unicode NFC (offsety by se rozjely).');
    if (!SENTENCE_END_RE.test(s)) err('sentence_end', `sentences[${i}]`, 'Věta nekončí tečkou, vykřičníkem ani otazníkem.');
    for (const p of speakableProblems(s)) err('not_speakable', `sentences[${i}]`, p);
  });
  const text = sentences.join(' ');
  if (d.text !== text) err('text_mismatch', 'text', 'Pole text neodpovídá větám spojeným mezerou.');
  if (text.length > LIMITS.textChars) err('text_too_long', 'text', `Text je delší než ${LIMITS.textChars} znaků.`);
  if (d.sentence_count !== sentences.length) err('sentence_count_mismatch', 'sentence_count', 'sentence_count neodpovídá počtu vět.');
  if (d.word_count !== words(text).length) err('word_count_mismatch', 'word_count', `word_count (${d.word_count}) neodpovídá počtu slov (${words(text).length}).`);
  if (typeof d.content_sha256 !== 'string' || (await sha256Hex(text)) !== d.content_sha256) {
    err('sha_mismatch', 'content_sha256', 'Kontrolní součet neodpovídá textu. Text i zvuk musí patřit ke stejné verzi.');
  }

  // --- TTS segmenty ------------------------------------------------------
  if (!Array.isArray(d.tts_segments) || d.tts_segments.length === 0) {
    err('bad_segments', 'tts_segments', 'Chybí tts_segments.');
  } else {
    const seen = new Set();
    d.tts_segments.forEach((seg, i) => {
      const p = `tts_segments[${i}]`;
      if (typeof seg?.id !== 'string' || seen.has(seg.id)) err('segment_id', p, 'ID segmentu chybí nebo není unikátní.');
      seen.add(seg?.id);
      if (!Number.isInteger(seg?.sentence_index) || seg.sentence_index < 0 || seg.sentence_index >= sentences.length) err('segment_index', p, 'sentence_index mimo rozsah.');
      if (typeof seg?.text !== 'string') err('segment_text', p, 'Segment nemá text.');
      else for (const pr of speakableProblems(seg.text)) err('not_speakable', p, pr);
    });
    if (d.tts_segments.every((s) => typeof s?.text === 'string') && d.tts_segments.map((s) => s.text).join(' ') !== text) {
      err('segments_text_mismatch', 'tts_segments', 'Segmenty pro hlas dohromady neodpovídají kanonickému znění (správnému řešení).');
    }
  }

  // --- jevy, anotace, podpora -------------------------------------------
  const knownFeature = (id) => taxonomy.has(id);
  for (const [key, list] of [['target_features', d.target_features], ['incidental_features', d.incidental_features]]) {
    if (!Array.isArray(list)) { err('bad_features', key, `${key} musí být pole.`); continue; }
    list.forEach((f, i) => {
      if (!knownFeature(f?.id)) err('unknown_feature', `${key}[${i}]`, `Neznámý jev „${f?.id}“. Přidejte jej do data/profiles.json.`);
      for (const ex of f?.examples ?? []) {
        if (!text.includes(ex)) warn('example_not_in_text', `${key}[${i}]`, `Příklad „${ex}“ se v textu nevyskytuje.`);
      }
    });
  }
  if (!Array.isArray(d.target_features) || d.target_features.length === 0) err('no_target', 'target_features', 'Diktát musí mít alespoň jeden cílový jev.');

  const annotations = Array.isArray(d.annotations) ? d.annotations : [];
  if (!Array.isArray(d.annotations)) err('bad_annotations', 'annotations', 'annotations musí být pole.');
  const seenAnn = new Set();
  annotations.forEach((a, i) => {
    const p = `annotations[${i}]`;
    if (!knownFeature(a?.feature_id)) err('unknown_feature', p, `Neznámý jev „${a?.feature_id}“.`);
    if (!ROLES.includes(a?.role)) err('bad_role', p, 'role musí být target nebo incidental.');
    if (!ANNOTATION_STATUSES.includes(a?.review_status)) err('bad_annotation_status', p, `review_status anotace musí být: ${ANNOTATION_STATUSES.join(', ')}.`);
    const s = sentences[a?.sentence_index];
    if (s === undefined) { err('annotation_sentence', p, 'sentence_index mimo rozsah.'); return; }
    if (!Number.isInteger(a.start) || !Number.isInteger(a.end) || a.start < 0 || a.end <= a.start || a.end > cpLen(s)) {
      err('annotation_range', p, 'Rozsah start/end je mimo větu.');
      return;
    }
    if (cpSlice(s, a.start, a.end) !== a.span) err('annotation_span', p, `Text na pozici ${a.start}–${a.end} není „${a.span}“.`);
    const key = `${a.sentence_index}|${a.start}|${a.end}|${a.feature_id}|${a.role}`;
    if (seenAnn.has(key)) err('annotation_duplicate', p, 'Duplicitní anotace.');
    seenAnn.add(key);
  });
  annotations.forEach((a, i) => {
    annotations.slice(i + 1).forEach((b) => {
      if (a.feature_id === b.feature_id && a.role === b.role && a.sentence_index === b.sentence_index && a.start < b.end && b.start < a.end && !(a.start === b.start && a.end === b.end)) {
        warn('annotation_nested', `annotations[${i}]`, `Anotace „${a.span}“ a „${b.span}“ (${a.feature_id}) se překrývají; pravděpodobně jde o zbytečnou vnořenou anotaci.`);
      }
    });
  });

  if (!Array.isArray(d.support)) err('bad_support', 'support', 'support musí být pole (může být prázdné).');
  (d.support ?? []).forEach((sup, i) => {
    const p = `support[${i}]`;
    const s = sentences[sup?.sentence_index];
    if (s === undefined) { err('support_sentence', p, 'sentence_index mimo rozsah.'); return; }
    if (sup.action !== 'prefill') err('support_action', p, 'Podporovaná je jen akce prefill.');
    if (typeof sup.exclude_from_independent_writing !== 'boolean') err('support_exclude', p, 'exclude_from_independent_writing musí být true/false.');
    if (!Number.isInteger(sup.start) || !Number.isInteger(sup.end) || cpSlice(s, sup.start, sup.end) !== sup.span) {
      err('support_span', p, 'Předvyplněné místo musí mít start/end a odpovídat textu (jednoznačné místo).');
      return;
    }
    const occurrences = words(s).filter((w) => w === sup.span).length;
    if (occurrences !== 1) err('support_ambiguous', p, `Slovo „${sup.span}“ se ve větě vyskytuje ${occurrences}×; místo není jednoznačné.`);
    if (typeof sup.reason !== 'string' || sup.reason.trim() === '') err('support_reason', p, 'Předvyplnění musí mít zdůvodnění.');
  });

  const textWords = new Set(words(text));
  if (!Array.isArray(d.required_known_forms)) err('bad_forms', 'required_known_forms', 'required_known_forms musí být pole.');
  for (const form of d.required_known_forms ?? []) {
    if (!textWords.has(form)) err('form_not_in_text', 'required_known_forms', `Požadovaný tvar „${form}“ není v textu (ověřuje se přesně, včetně velikosti písmen).`);
  }

  sentences.forEach((s, si) => {
    for (let m = WORD_SCAN.exec(s); m; m = WORD_SCAN.exec(s)) {
      if (!AMBIGUOUS_IY.test(m[0])) continue;
      const start = cpLen(s.slice(0, m.index));
      const end = start + cpLen(m[0]);
      if (!annotations.some((a) => a.sentence_index === si && a.start < end && start < a.end)) {
        warn('possible_unannotated_iy', `sentences[${si}]`, `Slovo „${m[0]}“ obsahuje i/y po obojetné souhlásce, ale nemá žádnou anotaci (možná neúplná anotace; vyžaduje kontrolu dospělým).`);
      }
    }
  });

  // --- grafémy (1. třída) ------------------------------------------------
  const derived = [...graphemesOf(text)];
  if (d.known_graphemes_required == null) {
    if (d.recommended_grade === 1) err('graphemes_missing', 'known_graphemes_required', 'Text pro 1. třídu musí uvádět seznam potřebných grafémů.');
  } else if (!Array.isArray(d.known_graphemes_required) || !sameSet(d.known_graphemes_required, derived)) {
    err('graphemes_mismatch', 'known_graphemes_required', `Seznam grafémů neodpovídá textu (z textu plyne: ${derived.sort().join(' ')}).`);
  }

  // --- stav kontroly a schválení ----------------------------------------
  const problems = completenessProblems({ ...d, annotations });
  if (d.annotation_completeness === 'complete') {
    for (const pr of problems) err('claimed_complete', 'annotation_completeness', `Anotace je označena jako úplná, ale: ${pr}.`);
  }
  if (d.teacher_approved === true) {
    if (d.review_status !== 'teacher_approved') err('approval_inconsistent', 'review_status', 'teacher_approved je true, ale review_status není teacher_approved.');
    if (d.annotation_completeness !== 'complete') err('approval_incomplete', 'annotation_completeness', 'Schválená položka musí mít úplnou anotaci.');
    if (typeof d.approval?.by !== 'string' || d.approval.by.trim() === '' || !/^\d{4}-\d{2}-\d{2}$/.test(d.approval?.date ?? '')) {
      err('approval_record', 'approval', 'Schválená položka musí mít záznam approval: {by, date: RRRR-MM-DD}.');
    }
  } else if (d.teacher_approved === false && d.review_status === 'teacher_approved') {
    err('approval_inconsistent', 'review_status', 'review_status je teacher_approved, ale teacher_approved není true.');
  }
  return out;
}

export async function validatePack(pack, taxonomy, { requirePackId = false } = {}) {
  const packIssues = [];
  const perDictation = [];
  const err = (code, path, msg) => packIssues.push(issue('error', code, path, msg));
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    err('not_object', '', 'Balíček není objekt JSON.');
    return { ok: false, packIssues, perDictation };
  }
  if (pack.schema_version !== 1) err('schema_version', 'schema_version', 'Podporovaná je jen schema_version 1.');
  if (pack.language !== 'cs-CZ') err('language', 'language', 'language musí být cs-CZ.');
  if (pack.offset_unit !== 'unicode_code_points') err('offset_unit', 'offset_unit', 'offset_unit musí být unicode_code_points.');
  if (requirePackId) {
    if (typeof pack.pack_id !== 'string' || !ID_RE.test(pack.pack_id)) err('pack_id', 'pack_id', 'Importovaný balíček musí mít pack_id.');
    if (!Number.isInteger(pack.pack_version) || pack.pack_version < 1) err('pack_version', 'pack_version', 'Importovaný balíček musí mít pack_version (celé číslo ≥ 1).');
  }
  if (!Array.isArray(pack.dictations) || pack.dictations.length === 0) {
    err('no_dictations', 'dictations', 'Balíček neobsahuje žádné diktáty.');
    return { ok: false, packIssues, perDictation };
  }
  if (pack.dictations.length > LIMITS.dictations) err('too_many', 'dictations', `Balíček má více než ${LIMITS.dictations} diktátů.`);
  const ids = new Set();
  for (const d of pack.dictations) {
    const issues = await validateDictation(d, taxonomy);
    if (d?.id !== undefined) {
      if (ids.has(d.id)) issues.push(issue('error', 'duplicate_id', 'id', `ID ${d.id} je v balíčku víckrát.`));
      ids.add(d.id);
    }
    perDictation.push({ id: d?.id ?? null, issues });
  }
  const ok = packIssues.length === 0 && perDictation.every((p) => p.issues.every((i) => i.level !== 'error'));
  return { ok, packIssues, perDictation };
}

export const errorsOf = (issues) => issues.filter((i) => i.level === 'error');
export const warningsOf = (issues) => issues.filter((i) => i.level === 'warning');

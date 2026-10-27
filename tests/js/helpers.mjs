import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTaxonomy } from '../../web/js/taxonomy.js';
import { cps, graphemesOf, sha256Hex, words } from '../../web/js/text.js';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const readJson = async (rel) => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
export const taxonomy = buildTaxonomy(await readJson('data/profiles.json'));
export const seed = await readJson('data/dictations.seed.json');
export const seedLibrary = () => structuredClone(seed).dictations.map((dictation) => ({ dictation, source: { pack_id: 'seed' } }));

// Pozice podřetězce v kódových bodech (n-tý výskyt).
export function locate(sentence, span, nth = 0) {
  const chars = cps(sentence);
  const target = cps(span);
  let seen = 0;
  for (let i = 0; i + target.length <= chars.length; i++) {
    if (chars.slice(i, i + target.length).join('') === span) {
      if (seen === nth) return { start: i, end: i + target.length };
      seen++;
    }
  }
  throw new Error(`„${span}“ nenalezeno ve větě „${sentence}“`);
}

// Sestaví strukturálně platný diktát: dopočítá text, počty, SHA, segmenty a offsety.
export async function makeDictation({
  id = 'T01', grade = 3, sentences, target, incidental = [], ann = [], support = [], forms = [],
  completeness = 'partial', approved = false, confirmed = false, extra = {},
}) {
  const text = sentences.join(' ');
  const declared = (list) => list.map((f) => ({ id: f, label: taxonomy.label(f), examples: [] }));
  const annotations = ann.map(([si, span, feature_id, role, nth = 0]) => ({
    sentence_index: si, ...locate(sentences[si], span, nth), span, feature_id, role,
    review_status: confirmed ? 'confirmed' : 'editorial_proposal',
  }));
  const d = {
    id, title: `Test ${id}`, recommended_grade: grade, sentences,
    target_features: declared(target), incidental_features: declared(incidental),
    required_known_forms: forms,
    support: support.map(([si, span, reason = 'test']) => ({
      sentence_index: si, span, action: 'prefill', reason, exclude_from_independent_writing: true, ...locate(sentences[si], span),
    })),
    learner_profile_note: '', teacher_note: '', version: 1, text,
    sentence_count: sentences.length, word_count: words(text).length,
    content_sha256: await sha256Hex(text), origin: 'test',
    review_status: approved ? 'teacher_approved' : 'editorially_checked_candidate',
    teacher_approved: approved, annotation_completeness: completeness,
    audio_review_status: 'not_generated', recommended_mode: 'strict_after_profile_confirmation',
    grade_is_advisory: true,
    known_graphemes_required: grade === 1 ? [...graphemesOf(text)] : null,
    curriculum_sources: [], annotations,
    tts_segments: sentences.map((t, i) => ({ id: `${id}-S0${i + 1}`, sentence_index: i, text: t })),
    ...extra,
  };
  if (approved) d.approval = { by: 'Test Učitel', date: '2026-10-27' };
  return d;
}

export const lib = (...ds) => ds.map((dictation) => ({ dictation, source: { pack_id: 'test' } }));

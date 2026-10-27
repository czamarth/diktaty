// Model poslechové kontroly hlasu. Je oddělený od datových validací i od pedagogického schválení:
// výsledek poslechu nikdy nemění teacher_approved ani review_status diktátu.

export const CHECKLIST = [
  { key: 'vowel_length', label: 'Délky samohlásek (á/a, í/i, ú/ů …)' },
  { key: 'di_ti_ni', label: 'Slabiky di / ti / ni (měkká výslovnost)' },
  { key: 'de_te_ne', label: 'Slabiky dě / tě / ně' },
  { key: 'be_pe_ve_me', label: 'Slabiky bě / pě / vě / mě' },
  { key: 'proper_names', label: 'Vlastní jména' },
  { key: 'consonant_clusters', label: 'Souhláskové skupiny' },
  { key: 'punctuation', label: 'Interpunkční členění (pauzy a intonace u čárek a teček)' },
];

export const STATUS_LABEL = {
  not_reviewed: 'Neposouzeno',
  in_progress: 'Rozpracováno',
  reviewed_ok: 'Poslechem v pořádku',
  needs_fix: 'Vyžaduje opravu',
  stale: 'Zastaralé (změnil se text nebo hlas)',
};

export const emptyRecord = (dictation, modelSha) => ({
  content_sha256: dictation.content_sha256,
  model_sha256: modelSha ?? null,
  reviewer: '',
  listened: { normal: false, slow: false },
  checks: Object.fromEntries(CHECKLIST.map((c) => [c.key, 'unset'])),
  note: '',
  saved_at: null,
});

// Záznam patří ke konkrétní verzi textu a konkrétnímu hlasu; po změně se nepoužije.
export function audioReviewStatus(record, dictation, modelSha) {
  if (!record) return 'not_reviewed';
  if (record.content_sha256 !== dictation.content_sha256 || (modelSha && record.model_sha256 !== modelSha)) return 'stale';
  const values = CHECKLIST.map((c) => record.checks?.[c.key] ?? 'unset');
  if (values.includes('problem')) return 'needs_fix';
  const complete = values.every((v) => v === 'ok') && record.listened?.normal && record.listened?.slow && (record.reviewer ?? '').trim() !== '';
  if (complete) return 'reviewed_ok';
  const touched = values.some((v) => v !== 'unset') || record.listened?.normal || record.listened?.slow;
  return touched ? 'in_progress' : 'not_reviewed';
}

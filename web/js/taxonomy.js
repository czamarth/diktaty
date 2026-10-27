// Taxonomie pravopisných jevů (data/profiles.json): jevy, okruhy a výchozí politika profilu.

export const LEVELS = ['not_taught', 'taught', 'mastered'];
export const LEVEL_RANK = { not_taught: 0, taught: 1, mastered: 2 };

export function buildTaxonomy(raw) {
  const problems = [];
  if (!raw || raw.schema_version !== 1 || !Array.isArray(raw.features) || !Array.isArray(raw.groups)) {
    throw new Error('Soubor s taxonomií jevů (profiles.json) je poškozený nebo má neznámou verzi.');
  }
  const groups = new Map(raw.groups.map((g) => [g.id, g]));
  const features = new Map();
  for (const f of raw.features) {
    if (features.has(f.id)) problems.push(`duplicitní jev ${f.id}`);
    if (!groups.has(f.group)) problems.push(`jev ${f.id} odkazuje na neznámý okruh ${f.group}`);
    if (!Number.isInteger(f.typical_grade) || f.typical_grade < 1 || f.typical_grade > 9) problems.push(`jev ${f.id} má neplatný typický ročník`);
    if (!['by_grade', 'adult_confirm'].includes(f.default_policy)) problems.push(`jev ${f.id} má neplatnou politiku`);
    features.set(f.id, f);
  }
  if (problems.length) throw new Error(`Taxonomie jevů je neplatná: ${problems.join('; ')}`);
  return {
    raw,
    levels: raw.levels,
    groups: raw.groups,
    features,
    has: (id) => features.has(id),
    label: (id) => features.get(id)?.label ?? id,
    featuresOfGroup: (gid) => raw.features.filter((f) => f.group === gid),
    groupOf: (id) => features.get(id)?.group,
  };
}

// Načítání knihovny (vestavěná sada + importované balíčky) a import rozšiřujícího balíčku JSON.
// Poškozený balíček dostane srozumitelný chybový stav; položky s chybami se nikdy nepoužijí.

import { errorsOf, validatePack } from './schema.js';

export const SEED_PACK_ID = 'seed';
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export class CatalogError extends Error {
  constructor(message, details = []) {
    super(message);
    this.details = details;
  }
}

async function getJson(url, fetchFn) {
  const res = await fetchFn(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

function absorb(items, problems, pack, validation, source) {
  for (const p of validation.packIssues) problems.push({ pack: source.pack_id, message: `${p.path}: ${p.message}` });
  if (!Array.isArray(pack?.dictations)) return;
  const byId = new Map(validation.perDictation.map((x, i) => [i, x]));
  pack.dictations.forEach((dictation, i) => {
    const issues = [...(byId.get(i)?.issues ?? [])];
    const clash = items.find((it) => it.dictation.id === dictation?.id && it.usable);
    if (clash) {
      issues.push({ level: 'error', code: 'id_collision', path: 'id', message: `ID ${dictation.id} už existuje v balíčku „${clash.source.pack_id}“.` });
    }
    items.push({ dictation, source, issues, usable: errorsOf(issues).length === 0 && validation.packIssues.length === 0 });
  });
}

export async function loadCatalog(taxonomy, fetchFn = fetch) {
  let seed;
  try {
    seed = await getJson('/data/dictations.seed.json', fetchFn);
  } catch (e) {
    throw new CatalogError('Základní knihovnu diktátů se nepodařilo načíst nebo není platný JSON.', [String(e.message ?? e)]);
  }
  const items = [];
  const problems = [];
  const seedResult = await validatePack(seed, taxonomy);
  absorb(items, problems, seed, seedResult, { pack_id: SEED_PACK_ID, pack_version: 1, builtin: true });

  const packs = [];
  try {
    const { packs: stored } = await getJson('/api/packs', fetchFn);
    for (const entry of stored) {
      if (!entry.data) {
        problems.push({ pack: entry.file, message: entry.error ?? 'Balíček nelze přečíst.' });
        continue;
      }
      const result = await validatePack(entry.data, taxonomy, { requirePackId: true });
      const source = { pack_id: entry.data.pack_id ?? entry.file, pack_version: entry.data.pack_version ?? 0, builtin: false };
      packs.push({ ...source, file: entry.file, ok: result.ok, count: entry.data.dictations?.length ?? 0 });
      absorb(items, problems, entry.data, result, source);
    }
  } catch (e) {
    problems.push({ pack: '(importované)', message: `Importované balíčky se nepodařilo načíst: ${e.message}` });
  }
  return { items, usable: items.filter((i) => i.usable), problems, packs, seedOk: seedResult.ok };
}

// Vrací { ok, report, pack } – nic se neuloží, dokud nejsou všechny kontroly bez chyby.
export async function checkImport(text, taxonomy, catalog) {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, report: [{ level: 'error', message: 'Soubor je prázdný.' }] };
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) return { ok: false, report: [{ level: 'error', message: 'Soubor je větší než 2 MB.' }] };
  let pack;
  try {
    pack = JSON.parse(text);
  } catch (e) {
    return { ok: false, report: [{ level: 'error', message: `Soubor není platný JSON (${e.message}).` }] };
  }
  const result = await validatePack(pack, taxonomy, { requirePackId: true });
  const report = [];
  for (const i of result.packIssues) report.push({ level: i.level, message: `Balíček – ${i.path}: ${i.message}` });
  for (const { id, issues } of result.perDictation) for (const i of issues) report.push({ level: i.level, message: `${id ?? '(bez id)'} – ${i.path}: ${i.message}` });

  let replaces = null;
  if (result.ok) {
    const others = catalog.items.filter((it) => it.source.pack_id !== pack.pack_id && it.usable);
    for (const d of pack.dictations) {
      const clash = others.find((it) => it.dictation.id === d.id);
      if (clash) report.push({ level: 'error', message: `${d.id} – ID už existuje v balíčku „${clash.source.pack_id}“.` });
    }
    const existing = catalog.packs.find((p) => p.pack_id === pack.pack_id);
    if (pack.pack_id === SEED_PACK_ID) report.push({ level: 'error', message: 'pack_id „seed“ je vyhrazen pro vestavěnou knihovnu.' });
    if (existing) {
      if (pack.pack_version < existing.pack_version) report.push({ level: 'error', message: `Nainstalovaná verze balíčku je novější (${existing.pack_version}) než importovaná (${pack.pack_version}).` });
      else replaces = existing;
    }
  }
  const ok = !report.some((r) => r.level === 'error');
  return { ok, report, pack: ok ? pack : null, replaces };
}

export async function storePack(pack, fetchFn = fetch) {
  const res = await fetchFn(`/api/packs/${encodeURIComponent(pack.pack_id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pack) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? `HTTP ${res.status}`);
}

export async function removePack(packId, fetchFn = fetch) {
  const res = await fetchFn(`/api/packs/${encodeURIComponent(packId)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

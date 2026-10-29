#!/usr/bin/env node
// Sestaví balíčky knihovny z library-src/*.txt do data/library/*.json a ověří je validátorem aplikace.
// Použití: node scripts/build-library.mjs [--only kód[,kód…]] [--check]   (--check nic nezapisuje)
// Návratový kód: 0 vše v pořádku, 1 chyby ve zdroji nebo ve validaci.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildTaxonomy } from '../web/js/taxonomy.js';
import { errorsOf, validatePack, warningsOf } from '../web/js/schema.js';
import { buildPack, formatPack, parseSource } from './library/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;

const taxonomy = buildTaxonomy(JSON.parse(await readFile(path.join(root, 'data/profiles.json'), 'utf8')));
const srcDir = path.join(root, 'library-src');
const outDir = path.join(root, 'data/library');
const files = (await readdir(srcDir)).filter((f) => f.endsWith('.txt')).sort();

let failed = false;
let total = 0;
if (!check) await mkdir(outDir, { recursive: true });
for (const file of files) {
  const src = parseSource(await readFile(path.join(srcDir, file), 'utf8'));
  if (only && !only.has(src.meta.code)) continue;
  const { pack, problems } = buildPack({ ...src, taxonomy });
  const schemaProblems = [];
  if (problems.length === 0) {
    const result = await validatePack(pack, taxonomy, { requirePackId: true });
    for (const i of result.packIssues) schemaProblems.push(`${i.path}: ${i.message}`);
    for (const { id, issues } of result.perDictation) for (const i of errorsOf(issues)) schemaProblems.push(`${id} ${i.path}: ${i.message}`);
    const warn = result.perDictation.flatMap(({ id, issues }) => warningsOf(issues).map((i) => `${id}: ${i.message}`));
    if (warn.length) console.log(`  (${warn.length} varování validátoru v ${file}, např. ${warn[0]})`);
  }
  const all = [...problems, ...schemaProblems];
  if (all.length) {
    failed = true;
    console.log(`\n✗ ${file} – ${all.length} problémů`);
    for (const p of all.slice(0, 60)) console.log(`   ${p}`);
    if (all.length > 60) console.log(`   … a ${all.length - 60} dalších`);
    continue;
  }
  total += pack.dictations.length;
  if (!check) await writeFile(path.join(outDir, `${src.meta.code}.json`), formatPack(pack), 'utf8');
  console.log(`✓ ${file} → ${pack.dictations.length} diktátů (${taxonomy.label(src.meta.feature)})`);
}
console.log(`\nCelkem sestaveno: ${total} diktátů.${failed ? ' ZÁVADY – viz výše.' : ''}`);
process.exit(failed ? 1 : 0);

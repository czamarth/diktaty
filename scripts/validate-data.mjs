#!/usr/bin/env node
// Strukturální validace datového balíčku (stejný kód jako při importu v aplikaci).
// Použití: node scripts/validate-data.mjs [balíček.json ...]   (výchozí: data/dictations.seed.json)
// Návratový kód: 0 = bez chyb, 1 = chyby, 2 = soubor nelze přečíst.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildTaxonomy } from '../web/js/taxonomy.js';
import { errorsOf, tierOf, validatePack, warningsOf } from '../web/js/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const taxonomy = buildTaxonomy(JSON.parse(await readFile(path.join(root, 'data/profiles.json'), 'utf8')));
const files = process.argv.slice(2);
if (files.length === 0) files.push(path.join(root, 'data/dictations.seed.json'));

let failed = false;
for (const file of files) {
  let pack;
  try {
    pack = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    console.error(`${file}: nelze přečíst nebo není JSON (${e.message})`);
    process.exit(2);
  }
  const isSeed = path.resolve(file) === path.join(root, 'data/dictations.seed.json');
  const result = await validatePack(pack, taxonomy, { requirePackId: !isSeed });
  console.log(`\n${file}`);
  for (const i of result.packIssues) console.log(`  CHYBA   balíček ${i.path}: ${i.message}`);
  for (const { id, issues } of result.perDictation) {
    const d = pack.dictations?.find((x) => x?.id === id);
    const tier = d ? tierOf(d) : '?';
    const e = errorsOf(issues);
    const w = warningsOf(issues);
    console.log(`  ${id ?? '(bez id)'}  ${e.length ? 'CHYBA' : 'ok   '}  úroveň=${tier}  chyb=${e.length} varování=${w.length}`);
    for (const i of e) console.log(`      CHYBA     ${i.path}: ${i.message}`);
    for (const i of w) console.log(`      varování  ${i.path}: ${i.message}`);
  }
  if (!result.ok) failed = true;
  console.log(`  => ${result.ok ? 'strukturálně v pořádku (NEZNAMENÁ pedagogické schválení)' : 'NEPROŠLO'}`);
}
process.exit(failed ? 1 : 0);

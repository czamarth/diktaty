#!/usr/bin/env node
// Zkopíruje balíčky z data/library/ do složky importovaných balíčků lokálního serveru (user_data/packs),
// odkud je aplikace načítá. Nic nepřepisuje jinak než stejnojmennými soubory; nic neschvaluje.
// Použití: node scripts/install-library.mjs [cílová_složka_user_data]
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userDir = path.resolve(process.argv[2] ?? process.env.DIKTATY_USER_DIR ?? path.join(root, 'user_data'));
const dest = path.join(userDir, 'packs');
await mkdir(dest, { recursive: true });
const files = (await readdir(path.join(root, 'data/library'))).filter((f) => f.endsWith('.json')).sort();
for (const f of files) await copyFile(path.join(root, 'data/library', f), path.join(dest, `lib-${f}`));
console.log(`Zkopírováno balíčků: ${files.length} → ${dest}`);

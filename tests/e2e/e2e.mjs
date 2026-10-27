// End-to-end test v reálném prohlížeči (Playwright + Chromium) proti skutečnému lokálnímu serveru.
//
// DŮLEŽITÉ: tento test NEOVĚŘUJE hlas. Odpověď /api/tts a stav „hlas připraven“ podstrkuje
// testovací harness (syntetický tón) – ověřuje se ovládání, souběh a zobrazení.
// Skutečné generování řeči a poslech: scripts/generate_audio.py a stránka Poslechová kontrola.
//
// Použití: node tests/e2e/e2e.mjs [--screens <adresář>]   (proměnná PYTHON = interpret pro server)

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire('/tmp/x.js');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const screensDir = process.argv.includes('--screens') ? process.argv[process.argv.indexOf('--screens') + 1] : null;
const PORT = 8798;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toneWav(seconds = 0.4) {
  const rate = 22050;
  const n = Math.floor(rate * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(6000 * Math.sin((2 * Math.PI * 440 * i) / rate)), 44 + i * 2);
  return buf;
}

const d03Sentences = ['Dědeček chová pěkné štěně.', 'Během dne věje slabý větřík.', 'Ve městě stojí dub.'];
const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok    ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e });
    console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n').slice(0, 4).join('\n        ')}`);
  }
}

const tmp = await mkdtemp(path.join(os.tmpdir(), 'diktaty-e2e-'));
const server = spawn(process.env.PYTHON ?? 'python3', [path.join(root, 'server/diktaty_server.py'), '--port', String(PORT), '--no-browser'], {
  env: { ...process.env, DIKTATY_USER_DIR: `${tmp}/user`, DIKTATY_MODELS_DIR: `${tmp}/models`, DIKTATY_CACHE_DIR: `${tmp}/cache` },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await sleep(1500);

const browser = await chromium.launch();
const requestsSeen = [];
const consoleProblems = [];

async function newPage({ fakeVoice = true, ttsDelay = 0, viewport = { width: 1100, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('dialog', (d) => d.accept()); // všechna potvrzení (změna ročníku, ukončení, odebrání) dospělý potvrzuje
  const calls = [];
  page.on('request', (r) => requestsSeen.push(r.url()));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleProblems.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => consoleProblems.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    window.__audios = [];
    window.__maxPlaying = 0;
    const Native = window.Audio;
    window.Audio = function (...a) { const x = new Native(...a); window.__audios.push(x); return x; };
    window.Audio.prototype = Native.prototype;
    setInterval(() => { window.__maxPlaying = Math.max(window.__maxPlaying, window.__audios.filter((a) => !a.paused && !a.ended).length); }, 10);
  });
  if (fakeVoice) {
    await page.route('**/api/health', (route) => route.fulfill({ json: {
      status: 'ready', ready: true, model: { id: 'cs_CZ-jirka-medium', file: 'cs_CZ-jirka-medium.onnx', sha256: 'a'.repeat(64), lock: 'ok', sample_rate: 22050 },
      engine: { name: 'TEST-HARNESS (ne řeč)', version: '0', license: 'n/a' }, cache: { entries: 0, bytes: 0 }, sound_check_text: 'Zvuk funguje. Můžeme začít.', error: null } }));
    await page.route('**/api/tts', async (route) => {
      calls.push(JSON.parse(route.request().postData()));
      await sleep(ttsDelay);
      try { await route.fulfill({ status: 200, contentType: 'audio/wav', body: toneWav() }); } catch { /* požadavek byl zrušen přehrávačem */ }
    });
  }
  return { page, calls, context };
}
const status = (page, text) => page.locator('main .status', { hasText: text }).first();
const playing = (page) => page.evaluate(() => window.__audios.filter((a) => !a.paused && !a.ended).length);
const btn = (page, name) => page.getByRole('button', { name, exact: true });
const shot = async (page, name) => { if (screensDir) { await mkdir(screensDir, { recursive: true }); await page.screenshot({ path: path.join(screensDir, name), fullPage: true }); } };

// ---------------------------------------------------------------------------
console.log('\nA) Výběr, příprava, dětský přehrávač, řešení (hlas = testovací harness)');
{
  const { page, calls } = await newPage({ ttsDelay: 150 });
  await page.goto(`${BASE}/`);
  await page.waitForSelector('h1');

  await step('úvod: žádné „null“/„[object“ v textu, voice badge, ročník 3 jako výchozí', async () => {
    const text = await page.textContent('main');
    assert.ok(!/\bnull\b|\[object/.test(text), 'nezpracované hodnoty v textu');
    assert.equal(await page.locator('select').first().inputValue(), '3');
    assert.match(await page.textContent('#voice-badge'), /cs_CZ-jirka-medium \(lokálně\)/);
  });

  await step('podporovaná varianta nabídne D03 a oznámí předvyplnění „slabý“', async () => {
    await page.getByLabel(/Podporovaná/).check();
    await page.getByText(/Nalezeno \d+ text/).waitFor();
    const card = page.locator('li.card', { hasText: 'D03' });
    await card.waitFor();
    assert.match(await card.textContent(), /předvyplní: „slabý“/);
  });

  await step('přísná varianta bez potvrzeného B nenabídne D04; po potvrzení ano', async () => {
    await page.getByLabel(/^\s*Přísná/).check();
    assert.equal(await page.locator('li.card:not(.rejected)', { hasText: 'D04 –' }).count(), 0);
    await page.getByText('Upravit probrané jevy').click();
    await page.getByRole('radiogroup', { name: 'Vyjmenovaná slova po B a slova příbuzná' }).getByLabel('Probráno', { exact: true }).check();
    await page.locator('li.card:not(.rejected)', { hasText: 'D04 –' }).first().waitFor();
    await page.getByRole('radiogroup', { name: 'Vyjmenovaná slova po B a slova příbuzná' }).getByLabel('Zatím neprobráno', { exact: true }).check();
    assert.equal(await page.locator('li.card:not(.rejected)', { hasText: 'D04 –' }).count(), 0);
  });

  await step('prázdný výsledek: srozumitelná zpráva, ne „dítě nic neumí“; nabídne podporovanou variantu', async () => {
    await page.locator('select').first().selectOption('1');
    await page.getByText(/knihovna nemá žádný text/).waitFor();
    const txt = await page.textContent('.empty');
    assert.match(txt, /Neznamená to, že dítě něco neumí/);
    await shot(page, '01-prazdny-vysledek.png');
    await page.locator('select').first().selectOption('3');
  });

  await step('příprava D03: celý text, předvyplněné místo, blokace předání bez potvrzení', async () => {
    await page.getByLabel(/Podporovaná/).check();
    await page.locator('li.card', { hasText: 'D03' }).getByRole('link', { name: /Připravit pro dítě/ }).click();
    await page.getByRole('heading', { name: /D03 – Štěně a větřík/ }).waitFor();
    assert.match(await page.textContent('main'), /Dědeček chová pěkné štěně/);
    assert.match(await page.textContent('main'), /Věta 2: „slabý“/);
    assert.match(await page.textContent('main'), /Kontrolovaný návrh/);
    assert.equal(await page.getByRole('button', { name: 'Předat dítěti a začít diktát' }).getAttribute('aria-disabled'), 'true');
    await shot(page, '02-priprava.png');
    // pokus o start bez potvrzení se nesmí provést (aria-disabled tlačítko lze kliknout, ale nic nespustí)
    await btn(page, 'Předat dítěti a začít diktát').click({ force: true });
    assert.match(page.url(), /#\/prepare\//);
    // přímý vstup na dětskou obrazovku bez potvrzení vrací k dospělému
    await page.goto(`${BASE}/#/dictate/D03`);
    await page.waitForURL(/#\/prepare\/D03/);
  });

  await step('potvrzení profilu a textu → dětská obrazovka; ověření zvuku', async () => {
    await page.getByRole('button', { name: 'Potvrdit profil' }).first().click();
    await page.getByLabel(/Text jsem celý přečetl/).check();
    await btn(page, 'Předat dítěti a začít diktát').click();
    await page.waitForURL(/#\/dictate\/D03/);
    await btn(page, 'Vyzkoušet zvuk').waitFor();
    assert.equal(await page.locator('nav').isHidden(), true, 'navigace je na dětské obrazovce skryta');
    await btn(page, 'Vyzkoušet zvuk').click();
    await page.getByText('Slyšel(a) jsi hlas?').waitFor();
    assert.equal(calls.at(-1).purpose, 'check');
    await btn(page, 'Ano, slyším').click();
  });

  await step('celý text přirozeným tempem; potom diktování po větách', async () => {
    await btn(page, 'Přehrát celý text').click();
    await page.getByText('Poslouchej celý text.').waitFor();
    const full = calls.at(-1);
    assert.equal(full.purpose, 'full');
    assert.equal(full.length_scale, 1);
    await btn(page, 'Začít diktovat').click();
    await page.getByRole('heading', { name: 'Věta 1 ze 3' }).waitFor();
    assert.equal(await playing(page), 0, 'přechod na diktování zastaví zvuk');
  });

  await step('správné znění se během diktování nezobrazuje (ani název), předvyplněné místo jen u své věty', async () => {
    const body = () => page.textContent('body');
    assert.ok(!/Dědeček|štěně|větřík|Štěně a větřík|pěkné/.test(await body()));
    assert.ok(!/Předvyplněné slovo/.test(await body()));
    await btn(page, 'Přehrát').click();
    await status(page, 'dohrála').waitFor();
    assert.equal(calls.at(-1).purpose, 'segment');
    assert.equal(calls.at(-1).segment.text, 'Dědeček chová pěkné štěně.');
    await btn(page, 'Další věta').click();
    await page.getByRole('heading', { name: 'Věta 2 ze 3' }).waitFor();
    assert.match(await body(), /Předvyplněné slovo v této větě: slabý/);
    assert.ok(!/věje|Během dne|větřík/.test(await body()), 'kontext předvyplněného slova se neprozrazuje');
    await shot(page, '03-detska-obrazovka.png');
  });

  await step('hlas čte jen kanonický text věty (žádné značky, názvy znamének ani nápověda i/y)', async () => {
    for (const c of calls.filter((x) => x.purpose === 'segment')) {
      assert.ok(d03Sentences.includes(c.segment.text), c.segment.text);
      assert.ok(!/[\[\]<>*_{}|#]/.test(c.segment.text));
      assert.equal(c.read_punctuation, false);
    }
  });

  await step('Pozastavit zastaví skutečně hrající zvuk; Přehrát pokračuje', async () => {
    await page.locator('main .status', { hasText: /Poslouchej\.|Načítám větu/ }).first().waitFor();
    await status(page, 'Poslouchej.').waitFor();
    await btn(page, 'Pozastavit').click();
    await status(page, 'Pozastaveno').waitFor();
    assert.equal(await playing(page), 0);
    await btn(page, 'Přehrát').click();
    await status(page, 'dohrála').waitFor();
  });

  await step('rychlé opakované kliknutí na Zopakovat/Přehrát: nikdy nehrají dvě nahrávky a hraje jen poslední', async () => {
    const before = calls.length;
    await page.evaluate(() => { window.__maxPlaying = 0; });
    const rep = btn(page, 'Zopakovat');
    await rep.click(); await rep.click(); await rep.click();
    await status(page, 'Poslouchej.').waitFor();
    await status(page, 'dohrála').waitFor();
    const maxPlaying = await page.evaluate(() => window.__maxPlaying);
    assert.ok(maxPlaying <= 1, `souběžně hrálo ${maxPlaying}`);
    assert.ok(calls.length - before >= 1);
    assert.equal(await page.evaluate(() => window.__audios.length), 1, 'jediný audio element');
  });

  await step('klávesnice: Tab/Enter ovládá tlačítka; Předchozí věta funguje', async () => {
    await page.locator('[data-action="Předchozí věta"]').focus();
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Věta 1 ze 3' }).waitFor();
    await status(page, 'dohrála').waitFor();
    await page.locator('[data-action="Další věta"]').focus();
    await page.keyboard.press('Space');
    await page.getByRole('heading', { name: 'Věta 2 ze 3' }).waitFor();
    // tlačítka mají textové popisky a viditelný fokus
    for (const name of ['Přehrát', 'Zopakovat', 'Další věta', 'Pozastavit']) assert.equal(await btn(page, name).count(), 1);
  });

  await step('Ukončit (po potvrzení) zastaví zvuk a vrátí se k dospělému', async () => {
    await status(page, 'dohrála').waitFor();
    await btn(page, 'Zopakovat').click();
    await status(page, 'Poslouchej.').waitFor();
    await btn(page, 'Ukončit').click();
    await page.waitForURL(/#\/prepare\/D03/);
    assert.equal(await playing(page), 0);
  });

  await step('dokončení diktátu: až teď se ukáže správné znění s označenými místy; nic se nehodnotí', async () => {
    await page.getByLabel(/Text jsem celý přečetl/).check();
    await btn(page, 'Předat dítěti a začít diktát').click();
    await btn(page, 'Vyzkoušet zvuk').click();
    await btn(page, 'Ano, slyším').click();
    await btn(page, 'Začít diktovat').click();
    for (let i = 0; i < 3; i++) {
      if (i === 0) await btn(page, 'Přehrát').click();
      await status(page, 'dohrála').waitFor();
      if (i < 2) await btn(page, 'Další věta').click();
    }
    await btn(page, 'Dokončit diktát').click();
    await page.getByRole('heading', { name: 'Správné znění' }).waitFor();
    const txt = await page.textContent('main');
    for (const s of d03Sentences) assert.ok(txt.includes(s.replace(/\.$/, '')), s);
    assert.ok(await page.locator('mark.m-target').count() >= 5);
    assert.match(txt, /neznámkuje/);
    assert.ok(!/známka|bodů|\d+ ?%/.test(txt.replace('neznámkuje', '')));
    await shot(page, '04-reseni.png');
    // řešení nejde otevřít bez dokončení
    await page.goto(`${BASE}/#/prepare/D03`);
    await page.reload();
    await page.goto(`${BASE}/#/solution/D03`);
    await page.waitForURL(/#\/prepare\/D03/);
  });

  await step('mobilní šířka (390 px): úvodní obrazovka bez vodorovného posunu', async () => {
    const m = await newPage({ viewport: { width: 390, height: 800 } });
    await m.page.goto(`${BASE}/`);
    await m.page.waitForSelector('h1');
    assert.ok(await m.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'vodorovný posun na výběru');
    await m.context.close();
  });
  await page.context().close();
}

// ---------------------------------------------------------------------------
console.log('\nB) Zpožděná odpověď a změna diktátu za letu');
{
  const { page, calls } = await newPage({ ttsDelay: 700 });
  await page.goto(`${BASE}/`);
  await page.waitForSelector('h1');
  await step('odchod z dětské obrazovky během načítání: pozdní odpověď nic nepřehraje', async () => {
    await page.locator('li.card', { hasText: 'D02' }).getByRole('link', { name: /Připravit/ }).click();
    await page.getByRole('button', { name: 'Potvrdit profil' }).first().click();
    await page.getByLabel(/Text jsem celý přečetl/).check();
    await btn(page, 'Předat dítěti a začít diktát').click();
    await btn(page, 'Vyzkoušet zvuk').click();
    await page.getByText('Načítám…').waitFor();
    await btn(page, 'Zpět k dospělému').click();
    await page.waitForURL(/#\/prepare\/D02/);
    await sleep(1200);
    const played = await page.evaluate(() => window.__audios.filter((a) => a.currentTime > 0 || !a.paused).length);
    assert.equal(played, 0, 'zastaralá odpověď spustila zvuk');
  });
  await page.context().close();
}

// ---------------------------------------------------------------------------
console.log('\nC) Hlas nedostupný (skutečný server, bez modelu – nic se nepodstrkuje)');
{
  const { page } = await newPage({ fakeVoice: false });
  await page.goto(`${BASE}/`);
  await page.waitForSelector('h1');
  await step('banner s příčinou a nápravou; předání dítěti zablokováno; žádný náhradní hlas', async () => {
    const banner = await page.textContent('#banner');
    assert.match(banner, /Chybí model hlasu|Není nainstalován lokální engine/);
    assert.match(banner, /fetch_model\.py|requirements\.txt/);
    await page.locator('li.card', { hasText: 'D02' }).getByRole('link', { name: /Připravit/ }).click();
    await page.getByRole('button', { name: 'Potvrdit profil' }).first().click();
    await page.getByLabel(/Text jsem celý přečetl/).check();
    assert.equal(await btn(page, 'Předat dítěti a začít diktát').getAttribute('aria-disabled'), 'true');
    assert.match(await page.textContent('.blockers'), /Hlas není k dispozici/);
    await page.goto(`${BASE}/#/dictate/D02`);
    await page.waitForURL(/#\/prepare\/D02/);
    await shot(page, '05-bez-modelu.png');
  });
  await step('stránka Stav popisuje problém a licence', async () => {
    await page.goto(`${BASE}/#/status`);
    await page.getByRole('heading', { name: 'Stav aplikace a hlasu' }).waitFor();
    const t = await page.textContent('main');
    assert.match(t, /Chybí/);
    assert.match(t, /GPL-3\.0/);
    assert.match(t, /CC0/);
  });
  await page.context().close();
}

// ---------------------------------------------------------------------------
console.log('\nD) Knihovna, import balíčku, poslechová kontrola');
{
  const { page } = await newPage({ ttsDelay: 50 });
  await page.goto(`${BASE}/#/library`);
  await page.getByRole('heading', { name: 'Knihovna diktátů' }).waitFor();

  await step('knihovna: 10 diktátů, kontroly oddělené (strukturální / redakční / pedagogické)', async () => {
    assert.equal(await page.locator('table.lib').first().locator('tbody tr').count(), 10);
    const t = await page.textContent('main');
    assert.match(t, /Automatické strukturální kontroly: 10 z 10 položek bez chyb, 5 varování/);
    assert.match(t, /Pedagogické schválení učitelem: 0 položek/);
    assert.match(t, /10 kontrolovaných návrhů/);
    assert.match(t, /demonstrační knihovna/);
    await shot(page, '06-knihovna.png');
  });

  const good = {
    schema_version: 1, language: 'cs-CZ', offset_unit: 'unicode_code_points', pack_id: 'e2e-sada', pack_version: 1,
    dictations: [(() => {
      const sentences = ['U domu je úl.', 'Vedle stojí stůl.', 'Táta nese sůl.'];
      const text = sentences.join(' ');
      return {
        id: 'E01', title: 'Importovaný', recommended_grade: 2, sentences, text, version: 1, sentence_count: 3, word_count: 10,
        content_sha256: null, origin: 'e2e', review_status: 'sample', teacher_approved: false, annotation_completeness: 'partial',
        audio_review_status: 'not_generated', recommended_mode: 'strict_after_profile_confirmation', required_known_forms: [], known_graphemes_required: null,
        support: [], curriculum_sources: [], learner_profile_note: '', teacher_note: '',
        target_features: [{ id: 'orth.u_long_basic', label: 'ú/ů', examples: ['úl'] }], incidental_features: [],
        annotations: [{ sentence_index: 0, start: 10, end: 12, span: 'úl', feature_id: 'orth.u_long_basic', role: 'target', review_status: 'editorial_proposal' }],
        tts_segments: sentences.map((t, i) => ({ id: `E01-S0${i + 1}`, sentence_index: i, text: t })),
      };
    })()],
  };
  const { createHash } = await import('node:crypto');
  good.dictations[0].content_sha256 = createHash('sha256').update(good.dictations[0].text).digest('hex');
  const bad = structuredClone(good);
  bad.pack_id = 'e2e-spatna';
  bad.dictations[0].sentences[0] = 'Upraveno.';
  await writeFile(`${tmp}/good.json`, JSON.stringify(good));
  await writeFile(`${tmp}/bad.json`, JSON.stringify(bad));
  await writeFile(`${tmp}/nejson.json`, '{tohle neni json');

  await step('import: poškozený a neplatný balíček se odmítne srozumitelně a nic se neuloží', async () => {
    await page.locator('input[type=file]').setInputFiles(`${tmp}/nejson.json`);
    await page.getByText(/nelze importovat/).waitFor();
    assert.match(await page.textContent('[role=alert]'), /není platný JSON/);
    await page.locator('input[type=file]').setInputFiles(`${tmp}/bad.json`);
    await page.getByText(/nelze importovat/).waitFor();
    assert.match(await page.textContent('section[aria-labelledby=h-import]'), /Kontrolní součet neodpovídá textu/);
    assert.equal(await page.getByRole('button', { name: 'Importovat balíček' }).count(), 0);
  });

  await step('import: platný balíček se uloží a přežije obnovení; nic se nepovažuje za schválené', async () => {
    await page.locator('input[type=file]').setInputFiles(`${tmp}/good.json`);
    await page.getByRole('button', { name: 'Importovat balíček' }).click();
    await page.getByText(/byl importován/).waitFor();
    assert.equal(await page.locator('table.lib').first().locator('tbody tr').count(), 11);
    await page.reload();
    await page.getByRole('heading', { name: 'Knihovna diktátů' }).waitFor();
    assert.equal(await page.locator('table.lib').first().locator('tbody tr').count(), 11);
    assert.match(await page.textContent('main'), /Pedagogické schválení učitelem: 0 položek/);
  });

  await step('odebrání importovaného balíčku', async () => {
    await page.getByRole('button', { name: 'Odebrat balíček' }).click();
    await page.waitForFunction(() => document.querySelectorAll('table.lib')[0].querySelectorAll('tbody tr').length === 10);
  });

  await step('poslechová kontrola: normálně i zpomaleně, záznam se uloží a váže na verzi textu', async () => {
    await page.goto(`${BASE}/#/review`);
    await page.getByRole('heading', { name: 'Poslechová kontrola hlasu' }).waitFor();
    assert.match(await page.textContent('main'), /Poslech v pořádku: 0 z 10/);
    await page.locator('summary', { hasText: 'D01' }).click();
    const block = page.locator('details', { hasText: 'D01 – Oběd pro rodinu' });
    const calls = [];
    page.on('request', (r) => { if (r.url().endsWith('/api/tts')) calls.push(JSON.parse(r.postData())); });
    await block.getByRole('button', { name: 'Normálně' }).first().click();
    await block.getByRole('button', { name: 'Zpomaleně' }).first().click();
    await sleep(300);
    assert.deepEqual(calls.map((c) => c.length_scale), [1, 1.3]);
    await block.getByLabel('Všechny věty normálním tempem').check();
    await block.getByRole('combobox', { name: /Délky samohlásek/ }).selectOption('ok');
    await block.getByRole('button', { name: 'Uložit hodnocení' }).click();
    await page.getByText('Hodnocení D01 uloženo.').waitFor();
    assert.match(await page.textContent('summary:has-text("D01")'), /Rozpracováno/);
    await shot(page, '07-poslechova-kontrola.png');
    // nikdy se samo nenastaví „v pořádku“
    assert.doesNotMatch(await page.textContent('main'), /Poslech v pořádku: [1-9]/);
  });
  await page.context().close();
}

// ---------------------------------------------------------------------------
console.log('\nE) Celková kontrola relace');
await step('žádné požadavky mimo 127.0.0.1 (provoz bez internetu nepotřebuje nic zvenčí)', async () => {
  const external = requestsSeen.filter((u) => !/^(http:\/\/127\.0\.0\.1:\d+\/|blob:|data:)/.test(u));
  assert.deepEqual(external, [], `externí požadavky: ${external.join(', ')}`);
  assert.ok(requestsSeen.length > 50);
});
await step('v konzoli žádné chyby ani varování (včetně porušení CSP)', async () => {
  // chyby 4xx/5xx z cíleně vyvolaných stavů (503 bez modelu) nejsou chyby aplikace
  const real = consoleProblems.filter((m) => !/Failed to load resource/.test(m));
  assert.deepEqual(real, [], real.join('\n'));
});

await browser.close();
server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\nE2E: ${results.length - failed.length}/${results.length} kroků prošlo`);
process.exit(failed.length ? 1 : 0);

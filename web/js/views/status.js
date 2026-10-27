// Stav aplikace a hlasu, ověření zvuku, licence a provoz bez sítě.

import { getHealth } from '../tts-client.js';
import { clear, h } from '../dom.js';
import { store, update } from '../store.js';
import { badge, errorPanel } from './common.js';

const STATUS_TEXT = {
  ready: ['Hlas je připraven', 'ok'],
  engine_missing: ['Chybí engine Piper', 'bad'],
  model_missing: ['Chybí model hlasu', 'bad'],
  model_invalid: ['Model hlasu je poškozený', 'bad'],
  model_changed: ['Model hlasu se změnil', 'bad'],
  service_unreachable: ['Lokální služba neodpovídá', 'bad'],
};

export function renderStatus(main) {
  let alive = true;
  let checking = false;

  async function recheck() {
    checking = true;
    draw();
    try {
      update({ health: await getHealth() });
    } catch (e) {
      update({ health: { status: 'service_unreachable', ready: false, error: { code: e.code, message: e.message, hint: e.hint } } });
    }
    checking = false;
    draw();
  }

  function draw() {
    if (!alive) return;
    const hl = store.health;
    const [text, kind] = STATUS_TEXT[hl?.status] ?? ['Neznámý stav', 'warn'];
    clear(main).append(
      h('h1', {}, 'Stav aplikace a hlasu'),
      h('section', { class: 'panel' },
        h('h2', {}, 'Hlas (lokální předčítání)'),
        h('p', { class: 'status-line', role: 'status' }, badge(text, kind)),
        hl?.error ? errorPanel(hl.error.message, [], hl.error.hint) : null,
        h('dl', {},
          h('dt', {}, 'Model'), h('dd', {}, hl?.model ? `${hl.model.id} (${hl.model.file})` : '–'),
          h('dt', {}, 'Otisk modelu (SHA-256)'), h('dd', { class: 'url' }, hl?.model?.sha256 ?? '–'),
          h('dt', {}, 'Záznam o hlasu'), h('dd', {}, { ok: 'odpovídá záznamu při stažení', unlocked: 'dosud bez záznamu (zaznamená se při prvním použití)', mismatch: 'NEODPOVÍDÁ záznamu' }[hl?.model?.lock] ?? '–'),
          h('dt', {}, 'Engine'), h('dd', {}, hl?.engine ? `${hl.engine.name} ${hl.engine.version ?? '(verze neznámá)'} – licence ${hl.engine.license ?? '?'}` : '–'),
          h('dt', {}, 'Mezipaměť zvuku'), h('dd', {}, hl?.cache ? `${hl.cache.entries} nahrávek, ${(hl.cache.bytes / 1024).toFixed(0)} kB` : '–')),
        h('p', {}, h('button', { type: 'button', class: 'btn', onclick: recheck, 'aria-disabled': checking ? 'true' : 'false' }, checking ? 'Kontroluji…' : 'Zkontrolovat znovu')),
        h('p', { class: 'hint' }, 'Hlas se nikdy nemění potichu: při jiném souboru modelu se předčítání zastaví a vyžádá si výslovné potvrzení. Aplikace nemá žádnou vzdálenou ani náhradní službu pro hlas.')),
      h('section', { class: 'panel' },
        h('h2', {}, 'Provoz bez sítě'),
        h('ul', {},
          h('li', {}, 'Aplikace i hlas běží jen na tomto počítači (adresa 127.0.0.1). Nenačítá nic z internetu: žádné externí skripty, písma ani statistiky.'),
          h('li', {}, 'Internet je potřeba jen jednou, při příkazu „python3 server/fetch_model.py“, který stáhne model hlasu.'),
          h('li', {}, 'Po stažení modelu lze síť odpojit; diktování, výběr i import balíčků dál fungují.')),
        h('p', { class: 'hint' }, 'Důkaz provozu bez sítě: viz README, část „Ověření bez sítě“ (příkaz scripts/generate_audio.py --require-offline).')),
      h('section', { class: 'panel' },
        h('h2', {}, 'Licence'),
        h('p', {}, 'Engine Piper (OHF-Voice/piper1-gpl): GPL-3.0-or-later. Český hlas cs_CZ-kasandra-medium (autor Ondřej Šimek): podle karty hlasu CC BY 4.0, vyžaduje uvedení autora; licenci celého balíčku z toho nelze odvozovat. Podrobnosti a stav ověření jsou v docs/LICENSES.md.')),
      store.storageOk ? null : h('p', { class: 'warn-text' }, 'Prohlížeč neumožňuje ukládání nastavení; profil se po zavření stránky ztratí.'));
  }

  draw();
  return () => { alive = false; };
}

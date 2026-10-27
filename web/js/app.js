// Spuštění aplikace a směrování (#/ …). Žádné externí požadavky; vše běží z lokálního serveru.

import { loadCatalog, CatalogError } from './catalog.js';
import { clear, h } from './dom.js';
import { buildTaxonomy } from './taxonomy.js';
import { getHealth } from './tts-client.js';
import { loadState, store, subscribe, update } from './store.js';
import { errorPanel } from './views/common.js';
import { renderChild } from './views/child.js';
import { renderLibrary } from './views/library.js';
import { renderPrepare } from './views/prepare.js';
import { renderReview } from './views/review.js';
import { renderSelect } from './views/select.js';
import { renderSolution } from './views/solution.js';
import { renderStatus } from './views/status.js';

const main = document.getElementById('main');
const banner = document.getElementById('banner');
const nav = document.getElementById('nav');
let cleanup = null;

const ROUTES = [
  [/^#\/?$/, renderSelect, 'select'],
  [/^#\/prepare\/([^/]+)$/, renderPrepare, 'select'],
  [/^#\/dictate\/([^/]+)$/, renderChild, 'child'],
  [/^#\/solution\/([^/]+)$/, renderSolution, 'select'],
  [/^#\/library$/, renderLibrary, 'library'],
  [/^#\/review$/, renderReview, 'review'],
  [/^#\/status$/, renderStatus, 'status'],
];

function paintChrome() {
  const hl = store.health;
  const voice = document.getElementById('voice-badge');
  if (voice) {
    voice.textContent = hl?.ready ? `Hlas: ${hl.model.id} (lokálně)` : 'Hlas nedostupný';
    voice.className = `badge ${hl?.ready ? 'ok' : 'bad'}`;
  }
  clear(banner);
  if (hl && !hl.ready) {
    banner.append(h('div', { class: 'banner bad', role: 'alert' },
      h('strong', {}, hl.error?.message ?? 'Hlas není k dispozici.'), ' ', hl.error?.hint ?? '', ' ', h('a', { href: '#/status' }, 'Podrobnosti')));
  } else if (store.catalog?.problems?.length) {
    banner.append(h('div', { class: 'banner warn', role: 'status' }, `Při načítání knihovny se vyskytly problémy (${store.catalog.problems.length}). `, h('a', { href: '#/library' }, 'Zobrazit')));
  }
}

function route() {
  cleanup?.();
  cleanup = null;
  const hash = location.hash || '#/';
  for (const [re, view, kind] of ROUTES) {
    const m = hash.match(re);
    if (!m) continue;
    document.body.dataset.view = kind;
    nav.hidden = kind === 'child';
    document.querySelectorAll('#nav a').forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === hash || (a.getAttribute('href') === '#/' && kind === 'select') ? 'page' : 'false'));
    clear(main);
    window.scrollTo(0, 0);
    cleanup = view(main, { id: m[1] ? decodeURIComponent(m[1]) : undefined }) ?? null;
    main.focus({ preventScroll: true });
    return;
  }
  location.replace('#/');
}

async function boot() {
  let taxonomy;
  try {
    const res = await fetch('/data/profiles.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    taxonomy = buildTaxonomy(await res.json());
  } catch (e) {
    clear(main).append(errorPanel('Aplikaci nelze spustit', [String(e.message ?? e)], 'Soubor data/profiles.json chybí nebo je poškozený. Obnovte jej z repozitáře.'));
    return;
  }
  loadState(taxonomy);
  try {
    update({ catalog: await loadCatalog(taxonomy) });
  } catch (e) {
    const lines = e instanceof CatalogError ? [e.message, ...e.details] : [String(e.message ?? e)];
    clear(main).append(errorPanel('Poškozený datový balíček', lines, 'Základní knihovna (data/dictations.seed.json) se nenačetla. Ověřte ji příkazem „node scripts/validate-data.mjs“ nebo ji obnovte z repozitáře.'));
    return;
  }
  try {
    update({ health: await getHealth() });
  } catch (e) {
    update({ health: { status: 'service_unreachable', ready: false, error: { code: e.code, message: e.message, hint: e.hint } } });
  }
  subscribe(paintChrome);
  paintChrome();
  window.addEventListener('hashchange', route);
  route();
}

boot();

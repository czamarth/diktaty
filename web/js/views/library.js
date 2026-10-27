// Knihovna: přehled diktátů, výsledky kontrol (oddělené od sebe), pokrytí a import balíčku JSON.

import { checkImport, loadCatalog, removePack, storePack } from '../catalog.js';
import { clear, h } from '../dom.js';
import { errorsOf, tierOf, warningsOf } from '../schema.js';
import { libraryCoverage } from '../selection.js';
import { store, update } from '../store.js';
import { badge, errorPanel, tierBadge } from './common.js';

export function renderLibrary(main) {
  let importState = null; // { text, result, busy, message }
  let alive = true;

  async function refresh() {
    const catalog = await loadCatalog(store.taxonomy);
    update({ catalog });
    draw();
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    importState = { name: file.name, busy: true };
    draw();
    try {
      const text = await file.text();
      const result = await checkImport(text, store.taxonomy, store.catalog);
      importState = { name: file.name, result };
    } catch (err) {
      importState = { name: file.name, result: { ok: false, report: [{ level: 'error', message: `Soubor nelze přečíst: ${err.message}` }] } };
    }
    if (alive) draw();
  }

  async function doImport() {
    const { pack } = importState.result;
    importState = { ...importState, busy: true };
    draw();
    try {
      await storePack(pack);
      importState = { name: importState.name, message: `Balíček „${pack.pack_id}“ (verze ${pack.pack_version}) byl importován. Všechny jeho položky jsou kandidáty bez schválení učitelem, dokud to nevyplývá z jejich dat.` };
      await refresh();
    } catch (err) {
      importState = { name: importState.name, result: { ok: false, report: [{ level: 'error', message: `Uložení selhalo: ${err.message}` }] } };
      if (alive) draw();
    }
  }

  async function doRemove(packId) {
    if (!confirm(`Odebrat importovaný balíček „${packId}“? Vestavěná knihovna zůstane.`)) return;
    await removePack(packId);
    await refresh();
  }

  function importPanel() {
    const r = importState?.result;
    return h('section', { class: 'panel', 'aria-labelledby': 'h-import' },
      h('h2', { id: 'h-import' }, 'Import rozšiřujícího balíčku'),
      h('p', { class: 'hint' }, 'Balíček JSON ve stejném tvaru jako data/dictations.seed.json (navíc s pack_id a pack_version). Nic se neuloží, dokud neprojdou všechny kontroly. Import nikdy nic neschvaluje.'),
      h('label', { class: 'field' }, 'Soubor balíčku: ', h('input', { type: 'file', accept: '.json,application/json', onchange: onFile })),
      importState?.busy ? h('p', { role: 'status' }, 'Kontroluji…') : null,
      importState?.message ? h('p', { class: 'ok-text', role: 'status' }, importState.message) : null,
      r ? h('div', { role: 'status' },
        r.ok ? h('p', { class: 'ok-text' }, `Balíček „${importState.name}“ prošel strukturálními kontrolami (to není pedagogické schválení).`)
          : errorPanel(`Balíček „${importState.name}“ nelze importovat`, r.report.filter((x) => x.level === 'error').map((x) => x.message)),
        r.report.some((x) => x.level === 'warning') ? h('ul', {}, r.report.filter((x) => x.level === 'warning').map((x) => h('li', {}, `varování – ${x.message}`))) : null,
        r.ok ? h('p', {}, r.replaces ? `Nahradí nainstalovanou verzi ${r.replaces.pack_version}. ` : null,
          h('button', { type: 'button', class: 'btn primary', onclick: doImport }, 'Importovat balíček')) : null) : null);
  }

  function draw() {
    if (!alive) return;
    const cat = store.catalog;
    const items = cat.items;
    const usable = cat.usable;
    const tiers = { approved: 0, checked: 0, sample: 0 };
    usable.forEach((i) => { tiers[tierOf(i.dictation)] += 1; });
    const warnings = items.reduce((n, i) => n + warningsOf(i.issues).length, 0);
    const cov = libraryCoverage(usable, store.taxonomy);
    const missingCov = cov.filter((c) => c.count === 0);

    clear(main).append(
      h('h1', {}, 'Knihovna diktátů'),
      h('section', { class: 'panel' },
        h('h2', {}, 'Stav kontrol – tři různé věci'),
        h('ul', {},
          h('li', {}, h('strong', {}, 'Automatické strukturální kontroly: '), `${items.filter((i) => errorsOf(i.issues).length === 0).length} z ${items.length} položek bez chyb, ${warnings} varování.`),
          h('li', {}, h('strong', {}, 'Redakční kontrola: '), `${tiers.checked} kontrolovaných návrhů, ${tiers.sample} ukázek.`),
          h('li', {}, h('strong', {}, 'Pedagogické schválení učitelem: '), `${tiers.approved} položek.`)),
        h('p', { class: 'hint' }, 'Strukturální kontrola ověřuje formát, offsety anotací, kontrolní součty a shodu textu pro hlas s řešením. Neposuzuje, zda je text vhodný pro konkrétní dítě. Poslech hlasu se eviduje zvlášť (Poslechová kontrola).')),
      cat.problems.length ? errorPanel('Problémy při načtení balíčků', cat.problems.map((p) => `${p.pack}: ${p.message}`)) : null,
      h('section', { class: 'panel' },
        h('h2', {}, `Diktáty (${items.length})`),
        h('table', { class: 'lib' },
          h('thead', {}, h('tr', {}, ['ID', 'Název', 'Ročník', 'Vět', 'Úroveň', 'Anotace', 'Balíček', 'Kontroly'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, items.map((i) => {
            const d = i.dictation;
            const e = errorsOf(i.issues);
            const w = warningsOf(i.issues);
            return h('tr', { class: i.usable ? '' : 'row-missing' },
              h('td', {}, d?.id ?? '?'), h('td', {}, d?.title ?? '?'), h('td', {}, d?.recommended_grade ?? '?'), h('td', {}, d?.sentences?.length ?? '?'),
              h('td', {}, i.usable ? tierBadge(tierOf(d)) : badge('nepoužitelné', 'bad')),
              h('td', {}, d?.annotation_completeness === 'complete' ? 'úplná' : 'neúplná'),
              h('td', {}, i.source.pack_id, i.source.builtin ? null : h('button', { type: 'button', class: 'btn small', onclick: () => doRemove(i.source.pack_id) }, 'Odebrat balíček')),
              h('td', {}, e.length ? badge(`${e.length} chyb`, 'bad') : badge('bez chyb', 'ok'), w.length ? [' ', badge(`${w.length} varování`, 'warn')] : null,
                (e.length || w.length) ? h('details', {}, h('summary', {}, 'detail'), h('ul', {}, i.issues.map((x) => h('li', {}, `${x.level === 'error' ? 'CHYBA' : 'varování'} ${x.path}: ${x.message}`)))) : null));
          })))),
      importPanel(),
      h('section', { class: 'panel' },
        h('h2', {}, 'Pokrytí jevů'),
        h('p', { class: 'hint' }, `První sada je demonstrační knihovna, ne dostatečné pokrytí všech okruhů všech tříd. Pro ${missingCov.length} z ${cov.length} jevů knihovna nemá žádný text, kde by byl cílovým jevem.`),
        h('details', {}, h('summary', {}, 'Zobrazit pokrytí podle jevů'),
          h('table', { class: 'lib' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Jev'), h('th', { scope: 'col' }, 'Počet textů s tímto cílovým jevem'))),
            h('tbody', {}, cov.map((c) => h('tr', { class: c.count ? '' : 'row-missing' }, h('td', {}, c.label), h('td', {}, c.count ? String(c.count) : 'žádný text')))))))
    );
  }

  draw();
  return () => { alive = false; };
}

// Výběr diktátu: ročník → upravitelný profil → varianta a okruh → výsledky s vysvětlením.

import { clear, h } from '../dom.js';
import { ALPHABET, STYLES, confirmProfile, defaultProfile, parseForms, setCheckGraphemes, setFeatureState, setGrapheme, setGraphemeBulk, setGroupState,
  setIncidentalLevel, setKnownForms, setWritingStyle, stateOf } from '../profile.js';
import { selectDictations } from '../selection.js';
import { setProfile, setSelection, store, subscribe } from '../store.js';
import { COMPLETENESS_LABEL, LEVEL_LABEL, MODE_LABEL, badge, explainTable, missingSummary, tierBadge } from './common.js';
import { LEVELS } from '../taxonomy.js';

const hasAdultEdits = (p) =>
  Object.values(p.knowledge).some((k) => k.origin === 'adult') || p.knownForms.length > 0 || p.graphemes.block.length > 0 || p.graphemes.cursive.length > 0;

export function renderSelect(main) {
  const open = new Set();
  let focusKey = null;
  const toggleOpen = (id) => (e) => { if (e.target.open) open.add(id); else open.delete(id); };
  const details = (id, summary, ...children) => h('details', { open: open.has(id), ontoggle: toggleOpen(id) }, h('summary', {}, summary), ...children);
  const fk = (key) => ({ 'data-fk': key, onfocus: () => { focusKey = key; } });

  function profileEditor() {
    const p = store.profile;
    const t = store.taxonomy;
    const groups = t.groups.map((g) => h('fieldset', { class: 'group' },
      h('legend', {}, g.label),
      h('div', { class: 'bulk' },
        h('button', { type: 'button', class: 'btn small', ...fk(`bulk:${g.id}:taught`), onclick: () => setProfile(setGroupState(p, t, g.id, 'taught')) }, 'Celý okruh: probráno'),
        h('button', { type: 'button', class: 'btn small', ...fk(`bulk:${g.id}:not_taught`), onclick: () => setProfile(setGroupState(p, t, g.id, 'not_taught')) }, 'Celý okruh: zatím neprobráno')),
      t.featuresOfGroup(g.id).map((f) => {
        const state = stateOf(p, f.id);
        const rec = f.default_policy === 'adult_confirm' && f.typical_grade <= p.grade && state === 'not_taught';
        return h('div', { class: 'feat' },
          h('span', { class: 'feat-label' }, f.label, ' ',
            h('small', {}, `(typicky ${f.typical_grade}. ročník)`),
            p.knowledge[f.id]?.origin === 'default' && state === 'taught' ? badge('výchozí', 'soft') : null,
            rec ? badge('doporučeno pro ročník – potvrďte', 'soft') : null),
          h('div', { class: 'radios', role: 'radiogroup', 'aria-label': f.label },
            LEVELS.map((lvl) => h('label', { class: 'radio' },
              h('input', { type: 'radio', name: `f-${f.id}`, value: lvl, checked: state === lvl, ...fk(`feat:${f.id}:${lvl}`), onchange: () => setProfile(setFeatureState(p, f.id, lvl)) }),
              ' ', LEVEL_LABEL[lvl]))));
      })));
    return groups;
  }

  function graphemeEditor() {
    const p = store.profile;
    const known = new Set(p.graphemes[p.writingStyle]);
    const grid = (title, list) => h('div', {},
      h('h4', {}, title),
      h('div', { class: 'letters' }, list.map((g) => h('button', {
        type: 'button', class: `letter${known.has(g) ? ' on' : ''}`, 'aria-pressed': known.has(g) ? 'true' : 'false',
        'aria-label': `${g} – ${known.has(g) ? 'známé' : 'neznámé'}`, ...fk(`g:${g}`), onclick: () => setProfile(setGrapheme(p, g, !known.has(g))),
      }, g))));
    return [
      h('p', { class: 'hint' }, 'Písmena se porovnávají přesně: a ≠ á, m ≠ M. Znalost se vztahuje k vybranému druhu písma; „ch“ je jedno písmeno.'),
      h('label', {}, 'Druh písma: ',
        h('select', { ...fk('style'), onchange: (e) => setProfile(setWritingStyle(p, e.target.value)) },
          Object.entries(STYLES).map(([k, v]) => h('option', { value: k, selected: p.writingStyle === k }, v)))),
      h('div', { class: 'bulk' },
        h('button', { type: 'button', class: 'btn small', onclick: () => setProfile(setGraphemeBulk(p, ALPHABET.lower, true)) }, 'Potvrdit všechna malá písmena'),
        h('button', { type: 'button', class: 'btn small', onclick: () => setProfile(setGraphemeBulk(p, ALPHABET.upper, true)) }, 'Potvrdit všechna velká písmena'),
        h('button', { type: 'button', class: 'btn small', onclick: () => setProfile(setGraphemeBulk(p, [...ALPHABET.lower, ...ALPHABET.upper], false)) }, 'Zrušit vše')),
      grid('Malá písmena', ALPHABET.lower),
      grid('Velká písmena', ALPHABET.upper),
    ];
  }

  function profilePanel() {
    const p = store.profile;
    return h('section', { class: 'panel', 'aria-labelledby': 'h-profile' },
      h('h2', { id: 'h-profile' }, '1. Ročník a znalostní profil'),
      h('label', { class: 'field' }, 'Ročník: ',
        h('select', {
          ...fk('grade'),
          onchange: (e) => {
            const g = Number(e.target.value);
            if (hasAdultEdits(store.profile) && !confirm('Změna ročníku nahradí vámi upravený profil výchozím profilem nového ročníku. Pokračovat?')) { e.target.value = String(store.profile.grade); return; }
            setProfile(defaultProfile(g, store.taxonomy));
          },
        }, Array.from({ length: 9 }, (_, i) => i + 1).map((g) => h('option', { value: g, selected: p.grade === g }, `${g}. ročník`)))),
      h('p', { class: 'hint' },
        'Ročník jen nabídne výchozí profil. Je to orientační doporučení, ne důkaz toho, co dítě zná, a není odvozen ze školního plánu konkrétní školy. ',
        'Rozhodují jevy, které dospělý skutečně potvrdí. Jevy, které se z ročníku nepředpokládají (např. vyjmenovaná slova, vzory, čárky), je třeba potvrdit.'),
      h('p', { class: 'status-line' },
        p.confirmed ? badge('Profil potvrzen dospělým', 'ok') : badge('Profil není potvrzen', 'warn'),
        ' ', p.confirmed ? 'Výběr níže odpovídá potvrzenému profilu.' : 'Výběr níže je jen orientační, dokud profil nepotvrdíte.'),
      h('div', { class: 'bulk' },
        h('button', { type: 'button', class: 'btn primary', disabled: p.confirmed, ...fk('confirm'), onclick: () => setProfile(confirmProfile(store.profile)) }, p.confirmed ? 'Profil je potvrzen' : 'Potvrdit profil'),
        h('button', { type: 'button', class: 'btn', onclick: () => { if (!hasAdultEdits(store.profile) || confirm('Vrátit výchozí profil pro tento ročník? Vaše úpravy se ztratí.')) setProfile(defaultProfile(store.profile.grade, store.taxonomy)); } }, 'Vrátit výchozí profil')),
      details('profile', 'Upravit probrané jevy', h('div', { class: 'groups' }, profileEditor())),
      details('opts', 'Další nastavení profilu',
        h('label', { class: 'field' }, 'Vedlejší jevy v textu musí být: ',
          h('select', { ...fk('incidental'), onchange: (e) => setProfile(setIncidentalLevel(store.profile, e.target.value)) },
            h('option', { value: 'taught', selected: p.incidentalLevel === 'taught' }, 'alespoň probrané'),
            h('option', { value: 'mastered', selected: p.incidentalLevel === 'mastered' }, 'zvládnuté (přísnější)'))),
        h('label', { class: 'field check' },
          h('input', { type: 'checkbox', checked: p.checkGraphemes, ...fk('checkg'), onchange: (e) => setProfile(setCheckGraphemes(store.profile, e.target.checked)) }),
          ' Kontrolovat znalost jednotlivých písmen (pro nejmladší děti)')),
      p.checkGraphemes ? details('graphemes', `Známá písmena (${p.graphemes[p.writingStyle].length})`, graphemeEditor()) : null,
      details('forms', `Konkrétní známé slovní tvary (${p.knownForms.length})`,
        h('p', { class: 'hint' }, 'Slova, která dítě zná i bez znalosti pravidla (např. převzaté slovo „film“, tvar „jsem“). Oddělte čárkou nebo novým řádkem; velikost písmen se rozlišuje.'),
        h('textarea', { rows: 3, 'aria-label': 'Známé slovní tvary', ...fk('forms'), onchange: (e) => setProfile(setKnownForms(store.profile, parseForms(e.target.value))) }, store.profile.knownForms.join('\n'))));
  }

  function filterPanel() {
    const s = store.selection;
    return h('section', { class: 'panel', 'aria-labelledby': 'h-filter' },
      h('h2', { id: 'h-filter' }, '2. Varianta a okruh'),
      h('fieldset', {},
        h('legend', {}, 'Varianta diktátu'),
        h('label', { class: 'radio block' }, h('input', { type: 'radio', name: 'mode', checked: s.mode === 'strict', ...fk('mode:strict'), onchange: () => setSelection({ mode: 'strict' }) }),
          ' ', h('strong', {}, 'Přísná'), ' – dítě samostatně píše jen to, co má potvrzené.'),
        h('label', { class: 'radio block' }, h('input', { type: 'radio', name: 'mode', checked: s.mode === 'supported', ...fk('mode:supported'), onchange: () => setSelection({ mode: 'supported' }) }),
          ' ', h('strong', {}, 'Podporovaná'), ' – přesně určená neprobraná místa jsou předvyplněná a dítě je samostatně nepíše.')),
      h('label', { class: 'field' }, 'Pravopisný okruh: ',
        h('select', { ...fk('topic'), onchange: (e) => setSelection({ groupId: e.target.value }) },
          h('option', { value: '' }, 'Všechny okruhy'),
          store.taxonomy.groups.map((g) => h('option', { value: g.id, selected: s.groupId === g.id }, g.label)))),
      h('label', { class: 'field check' }, h('input', { type: 'checkbox', checked: s.includeIncidentalTopic, ...fk('inc'), onchange: (e) => setSelection({ includeIncidentalTopic: e.target.checked }) }),
        ' U okruhu zahrnout i texty, kde je okruh jen vedlejším jevem'),
      h('label', { class: 'field check' }, h('input', { type: 'checkbox', checked: s.onlyApproved, ...fk('appr'), onchange: (e) => setSelection({ onlyApproved: e.target.checked }) }),
        ' Jen položky schválené učitelem (v první sadě žádné nejsou)'));
  }

  function card(entry, { rejected = false } = {}) {
    const d = entry.item.dictation;
    const ev = entry.ev;
    const prefills = ev.supported.prefills.map((s) => s.span);
    return h('li', { class: `card${rejected ? ' rejected' : ''}` },
      h('h3', {}, `${d.id} – ${d.title}`),
      h('p', { class: 'meta' },
        `Doporučený ročník ${d.recommended_grade} (orientační) · ${d.sentences.length} věty · `,
        tierBadge(ev.tier), ' ',
        ev.best ? badge(`${MODE_LABEL[ev.best]} varianta`, ev.best === 'strict' ? 'ok' : 'soft') : null,
        ev.best === 'supported' ? ` – předvyplní: ${prefills.map((p) => `„${p}“`).join(', ')}` : null),
      ev.needsAdultReview ? h('p', { class: 'warn-text' }, COMPLETENESS_LABEL.partial, '.') : null,
      rejected ? h('p', { class: 'warn-text' }, 'Chybí: ', missingSummary(ev).join('; '), '.') : null,
      details(`why:${d.id}`, 'Proč je tento text (ne)vhodný?', explainTable(ev),
        d.learner_profile_note ? h('p', {}, h('strong', {}, 'Poznámka k profilu: '), d.learner_profile_note) : null),
      h('p', {}, h('a', { class: 'btn primary', href: `#/prepare/${encodeURIComponent(d.id)}` }, rejected ? 'Otevřít přípravu (text zatím není vhodný)' : 'Připravit pro dítě')));
  }

  function resultsPanel() {
    const s = store.selection;
    const res = selectDictations(store.catalog.usable, store.profile, store.taxonomy, s);
    const children = [h('h2', { id: 'h-results' }, '3. Vhodné diktáty')];
    if (res.empty) {
      children.push(h('div', { class: 'empty', role: 'status' },
        h('p', {}, h('strong', {}, `Pro tento profil (${MODE_LABEL[s.mode].toLowerCase()} varianta${s.groupId ? `, okruh „${store.taxonomy.groups.find((g) => g.id === s.groupId).label}“` : ''}) knihovna nemá žádný text.`)),
        h('p', {}, 'Neznamená to, že dítě něco neumí – první sada deseti textů je jen ukázka a nepokrývá všechny okruhy ani ročníky.'),
        res.excludedByApproval ? h('p', {}, `${res.excludedByApproval} textů bylo skryto, protože nejsou schválené učitelem.`) : null));
      if (s.mode === 'strict') {
        const alt = selectDictations(store.catalog.usable, store.profile, store.taxonomy, { ...s, mode: 'supported' });
        if (!alt.empty) children.push(h('p', {}, 'V podporované variantě je k dispozici ', String(alt.matches.length), ' text(ů). ',
          h('button', { type: 'button', class: 'btn', onclick: () => setSelection({ mode: 'supported' }) }, 'Přepnout na podporovanou variantu')));
      }
      const nearest = res.rejected[0];
      if (nearest) children.push(h('p', {}, h('strong', {}, 'Nejblíže: '), `${nearest.item.dictation.id} – ${nearest.item.dictation.title}; chybí: ${missingSummary(nearest.ev).join('; ')}.`));
    } else {
      children.push(h('p', { 'aria-live': 'polite' }, `Nalezeno ${res.matches.length} text(ů). Nejdřív jsou texty doporučeného ročníku; ročník sám text nepřiděluje, rozhoduje profil.`));
      children.push(h('ul', { class: 'cards' }, res.matches.map((m) => card(m))));
    }
    if (res.rejected.length) {
      children.push(details('rejected', `Nevhodné pro tento profil (${res.rejected.length}) – s důvodem`, h('ul', { class: 'cards' }, res.rejected.map((m) => card(m, { rejected: true })))));
    }
    return h('section', { class: 'panel', 'aria-labelledby': 'h-results' }, children);
  }

  function draw() {
    const y = window.scrollY;
    clear(main).append(
      h('h1', {}, 'Výběr diktátu'),
      store.notes.length ? h('p', { class: 'hint' }, store.notes.join(' ')) : null,
      profilePanel(), filterPanel(), resultsPanel());
    window.scrollTo(0, y);
    if (focusKey) main.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  }

  draw();
  const unsub = subscribe(draw);
  return () => unsub();
}


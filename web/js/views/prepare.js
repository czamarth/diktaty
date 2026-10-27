// Příprava pro dospělého: celý text, jevy, známé tvary, předvyplněná místa, stav kontroly.
// Dospělý zde potvrdí použití ukázky, teprve pak se obrazovka předá dítěti.

import { clear, h } from '../dom.js';
import { confirmProfile, setFeatureState, setKnownForms } from '../profile.js';
import { evaluate } from '../selection.js';
import { warningsOf } from '../schema.js';
import { fetchReviews } from '../reviews-api.js';
import { audioReviewStatus, STATUS_LABEL } from '../review-model.js';
import { graphemesOf } from '../text.js';
import { TEMPOS, setProfile, setSelection, setSettings, store, subscribe, update } from '../store.js';
import { COMPLETENESS_LABEL, MODE_LABEL, TIER_LABEL, badge, errorPanel, explainTable, labelOf, markLegend, markedText, missingSummary, tierBadge } from './common.js';

export function renderPrepare(main, { id }) {
  const item = store.catalog.items.find((i) => i.dictation?.id === id);
  if (!item) {
    clear(main).append(errorPanel('Diktát nenalezen', [`V knihovně není diktát „${id}“.`]), h('p', {}, h('a', { class: 'btn', href: '#/' }, 'Zpět na výběr')));
    return () => {};
  }
  if (!item.usable) {
    clear(main).append(errorPanel(`Diktát ${id} nelze použít`, item.issues.filter((i) => i.level === 'error').map((i) => `${i.path}: ${i.message}`),
      'Položka neprošla strukturálními kontrolami a nebude se přehrávat.'), h('p', {}, h('a', { class: 'btn', href: '#/library' }, 'Otevřít knihovnu')));
    return () => {};
  }
  const d = item.dictation;
  let reviews = { state: 'loading', doc: null };
  let alive = true; // odpověď může dorazit po opuštění obrazovky a nesmí ji přepsat

  fetchReviews().then((doc) => { reviews = { state: 'ok', doc }; draw(); }).catch((e) => { reviews = { state: 'error', error: e.message }; draw(); });

  function draw() {
    if (!alive) return;
    const p = store.profile;
    const ev = evaluate(d, p);
    const wanted = store.selection.mode;
    const effective = wanted === 'strict' && !ev.strict.eligible && ev.supported.eligible ? 'supported' : wanted;
    const suitable = effective === 'strict' ? ev.strict.eligible : ev.supported.eligible;
    const prefills = effective === 'supported' ? ev.supported.prefills : [];
    const modelSha = store.health?.model?.sha256 ?? null;
    const audioStatus = reviews.state === 'ok' ? audioReviewStatus(reviews.doc.items[d.id], d, modelSha) : null;
    const confirmed = store.confirmedDictationId === d.id && p.confirmed;

    const blockers = [];
    if (!suitable) blockers.push(`Text zatím není vhodný pro tento profil (${MODE_LABEL[effective].toLowerCase()} varianta). Doplňte potvrzené znalosti, nebo zvolte jiný text.`);
    if (!p.confirmed) blockers.push('Profil není potvrzen dospělým.');
    if (!confirmed) blockers.push('Dospělý neověřil a nepotvrdil použití tohoto textu.');
    if (!store.health?.ready) blockers.push('Hlas není k dispozici (viz stránka Stav) – diktát nelze přehrát.');

    const g1 = p.checkGraphemes ? [...graphemesOf(d.text)].sort((a, b) => a.localeCompare(b, 'cs')) : null;
    const knownG = new Set(p.graphemes[p.writingStyle]);

    clear(main).append(
      h('p', {}, h('a', { href: '#/' }, '← Zpět na výběr')),
      h('h1', {}, `${d.id} – ${d.title}`),
      h('p', { class: 'meta' }, tierBadge(ev.tier), ' ', badge(`Doporučený ročník ${d.recommended_grade} (orientační)`, 'soft'), ' ',
        badge(COMPLETENESS_LABEL[d.annotation_completeness], d.annotation_completeness === 'complete' ? 'ok' : 'warn'), ' ',
        audioStatus ? badge(`Poslech hlasu: ${STATUS_LABEL[audioStatus]}`, audioStatus === 'reviewed_ok' ? 'ok' : 'warn') : null),
      h('p', { class: 'hint' }, TIER_LABEL[ev.tier], '. Strukturální kontroly, redakční kontrola, poslech hlasu a pedagogické schválení jsou čtyři různé věci; tato obrazovka nic z toho nenahrazuje.'),

      h('section', { class: 'panel' },
        h('h2', {}, 'Celý text (jen pro dospělého)'),
        markedText(d), markLegend(),
        h('p', { class: 'hint' }, 'Název se dítěti nediktuje. Správné znění se dítěti během diktování nezobrazuje.')),

      h('section', { class: 'panel' },
        h('h2', {}, 'Vhodnost pro profil'),
        h('p', { class: 'status-line', role: 'status' }, suitable ? badge(`Vhodný – ${MODE_LABEL[effective].toLowerCase()} varianta`, 'ok') : badge('Zatím nevhodný', 'bad'),
          wanted !== effective ? ` Zvolená přísná varianta není možná, text je dostupný jen jako podporovaný.` : ''),
        !suitable ? h('p', { class: 'warn-text' }, 'Chybí: ', missingSummary(ev).join('; '), '.') : null,
        explainTable(ev, { onConfirm: (r) => setProfile(setFeatureState(store.profile, r.feature_id, 'taught')) }),
        d.required_known_forms.length ? h('div', {}, h('h3', {}, 'Požadované konkrétní slovní tvary'),
          h('ul', {}, d.required_known_forms.map((f) => {
            const ok = p.knownForms.includes(f);
            return h('li', {}, `„${f}“ – `, ok ? badge('potvrzeno', 'ok') : badge('nepotvrzeno', 'bad'), ' ',
              ok ? null : h('button', { type: 'button', class: 'btn small', onclick: () => setProfile(setKnownForms(store.profile, [...store.profile.knownForms, f])) }, 'Dítě tento tvar zná'));
          }))) : null,
        g1 ? h('div', {}, h('h3', {}, 'Písmena v textu'), h('p', {}, g1.map((g) => h('span', { class: `letter-chip ${knownG.has(g) ? 'on' : 'off'}` }, `${g} ${knownG.has(g) ? '✓ známé' : '✗ neznámé'}`)))) : null,
        h('h3', {}, 'Předvyplněná místa'),
        prefills.length ? h('ul', {}, prefills.map((s) => h('li', {}, `Věta ${s.sentence_index + 1}: „${s.span}“ – ${s.reason}`))) : h('p', {}, effective === 'supported' ? 'Žádné místo není třeba předvyplnit.' : 'Přísná varianta nic nepředvyplňuje.')),

      h('section', { class: 'panel' },
        h('h2', {}, 'Poznámky a původ'),
        d.learner_profile_note ? h('p', {}, h('strong', {}, 'Potřebný profil: '), d.learner_profile_note) : null,
        d.teacher_note ? h('p', {}, h('strong', {}, 'Poznámka pro dospělého: '), d.teacher_note) : null,
        h('p', {}, h('strong', {}, 'Doporučená varianta v datech: '), d.recommended_mode === 'supported' ? 'podporovaná' : 'přísná po potvrzení profilu'),
        h('p', {}, h('strong', {}, 'Původ textu: '), d.origin, '. ', h('strong', {}, 'Zdroj: '), `balíček „${item.source.pack_id}“, verze textu ${d.version}.`),
        d.curriculum_sources.length ? h('details', {}, h('summary', {}, `Kurikulární zdroje (${d.curriculum_sources.length})`),
          h('p', { class: 'hint' }, 'Doloží jevy a orientační zařazení, nikoli původ vět.'), h('ul', {}, d.curriculum_sources.map((s) => h('li', { class: 'url' }, s.url)))) : null,
        warningsOf(item.issues).length ? h('div', {}, h('h3', {}, 'Varování z automatických kontrol anotací'),
          h('ul', {}, warningsOf(item.issues).map((w) => h('li', {}, w.message))),
          h('p', { class: 'hint' }, 'Heuristiky mohou mít falešné poplachy, ale upozorňují na místa, která mohla v anotaci uniknout. Zkontrolujte je před předáním dítěti.')) : null,
        reviews.state === 'error' ? h('p', { class: 'warn-text' }, `Stav poslechové kontroly nelze zjistit: ${reviews.error}`) : null),

      h('section', { class: 'panel' },
        h('h2', {}, 'Nastavení diktování'),
        h('fieldset', {}, h('legend', {}, 'Varianta'),
          ['strict', 'supported'].map((m) => {
            const ok = m === 'strict' ? ev.strict.eligible : ev.supported.eligible;
            return h('label', { class: 'radio block' }, h('input', { type: 'radio', name: 'pm', checked: effective === m, disabled: !ok && effective !== m, onchange: () => setSelection({ mode: m }) }),
              ` ${MODE_LABEL[m]}${ok ? '' : ' (pro tento profil nedostupná)'}`);
          })),
        h('label', { class: 'field' }, 'Tempo čtení: ',
          h('select', { onchange: (e) => setSettings({ tempo: e.target.value }) }, Object.entries(TEMPOS).map(([k, v]) => h('option', { value: k, selected: store.settings.tempo === k }, `${v.label} (${v.lengthScale})`)))),
        h('label', { class: 'field' }, 'Čas na psaní: ',
          h('select', { onchange: (e) => setSettings({ autoAdvanceSec: Number(e.target.value) }) },
            [0, 10, 20, 30, 45, 60].map((s) => h('option', { value: s, selected: store.settings.autoAdvanceSec === s }, s === 0 ? 'Bez časového limitu – čeká se na tlačítko Další věta (doporučeno)' : `Automaticky pokračovat po ${s} s`)))),
        h('p', { class: 'hint' }, 'Tempo čtení a čas na psaní jsou nezávislá nastavení. Časový limit dítěti nevnucujte, pokud k tomu není důvod.'),
        h('label', { class: 'field check' }, h('input', { type: 'checkbox', checked: store.settings.readPunctuation, onchange: (e) => setSettings({ readPunctuation: e.target.checked }) }),
          ' Nápověda: hlas řekne i názvy interpunkčních znamének (jinak je nečte)')),

      h('section', { class: 'panel handoff' },
        h('h2', {}, 'Předání dítěti'),
        h('label', { class: 'field check' }, h('input', { type: 'checkbox', checked: confirmed, disabled: !suitable || !p.confirmed,
          onchange: (e) => update({ confirmedDictationId: e.target.checked ? d.id : null }) }),
          ' Text jsem celý přečetl(a), odpovídá znalostem dítěte a potvrzuji jeho použití.'),
        !p.confirmed ? h('p', {}, h('button', { type: 'button', class: 'btn', onclick: () => setProfile(confirmProfile(store.profile)) }, 'Potvrdit profil')) : null,
        blockers.length ? h('ul', { class: 'blockers' }, blockers.map((b) => h('li', {}, b))) : null,
        h('button', {
          type: 'button', class: 'btn primary big', 'aria-disabled': blockers.length ? 'true' : 'false',
          onclick: () => {
            if (blockers.length) return;
            update({ run: { dictationId: d.id, mode: effective, prefills } });
            location.hash = `#/dictate/${encodeURIComponent(d.id)}`;
          },
        }, 'Předat dítěti a začít diktát')));
  }

  draw();
  const unsub = subscribe(draw);
  return () => { alive = false; unsub(); };
}

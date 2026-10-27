// Stav aplikace. Profil a nastavení se ukládají do localStorage jen jako pohodlí;
// aplikace funguje i bez něj (soukromé okno, zablokované úložiště).

import { defaultProfile, restoreProfile } from './profile.js';

const KEY = 'diktaty.v1';

export const TEMPOS = {
  normal: { label: 'Normální', lengthScale: 1.0 },
  slow: { label: 'Pomalu', lengthScale: 1.3 },
  veryslow: { label: 'Velmi pomalu', lengthScale: 1.6 },
};

export const defaultSettings = () => ({ tempo: 'normal', autoAdvanceSec: 0, readPunctuation: false });

export const store = {
  taxonomy: null,
  catalog: null,
  health: null,
  profile: null,
  settings: defaultSettings(),
  selection: { mode: 'strict', groupId: '', includeIncidentalTopic: false, onlyApproved: false },
  confirmedDictationId: null, // dospělý potvrdil použití právě tohoto diktátu
  run: null, // právě předaný diktát: { dictationId, mode, prefills } (neukládá se)
  storageOk: true,
  notes: [],
  listeners: new Set(),
};

export const subscribe = (fn) => { store.listeners.add(fn); return () => store.listeners.delete(fn); };
const emit = () => store.listeners.forEach((fn) => fn());

export function loadState(taxonomy) {
  store.taxonomy = taxonomy;
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    store.storageOk = false;
  }
  const restored = restoreProfile(raw?.profile, taxonomy);
  store.notes.push(...restored.notes.filter(() => raw?.profile));
  store.profile = restored.profile ?? defaultProfile(3, taxonomy);
  if (raw?.settings && typeof raw.settings === 'object') {
    const s = raw.settings;
    store.settings = {
      tempo: s.tempo in TEMPOS ? s.tempo : 'normal',
      autoAdvanceSec: [0, 10, 20, 30, 45, 60].includes(s.autoAdvanceSec) ? s.autoAdvanceSec : 0,
      readPunctuation: s.readPunctuation === true,
    };
  }
  if (raw?.selection && typeof raw.selection === 'object') {
    const m = raw.selection;
    store.selection = {
      mode: m.mode === 'supported' ? 'supported' : 'strict',
      groupId: taxonomy.groups.some((g) => g.id === m.groupId) ? m.groupId : '',
      includeIncidentalTopic: m.includeIncidentalTopic === true,
      onlyApproved: m.onlyApproved === true,
    };
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ profile: store.profile, settings: store.settings, selection: store.selection }));
    store.storageOk = true;
  } catch {
    store.storageOk = false;
  }
}

export function update(patch) {
  Object.assign(store, patch);
  if ('profile' in patch && store.confirmedDictationId && !store.profile.confirmed) store.confirmedDictationId = null;
  persist();
  emit();
}

export const setProfile = (profile) => update({ profile });
export const setSettings = (p) => update({ settings: { ...store.settings, ...p } });
export const setSelection = (p) => update({ selection: { ...store.selection, ...p } });

# Licence a původ komponent

Tento záznam **nenahrazuje právní posouzení**. Před jakoukoli distribucí ověřte licence konkrétních verzí.

| Komponenta | Verze | Licence | Stav ověření |
|---|---|---|---|
| Engine Piper (`piper-tts`, [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)) | 1.8.0 (připnuto v `server/requirements.txt`) | **GPL-3.0-or-later** | ověřeno z metadat nainstalovaného balíčku (`License: GPL-3.0-or-later`, soubor `COPYING` v balíčku) |
| `onnxruntime` (závislost) | 1.31.1 | MIT | z metadat balíčku |
| `numpy` (tranzitivní závislost) | 2.5.4 | BSD-3-Clause a další permisivní | z metadat balíčku |
| Hlas `cs_CZ-jirka-medium` (`rhasspy/piper-voices`) | stáhne `fetch_model.py`; otisk v `models/MODEL_LOCK.json` | dataset **CC0** podle zadání / karty modelu | **neověřeno zde** – HuggingFace je ze sandboxu blokován; `fetch_model.py` stáhne `models/MODEL_CARD`, přečtěte ji |
| Kód aplikace (`web/`, `server/`, `scripts/`, `tests/`) | – | **nezvolena** | viz níže |
| Texty diktátů v `data/` | – | původ: návrhy NotebookLM s redakční úpravou; **licence textů nezvolena** | autor/oprávněná osoba musí rozhodnout |

## Poznámky

- Z licence datasetu hlasu (CC0) se **neodvozuje** licence celého balíčku. Model je zvlášť stažený soubor, engine zvlášť.
- Server importuje `piper` jako Python knihovnu ve stejném procesu. Distribuce spojeného díla (aplikace + Piper) tak pravděpodobně podléhá podmínkám GPL-3.0; **osobní použití bez distribuce** je mimo tuto otázku. Před veřejnou distribucí nebo mobilním balíčkem (mimo rozsah první verze) je to třeba vyřešit (např. oddělit službu jako samostatný proces s vlastní licencí, nebo zvolit kompatibilní licenci).
- Kurikulární zdroje v datech (`curriculum_sources`) jsou odkazy dokládající jevy a orientační zařazení; neznamenají oprávnění převzít jejich texty. Texty v knihovně mají být nové.
- Aplikace sama žádné licenční soubory třetích stran nešíří. Až bude potřeba zabalit distribuci, přiložte `COPYING` Piperu a `MODEL_CARD` hlasu.

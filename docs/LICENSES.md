# Licence a původ komponent

Tento záznam **nenahrazuje právní posouzení**. Před jakoukoli distribucí ověřte licence konkrétních verzí.

| Komponenta | Verze | Licence | Stav ověření |
|---|---|---|---|
| Engine Piper (`piper-tts`, [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)) | 1.8.0 (připnuto v `server/requirements.txt`) | **GPL-3.0-or-later** | ověřeno z metadat nainstalovaného balíčku (`License: GPL-3.0-or-later`, soubor `COPYING` v balíčku) |
| `onnxruntime` (závislost) | 1.31.1 | MIT | z metadat balíčku |
| `numpy` (tranzitivní závislost) | 2.5.4 | BSD-3-Clause a další permisivní | z metadat balíčku |
| Hlas `cs_CZ-kasandra-medium` (`rhasspy/piper-voices`, autor Ondřej Šimek) | `.onnx` SHA-256 `09d08aa23691ed2d53fb3db242cfe82b189adf9c1812dd5fe928b5789ed76df7` (63 511 038 B), otisk potvrzen `X-Linked-ETag`; zapsáno v `models/MODEL_LOCK.json` | **CC BY 4.0** podle `MODEL_CARD` (vyžaduje uvedení autora) | `MODEL_CARD` přečtena 2026-10-27: „trained using my own original recordings, and I own the rights to the dataset“. **Neověřeno:** karta neuvádí základní model/checkpoint, ze kterého se trénovalo; stránka autora na HuggingFace (`ondrazarici/Cassandra-Kasandra-piper-cz`) licenci v metadatech neuvádí a nabízí placený balíček „včetně licenčních podmínek“ – rozpor s kartou je třeba vyjasnit s autorem. Není to právní posouzení |
| Hlas `cs_CZ-jirka-medium` — **vyřazen z licenčních důvodů, ne kvůli kvalitě** | – | karta: dataset CC0, „Finetuned from U.S. English lessac voice“ | Lessac model vznikl z dat Blizzard 2013 (Lessac Technologies / Voice Factory), která jsou licencována **jen pro výzkumné účely**; licence vylučuje komerční účely včetně vývoje produktů syntézy řeči a je osobní pro registrovaného držitele. Zda se vztahuje i na model dotrénovaný z lessac checkpointu, nelze z dostupných zdrojů rozhodnout. Dataset uvedený v kartě (`OHF-Voice/voice-datasets`) navíc česky neobsahuje žádný záznam (README ani složky, kontrola 2026-10-27), takže CC0 pro český dataset se tam nepodařilo potvrdit |
| Kód aplikace (`web/`, `server/`, `scripts/`, `tests/`) | – | **nezvolena** | viz níže |
| Texty diktátů v `data/` | – | původ: návrhy NotebookLM s redakční úpravou; **licence textů nezvolena** | autor/oprávněná osoba musí rozhodnout |

## Poznámky

- Z licence hlasu (CC BY 4.0 podle karty; vyžaduje uvedení autora Ondřeje Šimka) se **neodvozuje** licence celého balíčku. Model je zvlášť stažený soubor, engine zvlášť.
- Server importuje `piper` jako Python knihovnu ve stejném procesu. Distribuce spojeného díla (aplikace + Piper) tak pravděpodobně podléhá podmínkám GPL-3.0; **osobní použití bez distribuce** je mimo tuto otázku. Před veřejnou distribucí nebo mobilním balíčkem (mimo rozsah první verze) je to třeba vyřešit (např. oddělit službu jako samostatný proces s vlastní licencí, nebo zvolit kompatibilní licenci).
- Kurikulární zdroje v datech (`curriculum_sources`) jsou odkazy dokládající jevy a orientační zařazení; neznamenají oprávnění převzít jejich texty. Texty v knihovně mají být nové.
- Aplikace sama žádné licenční soubory třetích stran nešíří. Až bude potřeba zabalit distribuci, přiložte `COPYING` Piperu a `MODEL_CARD` hlasu.

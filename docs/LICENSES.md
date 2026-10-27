# Licence a původ komponent

Tento záznam **nenahrazuje právní posouzení**. Před jakoukoli distribucí ověřte licence konkrétních verzí.

| Komponenta | Verze | Licence | Stav ověření |
|---|---|---|---|
| Engine Piper (`piper-tts`, [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)) | 1.8.0 (připnuto v `server/requirements.txt`) | **GPL-3.0-or-later** | ověřeno z metadat nainstalovaného balíčku (`License: GPL-3.0-or-later`, soubor `COPYING` v balíčku) |
| `onnxruntime` (závislost) | 1.31.1 | MIT | z metadat balíčku |
| `numpy` (tranzitivní závislost) | 2.5.4 | BSD-3-Clause a další permisivní | z metadat balíčku |
| Hlas `cs_CZ-jirka-medium` (`rhasspy/piper-voices`, commit `5041a7a49ae5b3a0f30e6837769eb03fdbb231bd`) | `.onnx` SHA-256 `cbd5c900acacc8e8cbecd64347abb8de39c00a9d3104bed06fee92e4f319efc8` (63 201 294 B), `.onnx.json` SHA-256 `fb38b1799b7354808227c065efa97b1ffa2b0cde59505babb56a36d35af9c637`; zapsáno v `models/MODEL_LOCK.json` | dataset **CC0** podle `MODEL_CARD` (dataset: <https://github.com/OHF-Voice/voice-datasets>) | **přečteno z `MODEL_CARD` stažené 2026-10-27**, otisk `.onnx` potvrzen hlavičkou `X-Linked-ETag` serveru. Karta také uvádí „Finetuned from U.S. English lessac voice (medium quality)“; **licence tohoto výchozího hlasu/datasetu karta neuvádí a nebyla ověřena** |
| Kód aplikace (`web/`, `server/`, `scripts/`, `tests/`) | – | **nezvolena** | viz níže |
| Texty diktátů v `data/` | – | původ: návrhy NotebookLM s redakční úpravou; **licence textů nezvolena** | autor/oprávněná osoba musí rozhodnout |

## Poznámky

- Z licence datasetu hlasu (CC0) se **neodvozuje** licence celého balíčku. Model je zvlášť stažený soubor, engine zvlášť.
- Server importuje `piper` jako Python knihovnu ve stejném procesu. Distribuce spojeného díla (aplikace + Piper) tak pravděpodobně podléhá podmínkám GPL-3.0; **osobní použití bez distribuce** je mimo tuto otázku. Před veřejnou distribucí nebo mobilním balíčkem (mimo rozsah první verze) je to třeba vyřešit (např. oddělit službu jako samostatný proces s vlastní licencí, nebo zvolit kompatibilní licenci).
- Kurikulární zdroje v datech (`curriculum_sources`) jsou odkazy dokládající jevy a orientační zařazení; neznamenají oprávnění převzít jejich texty. Texty v knihovně mají být nové.
- Aplikace sama žádné licenční soubory třetích stran nešíří. Až bude potřeba zabalit distribuci, přiložte `COPYING` Piperu a `MODEL_CARD` hlasu.

# Diktáty

Lokální webová aplikace pro **české diktáty**. Rodič nebo učitel vybere text podle ročníku nebo pravopisného okruhu, upraví, co dítě skutečně probralo, a aplikace diktát **předčítá po větách** lokálním hlasem (Piper, `cs_CZ-jirka-medium`). Dítě píše na papír; správné znění se ukáže až po dokončení. Po jednorázovém stažení hlasu běží bez internetu.

> **Stav: první verze, demonstrační knihovna.** Deset textů je *kontrolovaný návrh*, ne schválená položka. Kvalita hlasu pro diktáty a pedagogická vhodnost textů **nebyly ověřeny** (viz [Co je a není ověřeno](#co-je-a-není-ověřeno)).

## Rychlý start

Potřebujete Python ≥ 3.9 a prohlížeč. (Node 20+ je potřeba jen pro testy.)

```bash
python3 -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
python3 -m pip install -r server/requirements.txt       # Piper (GPL-3.0-or-later), jen to
python3 server/fetch_model.py                           # JEDINÝ krok s internetem: stáhne hlas (vysvětlí a zeptá se)
python3 server/diktaty_server.py                        # otevře http://127.0.0.1:8765/
```

- Bez modelu se aplikace spustí, ale předčítání je nedostupné a srozumitelně to hlásí (banner + stránka **Stav**). Nikdy se nepřepne na jiný hlas ani na vzdálenou službu.
- Server poslouchá **jen na 127.0.0.1** (nelze změnit), odmítá cizí hlavičky `Host`/`Origin`.
- Ověřeno: instalace `piper-tts==1.8.0` přes pip a jeho Python API na Linuxu x86-64. **Neověřeno:** instalace na macOS/Windows a samotné stažení modelu (síť sandboxu blokuje HuggingFace).

## Jak se používá

1. **Výběr diktátu** – zvolte ročník. Nabídne se *výchozí profil*, který je jen orientační doporučení. Upravte stavy **zatím neprobráno / probráno / zvládnuto**, u nejmladších dětí známá písmena (přesně: a ≠ á, m ≠ M, podle druhu písma), případně konkrétní známé slovní tvary (např. „film“). Profil **potvrďte**.
2. Zvolte variantu a okruh:
   - **Přísná** – dítě samostatně píše jen to, co má potvrzené (jevy nebo konkrétní slovní tvary).
   - **Podporovaná** – přesně určená neprobraná místa jsou předvyplněná a dítě je samostatně nepíše.
3. **Příprava pro dospělého** – celý text, cílové i vedlejší jevy, tabulka „co text vyžaduje × co je v profilu“, předvyplněná místa, stav kontroly. Dospělý **potvrdí** použití textu.
4. **Dítě**: ověření zvuku → celý text přirozeným tempem → po větách tlačítky **Přehrát · Zopakovat · Další věta · Pozastavit** (+ Předchozí věta, Ukončit, „Věta 2 ze 4“). Ovládání funguje klávesnicí, vše je popsáno textem. Čeká se na tlačítko; časový limit je jen volba dospělého.
5. **Řešení** – správné znění a cílová místa (tučně + podtržení, ne jen barva). Nic se neznámkuje.

Další obrazovky: **Knihovna** (přehled, kontroly, pokrytí jevů, import balíčku JSON), **Poslechová kontrola** (poslech každého textu normálně i zpomaleně, záznam výsledků), **Stav** (hlas, licence).

## Ověření bez sítě

- **Aplikace a server (bez hlasu)** – `scripts/offline_e2e.sh` (Linux) spustí server a celý e2e test v síťovém jmenném prostoru jen s loopbackem. Hlas tam podstrkuje testovací harness; ověřuje se aplikace, ne řeč.
- **Se skutečným hlasem (na vašem stroji, po stažení modelu)**: odpojte Wi-Fi/kabel a spusťte
  `python3 scripts/generate_audio.py --require-offline`.
  Skript odmítne běžet, dokud je síť dostupná nebo je nastavena proxy (heuristika: DNS + TCP ven + proměnné `*_PROXY`), vygeneruje zvuk všech vět normálně i zpomaleně přesně pod klíči, které použije aplikace, a změří rychlost do `user_data/audio-generation-report.json`.
- Aplikace nenačítá nic zvenčí (CSP `default-src 'none'`, e2e test hlídá, že nevznikl žádný požadavek mimo 127.0.0.1).

## Rozšíření knihovny a schvalování

Viz [`docs/LIBRARY.md`](docs/LIBRARY.md): formát balíčku, `npm run validate -- balicek.json`, import v aplikaci a **postup, jak se kandidát stane schválenou položkou** (strukturální kontrola → redakční kontrola → poslech → pedagogické schválení; čtyři různé věci, nic se nenastavuje automaticky).

## Struktura

```
data/dictations.seed.json   první sada 10 textů (kandidáti)      data/profiles.json   taxonomie jevů, výchozí politika profilu
data/source/                původní návrh NotebookLM a validace   web/                 aplikace (vanilla JS, bez závislostí)
server/                     lokální server, TTS služba, fetch_model.py
scripts/                    validate-data.mjs, generate_audio.py, offline_e2e.sh
tests/                      js/ (node:test), py/ (unittest), e2e/ (Playwright)
docs/                       LIBRARY, LICENSES, EDITORIAL_NOTES, HANDOFF_PROMPT, TESTLOG
user_data/ models/ cache/   lokální data (necommitují se)
```

Hlasový text se odvozuje z **téhož kanonického znění** jako správné řešení (`tts_segments` se při validaci musí shodovat s `text`). Mezipaměť WAV je klíčovaná verzí textu (SHA-256), modelem (SHA-256), tempem, segmentací a nápovědou; úprava textu staré audio smaže, výměna modelu se hlásí a staré audio jiného hlasu se nepoužije.

## Testy

```bash
npm test                          # JS: schéma, výběr, přehrávač, katalog  (node ≥ 20, bez závislostí)
npm run test:py                   # Python: TTS služba, server, fetch_model (s nainstalovaným piper-tts navíc 2 testy proti skutečnému Piperu)
node tests/e2e/e2e.mjs            # prohlížeč (Playwright + Chromium musí být dostupné); hlas = testovací harness
npm run validate                  # strukturální kontrola dat
```

Záznam skutečně provedených testů a jejich omezení: [`docs/TESTLOG.md`](docs/TESTLOG.md).

## Co je a není ověřeno

| Oblast | Stav |
|---|---|
| Strukturální kontroly dat (formát, offsety, SHA-256, segmenty = řešení) | automaticky, projde |
| Výběr podle profilu, přehrávač, cache, chybové stavy, import | automatické testy |
| Redakční kontrola | provedla ji pouze AI (asistent); poznámky v [`docs/EDITORIAL_NOTES.md`](docs/EDITORIAL_NOTES.md) |
| Pedagogické schválení učitelem | **žádné** (`teacher_approved: false` u všech) |
| Kvalita a výslovnost hlasu, rychlost na vašem stroji | **neověřeno** – vyžaduje model a poslech |
| Výchozí profily ročníků | **provizorní** (viz níže) |

### Rozhodnutí, o kterých byste měli vědět

- **Výchozí profil je provizorní.** NotebookLM (poznámka „Podklad pro aplikaci“) nebyl v této relaci dostupný, a tak `typical_grade` a `default_policy` v `data/profiles.json` sestavil asistent z poznámek v seed datech. Ročník předpokládá jen základní pravopis (délky, ú/ů, dě/tě/ně, znělost…) z *předchozích* ročníků; vše ostatní (vyjmenovaná slova, vzory, shoda, čárky, předpony, vlastní jména) vždy potvrzuje dospělý. Nahraďte po redakční kontrole.
- **Okruh** filtruje podle *cílových* jevů a vedlejší požadavky se dál kontrolují; volitelně lze zahrnout i texty, kde je okruh jen vedlejší.
- Neúplná anotace text neskrývá, ale vyžaduje kontrolu dospělým; do „schváleného katalogu“ nikdy nepronikne.
- Vedlejší jevy stačí mít „probrané“ (přepínač: „zvládnuté“). Konkrétní známý slovní tvar pokryje jen pravopisné jevy vázané na slovo, ne interpunkci ani hranice vět.
- Licence aplikace nebyla zvolena (viz [`docs/LICENSES.md`](docs/LICENSES.md)).

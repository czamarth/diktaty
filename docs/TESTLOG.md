# Záznam provedených testů

Datum: 2026-10-27 · Prostředí: cloudový kontejner (Linux 6.18, x86-64), Node v22.22.0, Python 3.13.17, `piper-tts` 1.8.0, `onnxruntime` 1.31.1, Playwright + Chromium (předinstalované).
Čtyři vrstvy kontroly jsou vedeny **odděleně**. Vše níže je skutečně spuštěno; co se nespustilo, je v části 5.

## 1. Automatické strukturální kontroly dat — PROŠLO

`npm run validate` (`scripts/validate-data.mjs`, stejný kód jako import v aplikaci): **10 z 10 diktátů bez chyb**, 5 varování:

| Varování | Kde | Význam |
|---|---|---|
| `annotation_nested` | D01 (`má` v `mák`), D02 (`úl` v `úlu`), D07 (`zhlédl` ve `vzhlédl`) | zbytečné vnořené anotace v seedu (seed neměněn) |
| `possible_unannotated_iy` | D09 „silně“, D10 „bylo“ | i/y po obojetné souhlásce bez jakékoli anotace → anotace je opravdu neúplná |

Kontroluje: schéma a enumy, NFC, věty (3–5, koncová interpunkce), `text` = věty spojené mezerou, počty, **SHA-256**, `tts_segments` dohromady = `text`, speakable znaky (žádné `[[ ]]`, HTML, markdown), offsety anotací v kódových bodech, jednoznačnost předvyplnění, přesnou shodu požadovaných tvarů, seznam grafémů pro 1. třídu, konzistenci `teacher_approved`/`review_status`/`approval`/`annotation_completeness`.
Akceptace knihovny (test): právě 10 unikátních diktátů, 3–5 vět, ročníky 1,2,2,3,4,5,6,7,8,9, 31 vět, žádný není schválený.

## 2. Automatické testy kódu

| Sada | Příkaz | Výsledek |
|---|---|---|
| JS (schéma, profil, výběr, přehrávač, katalog/import) | `npm test` | **68/68** |
| Python (TTS služba, HTTP server, fetch_model) s `piper-tts` | `npm run test:py` | **49/49** |
| Python bez `piper-tts` | `python3 -m unittest discover -s tests/py` | 49, **2 přeskočeny** (testy proti skutečnému Piperu), 0 chyb |
| E2E v Chromiu proti skutečnému serveru | `node tests/e2e/e2e.mjs` | **25/25** kroků |
| E2E bez sítě (jmenný prostor jen s `lo`, bez proxy) | `scripts/offline_e2e.sh` | **25/25**; spojení ven ověřeně nedostupné |

Pokryté chování z akceptačních kritérií (výběr):
- nepotvrzené vyjmenované slovo po B vyřadí D04 z přísné varianty, potvrzení jej zpřístupní; potvrzená podpora zpřístupní D03 (předvyplněno „slabý“); konkrétní potvrzený tvar „slabý“ i potvrzená koncovka zpřístupní přísnou variantu;
- **ryba / lyže / hrály** jsou tři různé jevy (`hard_consonants_basic`, `listed_words_l`, `agreement_simple_plural`): znalost jednoho nezpřístupní zbylé dva; minulý čas se plošně nevyřazuje (D07 vyřadí jen chybějící `past_singular`);
- 1. třída: neznámý grafém text vyřadí; a ≠ á, m ≠ M; písmo (hůlkové ≠ psací) se rozlišuje; „ch“ je jedno písmeno;
- okruh filtruje podle cílových jevů a vedlejší požadavky dál kontroluje;
- neúplná anotace / chybějící učitel → nikdy do „schváleného katalogu“; schválená úplná položka projde;
- přehrávač (dvojníci zvuku, řízené asynchronní odpovědi): jediný audio element, žádné souběžné přehrávání, rychlé klikání, pozdní odpověď po změně diktátu / pauze / ukončení nic nespustí, pauza zastaví skutečně hrající zvuk, čekání na „Další věta“, nezávislé tempo a volitelný automatický postup;
- cache: klíč = verze textu + model + tempo + segmentace + nápověda; úprava textu staré audio smaže a nikdy nevrátí; změna modelu se hlásí a staré audio jiného hlasu se nepoužije; souběžné shodné požadavky = jedna syntéza; model se načte jednou;
- chybové stavy: chybí engine / model, poškozený model (skutečný Piper), nečeský model, jiný soubor modelu než v zámku, poškozený balíček, poškozený soubor v úložišti, vadný import; žádný náhradní hlas;
- bezpečnost lokální služby: jen 127.0.0.1, cizí `Host`/`Origin` → 403, path traversal → 404, whitelist dat, limity těla, CSP.
- e2e navíc: žádné „null“ v textu, správné znění se během diktování nezobrazí (ani název), předvyplněné slovo jen u své věty, dětská obrazovka nejde otevřít bez potvrzení dospělého a řešení bez dokončení, klávesnice (Tab/Enter/mezerník), mobilní šířka (390 px) bez vodorovného posunu – jen úvodní obrazovka, dětská obrazovka na mobilu netestována, import (vadný/platný/odebrání), poslechová kontrola nikdy sama nenastaví „v pořádku“, **žádný požadavek mimo 127.0.0.1**, **žádné chyby ani varování v konzoli (včetně CSP)**.

### Mutační kontrola (testy skutečně něco hlídají)
Záměrně rozbito → testy zčervenaly: (M1) zahazování pozdní odpovědi přehrávače, (M2) zneplatnění audio po úpravě textu, (M3) kontrola vedlejších jevů, (M4) kontrola SHA-256. **(M5)** vypnutí explicitní kontroly `[[ ]]` testy nezachytily – jde o ekvivalentní mutant (znaky `[` `]` odmítne už seznam povolených znaků; explicitní kontrola je druhá vrstva).

### Chyby, které testy odhalily při vývoji (opraveny)
1. Nativní `append()` vypisoval „null“ a „[object …]“ – centrální oprava v `clear()`.
2. Dětská obrazovka i řešení spadly na `Cannot access 'btn' before initialization` (zpětné volání přehrávače se spustilo během `load()`).
3. Server po odmítnutí požadavku (413/415) nepřečetl tělo a nezavřel keep-alive spojení → nyní `Connection: close`.
4. `fetch_model.py` bez nainstalovaného Piperu nevalidoval model (kontrola enginu předcházela kontrole souborů) → rozdělena na `validate_model_files()`.
5. Kontrola sítě ve `generate_audio.py` hlásila „odpojeno“ i přes proxy → přidána detekce proxy.
6. `/sys/class/net` ve výpisu `offline_e2e.sh` ukazoval rozhraní hostitele → nahrazeno `/proc/net/dev`.

## 3. Redakční kontrola

Provedl pouze asistent (AI); výsledky a nejistoty: [`EDITORIAL_NOTES.md`](EDITORIAL_NOTES.md). **Není to kontrola učitele.** Hlavní zjištění: 14 ze 70 slov s i/y nemá žádnou anotaci, z toho „bylo“ (D10, vyjmenované slovo po B) a „silně“ (D09) jsou skutečná rozhodovací místa.

## 4. Poslech hlasu a pedagogické schválení — NEPROVEDENO

- **Poslech hlasu: neproběhl.** Model `cs_CZ-jirka-medium` se v tomto prostředí nepodařilo stáhnout (HuggingFace: `CONNECT tunnel failed, response 403`; GitHub: 403; PyPI dostupné). Nebylo vygenerováno ani jedno WAV skutečným hlasem, neměřena rychlost (RTF), nevyslechnuty délky samohlásek, di/ti/ni, dě/tě/ně, bě/pě/vě/mě, vlastní jména, souhláskové skupiny ani členění podle interpunkce. Postup: [`HANDOFF_PROMPT.md`](HANDOFF_PROMPT.md) a `scripts/generate_audio.py`.
- **Pedagogické schválení: neproběhlo.** U všech 10 textů `teacher_approved: false`, `annotation_completeness: partial`, `audio_review_status: not_generated`.

## 5. Co nebylo ověřeno (souhrn)

- Skutečné stažení modelu (`fetch_model.py` testován jen proti místním souborům přes `file://`; ověření otisku proti hlavičce serveru `X-Linked-ETag` je naprogramováno, ale nevyzkoušeno na reálném serveru).
- Instalace `piper-tts` a běh na macOS/Windows (ověřeno jen Linux x86-64, Python 3.13).
- Kvalita, výslovnost a rychlost hlasu; provoz **se skutečným hlasem** bez sítě. E2E „bez sítě“ ověřuje aplikaci a server, hlas v něm podstrkuje testovací harness (syntetický tón) — to je v testu výslovně označeno.
- Prohlížeče kromě Chromia; čtečky obrazovky (jen sémantika a `aria-*`, žádný test se skutečnou čtečkou); automatický postup po větách v Safari (omezení autoplay).
- Výchozí profily ročníků jsou provizorní (nepocházejí z NotebookLM ani ze školních plánů).
- NotebookLM přes MCP: v relaci nebyl dostupný žádný nástroj; použita byla dodaná data.

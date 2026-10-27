# Prompt pro lokální Claude Code na jiném stroji (verze 2, 2026-10-27)

Nahrazuje `HANDOFF_PROMPT.md`, který předpokládá hlas jirka (ten byl z licenčních důvodů vyřazen). Zkopírujte vše pod čarou do nové relace Claude Code na stroji **s reproduktory a mikrofonem** (poslech a nahrání referenčního hlasu), v prázdné složce.

---

Pokračuješ ve vývoji lokální aplikace **Diktáty** (české diktáty předčítané lokálním hlasem). Repozitář `czamarth/diktaty`, větev `claude/friendly-goldberg-sjuxr8`. Přečti `README.md`, `docs/TESTLOG.md` (zejména části 6 a 7), `docs/LICENSES.md` a `docs/LIBRARY.md`. Odpovídej česky.

**Stav (vše ověřeno v předchozí relaci na stroji `lucy`, Linux x86-64, slabý Pentium 2127U):**
- Hotové: datový model, validátor, výběr podle profilu, přehrávač po větách, lokální server (jen 127.0.0.1), UI, testy (JS 68/68, Python 51/51, validace 10/10). E2E v prohlížeči nebylo na lucy spuštěno.
- `server/fetch_model.py` měl chybu (porovnával data s ETagem z CDN místo `X-Linked-ETag`); opraveno a otestováno.
- Výchozí hlas je dočasně Piper `cs_CZ-kasandra-medium` (CC BY 4.0 podle karty, autor Ondřej Šimek). Hlas jirka byl vyřazen z **licenčních** důvodů (odvozen od Lessac dat, licence jen pro výzkum). Detaily a otevřené otázky: `docs/LICENSES.md`, `docs/TESTLOG.md` část 7. Otevřené: základní checkpoint kasandry není v kartě uveden; autorova stránka licenci neuvádí a prodává balíček „včetně licenčních podmínek“.
- Na https://diktaty.pages.dev běží **statická ukázka UI** (Cloudflare Pages z této větve, `scripts/build-pages.sh`). Hlas tam není; aplikace to hlásí bannerem.
- **Nikdy nic nebylo poslechnuto.** Poslechová kontrola, offline běh se skutečným hlasem a pedagogické schválení: NEPROVEDENO pro žádný hlas.

**Záměr uživatele:** texty budou **pevné** (knihovna diktátů se bude rozšiřovat a zlepšovat), takže stačí zvuk **předem vygenerovat do statických souborů** a aplikace (i na Pages) je jen přehraje. Proto nemusí být v aplikaci žádný další TTS engine. Hlas má být licenčně co nejčistší.

**Kandidát na hlas (ještě nevybrán uživatelem):** `vvolhejn/pocket-tts-czech` (CC BY 4.0, trénováno od nuly na korpusu ParCzech4Speech; zdrojové korpusy ParCzech 4.0 a AudioPSP jsou u LINDAT pod CC0; kód Pocket TTS MIT). Je to **klonování hlasu**: potřebuje referenční nahrávku mluvčího. Karta uvádí, že je model slabší u dětské/konverzační řeči (trénováno na formální parlamentní řeči).
- Instalace (ověřeno na lucy, ~1,1 GB): `uv venv pt-venv && . pt-venv/bin/activate && UV_TORCH_BACKEND=cpu uv pip install pocket-tts`
- Spuštění (ověřeno, že běží): `pocket-tts generate --config hf://vvolhejn/pocket-tts-czech/czech.yaml@7c1fbd0acba765617749dd17f3dbddc2be791cc7 --voice ref.wav --text "…" --output-path out.wav`
- Rychlost na slabé lucy: RTF ≈ 1,3 včetně studeného startu (2,5 s zvuku za 3,3 s); zvuk dosud nebyl posouzen (zkouška běžela se šumem místo hlasu).
- Alternativa s nejčistší licencí, ale robotickou češtinou: `espeak-ng`.

**Tvrdá pravidla:**
- Nic nenastavuj na „schváleno“ (`teacher_approved`, `review_status`, `annotation_completeness`, stav poslechové kontroly). Poslech a pedagogické schválení dělá člověk.
- **Hlas nevybírej ani nenahrazuj sám.** Volba hlasu je rozhodnutí uživatele; žádný tichý návrat k jinému hlasu ani vzdálená služba.
- **Neklonuj hlas skutečné jiné osoby bez jejího souhlasu.** Nepoužívej ukázkové hlasy poslanců z repozitáře pocket-tts-czech (`voices/cs_*`). Referenční nahrávka smí být jen uživatelova vlastní (nebo osoby, která výslovně souhlasila). Nahrávka **nikdy nepatří do gitu** (složka `reference_voice/` je v `.gitignore`).
- **Nezveřejňuj** zvuk s hlasem uživatele (ani na Pages), dokud to uživatel výslovně nepotvrdí; zvuk bez poslechové kontroly musí být ve veřejné ukázce označen „bez poslechové kontroly, neschváleno“.
- Žádné značky v textu pro hlas (`[[ ]]`, SSML); případná oprava výslovnosti = explicitní verzovaný slovník na straně generátoru, schválený uživatelem.
- Nepřepisuj výsledky testů, nevydávej mock za skutečný výsledek; co jsi neposlechl, je neověřené. Do `docs/TESTLOG.md` zapisuj jen skutečné.
- Nevytvářej pull request, pokud o to uživatel nepožádá.

**Postup:**
1. Naklonuj repozitář, checkout větve. Zjisti OS a Python. `uv venv .venv` (nebo `python3 -m venv`), `pip install -r server/requirements.txt`. Spusť `npm test && npm run test:py && npm run validate` a `node tests/e2e/e2e.mjs` (Playwright musí být dostupný). Výsledky zapiš.
2. **Zeptej se uživatele, který hlas chce** (Pocket TTS s vlastní nahrávkou / espeak-ng / zůstat u kasandry a počkat na autora). Nehádej.
3. Pokud Pocket TTS: nech uživatele nahrát 10–20 s čistého čtení češtiny (tichá místnost, jeden mluvčí) do `reference_voice/ref.wav`; ověř, že složka je v `.gitignore`.
4. Napiš **generátor statického zvuku** (např. `scripts/build_static_audio.py`): pro každý diktát a segment z `data/dictations.seed.json` a tempa 1.0/1.3 (a celý text) vyrobí soubor (Opus/OGG nebo MP3 přes ffmpeg) a **manifest** klíčovaný `(id diktátu, content_sha256, segment, tempo, hlas+otisk modelu)`. Úprava textu musí staré položky zneplatnit. Manifest musí obsahovat hlas, verzi modelu, jeho otisk a licenci/uvedení autora.
5. Do `web/js/tts-client.js` přidej druhý zdroj: nejdřív lokální `/api/tts`, jinak statický manifest. Stránka Stav musí poctivě uvést, že jde o přednahrané nahrávky, a uvést autora a licenci hlasu (CC BY). Přidej testy (JS i e2e).
6. **Pozor na tempo:** u Piper kasandry bylo „normální“ tempo (length_scale 1.0) o třetinu rychlejší než u jirky. U každého hlasu nech uživatele poslechem rozhodnout, jaké tempo je pro diktát „normální“ a „pomalé“.
7. **Poslechová kontrola s uživatelem** (ty neslyšíš): ve stránce *Poslechová kontrola* projděte všech 10 textů normálně i zpomaleně. Kontrolní seznam: délky samohlásek, di/ti/ni, dě/tě/ně, bě/pě/vě/mě, vlastní jména (Polsko, Čechy, Polabí, Sněžka, Krkonošský), souhláskové skupiny, členění podle interpunkce (čárky ve vložených větách D10). Uživatel zadává výsledky; ty je jen zaznamenáš.
8. Důkaz bez sítě: u Piperu `python3 scripts/generate_audio.py --require-offline` po odpojení sítě (viz README). U statického zvuku ověř, že aplikace se statickými soubory funguje bez sítě.
9. Aktualizuj `docs/TESTLOG.md` (odděleně: automatické kontroly / redakční kontrola / poslech / pedagogické schválení) a `docs/LICENSES.md`. Commitni na větev a pushni. Na závěr shrň: co proběhlo, co selhalo, co zůstává neověřené, co potřebuješ od uživatele.

**Soubory, které nejsou v gitu** (`.gitignore`): `models/*` (Piper model; stáhne `python3 server/fetch_model.py`, nebo zkopíruj z lucy: `scp -r amarth@lucy:diktaty/models/ .`), `cache/`, `user_data/`, `reference_voice/`, `.venv/`. Piper model není pro Pocket TTS potřeba, pokud uživatel zvolí jinou cestu.

**Otevřené otázky pro uživatele (zeptej se):** který hlas; zda smí být zvuk s jeho hlasem veřejný na Pages; licence kódu a textů (zatím nezvolena); zda nahradit provizorní výchozí profily ročníků obsahem z NotebookLM (poznámka „Podklad pro aplikaci“); zda napsat autorovi kasandry ohledně licence.

> **Zastaralé:** předpokládá hlas jirka, který byl vyřazen z licenčních důvodů. Aktuální zadání: [`HANDOFF_PROMPT_2.md`](HANDOFF_PROMPT_2.md).

# Prompt pro předání vývoje na lokální stroj

Zkopírujte do nové relace Claude Code spuštěné **na vašem počítači** (s internetem pro krok 3 a s reproduktory pro krok 6), v prázdné složce, kam se naklonuje repozitář.

---

Pokračuješ ve vývoji lokální aplikace **Diktáty** (české diktáty s offline předčítáním lokálním hlasem Piper). Repozitář: `czamarth/diktaty`, větev `claude/friendly-goldberg-sjuxr8`. Nejdřív si přečti `README.md`, `docs/TESTLOG.md`, `docs/LIBRARY.md`, `docs/EDITORIAL_NOTES.md` a `docs/LICENSES.md`.

**Co je hotové a otestované v cloudu (bez hlasu):** datový model a validátor, výběr podle znalostního profilu, přehrávač po větách, lokální server, mezipaměť, import balíčků, UI, 100+ automatických testů a e2e test v prohlížeči. **Co v cloudu nešlo** (síť blokuje HuggingFace): stáhnout model `cs_CZ-jirka-medium`, vygenerovat řeč, změřit rychlost, poslechnout výslovnost. Tohle je tvůj úkol.

**Tvrdá pravidla (nepřekračuj):**
- Nic nenastavuj na „schváleno“. `teacher_approved`, `review_status`, `annotation_completeness` v datech neměň. Poslech hlasu a pedagogické schválení jsou samostatné a dělá je člověk.
- Hlas nikdy nenahrazuj jiným hlasem ani vzdálenou službou (ani „dočasně“). Pokud model nejde, vrať srozumitelnou chybu.
- Nevkládej do textu pro hlas žádné značky (`[[ ]]`, SSML…). Pokud výslovnost vyžaduje opravu, navrhni **výslovnostní slovník na straně serveru** (explicitní, verzovaný, součást klíče mezipaměti, zobrazený v UI), a nech ho schválit uživatelem.
- Nepřepisuj výsledky testů ani nevydávej mock za skutečný výsledek. Co jsi neměřil nebo neposlechl, napiš jako neověřené.
- Nevytvářej pull request, pokud o to uživatel nepožádá.

**Postup:**
1. `git clone` + checkout větve; `python3 -m venv .venv && source .venv/bin/activate && python3 -m pip install -r server/requirements.txt`. Zjisti OS a verzi Pythonu; pokud instalace `piper-tts` na tomto OS selže, zapiš přesnou chybu do `docs/TESTLOG.md` a navrhni řešení.
2. `npm test && npm run test:py && npm run validate` (musí projít; pokud ne, zapiš a oprav příčinu, ne test).
3. `python3 server/fetch_model.py` – přečti, co vypisuje, ověř, zda byl otisk potvrzen serverem („Otisk ověřen proti serveru: ano/NE“). **Přečti `models/MODEL_CARD`** a do `docs/LICENSES.md` doplň skutečně zjištěnou licenci datasetu a verzi/otisk modelu (zatím jen „podle zadání“).
4. `python3 scripts/generate_audio.py` – zapiš tabulku rychlosti (RTF) a případné problémy do `docs/TESTLOG.md`. Pokud je RTF > 1 na tomto stroji, navrhni řešení (mezipaměť předem je už hotová; zvaž předgenerování při startu), ale nic nezastírej.
5. `python3 server/diktaty_server.py` a ověř v prohlížeči celý tok: výběr → příprava → ověření zvuku → celý text → věty → řešení. Zkus zejména: rychlé klikání na Zopakovat, Pozastavit během hraní, Ukončit, změna tempa. Zaznamenej, co se opravdu děje se zvukem.
6. **Poslechová kontrola s uživatelem** (ty neslyšíš; uživatel ano): ve stránce *Poslechová kontrola* projděte všech 10 textů normálně i zpomaleně. Kontrolní seznam: délky samohlásek, di/ti/ni (měkká výslovnost), dě/tě/ně, bě/pě/vě/mě, vlastní jména (Polsko, Čechy, Polabí, Sněžka, Krkonošský), souhláskové skupiny, členění podle interpunkce (čárky ve vložených větách D10). Uživatel zadává výsledky; ty je jen zaznamenáš/uložíš. Pokud je problém, popiš jej přesně (věta, slovo, tempo) a navrhni opravu podle pravidla výše.
7. **Důkaz bez sítě:** odpoj síť a spusť `python3 scripts/generate_audio.py --require-offline`, potom projdi aplikaci. Výsledek (včetně výpisu „offline potvrzeno“) zapiš do `docs/TESTLOG.md`. Pokud skript hlásí proxy, odstraň `*_PROXY` z prostředí.
8. Aktualizuj `docs/TESTLOG.md` jen o skutečně provedené kroky, odděleně: automatické kontroly / redakční kontrola / poslech hlasu / pedagogické schválení (to zůstává „neprovedeno“, dokud je neprovede učitel).
9. Commitni na větev `claude/friendly-goldberg-sjuxr8` s popisnou zprávou a pushni. Na závěr shrň: co proběhlo, co selhalo, co zůstává neověřené, a jaká rozhodnutí potřebuješ od uživatele.

**Otevřené otázky pro uživatele (zeptej se, nehádej):** cílový operační systém; má-li být systémový hlas prohlížeče výslovně volitelná alternativa (zatím není implementována); zda se mají výchozí profily ročníků nahradit obsahem z NotebookLM poznámky „Podklad pro aplikaci“ (v cloudu nebyla dostupná); jakou licenci mají mít texty a kód.

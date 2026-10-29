# Knihovna: formát balíčku, rozšíření a schvalování

## Principy

- Texty musí být **nové**. Kurikulární citace (`curriculum_sources`) dokládají jevy a orientační zařazení, **ne původ vět**. Přístup k textu cizího katalogu neznamená oprávnění jej převzít.
- NotebookLM slouží k *návrhu* textů a odůvodnění profilů. Jeho výstup projde redakční kontrolou a uloží se jako verzovaná data. Aplikace nepotřebuje přihlášení do NotebookLM a **dětské odpovědi se do sešitu neposílají**.
- Čtyři různé věci, které se nesmí míchat:

| Vrstva | Kdo | Kde se eviduje | Co z ní plyne |
|---|---|---|---|
| Strukturální kontroly | automat (`validatePack`) | výstup `npm run validate`, Knihovna | formát, offsety, SHA-256, segmenty = řešení, konzistence stavů |
| Redakční kontrola | člověk nebo AI | `review_status: editorially_checked_candidate`, `annotation_completeness` | návrh je rozumný, **není schválen** |
| Poslech hlasu | rodič/učitel | stránka *Poslechová kontrola* → `user_data/audio-review.json` | hlas zní správně pro konkrétní text a model |
| Pedagogické schválení | učitel | `teacher_approved`, `approval` | text je vhodný pro cílovou skupinu |

## Formát balíčku

Soubor JSON: stejný tvar jako `data/dictations.seed.json`, navíc `pack_id` a `pack_version`.

```json
{
  "schema_version": 1, "language": "cs-CZ", "offset_unit": "unicode_code_points",
  "pack_id": "moje-sada", "pack_version": 1,
  "dictations": [ { …diktát… } ]
}
```

Diktát (povinná pole; chybějící `teacher_approved` **není** „schváleno“ – je to chyba):

| Pole | Význam |
|---|---|
| `id`, `title`, `recommended_grade` (1–9), `version` (≥1) | stabilní ID, název (dítěti se nediktuje), orientační ročník, verze textu |
| `sentences` (3–5), `text` | věty a `text = sentences.join(" ")`; věty v Unicode **NFC**, každá končí `. ! ?` |
| `sentence_count`, `word_count`, `content_sha256` | musí odpovídat; SHA-256 UTF-8 textu |
| `tts_segments[]` `{id, sentence_index, text}` | co se čte; **dohromady musí dát přesně `text`**; žádné značky ani `[[ ]]` |
| `target_features[]`, `incidental_features[]` `{id, label, examples}` | `id` musí být v `data/profiles.json` |
| `annotations[]` | přesné výskyty: `sentence_index`, `start`, `end` (kódové body), `span`, `feature_id`, `role` (`target`/`incidental`), `review_status` (`editorial_proposal`/`confirmed`) |
| `required_known_forms[]` | konkrétní slovní tvary, které musí dítě znát (přesná shoda včetně velikosti písmen; musí být v textu) |
| `support[]` | předvyplněná místa `{sentence_index, span, start, end, action: "prefill", reason, exclude_from_independent_writing}`; místo musí být jednoznačné |
| `known_graphemes_required` | pro **1. třídu povinné**; musí přesně odpovídat písmenům textu (`ch` je jedno písmeno, rozlišuje se velikost a diakritika) |
| `review_status` | `sample` · `editorially_checked_candidate` · `teacher_approved` |
| `teacher_approved` | `true` jen s úplnou potvrzenou anotací a záznamem `approval: {by, date}` |
| `annotation_completeness` | `partial` · `complete` (tvrzení `complete` se ověřuje nutnými podmínkami) |
| `audio_review_status`, `recommended_mode`, `origin`, `curriculum_sources[]` | viz `scripts/validate-data.mjs` |

Nové jevy: přidejte položku do `data/profiles.json` (`id`, `group`, `label`, `typical_grade`, `default_policy`). Neznámý `feature_id` je chyba importu.

Zásady anotace: i/y v kořeni, v koncovce jména a ve shodě jsou **různé jevy** (různé štítky); výčet, oslovení, hranice vět, vložená vedlejší věta, vsuvka a přímá řeč mají samostatné štítky; jedno slovo může vyžadovat víc znalostí; důležitá jsou i místa mezi slovy a větami; vnořené duplicitní anotace se hlásí jako varování.

## Kontrola a import

```bash
npm run validate -- cesta/k/balicek.json   # návratový kód 1 při chybách; vypíše i varování
```

V aplikaci: **Knihovna → Import**. Nic se neuloží, dokud neprojdou všechny kontroly; ID nesmí kolidovat s jiným balíčkem; nižší `pack_version` už nainstalovaného balíčku se odmítne, vyšší jej nahradí; `pack_id` `seed` je vyhrazeno. Import nikdy nic neschvaluje.

## Od kandidáta ke schválené položce

1. `npm run validate` bez chyb (strukturální kontrola).
2. **Úplná anotace**: každý jev v `target_features`/`incidental_features` má výskyty se správnou rolí, každá anotace má jev v seznamu, **žádný výskyt nezůstal nepopsaný**; člověk změní `review_status` anotací na `confirmed`. Pak `annotation_completeness: "complete"`. (Validátor ověří jen nutné podmínky – že nic nechybí, potvrzuje člověk.)
3. **Poslech** (*Poslechová kontrola*): normálně i zpomaleně, kontrolní seznam (délky samohlásek, di/ti/ni, dě/tě/ně, bě/pě/vě/mě, vlastní jména, souhláskové skupiny, interpunkční členění). Záznam platí jen pro konkrétní `content_sha256` a konkrétní model; po změně jednoho z nich je „zastaralý“.
4. **Pedagogické schválení učitelem**: `teacher_approved: true`, `review_status: "teacher_approved"`, `approval: {"by": "…", "date": "RRRR-MM-DD"}`.
5. Teprve potom položka projde filtrem „jen schválené učitelem“. Jakákoli změna textu vyžaduje novou `version` a nový `content_sha256` a tím **zneplatní** zvuk, poslech i schválení.

Automatické schválení podle ročníku, štítku zdrojového webu nebo názvu je nepřípustné.

## Co dělat při změně textu

Změňte `sentences`, `text`, `tts_segments`, `word_count`, `content_sha256`, zvyšte `version`, přepočtěte offsety anotací, vraťte `teacher_approved: false` a `annotation_completeness: partial`, dokud se znovu neověří.

## Vygenerovaná knihovna (`data/library/`, 38 balíčků × 30 diktátů)

Pro **každý z 38 jevů** v `data/profiles.json` je jeden balíček `lib-<kód>` s 30 diktáty, v nichž je tento jev jediným cílovým. Všechny položky jsou `review_status: "sample"`, `teacher_approved: false`, `annotation_completeness: "partial"` – tedy **ukázky bez lidské kontroly**.

### Jak vzniká
`library-src/<kód>.txt` (zdroj) → `node scripts/build-library.mjs` → `data/library/<kód>.json` → `node scripts/lint-library.mjs`.
Část zdrojů je psaná ručně (1.–4. ročník a vyjmenovaná slova: `sb vq ul pg sc hc vf vi lb ll lm vyc lp ls lv lz lr pan hrad zena`), zbytek poskládaly generátory `scripts/library/gen-*.mjs` z ručně sestavených slovníků a dvojic vět. Obojí prochází stejnými kontrolami. Výplňové věty (`fillers.mjs`) doplňují krátké texty na minimální délku a **tematicky nemusí navazovat**.

### Co generátor vynucuje (a lze to spustit: `npm run build:library`, `npm run lint:library`, `npm test`)
- **Uzavřenost jevů:** každý jev v textu (automaticky rozpoznaný nebo ručně označený) musí být cílový, nebo mít typický ročník nižší než cíl (případně stejný a „podle ročníku“); vedlejších jevů vyžadujících potvrzení dospělým je nejvýše 3. Tj. text neobsahuje okruh, který by žák v dané úrovni „ještě neznal“.
- **Skrytá rozhodnutí:** i/y po obojetných souhláskách (včetně ověření podle seznamu vyjmenovaných slov), koncové -i/-y/-ý/-í podle vzoru, minulý čas -l/-la/-lo/-li/-ly, předpony s-/z-/vz-/vy-, mě/mně, velká písmena, čárky a další interpunkce – pokud je autor neoznačí, build selže; pokud patří do vyššího ročníku, build selže.
- **1. ročník:** žádné i/y, ú/ů, ě, znělé souhlásky na konci ani nesouhlasné skupiny; navíc se u 1. třídy počítá seznam potřebných grafémů.
- **Neopakování:** žádná věta ani název se neopakuje v celé knihovně (včetně seedu); žádné obsahové slovo není ve více než 8 textech jednoho balíčku (v 1. ročníku 12); texty si nesmí být příliš podobné; ve větě se nesmí opakovat stejné obsahové slovo (výjimka: balíček protikladů `od`).
- **Zkouška výběrovým mechanismem aplikace** (`tests/js/library.test.mjs`): profil znající jevy do cílového ročníku přijme všech 30 textů; bez cílového jevu nebo bez kteréhokoli vedlejšího jevu text neprojde.

### Co to NEZNAMENÁ (zaručeno není)
- Že je čeština správná a přirozená (balíčky sestavené ze šablon – `vv vs vlo slo od geo nev shrev pas plur me pr` – obsahují i věcně podivné věty typu „Rybář, který nese kost, je náš soused.“), že věty dávají smysl nebo že jsou pedagogicky vhodné. Texty jsou záměrně jednoduché a často šablonovité; střední délka je **12–23 slov** (1. až 9. ročník), což je výrazně kratší než běžný diktát.
- Že v textech nejsou jevy, které detektor nezná. Detektory jsou heuristiky nad slovy (viz `scripts/library/phenomena.mjs`), žádná morfologická analýza. Zejména předpony s-/z-/vz- (jen vybraná slova), shoda a koncovky mimo vzory v `lexicon.mjs` se chytají jen částečně.
- Že anotace jsou úplné (`partial`) ani že `examples` ve `target_features` jsou nejlepší ukázky.
- Že jsou zvuk, výslovnost nebo licence hlasu v pořádku (viz `docs/TESTLOG.md`, `docs/LICENSES.md`).

### Použití v aplikaci
`npm run install:library` zkopíruje balíčky do `user_data/packs/` (odtud je lokální server nabízí jako importované). Po instalaci nabízí stránka Knihovna 1150 položek (10 ze seedu + 1140); ročníkové profily z `profiles.json` jsou stále **provizorní**.

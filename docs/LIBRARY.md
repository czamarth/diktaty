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

# Poznámky k redakční kontrole první sady

**Autor: asistent (AI). Toto NENÍ pedagogické schválení ani kontrola učitelem.** Rozlišujte, co je ověřitelné strojově (A), a co je můj odborný úsudek, který může být chybný a patří k posouzení učitelem (B). Co jsem nedělal, je v části C.

## A. Strojově ověřené (reprodukovatelné: `npm run validate`, skript v `docs/TESTLOG.md`)

1. **Strukturální kontroly projdou u všech 10 textů** (offsety anotací, SHA-256, počty slov, segmenty pro hlas = řešení, 31 vět, rozložení ročníků 1,2,2,3,4,5,6,7,8,9).
2. **Tři zbytečné vnořené anotace** (varování `annotation_nested`): `má` uvnitř `mák` (D01), `úl` uvnitř `úlu` (D02), `zhlédl` uvnitř `vzhlédl` (D07). Zřejmě artefakt hledání podřetězce. Seed jsem neměnil.
3. **Anotace je opravdu neúplná, ne jen formálně:** ze 70 slov obsahujících i/í/y/ý nemá 14 žádnou anotaci (hnízdě, film, knihu, Když, silně, chaty, Kniha, první, stránky, I, když, bylo, nepříznivé, turisté). Většina nejsou rozhodovací místa, ale **dvě ano**:
   - **D10 „bylo“** – vyjmenované slovo po B (být). Dítě bez potvrzených slov po B by D10 v přísné variantě dostalo, protože engine toto místo nevidí.
   - **D09 „silně“** – i po obojetném s (silný).
   Validátor proto vydává varování `possible_unannotated_iy` a příprava pro dospělého je zobrazuje. Je to heuristika (i/y po b, l, m, p, s, v, z bez anotace), ne důkaz.
4. U všech textů je `annotation_completeness: partial` a `teacher_approved: false`; aplikace žádný z nich nepovažuje za schválený.

## B. Moje jazykové úvahy – k posouzení učitelem (mohu se mýlit)

| Text | Pozorování | Jistota |
|---|---|---|
| D03 „městě“ | Štítek je „dě/tě/ně… **mimo morfologický šev**“, ale `tě` v „městě“ je zároveň koncovka 6. pádu slova *město*. Ověřit, zda to odpovídá záměru štítku a profilu (2. ročník). | střední |
| D07 „sešitu“ | Slovo má předponu *se-* a mohlo by patřit k jevu s/z; je anotováno jen jako koncovka (`noun_endings_review`). | střední |
| D09 | Štítek `listed_words_review` („lexikální i/y“) obsahuje i „vrátím“ (koncovka slovesa) a „knihovny“ (koncovka jména po n). To jsou jiné jevy než i/y v kořeni; v zadání mají být oddělené. | střední |
| D06 „pípla“ | „Ptáčata hlasitě pípla“ – tvar od *pípnout* (jednorázový děj); k opakovanému pípání se běžněji řekne „pípala“. Jde o přirozenost formulace, ne o pravopis. | nízká |
| D01–D10 | Délka vět a slovní zásoba nebyly měřeny proti žádnému kritériu čitelnosti; „doporučený ročník“ je jen návrh. | – |

## C. Co jsem NEDĚLAL

- Nesrovnával jsem texty se školními plány ani s kurikulárními dokumenty (NotebookLM nebyl v relaci dostupný).
- **Neověřoval jsem původnost textů** vůči cizím katalogům diktátů. Zadání vyžaduje nové věty; doporučuji autorovi/učiteli, aby to potvrdil.
- Neposlouchal jsem hlas (model nebyl dostupný) a nic jsem neříkal o výslovnosti.
- Nezměnil jsem žádný text, anotaci ani stav v `data/dictations.seed.json`.

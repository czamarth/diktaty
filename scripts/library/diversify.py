#!/usr/bin/env python3
"""Pomůcka pro psaní zdrojů: u slov na začátku věty (např. Dívka, Kluk), která se v balíčku opakují
víc než N×, střídavě dosadí jména osob. Jména nepřidávají žádný pravopisný jev.
Použití: diversify.py library-src/xx.txt Dívka:f Kluk:m [--keep 5]"""
import re, sys, pathlib
F = ["Eva", "Olga", "Anna", "Dana", "Lenka", "Tereza", "Hana", "Alena", "Nela", "Marta", "Ema", "Lara", "Soňa", "Mara"]
M = ["Jan", "Petr", "Karel", "Marek", "Radek", "Adam", "Pavel", "Ota", "Roman", "Vojta", "Alan", "Erik", "Oto", "Ivo"]
args = [a for a in sys.argv[1:] if not a.startswith("--")]
keep = int(sys.argv[sys.argv.index("--keep") + 1]) if "--keep" in sys.argv else 5
if "--keep" in sys.argv:
    args = [a for a in args if a != str(keep)]
path = pathlib.Path(args[0]); text = path.read_text()
for spec in args[1:]:
    word, kind = spec.split(":"); pool = F if kind == "f" else M
    n = 0; i = 0
    def rep(m):
        global n, i
        n += 1
        if n <= keep: return m.group(0)
        name = pool[i % len(pool)]; i += 1
        return m.group(1) + name + m.group(2)
    text = re.sub(r"(^)" + word + r"( )", rep, text, flags=re.M)
path.write_text(text)

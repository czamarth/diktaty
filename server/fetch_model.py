#!/usr/bin/env python3
"""Jednorázové stažení českého hlasu pro Piper (cs_CZ-jirka-medium).

Toto je JEDINÝ krok aplikace, který potřebuje internet, a spouští se jen výslovně tímto příkazem.
Aplikace sama nikdy nic nestahuje a při chybějícím modelu nepřechází na jiný hlas ani na vzdálenou službu.

Co se stane:
  1. vysvětlí se, co se stáhne a odkud, a zeptá se na souhlas (přeskočí se parametrem --yes);
  2. do složky models/ se stáhne model (.onnx), jeho konfigurace (.onnx.json) a karta modelu (MODEL_CARD);
  3. ověří se, že je to český hlas, a pokud server poskytl otisk souboru (HuggingFace jej uvádí v hlavičce
     X-Linked-ETag), porovná se se stáhnutým souborem;
  4. zapíše se models/MODEL_LOCK.json s otiskem. Pozdější změna souboru modelu se hlásí a hlas se nesmí
     změnit potichu.

Při chybě sítě vypíše postup ručního stažení.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tts_service import MODEL_ID, TtsService  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/cs/cs_CZ/jirka/medium"
FILES = [(f"{MODEL_ID}.onnx", True), (f"{MODEL_ID}.onnx.json", True), ("MODEL_CARD", False)]
HEX64 = re.compile(r"^[0-9a-f]{64}$")


def explain(base: str, models_dir: Path) -> str:
    return f"""
Diktáty potřebují jednorázově stáhnout český hlas pro lokální předčítání.

  Hlas:      {MODEL_ID} (Piper, projekt rhasspy/piper-voices)
  Odkud:     {base}
  Kam:       {models_dir}
  Co:        {', '.join(n for n, _ in FILES)}
  Velikost:  řádově desítky MB

Po stažení aplikace funguje bez internetu a nic dalšího nestahuje.
Licence: engine Piper je GPL-3.0-or-later; dataset hlasu je podle karty modelu CC0
(kartu si po stažení přečtěte v models/MODEL_CARD; licenci celého balíčku z licence datasetu neodvozujte).
"""


def manual_help(base: str, models_dir: Path) -> str:
    urls = "\n".join(f"    {base}/{n}" for n, _ in FILES)
    return f"""
Stažení se nezdařilo. Soubory můžete stáhnout ručně (prohlížečem nebo jiným počítačem) a vložit do:
    {models_dir}
Adresy:
{urls}
Potom spusťte znovu: python3 server/fetch_model.py --accept-current   (zapíše otisk ručně vložených souborů)
"""


def download(url: str, dest: Path) -> tuple[str, str | None]:
    """Stáhne soubor do dest (atomicky). Vrací (sha256, otisk uvedený serverem nebo None)."""
    req = urllib.request.Request(url, headers={"User-Agent": "diktaty-fetch-model/0.1"})
    h = hashlib.sha256()
    tmp = dest.with_name(dest.name + ".part")
    with urllib.request.urlopen(req, timeout=60) as res, open(tmp, "wb") as out:
        total = int(res.headers.get("Content-Length") or 0)
        done = 0
        etag = res.headers.get("X-Linked-ETag") or res.headers.get("ETag")
        while True:
            chunk = res.read(1024 * 256)
            if not chunk:
                break
            h.update(chunk)
            out.write(chunk)
            done += len(chunk)
            if total and sys.stderr.isatty():
                print(f"\r  {dest.name}: {done * 100 // total} %", end="", file=sys.stderr)
    if sys.stderr.isatty():
        print(file=sys.stderr)
    os.replace(tmp, dest)
    server_hash = etag.strip().strip('"').removeprefix("W/").strip('"').lower() if etag else None
    return h.hexdigest(), (server_hash if server_hash and HEX64.match(server_hash) else None)


def main(argv=None, models_dir: Path | None = None) -> int:
    ap = argparse.ArgumentParser(description="Jednorázově stáhne český hlas pro Piper.")
    ap.add_argument("--yes", action="store_true", help="nepožadovat potvrzení")
    ap.add_argument("--accept-current", action="store_true", help="nic nestahovat; potvrdit a zaznamenat aktuální soubory v models/ (po ruční výměně hlasu)")
    ap.add_argument("--base-url", default=DEFAULT_BASE, help="jiný zdroj souborů (zrcadlo)")
    ap.add_argument("--models-dir", default=None)
    args = ap.parse_args(argv)
    mdir = Path(models_dir or args.models_dir or os.environ.get("DIKTATY_MODELS_DIR") or ROOT / "models").expanduser().resolve()
    mdir.mkdir(parents=True, exist_ok=True)
    base = args.base_url.rstrip("/")
    svc = TtsService(mdir, Path(tempfile.mkdtemp(prefix="diktaty-cache-")))

    if args.accept_current:
        if not (svc.onnx_path.is_file() and svc.config_path.is_file()):
            print(f"Ve složce {mdir} chybí {svc.onnx_path.name} nebo {svc.config_path.name}.", file=sys.stderr)
            return 1
        st = svc.validate_model_files()
        if st["status"] == "model_invalid":
            print(st["error"].message, file=sys.stderr)
            return 1
        lock = svc.write_lock({"source": "ručně potvrzeno příkazem --accept-current"})
        print(f"Zaznamenán hlas {lock['model_id']} (SHA-256 {lock['onnx_sha256'][:16]}…).")
        return 0

    print(explain(base, mdir))
    if not args.yes:
        if not sys.stdin.isatty():
            print("Bez interaktivního terminálu je třeba souhlas dát parametrem --yes.", file=sys.stderr)
            return 2
        if input("Stáhnout? [a/N] ").strip().lower() not in ("a", "ano", "y", "yes"):
            print("Nic se nestahuje. Předčítání zůstane nedostupné, dokud model nestáhnete.")
            return 2

    fetched: dict[str, tuple[str, str | None]] = {}
    try:
        for name, required in FILES:
            print(f"Stahuji {name} …")
            try:
                fetched[name] = download(f"{base}/{name}", mdir / name)
            except (urllib.error.URLError, OSError) as e:
                if required:
                    raise
                print(f"  (nepovinný soubor {name} se nepodařilo stáhnout: {e})")
    except (urllib.error.URLError, OSError) as e:
        print(f"Chyba: {e}", file=sys.stderr)
        print(manual_help(base, mdir), file=sys.stderr)
        return 1

    verified = []
    for name, (sha, server_sha) in fetched.items():
        if server_sha is not None:
            if server_sha != sha:
                for n, _ in FILES:
                    (mdir / n).unlink(missing_ok=True)
                print(f"Chyba: otisk souboru {name} ({sha[:16]}…) se neshoduje s otiskem od serveru ({server_sha[:16]}…). Soubory byly smazány.", file=sys.stderr)
                return 1
            verified.append(name)

    st = svc.validate_model_files()
    if st["status"] == "model_invalid":
        for n, _ in FILES:
            (mdir / n).unlink(missing_ok=True)
        print(f"{st['error'].message} Soubory byly smazány.", file=sys.stderr)
        return 1
    lock = svc.write_lock({
        "source_url": base,
        "integrity_verified_against_server_hash": svc.onnx_path.name in verified,
        "files": {n: s for n, (s, _) in fetched.items()},
    })
    print(f"\nHotovo. Hlas {lock['model_id']} je uložen v {mdir}.")
    print(f"  SHA-256 modelu: {lock['onnx_sha256']}")
    print("  Otisk ověřen proti serveru: " + ("ano" if lock["integrity_verified_against_server_hash"] else "NE (server otisk neposkytl; zaznamenán jen lokální otisk)"))
    if not svc.engine.available()[0]:
        print("  Pozor: není nainstalován Piper. Spusťte: python3 -m pip install -r server/requirements.txt")
    print("  Přečtěte si models/MODEL_CARD (licence a původ dat) a poslechněte hlas na stránce Poslechová kontrola.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

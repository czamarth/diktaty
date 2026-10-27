#!/usr/bin/env python3
"""Vygeneruje zvuk všech diktátů skutečným lokálním hlasem (Piper) a změří rychlost.

Spouští se NA POČÍTAČI S MODELEM (po `python3 server/fetch_model.py`). V sandboxu bez modelu nelze.

  python3 scripts/generate_audio.py                       # normálně (1.0) a zpomaleně (1.3)
  python3 scripts/generate_audio.py --require-offline     # odmítne běžet, pokud je dostupný internet
  python3 scripts/generate_audio.py --rates 1.0,1.3,1.6 --export-wav ./wav

Zvuk se ukládá do stejné mezipaměti a pod stejnými klíči, jaké použije aplikace, takže pozdější diktování je
okamžité. Skript NIC neschvaluje: stav poslechové kontroly zůstává „neposouzeno“, dokud člověk nepoužije
stránku Poslechová kontrola. Výsledek měření se zapíše do user_data/audio-generation-report.json.
Návratové kódy: 0 vše v pořádku, 1 chyba syntézy/nesoulad dat, 3 síť je dostupná při --require-offline,
4 hlas není připraven.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import socket
import sys
import time
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))
from tts_service import TtsError, TtsService, sha256_text  # noqa: E402


def network_reachable() -> dict:
    """Zkusí překročit hranici počítače. Úspěch = síť není odpojena."""
    result = {"dns": False, "tcp": False}
    try:
        socket.getaddrinfo("huggingface.co", 443)
        result["dns"] = True
    except OSError:
        pass
    for host in ("1.1.1.1", "8.8.8.8"):
        try:
            with socket.create_connection((host, 53), timeout=3):
                result["tcp"] = True
                break
        except OSError:
            continue
    # Přímé spojení může být zablokováno, ale internet přesto dostupný přes proxy → to by nebylo odpojeno.
    result["proxy_configured"] = any(os.environ.get(k) for k in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"))
    result["reachable"] = result["dns"] or result["tcp"] or result["proxy_configured"]
    return result


def wav_info(data: bytes) -> tuple[float, int]:
    with wave.open(io.BytesIO(data)) as w:
        return w.getnframes() / w.getframerate(), w.getframerate()


def load_dictations(user_dir: Path) -> list[dict]:
    items = []
    packs = [ROOT / "data" / "dictations.seed.json", *sorted((user_dir / "packs").glob("*.json"))]
    for path in packs:
        pack = json.loads(path.read_text(encoding="utf-8"))
        items.extend(pack.get("dictations", []))
    return items


def request(d: dict, purpose: str, seg_id: str, text: str, rate: float) -> dict:
    return {
        "purpose": purpose, "length_scale": rate, "read_punctuation": False,
        "segment": {"id": seg_id, "text": text},
        "dictation": {"id": d["id"], "version": d["version"], "content_sha256": d["content_sha256"], "text": d["text"]},
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rates", default="1.0,1.3", help="tempa (length_scale) oddělená čárkou")
    ap.add_argument("--require-offline", action="store_true", help="odmítnout běh, pokud je dostupný internet")
    ap.add_argument("--export-wav", default=None, help="navíc uložit WAV soubory do této složky (k poslechu mimo aplikaci)")
    args = ap.parse_args(argv)
    rates = [float(x) for x in args.rates.split(",")]

    net = network_reachable()
    print(f"Síť: DNS {'ANO' if net['dns'] else 'ne'}, TCP {'ANO' if net['tcp'] else 'ne'}, proxy v prostředí {'ANO' if net['proxy_configured'] else 'ne'} → {'DOSTUPNÁ/NEPOTVRZENO ODPOJENÍ' if net['reachable'] else 'odpojeno'}")
    print("  (heuristika: zkouší DNS a TCP ven a hledá proxy; není to důkaz izolace, jen pojistka proti omylu)")
    if args.require_offline and net["reachable"]:
        print("Chyba: síť je dostupná nebo je nastavena proxy. Odpojte Wi-Fi/kabel (nebo zapněte režim Letadlo), odstraňte proměnné *_PROXY a spusťte znovu.", file=sys.stderr)
        return 3

    models = Path(os.environ.get("DIKTATY_MODELS_DIR", ROOT / "models"))
    cache = Path(os.environ.get("DIKTATY_CACHE_DIR", ROOT / "cache" / "tts"))
    user_dir = Path(os.environ.get("DIKTATY_USER_DIR", ROOT / "user_data"))
    svc = TtsService(models, cache)
    st = svc.status()
    print(f"Hlas: {st['model']['id']} [{st['status']}], engine {st['engine']['name']} {st['engine']['version']}")
    if not st["ready"]:
        print(f"Chyba: {st['error']['message']}\n{st['error']['hint'] or ''}", file=sys.stderr)
        return 4

    export = Path(args.export_wav) if args.export_wav else None
    if export:
        export.mkdir(parents=True, exist_ok=True)
    dictations = load_dictations(user_dir)
    rows, problems = [], []
    t_start = time.perf_counter()
    for d in dictations:
        if sha256_text(d["text"]) != d["content_sha256"] or " ".join(s["text"] for s in d["tts_segments"]) != d["text"]:
            problems.append(f"{d['id']}: text neodpovídá kontrolnímu součtu nebo segmentům – přeskočeno")
            continue
        jobs = [("full", "full", d["text"], 1.0)] + [("segment", s["id"], s["text"], r) for s in d["tts_segments"] for r in rates]
        for purpose, seg_id, text, rate in jobs:
            t0 = time.perf_counter()
            try:
                res = svc.synthesize(request(d, purpose, seg_id, text, rate))
            except TtsError as e:
                problems.append(f"{d['id']} {seg_id} @{rate}: {e.code}: {e.message}")
                continue
            took = time.perf_counter() - t0
            dur, sr = wav_info(res["wav"])
            rows.append({"dictation": d["id"], "segment": seg_id, "length_scale": rate, "chars": len(text), "audio_seconds": round(dur, 2),
                         "sample_rate": sr, "bytes": len(res["wav"]), "synth_seconds": round(took, 3), "cache": res["cache"],
                         "realtime_factor": round(took / dur, 3) if dur else None})
            if not (0.3 <= dur <= 60):
                problems.append(f"{d['id']} {seg_id} @{rate}: nepravděpodobná délka {dur:.2f} s")
            if export:
                (export / f"{d['id']}_{seg_id}_x{rate}.wav").write_bytes(res["wav"])
    total = time.perf_counter() - t_start
    fresh = [r for r in rows if r["cache"] == "miss"]

    print(f"\n{'diktát':7} {'úsek':9} {'tempo':>5} {'znaků':>5} {'audio s':>8} {'syntéza s':>9} {'RTF':>6}")
    for r in rows:
        print(f"{r['dictation']:7} {r['segment']:9} {r['length_scale']:>5} {r['chars']:>5} {r['audio_seconds']:>8} {r['synth_seconds']:>9} {r['realtime_factor']!s:>6}{'  (z mezipaměti)' if r['cache'] == 'hit' else ''}")
    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "network": net, "offline_confirmed": not net["reachable"], "require_offline": args.require_offline,
        "model": st["model"], "engine": st["engine"], "rates": rates,
        "segments": len(rows), "freshly_synthesized": len(fresh), "total_seconds": round(total, 2),
        "mean_realtime_factor": round(sum(r["realtime_factor"] for r in fresh) / len(fresh), 3) if fresh else None,
        "problems": problems, "rows": rows,
        "note": "Měření rychlosti a technická kontrola délky. NENÍ to poslechová kontrola ani pedagogické schválení.",
    }
    user_dir.mkdir(parents=True, exist_ok=True)
    (user_dir / "audio-generation-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nHotovo: {len(rows)} nahrávek za {total:.1f} s; offline potvrzeno: {'ANO' if report['offline_confirmed'] else 'NE'}.")
    if report["mean_realtime_factor"] is not None:
        print(f"Průměrný poměr času syntézy k délce zvuku (RTF): {report['mean_realtime_factor']} (méně než 1 = rychleji než v reálném čase)")
    print("Zpráva: user_data/audio-generation-report.json. Teď poslechněte hlas ve stránce „Poslechová kontrola“.")
    for p in problems:
        print(f"PROBLÉM: {p}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

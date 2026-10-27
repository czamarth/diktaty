#!/usr/bin/env python3
"""Lokální server aplikace Diktáty.

Poslouchá výhradně na 127.0.0.1 (nelze změnit parametrem), obsluhuje statické soubory aplikace,
datové balíčky a lokální TTS. Žádné požadavky ven; model se stahuje samostatným, výslovně
spuštěným příkazem (server/fetch_model.py).
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import sys
import threading
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tts_service import TtsError, TtsService  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
HOST = "127.0.0.1"
DEFAULT_PORT = 8765
MAX_BODY = 2 * 1024 * 1024
PACK_ID = re.compile(r"^[A-Za-z][A-Za-z0-9._-]{1,31}$")
DATA_FILES = {"/data/dictations.seed.json", "/data/profiles.json"}
STATIC_TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
                ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8"}
CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; "
       "connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")


class App:
    def __init__(self, tts: TtsService, web_dir: Path, data_dir: Path, user_dir: Path):
        self.tts = tts
        self.web_dir = web_dir
        self.data_dir = data_dir
        self.packs_dir = user_dir / "packs"
        self.reviews_path = user_dir / "audio-review.json"
        self.packs_dir.mkdir(parents=True, exist_ok=True)
        self.io_lock = threading.Lock()


def atomic_write(path: Path, data: bytes) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def make_handler(app: App):
    class Handler(BaseHTTPRequestHandler):
        server_version = "Diktaty/0.1"
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):  # tichý přístupový log, chyby jdou na stderr
            if os.environ.get("DIKTATY_ACCESS_LOG"):
                super().log_message(fmt, *args)

        # --- pomocné ---------------------------------------------------------
        _body_consumed = False

        def _allowed_hosts(self):
            port = self.server.server_address[1]
            return {f"127.0.0.1:{port}", f"localhost:{port}"}

        def _guard(self, mutating: bool, need_json: bool | None = None) -> bool:
            host = self.headers.get("Host", "")
            if host not in self._allowed_hosts():
                self._json({"error": {"code": "bad_host", "message": "Nepovolená hlavička Host.", "hint": None}}, 403)
                return False
            if mutating:
                origin = self.headers.get("Origin")
                if origin is not None and origin != f"http://{host}":
                    self._json({"error": {"code": "bad_origin", "message": "Požadavek z cizího původu byl odmítnut.", "hint": None}}, 403)
                    return False
                if (mutating if need_json is None else need_json) and not self.headers.get("Content-Type", "").startswith("application/json"):
                    self._json({"error": {"code": "bad_content_type", "message": "Očekává se application/json.", "hint": None}}, 415)
                    return False
            return True

        def _send(self, status: int, body: bytes, ctype: str, extra: dict | None = None):
            # Odmítnutý požadavek s nepřečteným tělem by na keep-alive spojení zkomolil další požadavek.
            if self.command in ("POST", "PUT", "DELETE") and not self._body_consumed and int(self.headers.get("Content-Length") or 0) > 0:
                self.close_connection = True
            self.send_response(status)
            if self.close_connection:
                self.send_header("Connection", "close")
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", CSP)
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _json(self, obj, status: int = 200):
            self._send(status, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8", {"Cache-Control": "no-store"})

        def _body_json(self):
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise TtsError("bad_request", "Neplatná hlavička Content-Length.")
            if length <= 0 or length > MAX_BODY:
                raise TtsError("bad_request", f"Tělo požadavku musí mít 1 B až {MAX_BODY // 1024} kB.", None, 413 if length > MAX_BODY else 400)
            try:
                raw = self.rfile.read(length)
                self._body_consumed = True
                return json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                raise TtsError("bad_request", "Tělo požadavku není platný JSON.")

        def _fail(self, e: TtsError):
            self._json(e.to_json(), e.status)

        # --- metody ----------------------------------------------------------
        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            if not self._guard(False):
                return
            path = unquote(urlsplit(self.path).path)
            try:
                if path == "/api/health":
                    return self._json(app.tts.status())
                if path == "/api/packs":
                    return self._json({"packs": self._read_packs()})
                if path == "/api/reviews":
                    return self._json(self._read_reviews())
                if path.startswith("/api/"):
                    return self._json({"error": {"code": "not_found", "message": "Neznámá adresa API.", "hint": None}}, 404)
                return self._static(path)
            except TtsError as e:
                self._fail(e)

        def do_POST(self):
            if not self._guard(True):
                return
            path = urlsplit(self.path).path
            try:
                if path == "/api/tts":
                    result = app.tts.synthesize(self._body_json())
                    return self._send(200, result["wav"], "audio/wav", {
                        "Cache-Control": "no-store",
                        "X-Diktaty-Cache": result["cache"],
                        "X-Diktaty-Invalidated": str(result["invalidated"]),
                        "X-Diktaty-Model": app.tts.model_id,
                    })
                return self._json({"error": {"code": "not_found", "message": "Neznámá adresa API.", "hint": None}}, 404)
            except TtsError as e:
                self._fail(e)

        def do_PUT(self):
            if not self._guard(True):
                return
            path = urlsplit(self.path).path
            try:
                m = re.fullmatch(r"/api/packs/([^/]+)", path)
                if m:
                    pack_id = m.group(1)
                    body = self._body_json()
                    if not PACK_ID.match(pack_id) or not isinstance(body, dict) or body.get("pack_id") != pack_id:
                        raise TtsError("bad_request", "pack_id v adrese a v balíčku se musí shodovat a mít platný tvar.")
                    with app.io_lock:
                        atomic_write(app.packs_dir / f"{pack_id}.json", json.dumps(body, ensure_ascii=False).encode("utf-8"))
                    return self._json({"stored": pack_id})
                if path == "/api/reviews":
                    body = self._body_json()
                    if not isinstance(body, dict) or body.get("schema") != 1 or not isinstance(body.get("items"), dict):
                        raise TtsError("bad_request", "Záznam poslechové kontroly má neplatný tvar.")
                    with app.io_lock:
                        atomic_write(app.reviews_path, json.dumps(body, ensure_ascii=False).encode("utf-8"))
                    return self._json({"stored": True})
                return self._json({"error": {"code": "not_found", "message": "Neznámá adresa API.", "hint": None}}, 404)
            except TtsError as e:
                self._fail(e)

        def do_DELETE(self):
            if not self._guard(True, need_json=False):
                return
            m = re.fullmatch(r"/api/packs/([^/]+)", urlsplit(self.path).path)
            if not m or not PACK_ID.match(m.group(1)):
                return self._json({"error": {"code": "not_found", "message": "Neznámá adresa API.", "hint": None}}, 404)
            with app.io_lock:
                (app.packs_dir / f"{m.group(1)}.json").unlink(missing_ok=True)
            self._json({"deleted": m.group(1)})

        # --- data a statika -------------------------------------------------------
        def _read_packs(self):
            out = []
            with app.io_lock:
                for p in sorted(app.packs_dir.glob("*.json")):
                    try:
                        out.append({"file": p.name, "data": json.loads(p.read_text(encoding="utf-8"))})
                    except (OSError, ValueError):
                        out.append({"file": p.name, "data": None, "error": "Soubor balíčku je poškozený (není platný JSON)."})
            return out

        def _read_reviews(self):
            with app.io_lock:
                try:
                    return json.loads(app.reviews_path.read_text(encoding="utf-8"))
                except FileNotFoundError:
                    return {"schema": 1, "items": {}}
                except (OSError, ValueError):
                    raise TtsError("reviews_corrupt", "Záznam poslechové kontroly je poškozený.", f"Zkontrolujte nebo smažte soubor {app.reviews_path}.", 500)

        def _static(self, path: str):
            if path in DATA_FILES:
                target = app.data_dir / path.removeprefix("/data/")
            else:
                rel = "index.html" if path in ("/", "") else path.lstrip("/")
                target = (app.web_dir / rel).resolve()
                if app.web_dir.resolve() not in target.parents and target != app.web_dir.resolve():
                    return self._json({"error": {"code": "not_found", "message": "Soubor nenalezen.", "hint": None}}, 404)
            ext = target.suffix.lower()
            if ext not in STATIC_TYPES or not target.is_file():
                return self._json({"error": {"code": "not_found", "message": "Soubor nenalezen.", "hint": None}}, 404)
            self._send(200, target.read_bytes(), STATIC_TYPES.get(ext) or mimetypes.guess_type(str(target))[0] or "application/octet-stream",
                       {"Cache-Control": "no-cache"})

    return Handler


def make_server(app: App, port: int = DEFAULT_PORT) -> ThreadingHTTPServer:
    httpd = ThreadingHTTPServer((HOST, port), make_handler(app))
    httpd.daemon_threads = True
    return httpd


def default_app() -> App:
    """Adresáře lze přepsat proměnnými DIKTATY_MODELS_DIR, DIKTATY_CACHE_DIR a DIKTATY_USER_DIR."""
    def env_dir(name: str, default: Path) -> Path:
        return Path(os.environ[name]).expanduser().resolve() if os.environ.get(name) else default

    return App(
        TtsService(env_dir("DIKTATY_MODELS_DIR", ROOT / "models"), env_dir("DIKTATY_CACHE_DIR", ROOT / "cache" / "tts")),
        ROOT / "web", ROOT / "data", env_dir("DIKTATY_USER_DIR", ROOT / "user_data"),
    )


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Lokální server aplikace Diktáty (jen 127.0.0.1).")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--no-browser", action="store_true", help="neotevírat prohlížeč")
    ap.add_argument("--clear-cache", action="store_true", help="smazat mezipaměť zvuku a skončit")
    args = ap.parse_args(argv)

    app = default_app()
    if args.clear_cache:
        print(f"Smazáno záznamů mezipaměti: {app.tts.clear_cache()}")
        return 0
    st = app.tts.status()
    print("Diktáty – lokální server")
    print(f"  hlas:   {st['model']['id']}  [{st['status']}]")
    if st["error"]:
        print(f"  !! {st['error']['message']}")
        if st["error"]["hint"]:
            print(f"     {st['error']['hint']}")
        print("  Aplikace se spustí, ale předčítání bude nedostupné, dokud se to nespraví.")
    try:
        httpd = make_server(app, args.port)
    except OSError as e:
        print(f"Nelze naslouchat na {HOST}:{args.port}: {e}\nZkuste jiný port: --port 8766", file=sys.stderr)
        return 1
    url = f"http://{HOST}:{httpd.server_address[1]}/"
    print(f"  adresa: {url}   (dostupná jen z tohoto počítače; ukončení Ctrl+C)")
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nUkončeno.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Testy fetch_model.py. Skutečné stažení z HuggingFace tu NEBYLO ověřeno (síť sandboxu ho blokuje);
testuje se logika (potvrzení, ověření, zámek, chyby) proti místním souborům přes file://."""
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "server"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import fetch_model  # noqa: E402
from fakes import write_model  # noqa: E402
from tts_service import TtsService  # noqa: E402
from fakes import FakeEngine  # noqa: E402


class FetchModel(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        t = Path(self.tmp.name)
        self.remote = t / "remote"
        write_model(self.remote)
        (self.remote / "MODEL_CARD").write_text("Dataset: CC0", encoding="utf-8")
        self.models = t / "models"
        self.base = self.remote.as_uri()

    def run_main(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = fetch_model.main(["--base-url", self.base, "--models-dir", str(self.models), *args])
        return code, out.getvalue(), err.getvalue()

    def test_explains_and_downloads_with_yes(self):
        code, out, _ = self.run_main("--yes")
        self.assertEqual(code, 0)
        self.assertIn("jednorázově stáhnout", out)
        self.assertIn("funguje bez internetu", out)
        for n in ("cs_CZ-kasandra-medium.onnx", "cs_CZ-kasandra-medium.onnx.json", "MODEL_CARD", "MODEL_LOCK.json"):
            self.assertTrue((self.models / n).is_file(), n)
        lock = json.loads((self.models / "MODEL_LOCK.json").read_text(encoding="utf-8"))
        self.assertEqual(len(lock["onnx_sha256"]), 64)
        self.assertFalse(lock["integrity_verified_against_server_hash"])
        self.assertIn("NE (server otisk neposkytl", out)

    def test_no_consent_no_download(self):
        code, _, err = self.run_main()  # stdin není terminál a chybí --yes
        self.assertEqual(code, 2)
        self.assertIn("--yes", err)
        self.assertFalse(self.models.exists() and any(self.models.iterdir()))

    def test_unreachable_source_gives_manual_instructions(self):
        self.base = (Path(self.tmp.name) / "neexistuje").as_uri()
        code, _, err = self.run_main("--yes")
        self.assertEqual(code, 1)
        self.assertIn("ručně", err)
        self.assertIn("cs_CZ-kasandra-medium.onnx", err)
        self.assertIn("--accept-current", err)

    def test_wrong_language_is_deleted_and_reported(self):
        write_model(self.remote, language="en_US")
        code, _, err = self.run_main("--yes")
        self.assertEqual(code, 1)
        self.assertIn("není český", err)
        self.assertFalse((self.models / "cs_CZ-kasandra-medium.onnx").exists())
        self.assertFalse((self.models / "MODEL_LOCK.json").exists())

    def test_hash_mismatch_from_server_is_detected(self):
        original = fetch_model.download
        def lying(url, dest):
            sha, _ = original(url, dest)
            return sha, "0" * 64 if dest.suffix == ".onnx" else None
        fetch_model.download = lying
        self.addCleanup(setattr, fetch_model, "download", original)
        code, _, err = self.run_main("--yes")
        self.assertEqual(code, 1)
        self.assertIn("neshoduje", err)
        self.assertFalse((self.models / "cs_CZ-kasandra-medium.onnx").exists())

    def _serve_like_huggingface(self, linked_etag_for_onnx=None):
        """Lokální HTTP server po vzoru HuggingFace/Xet: 302 s X-Linked-ETag (skutečný SHA-256),
        koncová odpověď nese jiný ETag (interní hash úložiště) a X-Xet-Hash."""
        import hashlib
        import http.server
        import threading

        remote = self.remote

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                if self.path.startswith("/cdn/"):
                    data = (remote / self.path[len("/cdn/"):]).read_bytes()
                    self.send_response(200)
                    self.send_header("ETag", '"' + "e" * 64 + '"')
                    self.send_header("X-Xet-Hash", "e" * 64)
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
                name = self.path.lstrip("/")
                data = (remote / name).read_bytes()
                self.send_response(302)
                self.send_header("Location", "/cdn/" + name)
                if name.endswith(".onnx"):
                    self.send_header("X-Linked-ETag", '"' + (linked_etag_for_onnx or hashlib.sha256(data).hexdigest()) + '"')
                self.send_header("Content-Length", "0")
                self.end_headers()

        srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        self.base = f"http://127.0.0.1:{srv.server_address[1]}"

    def test_redirect_with_linked_etag_is_verified_against_it_not_cdn_etag(self):
        self._serve_like_huggingface()
        code, out, err = self.run_main("--yes")
        self.assertEqual(code, 0, err)
        self.assertIn("Otisk ověřen proti serveru: ano", out)
        lock = json.loads((self.models / "MODEL_LOCK.json").read_text(encoding="utf-8"))
        self.assertTrue(lock["integrity_verified_against_server_hash"])

    def test_redirect_with_wrong_linked_etag_is_still_rejected(self):
        self._serve_like_huggingface(linked_etag_for_onnx="0" * 64)
        code, _, err = self.run_main("--yes")
        self.assertEqual(code, 1)
        self.assertIn("neshoduje", err)
        self.assertFalse((self.models / "cs_CZ-kasandra-medium.onnx").exists())

    def test_accept_current_records_manually_placed_voice(self):
        write_model(self.models)
        code, out, _ = self.run_main("--accept-current")
        self.assertEqual(code, 0)
        self.assertEqual(TtsService(self.models, Path(self.tmp.name) / "c", FakeEngine()).status()["model"]["lock"], "ok")
        # výměna souboru → změna se hlásí, dokud ji dospělý znovu nepotvrdí
        (self.models / "cs_CZ-kasandra-medium.onnx").write_bytes(b"q" * 4096)
        self.assertEqual(TtsService(self.models, Path(self.tmp.name) / "c", FakeEngine()).status()["status"], "model_changed")
        self.assertEqual(self.run_main("--accept-current")[0], 0)
        self.assertEqual(TtsService(self.models, Path(self.tmp.name) / "c", FakeEngine()).status()["status"], "ready")

    def test_accept_current_without_files_fails(self):
        code, _, err = self.run_main("--accept-current")
        self.assertEqual(code, 1)
        self.assertIn("chybí", err)


if __name__ == "__main__":
    unittest.main()

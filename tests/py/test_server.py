import http.client
import json
import sys
import tempfile
import threading
import unittest
import wave
import io
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "server"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakes import FakeEngine, make_body, write_model  # noqa: E402
from diktaty_server import App, make_server  # noqa: E402
from tts_service import TtsService  # noqa: E402


class ServerCase(unittest.TestCase):
    with_model = True

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        t = Path(self.tmp.name)
        (t / "web" / "js").mkdir(parents=True)
        (t / "web" / "index.html").write_text("<!doctype html><title>t</title>", encoding="utf-8")
        (t / "web" / "js" / "app.js").write_text("export {};", encoding="utf-8")
        (t / "data").mkdir()
        (t / "data" / "dictations.seed.json").write_text('{"dictations": []}', encoding="utf-8")
        (t / "data" / "profiles.json").write_text("{}", encoding="utf-8")
        (t / "data" / "secret.json").write_text('{"secret": true}', encoding="utf-8")
        (t / "secret.txt").write_text("nesmí ven", encoding="utf-8")
        if self.with_model:
            write_model(t / "models")
        self.engine = FakeEngine()
        tts = TtsService(t / "models", t / "cache", self.engine)
        self.app = App(tts, t / "web", t / "data", t / "user")
        self.httpd = make_server(self.app, 0)
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)

    def req(self, method, path, body=None, headers=None, host=None, raw=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        h = {"Host": host or f"127.0.0.1:{self.port}"}
        h.update(headers or {})
        data = raw
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            h.setdefault("Content-Type", "application/json")
        conn.request(method, path, body=data, headers=h)
        res = conn.getresponse()
        payload = res.read()
        conn.close()
        return res, payload


class Binding(ServerCase):
    def test_listens_only_on_loopback(self):
        self.assertEqual(self.httpd.server_address[0], "127.0.0.1")


class StaticAndGuards(ServerCase):
    def test_serves_app_and_whitelisted_data_only(self):
        r, b = self.req("GET", "/")
        self.assertEqual((r.status, r.getheader("Content-Type")), (200, "text/html; charset=utf-8"))
        self.assertIn(b"<title>t</title>", b)
        self.assertEqual(self.req("GET", "/js/app.js")[0].getheader("Content-Type"), "text/javascript; charset=utf-8")
        self.assertEqual(self.req("GET", "/data/dictations.seed.json")[0].status, 200)
        self.assertEqual(self.req("GET", "/data/profiles.json")[0].status, 200)
        self.assertEqual(self.req("GET", "/data/secret.json")[0].status, 404)

    def test_path_traversal_and_unknown_types_are_refused(self):
        for p in ["/../secret.txt", "/%2e%2e/secret.txt", "/js/../../secret.txt", "/..%2fsecret.txt", "/data/../secret.txt", "/models/MODEL_LOCK.json", "/cache/x.wav"]:
            self.assertEqual(self.req("GET", p)[0].status, 404, p)

    def test_security_headers(self):
        r, _ = self.req("GET", "/")
        csp = r.getheader("Content-Security-Policy")
        self.assertIn("default-src 'none'", csp)
        self.assertIn("connect-src 'self'", csp)
        self.assertNotIn("http", csp.replace("http://", "x"))  # žádný externí původ
        self.assertEqual(r.getheader("X-Content-Type-Options"), "nosniff")

    def test_foreign_host_header_is_rejected(self):
        r, _ = self.req("GET", "/api/health", host="evil.example")
        self.assertEqual(r.status, 403)
        r, _ = self.req("GET", "/", host=f"attacker.test:{self.port}")
        self.assertEqual(r.status, 403)

    def test_cross_origin_writes_are_rejected(self):
        r, _ = self.req("POST", "/api/tts", make_body(), headers={"Origin": "http://evil.example"})
        self.assertEqual(r.status, 403)
        r, _ = self.req("PUT", "/api/reviews", {"schema": 1, "items": {}}, headers={"Origin": "http://evil.example"})
        self.assertEqual(r.status, 403)
        r, _ = self.req("DELETE", "/api/packs/abc", headers={"Origin": "http://evil.example"})
        self.assertEqual(r.status, 403)

    def test_json_content_type_required_and_size_limited(self):
        r, _ = self.req("POST", "/api/tts", raw=b"{}", headers={"Content-Type": "text/plain"})
        self.assertEqual(r.status, 415)
        self.assertEqual(r.getheader("Connection"), "close", "odmítnuté tělo se nepřečetlo → spojení se zavře")
        # Příliš velké tělo: rozhodne se podle hlavičky, tělo se nečte a spojení se zavře
        # (jinak by nepřečtená data zkomolila další požadavek na stejném spojení).
        import socket
        with socket.create_connection(("127.0.0.1", self.port), timeout=5) as sock:
            sock.sendall((f"POST /api/tts HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\nContent-Type: application/json\r\nContent-Length: {3 * 1024 * 1024}\r\n\r\n").encode())
            head = sock.recv(4096).decode("latin-1")
        self.assertTrue(head.startswith("HTTP/1.1 413"), head)
        self.assertIn("Connection: close", head)
        r, b = self.req("POST", "/api/tts", raw=b"{nejson", headers={"Content-Type": "application/json"})
        self.assertEqual((r.status, json.loads(b)["error"]["code"]), (400, "bad_request"))


class Tts(ServerCase):
    def test_health_ready(self):
        r, b = self.req("GET", "/api/health")
        h = json.loads(b)
        self.assertEqual((r.status, h["status"], h["ready"]), (200, "ready", True))
        self.assertEqual(h["model"]["id"], "cs_CZ-kasandra-medium")
        self.assertIn("sound_check_text", h)

    def test_tts_returns_wav_and_cache_headers(self):
        r, b = self.req("POST", "/api/tts", make_body())
        self.assertEqual((r.status, r.getheader("Content-Type"), r.getheader("X-Diktaty-Cache")), (200, "audio/wav", "miss"))
        with wave.open(io.BytesIO(b)) as w:
            self.assertGreater(w.getnframes(), 0)
        r, _ = self.req("POST", "/api/tts", make_body())
        self.assertEqual(r.getheader("X-Diktaty-Cache"), "hit")
        self.assertEqual(r.getheader("X-Diktaty-Model"), "cs_CZ-kasandra-medium")

    def test_version_mismatch_is_409(self):
        body = make_body()
        body["dictation"]["text"] += " Navíc."
        r, b = self.req("POST", "/api/tts", body)
        self.assertEqual((r.status, json.loads(b)["error"]["code"]), (409, "version_mismatch"))

    def test_synthesis_error_is_500_with_message_and_no_audio(self):
        self.engine.fail_synth = True
        r, b = self.req("POST", "/api/tts", make_body())
        self.assertEqual(r.status, 500)
        self.assertEqual(json.loads(b)["error"]["code"], "synthesis_failed")


class NoModel(ServerCase):
    with_model = False

    def test_missing_model_gives_503_with_remedy_and_never_fakes_audio(self):
        r, b = self.req("GET", "/api/health")
        h = json.loads(b)
        self.assertEqual((h["status"], h["ready"]), ("model_missing", False))
        self.assertIn("fetch_model.py", h["error"]["hint"])
        r, b = self.req("POST", "/api/tts", make_body())
        self.assertEqual(r.status, 503)
        self.assertEqual(json.loads(b)["error"]["code"], "model_missing")
        self.assertEqual(self.engine.synth_calls, [])
        # aplikace samotná i data zůstávají dostupná (příprava diktátu bez hlasu)
        self.assertEqual(self.req("GET", "/")[0].status, 200)


class PacksAndReviews(ServerCase):
    def test_pack_roundtrip(self):
        pack = {"pack_id": "moje-sada", "pack_version": 1, "dictations": []}
        r, _ = self.req("PUT", "/api/packs/moje-sada", pack)
        self.assertEqual(r.status, 200)
        r, b = self.req("GET", "/api/packs")
        packs = json.loads(b)["packs"]
        self.assertEqual([p["data"]["pack_id"] for p in packs], ["moje-sada"])
        self.assertEqual(self.req("DELETE", "/api/packs/moje-sada")[0].status, 200)
        self.assertEqual(json.loads(self.req("GET", "/api/packs")[1])["packs"], [])

    def test_pack_id_mismatch_and_bad_names(self):
        self.assertEqual(self.req("PUT", "/api/packs/a-b", {"pack_id": "jine"})[0].status, 400)
        self.assertEqual(self.req("PUT", "/api/packs/..%2fevil", {"pack_id": "..%2fevil"})[0].status, 400)
        self.assertEqual(self.req("PUT", "/api/packs/x", [1, 2])[0].status, 400)
        self.assertEqual(list((Path(self.tmp.name) / "user" / "packs").glob("*")), [])

    def test_corrupt_pack_on_disk_is_reported_not_fatal(self):
        (self.app.packs_dir / "rozbity.json").write_text("{not json", encoding="utf-8")
        self.req("PUT", "/api/packs/dobry", {"pack_id": "dobry"})
        packs = json.loads(self.req("GET", "/api/packs")[1])["packs"]
        by_file = {p["file"]: p for p in packs}
        self.assertIsNone(by_file["rozbity.json"]["data"])
        self.assertIn("poškozený", by_file["rozbity.json"]["error"])
        self.assertEqual(by_file["dobry.json"]["data"]["pack_id"], "dobry")

    def test_reviews_roundtrip_and_validation(self):
        self.assertEqual(json.loads(self.req("GET", "/api/reviews")[1]), {"schema": 1, "items": {}})
        doc = {"schema": 1, "items": {"D01": {"status": "reviewed_ok"}}}
        self.assertEqual(self.req("PUT", "/api/reviews", doc)[0].status, 200)
        self.assertEqual(json.loads(self.req("GET", "/api/reviews")[1]), doc)
        self.assertEqual(self.req("PUT", "/api/reviews", {"schema": 2})[0].status, 400)
        (self.app.reviews_path).write_text("{rozbito", encoding="utf-8")
        r, b = self.req("GET", "/api/reviews")
        self.assertEqual((r.status, json.loads(b)["error"]["code"]), (500, "reviews_corrupt"))


if __name__ == "__main__":
    unittest.main()

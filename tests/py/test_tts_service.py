import copy
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "server"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakes import FakeEngine, make_body, write_model  # noqa: E402
from tts_service import (  # noqa: E402
    PiperEngine, SOUND_CHECK_TEXT, TtsError, TtsService, parse_request, sha256_text, speech_text,
)

FULL = "Máma má maso. Ema má mák. Ota má salát."


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.models = Path(self.tmp.name) / "models"
        self.cache = Path(self.tmp.name) / "cache"

    def service(self, engine=None, model=True):
        if model:
            write_model(self.models)
        self.models.mkdir(exist_ok=True)
        return TtsService(self.models, self.cache, engine or FakeEngine())


class RequestValidation(unittest.TestCase):
    def test_valid_segment_and_full(self):
        r = parse_request(make_body())
        self.assertEqual((r.purpose, r.dictation_id, r.text), ("segment", "D01", "Máma má maso."))
        self.assertEqual(parse_request(make_body(purpose="full")).text, FULL)

    def test_version_mismatch_when_text_does_not_match_checksum(self):
        body = make_body()
        body["dictation"]["text"] = FULL.replace("Ema", "Ela")
        with self.assertRaises(TtsError) as cm:
            parse_request(body)
        self.assertEqual((cm.exception.code, cm.exception.status), ("version_mismatch", 409))

    def test_segment_must_belong_to_the_dictation(self):
        with self.assertRaises(TtsError) as cm:
            parse_request(make_body(text="Táta má sůl."))
        self.assertEqual(cm.exception.code, "segment_mismatch")
        body = make_body(purpose="full")
        body["segment"]["text"] = "Máma má maso."
        with self.assertRaises(TtsError) as cm:
            parse_request(body)
        self.assertEqual(cm.exception.code, "segment_mismatch")

    def test_technical_markup_and_phoneme_blocks_never_reach_the_voice(self):
        for bad in ["Máma [[mˈaːma]] má maso.", "Máma <b>má</b>.", "**Máma** má maso.", "Máma_má.", "Máma {má}."]:
            full = bad
            body = make_body(text=bad, full=full)
            with self.assertRaises(TtsError, msg=bad) as cm:
                parse_request(body)
            self.assertEqual(cm.exception.code, "not_speakable", bad)

    def test_length_scale_range_and_types(self):
        for bad in [0.1, 3.0, "rychle", None, float("nan")]:
            with self.assertRaises(TtsError, msg=str(bad)):
                parse_request(make_body(length_scale=bad))
        self.assertEqual(parse_request(make_body(length_scale=1.35)).length_scale, 1.35)

    def test_sound_check_allows_only_the_fixed_phrase(self):
        ok = {"purpose": "check", "length_scale": 1.0, "segment": {"id": "sound-check", "text": SOUND_CHECK_TEXT}}
        self.assertEqual(parse_request(ok).purpose, "check")
        bad = copy.deepcopy(ok)
        bad["segment"]["text"] = "Řekni cokoli jiného."
        with self.assertRaises(TtsError):
            parse_request(bad)

    def test_garbage_bodies(self):
        for bad in [None, [], "x", {}, {"purpose": "segment"}, {"purpose": "segment", "segment": {"id": "a", "text": 5}}]:
            with self.assertRaises(TtsError):
                parse_request(bad)


class SpeechText(unittest.TestCase):
    def test_default_reads_canonical_text_unchanged(self):
        self.assertEqual(speech_text("Studenti,  kteří se učili, uspěli."), "Studenti, kteří se učili, uspěli.")
        self.assertEqual(speech_text("Slíbil jsem, že knihu vrátím."), "Slíbil jsem, že knihu vrátím.")

    def test_punctuation_names_only_when_hint_chosen(self):
        self.assertEqual(speech_text("Máma má maso.", True), "Máma má maso tečka.")
        self.assertEqual(speech_text("Když pršelo, schoval jsem se.", True), "Když pršelo čárka, schoval jsem se tečka.")
        self.assertNotIn("čárka", speech_text("Když pršelo, schoval jsem se.", False))


class ModelStates(Base):
    def test_engine_missing(self):
        st = self.service(FakeEngine(available=False), model=False).status()
        self.assertEqual((st["status"], st["ready"]), ("engine_missing", False))
        self.assertIn("requirements.txt", st["error"]["hint"])

    def test_model_missing_explains_how_to_fix_it_and_does_not_start_remote_tts(self):
        svc = self.service(model=False)
        st = svc.status()
        self.assertEqual(st["status"], "model_missing")
        self.assertIn("fetch_model.py", st["error"]["hint"])
        with self.assertRaises(TtsError) as cm:
            svc.synthesize(make_body())
        self.assertEqual((cm.exception.code, cm.exception.status), ("model_missing", 503))
        self.assertEqual(svc.engine.synth_calls, [])

    def test_not_a_czech_voice_is_refused(self):
        write_model(self.models, language="en_US")
        svc = TtsService(self.models, self.cache, FakeEngine())
        self.assertEqual(svc.status()["status"], "model_invalid")
        self.assertIn("není český", svc.status()["error"]["message"])

    def test_truncated_or_unparseable_files_are_invalid(self):
        write_model(self.models, payload=b"x" * 10)
        self.assertEqual(TtsService(self.models, self.cache, FakeEngine()).status()["status"], "model_invalid")
        write_model(self.models)
        (self.models / "cs_CZ-jirka-medium.onnx.json").write_text("{not json", encoding="utf-8")
        self.assertEqual(TtsService(self.models, self.cache, FakeEngine()).status()["status"], "model_invalid")

    def test_load_failure_is_reported_not_hidden(self):
        svc = self.service(FakeEngine(fail_load=True))
        with self.assertRaises(TtsError) as cm:
            svc.synthesize(make_body())
        self.assertEqual(cm.exception.code, "model_invalid")

    def test_voice_change_is_not_silent(self):
        svc = self.service()
        svc.synthesize(make_body())
        self.assertEqual(svc.status()["model"]["lock"], "ok")
        (self.models / "cs_CZ-jirka-medium.onnx").write_bytes(b"y" * 4096)  # jiný model pod stejným jménem
        svc2 = TtsService(self.models, self.cache, FakeEngine())
        st = svc2.status()
        self.assertEqual(st["status"], "model_changed")
        with self.assertRaises(TtsError) as cm:
            svc2.synthesize(make_body())
        self.assertEqual(cm.exception.code, "model_changed")
        self.assertEqual(svc2.engine.synth_calls, [])

    def test_first_run_records_the_voice_in_a_lock_file(self):
        svc = self.service()
        self.assertEqual(svc.status()["model"]["lock"], "unlocked")
        svc.synthesize(make_body())
        lock = json.loads((self.models / "MODEL_LOCK.json").read_text(encoding="utf-8"))
        self.assertEqual(lock["model_id"], "cs_CZ-jirka-medium")
        self.assertEqual(len(lock["onnx_sha256"]), 64)


class Cache(Base):
    def test_model_loaded_once_and_second_request_is_served_from_cache(self):
        eng = FakeEngine()
        svc = self.service(eng)
        a = svc.synthesize(make_body())
        b = svc.synthesize(make_body())
        self.assertEqual((a["cache"], b["cache"]), ("miss", "hit"))
        self.assertEqual(a["wav"], b["wav"])
        self.assertEqual((eng.load_calls, len(eng.synth_calls)), (1, 1))
        svc.synthesize(make_body(text="Ema má mák."))
        self.assertEqual((eng.load_calls, len(eng.synth_calls)), (1, 2), "více úseků = jedno načtení modelu")

    def test_tempo_segmentation_and_version_are_part_of_the_key(self):
        eng = FakeEngine()
        svc = self.service(eng)
        svc.synthesize(make_body())
        self.assertEqual(svc.synthesize(make_body(length_scale=1.3))["cache"], "miss")
        self.assertEqual(svc.synthesize(make_body(length_scale=1.3))["cache"], "hit")
        other_segment = make_body()
        other_segment["segment"]["id"] = "D01-S09"
        self.assertEqual(svc.synthesize(other_segment)["cache"], "miss")
        v2 = make_body()
        v2["dictation"]["version"] = 2
        self.assertEqual(svc.synthesize(v2)["cache"], "miss")
        self.assertEqual(svc.synthesize(make_body(read_punctuation=True))["cache"], "miss")

    def test_editing_the_text_invalidates_old_audio_and_it_is_never_served_again(self):
        svc = self.service()
        old = svc.synthesize(make_body())
        old_wav = self.cache / f"{old['key']}.wav"
        self.assertTrue(old_wav.is_file())
        edited_full = "Máma má sýr. Ema má mák. Ota má salát."
        res = svc.synthesize(make_body(text="Máma má sýr.", full=edited_full))
        self.assertEqual(res["cache"], "miss")
        self.assertEqual(res["invalidated"], 1)
        self.assertFalse(old_wav.exists(), "staré audio je smazáno")
        self.assertFalse((self.cache / f"{old['key']}.json").exists())
        # původní znění se musí syntetizovat znovu, ne vzít ze staré cache
        again = svc.synthesize(make_body())
        self.assertEqual(again["cache"], "miss")

    def test_cache_survives_restart_and_is_dropped_for_another_model(self):
        svc = self.service()
        svc.synthesize(make_body())
        eng2 = FakeEngine()
        svc2 = TtsService(self.models, self.cache, eng2)
        self.assertEqual(svc2.synthesize(make_body())["cache"], "hit")
        self.assertEqual(eng2.synth_calls, [])
        # jiný model (po potvrzení změny) → staré zvuky jiného hlasu se nepoužijí
        write_model(self.models, payload=b"z" * 4096)
        (self.models / "MODEL_LOCK.json").unlink()
        svc3 = TtsService(self.models, self.cache, FakeEngine())
        self.assertEqual(svc3.synthesize(make_body())["cache"], "miss")

    def test_failed_synthesis_leaves_no_cache_entry_and_no_substitute(self):
        svc = self.service(FakeEngine(fail_synth=True))
        with self.assertRaises(TtsError) as cm:
            svc.synthesize(make_body())
        self.assertEqual((cm.exception.code, cm.exception.status), ("synthesis_failed", 500))
        self.assertEqual(list(self.cache.glob("*")), [])

    def test_concurrent_identical_requests_synthesize_once(self):
        eng = FakeEngine()
        svc = self.service(eng)
        results = []
        threads = [threading.Thread(target=lambda: results.append(svc.synthesize(make_body())["cache"])) for _ in range(8)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(sorted(results), ["hit"] * 7 + ["miss"])
        self.assertEqual(len(eng.synth_calls), 1)

    def test_clear_cache(self):
        svc = self.service()
        svc.synthesize(make_body())
        self.assertEqual(svc.clear_cache(), 1)
        self.assertEqual(svc.status()["cache"]["entries"], 0)

    def test_speech_text_is_derived_from_canonical_text(self):
        eng = FakeEngine()
        svc = self.service(eng)
        svc.synthesize(make_body())
        self.assertEqual(eng.synth_calls[0][0], "Máma má maso.")


@unittest.skipUnless(PiperEngine().available()[0], "piper-tts není nainstalován (pip install -r server/requirements.txt)")
class RealPiperEngine(Base):
    """Tyto testy běží proti skutečnému balíčku piper-tts (bez stažené řeči)."""

    def test_missing_model_with_real_engine(self):
        svc = TtsService(self.models, self.cache)
        st = svc.status()
        self.assertEqual(st["status"], "model_missing")
        self.assertEqual(st["engine"]["name"], "piper-tts")
        self.assertIsNotNone(st["engine"]["version"])
        with self.assertRaises(TtsError) as cm:
            svc.synthesize(make_body())
        self.assertEqual(cm.exception.code, "model_missing")

    def test_corrupted_model_with_real_engine_is_reported_as_invalid(self):
        write_model(self.models, payload=b"this is not an onnx model" * 200)
        svc = TtsService(self.models, self.cache)
        with self.assertRaises(TtsError) as cm:
            svc.synthesize(make_body())
        self.assertEqual(cm.exception.code, "model_invalid")
        self.assertIn("nepodařilo načíst", cm.exception.message)


if __name__ == "__main__":
    unittest.main()

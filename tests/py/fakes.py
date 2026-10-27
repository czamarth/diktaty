"""Testovací dvojník enginu. Slouží výhradně k ověření logiky služby (cache, verze, chyby).
NEGENERUJE řeč – vyrábí krátký tón. Nikdy se nepoužívá mimo testy."""
import io
import math
import struct
import wave


class FakeEngine:
    name = "fake-engine-for-tests"
    license = "n/a"

    def __init__(self, available=True, fail_load=False, fail_synth=False):
        self._available = available
        self.fail_load = fail_load
        self.fail_synth = fail_synth
        self.load_calls = 0
        self.synth_calls = []

    def available(self):
        return (True, None) if self._available else (False, "No module named 'piper'")

    def version(self):
        return "0.0-test"

    def load(self, onnx_path, config_path):
        self.load_calls += 1
        if self.fail_load:
            raise RuntimeError("simulovaná chyba načtení")
        return object()

    def synthesize(self, voice, text, length_scale):
        self.synth_calls.append((text, length_scale))
        if self.fail_synth:
            raise RuntimeError("simulovaná chyba syntézy")
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(22050)
            n = int(22050 * 0.05 * length_scale)
            w.writeframes(b"".join(struct.pack("<h", int(8000 * math.sin(i / 5))) for i in range(n)))
        return buf.getvalue()


def write_model(models_dir, model_id="cs_CZ-kasandra-medium", language="cs_CZ", payload=b"x" * 4096, sample_rate=22050):
    models_dir.mkdir(parents=True, exist_ok=True)
    (models_dir / f"{model_id}.onnx").write_bytes(payload)
    (models_dir / f"{model_id}.onnx.json").write_text(
        '{"audio": {"sample_rate": %d}, "language": {"code": "%s"}, "num_symbols": 10, "num_speakers": 1}' % (sample_rate, language),
        encoding="utf-8",
    )


def make_body(text="Máma má maso.", full="Máma má maso. Ema má mák. Ota má salát.", purpose="segment", **over):
    from tts_service import sha256_text

    body = {
        "purpose": purpose,
        "length_scale": 1.0,
        "read_punctuation": False,
        "segment": {"id": "D01-S01" if purpose == "segment" else "full", "text": text if purpose == "segment" else full},
        "dictation": {"id": "D01", "version": 1, "content_sha256": sha256_text(full), "text": full},
    }
    body.update(over)
    return body

"""Lokální služba pro předčítání diktátů (Piper). Bez sítě, bez náhradních hlasů.

Odpovědnosti:
  * ověřit, že je k dispozici engine i model hlasu, a srozumitelně popsat, co chybí;
  * model načíst jednou a obsloužit více úseků;
  * ověřit požadavek (verze textu, soulad úseku s diktátem, žádné technické značky);
  * ukládat WAV do mezipaměti podle verze textu, modelu, tempa a segmentace;
  * po úpravě textu zneplatnit staré audio, po změně modelu staré audio nepoužít.

Nikdy nepřechází na jiný hlas ani na vzdálenou službu: když něco chybí, vrátí chybu.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
import threading
import time
import unicodedata
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional

MODEL_ID = "cs_CZ-kasandra-medium"
SOUND_CHECK_TEXT = "Zvuk funguje. Můžeme začít."
CACHE_SCHEMA = 1
MIN_LENGTH_SCALE = 0.5
MAX_LENGTH_SCALE = 2.5
MAX_TEXT_CHARS = 2000

# Stejná pravidla jako speakableProblems() v web/js/text.js.
_SPEAKABLE = re.compile(r"^[\w\s.,!?;:…„“”\"'’‘()–—\-]*$", re.UNICODE)
_ID = re.compile(r"^[A-Za-z][A-Za-z0-9._-]{1,31}$")
_SHA = re.compile(r"^[0-9a-f]{64}$")


class TtsError(Exception):
    def __init__(self, code: str, message: str, hint: Optional[str] = None, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.hint = hint
        self.status = status

    def to_json(self) -> dict:
        return {"error": {"code": self.code, "message": self.message, "hint": self.hint}}


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def speakable_problems(text: str) -> list[str]:
    problems = []
    if not isinstance(text, str) or not text.strip():
        return ["text je prázdný"]
    if "_" in text or not _SPEAKABLE.match(text):
        problems.append("text obsahuje znaky nepovolené pro hlasový vstup")
    if "[[" in text or "]]" in text:
        problems.append("text obsahuje značku [[ ]]")
    return problems


_PUNCT_WORDS = [
    (re.compile(r"\s*\.\.\.|\s*…"), " tři tečky"),
    (re.compile(r"\s*,"), " čárka,"),
    (re.compile(r"\s*\."), " tečka."),
    (re.compile(r"\s*\?"), " otazník?"),
    (re.compile(r"\s*!"), " vykřičník!"),
    (re.compile(r"\s*:"), " dvojtečka:"),
    (re.compile(r"\s*;"), " středník;"),
]


def speech_text(text: str, read_punctuation: bool = False) -> str:
    """Hlasový vstup se odvozuje z kanonického znění. Jediná povolená úprava je
    předem zvolená nápověda „číst interpunkci“; jinak se text nemění."""
    out = unicodedata.normalize("NFC", re.sub(r"\s+", " ", text)).strip()
    if read_punctuation:
        for pattern, repl in _PUNCT_WORDS:
            out = pattern.sub(repl, out)
        out = re.sub(r"\s+", " ", out).strip()
    return out


@dataclass(frozen=True)
class SynthRequest:
    purpose: str
    length_scale: float
    read_punctuation: bool
    segment_id: str
    text: str
    dictation_id: Optional[str]
    dictation_version: Optional[int]
    content_sha256: Optional[str]


def parse_request(body: Any) -> SynthRequest:
    if not isinstance(body, dict):
        raise TtsError("bad_request", "Požadavek musí být objekt JSON.")
    purpose = body.get("purpose")
    if purpose not in ("segment", "full", "check"):
        raise TtsError("bad_request", "purpose musí být segment, full nebo check.")
    try:
        length_scale = float(body.get("length_scale", 1.0))
    except (TypeError, ValueError):
        raise TtsError("bad_request", "length_scale musí být číslo.")
    if not (MIN_LENGTH_SCALE <= length_scale <= MAX_LENGTH_SCALE) or length_scale != length_scale:
        raise TtsError("bad_request", f"length_scale musí být v rozsahu {MIN_LENGTH_SCALE}–{MAX_LENGTH_SCALE}.")
    read_punct = body.get("read_punctuation", False)
    if not isinstance(read_punct, bool):
        raise TtsError("bad_request", "read_punctuation musí být true/false.")
    seg = body.get("segment")
    if not isinstance(seg, dict) or not isinstance(seg.get("text"), str) or not isinstance(seg.get("id"), str):
        raise TtsError("bad_request", "Chybí segment {id, text}.")
    text = seg["text"]
    if len(text) > MAX_TEXT_CHARS:
        raise TtsError("bad_request", "Text je příliš dlouhý.")
    if text != unicodedata.normalize("NFC", text):
        raise TtsError("bad_request", "Text není v normalizaci Unicode NFC.")
    problems = speakable_problems(text)
    if problems:
        raise TtsError("not_speakable", "; ".join(problems))
    if not _ID.match(seg["id"]) and seg["id"] not in ("full", "sound-check"):
        raise TtsError("bad_request", "Neplatné ID segmentu.")

    if purpose == "check":
        if text != SOUND_CHECK_TEXT:
            raise TtsError("bad_request", "Pro ověření zvuku je povolen jen pevný text.")
        return SynthRequest(purpose, length_scale, False, seg["id"], text, None, None, None)

    d = body.get("dictation")
    if not isinstance(d, dict) or not isinstance(d.get("text"), str):
        raise TtsError("bad_request", "Chybí dictation {id, version, content_sha256, text}.")
    if not isinstance(d.get("id"), str) or not _ID.match(d["id"]):
        raise TtsError("bad_request", "Neplatné ID diktátu.")
    if not isinstance(d.get("version"), int) or isinstance(d["version"], bool) or d["version"] < 1:
        raise TtsError("bad_request", "Neplatná verze diktátu.")
    if not isinstance(d.get("content_sha256"), str) or not _SHA.match(d["content_sha256"]):
        raise TtsError("bad_request", "Neplatný kontrolní součet diktátu.")
    if sha256_text(d["text"]) != d["content_sha256"]:
        raise TtsError(
            "version_mismatch",
            "Text diktátu neodpovídá jeho kontrolnímu součtu. Zvuk a správné znění by patřily k různým verzím.",
            "Znovu načtěte stránku; pokud se chyba opakuje, datový balíček je poškozený.",
            status=409,
        )
    if purpose == "full" and text != d["text"]:
        raise TtsError("segment_mismatch", "Celý text pro přehrání se liší od textu diktátu.", status=409)
    if purpose == "segment" and text not in d["text"]:
        raise TtsError("segment_mismatch", "Úsek není součástí textu diktátu.", status=409)
    return SynthRequest(purpose, length_scale, read_punct, seg["id"], text, d["id"], d["version"], d["content_sha256"])


# ---------------------------------------------------------------------------
# Engine


class PiperEngine:
    """Adaptér na piper-tts (OHF-Voice/piper1-gpl). Ověřeno na piper-tts 1.8.0."""

    name = "piper-tts"
    license = "GPL-3.0-or-later"

    def available(self) -> tuple[bool, Optional[str]]:
        try:
            import piper  # noqa: F401
        except ImportError as e:
            return False, str(e)
        return True, None

    def version(self) -> Optional[str]:
        try:
            from importlib.metadata import version

            return version("piper-tts")
        except Exception:
            return None

    def load(self, onnx_path: Path, config_path: Path):
        from piper import PiperVoice

        return PiperVoice.load(str(onnx_path), config_path=str(config_path))

    def synthesize(self, voice, text: str, length_scale: float) -> bytes:
        from piper import SynthesisConfig

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wav:
            voice.synthesize_wav(text, wav, syn_config=SynthesisConfig(length_scale=length_scale))
        return buf.getvalue()


# ---------------------------------------------------------------------------
# Služba


class TtsService:
    def __init__(self, models_dir: Path, cache_dir: Path, engine=None, model_id: str = MODEL_ID):
        self.models_dir = Path(models_dir)
        self.cache_dir = Path(cache_dir)
        self.engine = engine or PiperEngine()
        self.model_id = model_id
        self.onnx_path = self.models_dir / f"{model_id}.onnx"
        self.config_path = self.models_dir / f"{model_id}.onnx.json"
        self.lock_path = self.models_dir / "MODEL_LOCK.json"
        self._lock = threading.Lock()
        self._voice = None
        self._voice_sha: Optional[str] = None
        self._hash_cache: dict[tuple, str] = {}
        self._index: dict[str, dict] = {}
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._load_index()

    # --- stav modelu -------------------------------------------------------

    def _file_sha(self, path: Path) -> str:
        st = path.stat()
        key = (str(path), st.st_size, st.st_mtime_ns)
        if key not in self._hash_cache:
            self._hash_cache[key] = sha256_file(path)
        return self._hash_cache[key]

    def validate_model_files(self) -> dict:
        """Zkontroluje soubory modelu bez ohledu na engine (nic nenačítá).
        Vrátí {'status': 'ok'|'model_missing'|'model_invalid', 'error': TtsError|None, 'sample_rate': int}."""
        missing = [p.name for p in (self.onnx_path, self.config_path) if not p.is_file()]
        if missing:
            return {
                "status": "model_missing",
                "error": TtsError(
                    "model_missing",
                    f"Chybí model hlasu {self.model_id} ({', '.join(missing)}).",
                    "Stáhněte jej jednorázově příkazem: python3 server/fetch_model.py (potřebuje internet, dále už ne).",
                    503,
                ),
            }
        try:
            cfg = json.loads(self.config_path.read_text(encoding="utf-8"))
            if not isinstance(cfg, dict) or int(cfg["audio"]["sample_rate"]) <= 0:
                raise ValueError("chybí audio.sample_rate")
            lang = (cfg.get("language") or {}).get("code") or (cfg.get("espeak") or {}).get("voice") or ""
            if lang and not str(lang).lower().startswith("cs"):
                raise ValueError(f"model není český (jazyk {lang})")
            if self.onnx_path.stat().st_size < 1024:
                raise ValueError("soubor modelu je příliš malý")
        except (ValueError, KeyError, TypeError, OSError) as e:
            return {
                "status": "model_invalid",
                "error": TtsError(
                    "model_invalid",
                    f"Model hlasu je poškozený nebo nevhodný: {e}.",
                    "Smažte složku models/ a znovu spusťte: python3 server/fetch_model.py",
                    503,
                ),
            }
        return {"status": "ok", "error": None, "sample_rate": int(cfg["audio"]["sample_rate"])}

    def _check_model(self) -> dict:
        """Vrátí {'status': ..., 'error': TtsError|None, 'lock': ..., 'sha256': ...} bez načtení modelu."""
        ok, why = self.engine.available()
        if not ok:
            return {
                "status": "engine_missing",
                "error": TtsError(
                    "engine_missing",
                    "Není nainstalován lokální engine Piper (balíček piper-tts).",
                    "Nainstalujte jej příkazem: python3 -m pip install -r server/requirements.txt",
                    503,
                ),
            }
        files = self.validate_model_files()
        if files["status"] != "ok":
            return files
        sha = self._file_sha(self.onnx_path)
        lock = self._read_lock()
        if lock is None:
            return {"status": "ready", "lock": "unlocked", "sha256": sha, "error": None, "sample_rate": files["sample_rate"]}
        if lock.get("model_id") != self.model_id or lock.get("onnx_sha256") != sha:
            return {
                "status": "model_changed",
                "sha256": sha,
                "lock": "mismatch",
                "error": TtsError(
                    "model_changed",
                    "Soubor modelu se liší od modelu zaznamenaného při stažení. Hlas se nesmí změnit potichu.",
                    "Pokud jste hlas vyměnili záměrně, potvrďte to: python3 server/fetch_model.py --accept-current",
                    503,
                ),
            }
        return {"status": "ready", "lock": "ok", "sha256": sha, "error": None, "sample_rate": files["sample_rate"]}

    def _read_lock(self) -> Optional[dict]:
        try:
            return json.loads(self.lock_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def write_lock(self, extra: Optional[dict] = None) -> dict:
        lock = {
            "model_id": self.model_id,
            "onnx_sha256": sha256_file(self.onnx_path),
            "config_sha256": sha256_file(self.config_path),
            "locked_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "note": "Záznam o použitém hlasu. Změna souboru modelu se hlásí; hlas se nemění potichu.",
            **(extra or {}),
        }
        tmp = self.lock_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(lock, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, self.lock_path)
        return lock

    def status(self) -> dict:
        info = self._check_model()
        err: Optional[TtsError] = info.get("error")
        metas = list(self._index.values())  # snímek: syntéza může index měnit v jiném vlákně
        entries = len(metas)
        size = sum(m.get("bytes", 0) for m in metas)
        return {
            "status": info["status"],
            "ready": info["status"] == "ready",
            "model": {
                "id": self.model_id,
                "file": self.onnx_path.name,
                "sha256": info.get("sha256"),
                "lock": info.get("lock"),
                "sample_rate": info.get("sample_rate"),
            },
            "engine": {
                "name": self.engine.name,
                "version": self.engine.version(),
                "license": getattr(self.engine, "license", None),
            },
            "cache": {"entries": entries, "bytes": size},
            "sound_check_text": SOUND_CHECK_TEXT,
            "error": None if err is None else err.to_json()["error"],
        }

    # --- načtení modelu ---------------------------------------------------

    def _ensure_voice(self):
        info = self._check_model()
        if info["status"] != "ready":
            self._voice = None
            raise info["error"]
        if self._voice is not None and self._voice_sha == info["sha256"]:
            return self._voice, info["sha256"]
        try:
            self._voice = self.engine.load(self.onnx_path, self.config_path)
        except Exception as e:  # onnxruntime/piper hlásí řadu různých výjimek
            self._voice = None
            raise TtsError(
                "model_invalid",
                f"Model hlasu se nepodařilo načíst: {e}",
                "Smažte složku models/ a znovu spusťte: python3 server/fetch_model.py",
                503,
            )
        self._voice_sha = info["sha256"]
        if info["lock"] == "unlocked":
            self.write_lock({"source": "první načtení bez záznamu o stažení (hash zaznamenán při prvním spuštění)"})
        self._prune_foreign_model()
        return self._voice, info["sha256"]

    # --- mezipaměť ---------------------------------------------------------

    def _load_index(self) -> None:
        self._index.clear()
        for meta_path in self.cache_dir.glob("*.json"):
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                if (self.cache_dir / f"{meta['key']}.wav").is_file():
                    self._index[meta["key"]] = meta
                else:
                    meta_path.unlink(missing_ok=True)
            except (OSError, ValueError, KeyError):
                meta_path.unlink(missing_ok=True)

    def _drop(self, key: str) -> None:
        self._index.pop(key, None)
        for ext in ("wav", "json"):
            (self.cache_dir / f"{key}.{ext}").unlink(missing_ok=True)

    def _prune_foreign_model(self) -> int:
        stale = [k for k, m in self._index.items() if m.get("model_sha256") != self._voice_sha]
        for k in stale:
            self._drop(k)
        return len(stale)

    def invalidate_stale(self, dictation_id: str, content_sha256: str) -> int:
        """Úprava textu zneplatní staré audio téhož diktátu."""
        stale = [
            k for k, m in self._index.items()
            if (m.get("dictation") or {}).get("id") == dictation_id and (m.get("dictation") or {}).get("content_sha256") != content_sha256
        ]
        for k in stale:
            self._drop(k)
        return len(stale)

    def clear_cache(self) -> int:
        with self._lock:
            keys = list(self._index)
            for k in keys:
                self._drop(k)
            return len(keys)

    def cache_key(self, model_sha: str, req: SynthRequest, speech: str) -> str:
        material = {
            "schema": CACHE_SCHEMA,
            "model_id": self.model_id,
            "model_sha256": model_sha,
            "engine": self.engine.name,
            "engine_version": self.engine.version(),
            "length_scale": round(req.length_scale, 3),
            "purpose": req.purpose,
            "dictation": None if req.dictation_id is None else {"id": req.dictation_id, "version": req.dictation_version, "content_sha256": req.content_sha256},
            "segment_id": req.segment_id,
            "speech_sha256": sha256_text(speech),
            "read_punctuation": req.read_punctuation,
        }
        return sha256_text(json.dumps(material, sort_keys=True, ensure_ascii=False))

    # --- syntéza -----------------------------------------------------------

    def synthesize(self, body: Any) -> dict:
        """Vrátí {'wav': bytes, 'cache': 'hit'|'miss', 'key': str, 'invalidated': int}."""
        req = parse_request(body)
        speech = speech_text(req.text, req.read_punctuation)
        with self._lock:
            voice, model_sha = self._ensure_voice()
            invalidated = 0
            if req.dictation_id is not None:
                invalidated = self.invalidate_stale(req.dictation_id, req.content_sha256)
            key = self.cache_key(model_sha, req, speech)
            wav_path = self.cache_dir / f"{key}.wav"
            if key in self._index and wav_path.is_file():
                return {"wav": wav_path.read_bytes(), "cache": "hit", "key": key, "invalidated": invalidated}
            try:
                wav = self.engine.synthesize(voice, speech, req.length_scale)
            except Exception as e:
                raise TtsError("synthesis_failed", f"Syntéza hlasu selhala: {e}", "Zkuste větu zopakovat; pokud se chyba opakuje, restartujte službu.", 500)
            if not wav:
                raise TtsError("synthesis_failed", "Syntéza nevrátila žádný zvuk.", None, 500)
            meta = {
                "key": key,
                "created": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "purpose": req.purpose,
                "dictation": None if req.dictation_id is None else {"id": req.dictation_id, "version": req.dictation_version, "content_sha256": req.content_sha256},
                "segment_id": req.segment_id,
                "length_scale": round(req.length_scale, 3),
                "read_punctuation": req.read_punctuation,
                "text": req.text,
                "speech_text": speech,
                "model_id": self.model_id,
                "model_sha256": model_sha,
                "engine": self.engine.name,
                "engine_version": self.engine.version(),
                "bytes": len(wav),
            }
            tmp_wav = wav_path.with_suffix(".wav.tmp")
            tmp_wav.write_bytes(wav)
            os.replace(tmp_wav, wav_path)
            meta_path = self.cache_dir / f"{key}.json"
            tmp_meta = meta_path.with_suffix(".json.tmp")
            tmp_meta.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
            os.replace(tmp_meta, meta_path)
            self._index[key] = meta
            return {"wav": wav, "cache": "miss", "key": key, "invalidated": invalidated}

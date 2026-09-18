"""Generate mousique's voice banks once: every note name and rhythm syllable, spoken, trimmed, levelled and
time-stretched to several lengths, packed into one MP3 per bank with a JSON index.

The app never synthesizes speech: it loads these banks and, for each note, picks the length closest to the
note's duration. Re-run only when the word lists or the voice change:

    python3 -m venv .venv && .venv/bin/pip install piper-tts
    .venv/bin/python generate.py            # needs sox, rubberband and ffmpeg on PATH

Voices (downloaded into models/ by this script) and their licences:
  fa_IR-amir-medium   — Piper, dataset CC0 (datacula.com)
  en_US-ljspeech-medium — Piper, LJ Speech dataset, public domain
so the generated clips can be published with the app.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import urllib.request
import wave
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODELS = HERE / "models"
OUT = HERE.parent.parent / "apps" / "web" / "public" / "voice"

VOICES = {
    "fa": ("fa/fa_IR/amir/medium", "fa_IR-amir-medium", "CC0 (dataset: datacula.com)"),
    "en": ("en/en_US/ljspeech/medium", "en_US-ljspeech-medium", "public domain (LJ Speech)"),
}

# Time-stretch factors (pitch preserved). Between two of them the app nudges the playback rate by a few percent.
FACTORS = [0.5, 0.7, 1.0, 1.4, 2.0]
GAP_S = 0.15  # silence between clips in a packed file, larger than any MP3 encoder offset
RATE = 22050

STEPS = ["C", "D", "E", "F", "G", "A", "B"]
ACCS = ["", "sharp", "flat", "koron", "sori"]

FA_STEP = {"C": "دو", "D": "رِ", "E": "می", "F": "فا", "G": "سُل", "A": "لا", "B": "سی"}
FA_ACC = {"sharp": "دیز", "flat": "بِمُل", "koron": "کُرُن", "sori": "سُری"}
SOLFEGE = {"C": "Do", "D": "Re", "E": "Mi", "F": "Fa", "G": "Sol", "A": "La", "B": "Si"}
EN_ACC = {"sharp": "sharp", "flat": "flat", "koron": "koron", "sori": "sori"}
LETTER = {"C": "C", "D": "D", "E": "E", "F": "F", "G": "G", "A": "A", "B": "B"}

# The eight quarter-beat words (packages/core/src/rhythm.ts), spoken whole: in this method a word's syllables
# already have the lengths of the notes, so a word fitted to its beat puts each syllable on its note. Single
# syllables are not used — the voice renders them unreliably (from 0.06 s to 0.8 s for the same syllable).
# Key: the word as the app's rhythmWords() spells it (syllables joined, no tatweel); value: what is spoken.
WORDS = {
    "راست": "راست",
    "راستُ": "راستُ",
    "رُباب": "رُباب",
    "میزد": "می‌زد",
    "میزَدُ": "می‌زَدُ",
    "بِزَدَم": "بِزَدَم",
    "بِزَدَمُ": "بِزَدَمُ",
    "رُبابُ": "رُبابُ",
}
SYLLABLE_COUNT = {"راست": 1, "راستُ": 2, "رُباب": 2, "میزد": 2, "میزَدُ": 3, "بِزَدَم": 3, "بِزَدَمُ": 4, "رُبابُ": 3}


def banks() -> dict[str, tuple[str, dict[str, str]]]:
    """bank name -> (voice, {clip key: text to speak})"""
    def names(step_words: dict[str, str], acc_words: dict[str, str], lang: str) -> dict[str, str]:
        out = {}
        for s in STEPS:
            for a in ACCS:
                key = f"{s}-{a}" if a else s
                out[key] = step_words[s] + (f" {acc_words[a]}" if a else "")
        return out

    return {
        "names-persian": ("fa", names(FA_STEP, FA_ACC, "fa")),
        "names-solfege": ("en", names(SOLFEGE, EN_ACC, "en")),
        "names-letters": ("en", names(LETTER, EN_ACC, "en")),
        "rhythm-words": ("fa", dict(WORDS)),
    }


def run(*cmd: str) -> None:
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def ensure_model(voice: str) -> Path:
    path, name, _ = VOICES[voice]
    MODELS.mkdir(exist_ok=True)
    onnx = MODELS / f"{name}.onnx"
    for ext in (".onnx", ".onnx.json"):
        target = MODELS / f"{name}{ext}"
        if not target.exists():
            url = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/{path}/{name}{ext}"
            urllib.request.urlretrieve(url, target)
    return onnx


_loaded: dict[Path, object] = {}

# Takes tried for every clip; the one whose trimmed length is closest to what the text should take is kept.
TAKES = [(1.0, 0.667), (1.0, 0.4), (1.0, 0.9), (1.2, 0.667), (1.2, 0.4), (1.35, 0.667)]


def expected_seconds(text: str) -> float:
    """A rough spoken length: about 0.3 s a syllable, counting written vowel marks and long vowels."""
    syllables = sum(ch in "اویَُِeaiouy" for ch in text.lower())
    return 0.3 * max(1, syllables)


def speak(model: Path, text: str, wav: Path, tmp: Path, expected: float | None = None) -> None:
    import math
    from piper import PiperVoice, SynthesisConfig

    voice = _loaded.get(model) or PiperVoice.load(str(model))
    _loaded[model] = voice
    target = expected or expected_seconds(text)
    best: tuple[float, Path] | None = None
    for i, (length, noise) in enumerate(TAKES):
        raw, trimmed = tmp / f"take{i}.wav", tmp / f"take{i}.trim.wav"
        with wave.open(str(raw), "wb") as w:
            voice.synthesize_wav(text + ".", w, syn_config=SynthesisConfig(length_scale=length, noise_scale=noise))
        run("sox", str(raw), str(trimmed), "silence", "1", "0.01", "0.5%", "reverse", "silence", "1", "0.01", "0.5%", "reverse")
        d = seconds(trimmed)
        if d < 0.05:
            continue
        score = abs(math.log(d / target))
        if best is None or score < best[0]:
            best = (score, raw)
    if best is None:
        raise RuntimeError(f"no usable take for {text!r}")
    shutil.copy(best[1], wav)


def seconds(wav: Path) -> float:
    with wave.open(str(wav)) as w:
        return w.getnframes() / w.getframerate()


def clean(src: Path, dst: Path) -> None:
    """Mono 22.05 kHz, silence trimmed at both ends, levelled, with short fades so clips never click."""
    trimmed = dst.with_suffix(".trim.wav")
    run("sox", str(src), "-r", str(RATE), "-c", "1", str(trimmed),
        "silence", "1", "0.01", "0.5%", "reverse", "silence", "1", "0.01", "0.5%", "reverse", "norm", "-3")
    # A second pass: the fade-out needs the trimmed length, which sox only knows once the file exists.
    run("sox", str(trimmed), str(dst), "fade", "t", "0.005", "-0", "0.02")


def stretch(src: Path, dst: Path, factor: float) -> None:
    if factor == 1.0:
        shutil.copy(src, dst)
    else:
        run("rubberband", "-3", "-t", str(factor), str(src), str(dst))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index: dict = {
        "generated": date.today().isoformat(),
        "factors": FACTORS,
        "voices": {k: {"model": v[1], "licence": v[2]} for k, v in VOICES.items()},
        "banks": {},
    }
    with tempfile.TemporaryDirectory() as tmp_s:
        tmp = Path(tmp_s)
        silence = tmp / "gap.wav"
        run("sox", "-n", "-r", str(RATE), "-c", "1", str(silence), "trim", "0", str(GAP_S))
        for bank, (voice, clips) in banks().items():
            model = ensure_model(voice)
            parts: list[Path] = [silence]
            cursor = GAP_S
            entries = {}
            for key, text in clips.items():
                raw, base = tmp / "raw.wav", tmp / f"{bank}-{len(entries)}.wav"
                expected = 0.32 * SYLLABLE_COUNT[key] if bank == "rhythm-words" else None
                speak(model, text, raw, tmp, expected)
                clean(raw, base)
                variants = []
                for f in FACTORS:
                    v = tmp / f"{bank}-{len(entries)}-{f}.wav"
                    stretch(base, v, f)
                    d = seconds(v)
                    variants.append({"factor": f, "start": round(cursor, 4), "duration": round(d, 4)})
                    parts += [v, silence]
                    cursor += d + GAP_S
                entries[key] = {"text": text, "variants": variants}
                if variants[2]["duration"] < 0.06:
                    print(f"warning: {bank}/{key} ({text}) is only {variants[2]['duration']:.3f}s")
            packed = tmp / f"{bank}.wav"
            run("sox", *map(str, parts), str(packed))
            run("ffmpeg", "-y", "-i", str(packed), "-codec:a", "libmp3lame", "-b:a", "64k", "-ac", "1",
                str(OUT / f"{bank}.mp3"))
            index["banks"][bank] = {"file": f"{bank}.mp3", "voice": voice, "clips": entries}
            print(f"{bank}: {len(entries)} clips, {cursor:.1f}s packed")
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n")


if __name__ == "__main__":
    main()

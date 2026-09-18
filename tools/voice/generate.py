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
# Each word's note pattern in sixteenths (its syllables' lengths), from the method's table.
PATTERN = {"راست": [4], "راستُ": [3, 1], "رُباب": [1, 3], "میزد": [2, 2], "میزَدُ": [2, 1, 1],
           "بِزَدَم": [1, 1, 2], "بِزَدَمُ": [1, 1, 1, 1], "رُبابُ": [1, 2, 1]}


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


def best_word_take(model: Path, text: str, units: list[int], tmp: Path) -> tuple[Path, dict]:
    """Speak a rhythm word in every take and keep the one whose syllables are found cleanly and whose natural
    spacing is closest to the word's note pattern."""
    from piper import PiperVoice, SynthesisConfig

    voice = _loaded.get(model) or PiperVoice.load(str(model))
    _loaded[model] = voice
    best = None
    for i, (length, noise) in enumerate(TAKES + [(1.1, 0.5), (1.1, 0.8), (0.9, 0.667)]):
        raw = tmp / f"word{i}.wav"
        with wave.open(str(raw), "wb") as w:
            voice.synthesize_wav(text + ".", w, syn_config=SynthesisConfig(length_scale=length, noise_scale=noise))
        norm = tmp / f"word{i}.norm.wav"
        run("sox", str(raw), "-r", str(RATE), "-c", "1", str(norm), "norm", "-3")
        a = analyse(norm, len(units))
        if not a:
            continue
        cost = warp_cost(a["onsets"], units)
        if best is None or cost < best[0]:
            best = (cost, norm, a)
    if best is None:
        raise RuntimeError(f"no take of {text!r} with {len(units)} clear syllables")
    keep = tmp / "word-best.wav"
    shutil.copy(best[1], keep)
    return keep, best[2]


def seconds(wav: Path) -> float:
    with wave.open(str(wav)) as w:
        return w.getnframes() / w.getframerate()


# ---- syllable analysis ------------------------------------------------------------------------------
#
# A syllable is heard at its vowel onset (its "perceptual centre"), not where its sound begins, so that is
# the moment that has to sit on the metronome grid. The voice gives no timing, but the number of syllables
# of every word is known: the vowel nuclei are the n strongest voiced energy peaks, and a vowel onset is
# halfway up the rise from the valley before its nucleus.

HOP = 0.005


def read_wav(path: Path):
    import numpy as np
    with wave.open(str(path)) as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float) / 32768
    return x, sr


def voiced_envelope(x, sr):
    import numpy as np
    hop, win = int(sr * HOP), int(sr * 0.025)
    frames = range(0, max(1, len(x) - win), hop)
    env = np.array([np.sqrt(np.mean(x[i:i + win] ** 2)) for i in frames])
    zcr = np.array([np.mean(np.abs(np.diff(np.sign(x[i:i + win])))) / 2 for i in frames])
    voiced = env * (zcr < 0.25)
    return np.convolve(voiced, np.ones(7) / 7, mode="same"), env


def analyse(path: Path, n: int) -> dict | None:
    """Vowel onsets, the valleys between syllables, and where sound starts and ends (all in seconds)."""
    import numpy as np
    x, sr = read_wav(path)
    s, env = voiced_envelope(x, sr)
    if len(s) < 10 or s.max() <= 0:
        return None
    cands = [i for i in range(1, len(s) - 1) if s[i] >= s[i - 1] and s[i] > s[i + 1] and s[i] > 0.12 * s.max()]
    keep: list[int] = []
    for p in sorted(cands, key=lambda i: -s[i]):
        if all(abs(p - q) * HOP >= 0.05 for q in keep):
            keep.append(p)
        if len(keep) == n:
            break
    if len(keep) != n:
        return None
    keep.sort()
    onsets, valleys, prev = [], [], 0
    for p in keep:
        v = prev + int(np.argmin(s[prev:p + 1]))
        half = s[v] + 0.5 * (s[p] - s[v])
        j = v
        while j < p and s[j] < half:
            j += 1
        onsets.append(j * HOP)
        valleys.append(v * HOP)
        prev = p
    loud = np.nonzero(env > 0.02 * env.max())[0]
    start, end = loud[0] * HOP, (loud[-1] + 1) * HOP + 0.025
    if any(b - a < 0.045 for a, b in zip(onsets, onsets[1:])):
        return None
    return {"onsets": onsets, "valleys": valleys, "start": start, "end": min(end, len(x) / sr)}


def clean(src: Path, dst: Path) -> None:
    """Mono 22.05 kHz, silence trimmed at both ends, levelled, with short fades so clips never click."""
    trimmed = dst.with_suffix(".trim.wav")
    run("sox", str(src), "-r", str(RATE), "-c", "1", str(trimmed),
        "silence", "1", "0.01", "0.5%", "reverse", "silence", "1", "0.01", "0.5%", "reverse", "norm", "-3")
    # A second pass: the fade-out needs the trimmed length, which sox only knows once the file exists.
    run("sox", str(trimmed), str(dst), "fade", "t", "0.005", "-0", "0.02")


# ---- rhythm words: every vowel onset on its sixteenth -----------------------------------------------

# Beat lengths the words are rendered at (quarter = 167 … 46 per minute); between two the app nudges the rate.
BEATS = [0.36, 0.46, 0.6, 0.78, 1.0, 1.3]
MAX_LEAD = 0.14      # consonants before the first vowel onset, kept at their natural length up to this
NEXT_LEAD = 0.08     # room left at the end of a beat for the next word's lead-in
ACCENT_DB = 2.0      # the syllable on the beat carries the accent ...
LIGHT_DB = -1.5      # ... the syllables between the beats are lighter


def pattern_onsets(units: list[int]) -> list[float]:
    """Where each syllable starts in the beat, as a fraction: [1, 1, 2] -> [0, 0.25, 0.5]."""
    out, acc = [], 0
    for u in units:
        out.append(acc / 4)
        acc += u
    return out


def warp_cost(onsets: list[float], units: list[int]) -> float:
    """How far a take's natural syllable spacing is from the pattern: the least-warped take sounds most natural."""
    import math
    if len(units) < 2:
        return 0.0
    got = [b - a for a, b in zip(onsets, onsets[1:])]
    want = units[:-1]
    g, w = sum(got), sum(want)
    return sum(abs(math.log((x / g) / (y / w))) for x, y in zip(got, want))


XFADE = 0.008  # each piece overlaps its neighbour by this much, cross-faded around the joint


def write_wav(path: Path, x, sr: int) -> None:
    import numpy as np
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def render_word(src: Path, a: dict, units: list[int], beat: float, dst: Path, tmp: Path) -> dict:
    """Place each vowel onset of a spoken word exactly on its sixteenth of a beat `beat` seconds long.

    The word is cut at its vowel onsets into pieces (lead-in consonants, each syllable, the tail), each piece
    is stretched on its own to an exact length (pitch kept), and the pieces are joined with short crossfades
    centred on the target moments — so the grid points are exact by construction. rubberband's own time map
    was tried first and drifts early in proportion to the stretch (up to 85 ms), which is why it is not used.
    The syllable on the beat carries the accent; the others are a little lighter."""
    import numpy as np

    x, sr = read_wav(src)
    onsets = a["onsets"]
    lead_in = min(MAX_LEAD, onsets[0] - a["start"])
    fracs = pattern_onsets(units)
    tail_in = a["end"] - onsets[-1]
    tail_out = min(tail_in, max(0.06, units[-1] / 4 * beat - NEXT_LEAD))
    src_b = [onsets[0] - lead_in] + onsets + [a["end"]]
    dst_b = [0.0] + [lead_in + f * beat for f in fracs] + [lead_in + fracs[-1] * beat + tail_out]
    total = int(round(dst_b[-1] * sr)) + int(XFADE * sr) + 1
    out = np.zeros(total)
    weight = np.zeros(total)
    for k in range(len(src_b) - 1):
        s0, s1 = src_b[k], src_b[k + 1]
        d0, d1 = dst_b[k], dst_b[k + 1]
        r = (d1 - d0) / max(1e-4, s1 - s0)
        # The piece plus an overlap on each side, so neighbours can cross-fade.
        e0, e1 = max(0.0, s0 - XFADE), min(len(x) / sr, s1 + XFADE)
        piece_in, piece_out = tmp / f"piece{k}.wav", tmp / f"piece{k}.out.wav"
        write_wav(piece_in, x[int(e0 * sr):int(e1 * sr)], sr)
        run("rubberband", "-3", "-D", f"{(e1 - e0) * r:.5f}", str(piece_in), str(piece_out))
        y, _ = read_wav(piece_out)
        gain = 10 ** ((ACCENT_DB if k <= 1 else LIGHT_DB) / 20)
        at = int(round((d0 - (s0 - e0) * r) * sr))       # where the piece's first sample goes
        # Trapezoid window: full weight over the piece, ramps over the overlaps.
        n = len(y)
        w = np.ones(n)
        ramp_in = int(round((s0 - e0) * r * sr * 2))
        ramp_out = int(round((e1 - s1) * r * sr * 2))
        if ramp_in > 0:
            w[:ramp_in] = np.linspace(0, 1, ramp_in, endpoint=False)
        if ramp_out > 0:
            w[n - ramp_out:] = np.linspace(1, 0, ramp_out)
        lo, hi = max(0, at), min(total, at + n)
        out[lo:hi] += (y * w * gain)[lo - at:hi - at]
        weight[lo:hi] += w[lo - at:hi - at]
    out = np.where(weight > 1e-3, out / np.maximum(weight, 1e-3), 0.0)
    out = out[: int(round(dst_b[-1] * sr))]
    fade = int(0.03 * sr)
    out[-fade:] *= np.linspace(1, 0, fade)
    out[: int(0.004 * sr)] *= np.linspace(0, 1, int(0.004 * sr))
    write_wav(dst, out, sr)
    return {"lead": round(lead_in, 4), "targets": [round(t, 4) for t in dst_b[1:-1]]}


PROBE_INSIDE = 0.015


def probe_error_ms(take: Path, a: dict, units: list[int], beat: float, tmp: Path) -> list[int]:
    """Check a rendering the way that cannot be fooled by stretched vowels: put a short tone burst 15 ms inside
    each syllable of a silent copy of the take, render it with the same cuts and lengths, and measure where
    each burst lands against where it must."""
    import numpy as np

    x, sr = read_wav(take)
    probe = np.zeros_like(x)
    t = np.arange(int(sr * 0.012)) / sr
    for o in a["onsets"]:
        i = int((o + PROBE_INSIDE) * sr)
        probe[i:i + len(t)] += 0.8 * np.sin(2 * np.pi * 1000 * t)
    pin, pout = tmp / "probe.wav", tmp / "probe.out.wav"
    write_wav(pin, probe, sr)
    info = render_word(pin, a, units, beat, pout, tmp)
    y, _ = read_wav(pout)
    env = np.convolve(np.abs(y), np.ones(int(sr * 0.002)) / int(sr * 0.002), mode="same")
    ons = a["onsets"] + [a["end"]]
    tg = info["targets"] + [None]
    errs = []
    for k, target in enumerate(info["targets"]):
        r = (tg[k + 1] - target) / (ons[k + 1] - ons[k]) if tg[k + 1] is not None else 1.0
        expect = target + PROBE_INSIDE * r
        i0, i1 = max(0, int((expect - 0.06) * sr)), int((expect + 0.06) * sr)
        seg = env[i0:i1]
        j = int(np.argmax(seg > 0.5 * seg.max())) if seg.size and seg.max() > 0 else 0
        errs.append(round(((i0 + j) / sr - expect) * 1000))
    return errs


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
        "beats": BEATS,
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
                if bank == "rhythm-words":
                    units = PATTERN[key]
                    take, a = best_word_take(model, text, units, tmp)
                    variants, report = [], []
                    for b in BEATS:
                        v = tmp / f"{bank}-{len(entries)}-{b}.wav"
                        info = render_word(take, a, units, b, v, tmp)
                        d = seconds(v)
                        report.append(probe_error_ms(take, a, units, b, tmp))
                        variants.append({"beat": b, "start": round(cursor, 4), "duration": round(d, 4), "lead": info["lead"]})
                        parts += [v, silence]
                        cursor += d + GAP_S
                    entries[key] = {"text": text, "units": units, "variants": variants}
                    print(f"  {key}: onset error ms per beat length {report}")
                    continue
                raw, base = tmp / "raw.wav", tmp / f"{bank}-{len(entries)}.wav"
                speak(model, text, raw, tmp)
                clean(raw, base)
                variants = []
                for f in FACTORS:
                    v = tmp / f"{bank}-{len(entries)}-{f}.wav"
                    stretch(base, v, f)
                    d = seconds(v)
                    a = analyse(v, 1)
                    lead = round(a["onsets"][0], 4) if a else 0.0
                    variants.append({"factor": f, "start": round(cursor, 4), "duration": round(d, 4), "lead": lead})
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

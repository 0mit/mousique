"""Measure the vowel the voice actually produced in each note name, as the first two formants (Hz).

A pronunciation complaint ("Sol sounds like sel") can be checked by ear only once; this makes it a number:
open o has F2 around 1000 Hz, é/è around 2000, i above 2500, a around 1300–1700 (higher after d, l, s).

    .venv/bin/python check_vowels.py            # the base names in the current names-french bank
    .venv/bin/python check_vowels.py Sôl Saule   # spellings, synthesized fresh (four takes each)
"""

from __future__ import annotations

import json
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

import generate as g


def formants(x, sr: int) -> list[float]:
    """F1 and F2 at the strongest voiced frame, by LPC (autocorrelation method, order 2 + sr/1000)."""
    s, _ = g.voiced_envelope(x, sr)
    c = int(int(np.argmax(s)) * g.HOP * sr)
    n = int(0.03 * sr)
    seg = x[max(0, c - n // 2): c + n // 2]
    seg = np.append(seg[0], seg[1:] - 0.97 * seg[:-1]) * np.hamming(len(seg))
    order = 2 + sr // 1000
    r = np.correlate(seg, seg, "full")[len(seg) - 1: len(seg) + order]
    a = np.linalg.solve(np.array([[r[abs(i - j)] for j in range(order)] for i in range(order)]), r[1:order + 1])
    roots = [z for z in np.roots(np.concatenate(([1], -a))) if np.imag(z) > 0]
    pairs = sorted((np.angle(z) * sr / (2 * np.pi), -np.log(abs(z)) * sr / np.pi) for z in roots)
    return [f for f, bw in pairs if f > 200 and bw < 500][:2]


def bank() -> None:
    idx = json.loads((g.OUT / "index.json").read_text())
    x, sr = g.read_wav(g.HERE / "out" / "names-french.wav")
    for k in "CDEFGAB":
        c = idx["banks"]["names-french"]["clips"][k]
        v = max(c["variants"], key=lambda v: v["factor"])
        seg = x[int(v["start"] * sr): int((v["start"] + v["duration"]) * sr)]
        print(f"{c['text']:5s} F1, F2 = {[round(f) for f in formants(seg, sr)]}")


def spellings(texts: list[str]) -> None:
    from piper import PiperVoice, SynthesisConfig

    voice = PiperVoice.load(str(g.ensure_model("fr")))
    with tempfile.TemporaryDirectory() as t:
        path = Path(t) / "v.wav"
        for text in texts:
            takes = []
            for ls, ns in [(1.0, 0.667), (1.0, 0.33), (1.12, 0.5), (0.9, 0.5)]:
                with wave.open(str(path), "wb") as w:
                    voice.synthesize_wav(text + ".", w, syn_config=SynthesisConfig(length_scale=ls, noise_scale=ns))
                x, sr = g.read_wav(path)
                takes.append([round(f) for f in formants(x, sr)])
            print(f"{text:8s} F1, F2 per take: {takes}")


if __name__ == "__main__":
    spellings(sys.argv[1:]) if len(sys.argv) > 1 else bank()

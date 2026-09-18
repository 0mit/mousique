import {
  beatGrid,
  buildTimeline,
  demoScore,
  frequencyHz,
  measureIndexAt,
  playbackNotes,
  validateScore,
  type Score,
  type Tuning,
} from '@mousique/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player } from './audio/player.ts';
import { ScoreView } from './score/ScoreView.tsx';

export function App() {
  const [score, setScore] = useState<Score>(demoScore);
  const [bpm, setBpm] = useState(demoScore.tempo.bpm);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(60);
  const [metronome, setMetronome] = useState(false);
  const [countIn, setCountIn] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loadError, setLoadError] = useState<string>();

  const playerRef = useRef<Player>(undefined);
  const player = (playerRef.current ??= new Player());

  const timeline = useMemo(() => buildTimeline(score), [score]);
  const problems = useMemo(() => validateScore(score), [score]);

  useEffect(() => {
    const meterAt = (q: number) => {
      const m = timeline.measures[measureIndexAt(timeline, q)];
      const t = m?.time ?? { beats: 4, beatType: 4 };
      return { beats: t.beats, beatQ: 4 / t.beatType };
    };
    player.setMaterial(playbackNotes(timeline), beatGrid(timeline), timeline.totalQ, meterAt);
  }, [player, timeline]);

  useEffect(() => player.setOptions({ bpm, speed, metronome, countIn }), [player, bpm, speed, metronome, countIn]);

  const getQ = useCallback(() => player.q(), [player]);

  const togglePlay = useCallback(async () => {
    if (player.isPlaying) {
      player.pause();
      setPlaying(false);
    } else {
      setPlaying(true);
      await player.play(undefined, () => setPlaying(false));
    }
  }, [player]);

  const stop = useCallback(() => {
    player.stop();
    setPlaying(false);
  }, [player]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        void togglePlay();
      } else if (e.code === 'Home') {
        player.seek(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, togglePlay]);

  const setTuning = (patch: Partial<Tuning>) => setScore((s) => ({ ...s, tuning: { ...s.tuning, ...patch } }));

  const loadFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Score;
      if (data.format !== 'mousique-score' || !Array.isArray(data.measures)) {
        throw new Error('not a mousique score (expected "format": "mousique-score")');
      }
      stop();
      setScore(data);
      setBpm(data.tempo?.bpm ?? 72);
      setLoadError(undefined);
    } catch (err) {
      setLoadError(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const saveFile = () => {
    const blob = new Blob([JSON.stringify(score, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${score.meta.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'score'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const t = score.tuning;
  const tuningCheck = () =>
    player.tuningCheck({
      natural: frequencyHz('A', 4, undefined, t),
      koron: frequencyHz('A', 4, 'koron', t),
      sori: frequencyHz('A', 4, 'sori', t),
    });

  return (
    <div className="m-app">
      <header className="m-top">
        <div className="m-brand">mousique</div>
        <h1 className="m-title" dir="auto">
          {score.meta.title}
        </h1>
        <div className="m-file">
          <label className="m-button">
            Open score…
            <input type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
          </label>
          <button className="m-button" onClick={saveFile}>
            Save
          </button>
        </div>
      </header>

      <section className="m-transport" aria-label="Transport">
        <button className="m-button m-primary" onClick={togglePlay} aria-pressed={playing}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button className="m-button" onClick={stop}>
          Stop
        </button>
        <Position getQ={getQ} timeline={timeline} bpm={bpm * speed} />
        <label className="m-field">
          Tempo
          <input type="number" min={20} max={300} value={bpm} onChange={(e) => setBpm(clamp(+e.target.value, 20, 300))} />
          <span className="m-unit">♩/min</span>
        </label>
        <label className="m-field">
          Speed
          <input type="range" min={0.25} max={1.25} step={0.05} value={speed} onChange={(e) => setSpeed(+e.target.value)} />
          <span className="m-unit m-num">{speed.toFixed(2)}×</span>
        </label>
        <label className="m-check">
          <input type="checkbox" checked={metronome} onChange={(e) => setMetronome(e.target.checked)} /> Metronome
        </label>
        <label className="m-check">
          <input type="checkbox" checked={countIn} onChange={(e) => setCountIn(e.target.checked)} /> Count-in
        </label>
        <label className="m-field">
          Zoom
          <input type="range" min={25} max={80} step={5} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
        </label>
      </section>

      <main className="m-main">
        <ScoreView score={score} timeline={timeline} getQ={getQ} zoom={zoom} onSeek={(q) => player.seek(q)} />

        <aside className="m-side">
          <h2>Tuning</h2>
          <label className="m-field">
            A4
            <input type="number" step={0.1} value={t.a4Hz} onChange={(e) => setTuning({ a4Hz: +e.target.value || 440 })} />
            <span className="m-unit">Hz</span>
          </label>
          <label className="m-field">
            Offset
            <input type="number" step={1} value={t.offsetCents} onChange={(e) => setTuning({ offsetCents: +e.target.value })} />
            <span className="m-unit">cents</span>
          </label>
          <label className="m-field">
            Koron
            <input type="number" step={1} max={0} value={t.koronCents} onChange={(e) => setTuning({ koronCents: +e.target.value })} />
            <span className="m-unit">cents</span>
          </label>
          <label className="m-field">
            Sori
            <input type="number" step={1} min={0} value={t.soriCents} onChange={(e) => setTuning({ soriCents: +e.target.value })} />
            <span className="m-unit">cents</span>
          </label>
          <button className="m-button" onClick={tuningCheck}>
            Hear A · A koron · A · A sori
          </button>
          <p className="m-hint">Click a note to start from it. Space plays and pauses; Home returns to the start.</p>

          {(problems.length > 0 || loadError) && (
            <>
              <h2>Problems</h2>
              <ul className="m-problems">
                {loadError && <li>{loadError}</li>}
                {problems.map((p, i) => (
                  <li key={i}>{p.message}</li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
}

/** Bar, beat position and tempo, updated every frame without re-rendering React. */
function Position({ getQ, timeline, bpm }: { getQ: () => number; timeline: ReturnType<typeof buildTimeline>; bpm: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const q = getQ();
      if (q < 0) {
        ref.current!.textContent = 'count-in';
        return;
      }
      const m = timeline.measures[measureIndexAt(timeline, q)];
      const inBar = m ? q - m.q : q;
      ref.current!.textContent = `bar ${m?.number ?? 1} · ${inBar.toFixed(2)} ♩ · ${Math.round(bpm)} ♩/min`;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [getQ, timeline, bpm]);
  return <span className="m-position m-num" ref={ref} />;
}

import {
  beatGrid,
  buildTimeline,
  demoScore,
  frequencyHz,
  measureIndexAt,
  nearestOccurrence,
  newScore,
  playbackNotes,
  mezrabs,
  noteNames,
  rhythmWords,
  voiceBank,
  voiceCues,
  selectedEvent,
  selectedMeasureIndex,
  validateScore,
  type Score,
  type Selection,
  type NameSystem,
  type VoiceKind,
  type Tuning,
} from '@mousique/core';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Player } from './audio/player.ts';
import { exportSettings, loadWordSettings, saveLocalSettings, settingFor, type WordSetting, type WordSettings } from './audio/rhythmVoice.ts';
import { VoiceBank } from './audio/voice.ts';
import { NumberField } from './editor/NumberField.tsx';
import { VoiceLab } from './editor/VoiceLab.tsx';
import { Palette } from './editor/Palette.tsx';
import { BarPanel, describeEvent, NotePanel, ScorePanel } from './editor/Panels.tsx';
import { Shortcuts } from './editor/Shortcuts.tsx';
import { handleEditorKey, useEditor } from './editor/useEditor.ts';
import { ScoreView } from './score/ScoreView.tsx';
import { loadAutosave, saveAutosave } from './storage.ts';

/** Which voices speak: none, one of them, or both (one each side of the stereo field). */
type VoiceChoice = VoiceKind | 'off' | 'both';

export function App() {
  const playerRef = useRef<Player>(undefined);
  const player = (playerRef.current ??= new Player());

  // Hear each note as it is written or changed.
  const audition = useCallback(
    (sel: Selection, s: Score) => {
      if (player.isPlaying || sel?.kind !== 'event') return;
      const ev = buildTimeline(s).byId.get(sel.id);
      if (!ev || ev.rest) return;
      void player.synth.resume().then(() => {
        const t = player.synth.ctx.currentTime + 0.01;
        for (const n of ev.notes) player.synth.pluck(n.hz, t, 0.45, 0.8);
      });
    },
    [player],
  );

  const api = useEditor(demoScore, audition);
  const { state } = api;
  const score = state.score;

  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(60);
  // The score is laid out again at a new zoom when the browser has time; dragging the slider never waits for it.
  const deferredZoom = useDeferredValue(zoom);
  const [metronome, setMetronome] = useState(false);
  const [countIn, setCountIn] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [saved, setSaved] = useState<'loading' | 'saved' | 'saving'>('loading');
  const [showWords, setShowWords] = useState(() => {
    try {
      return localStorage.getItem('mousique.words') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('mousique.words', showWords ? '1' : '0');
    } catch {
      // A per-viewer preference only; nothing is lost without it.
    }
  }, [showWords]);

  const [nameSystem, setNameSystem] = useState<NameSystem | 'off'>(() => {
    try {
      return (localStorage.getItem('mousique.names') as NameSystem | 'off' | null) ?? 'off';
    } catch {
      return 'off';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('mousique.names', nameSystem);
    } catch {
      // A per-viewer preference only.
    }
  }, [nameSystem]);

  const timeline = useMemo(() => buildTimeline(score), [score]);
  const problems = useMemo(() => validateScore(score), [score]);
  const words = useMemo(() => (showWords ? rhythmWords(score) : undefined), [score, showWords]);
  const [suggestMezrab, setSuggestMezrab] = useState(() => {
    try {
      return localStorage.getItem('mousique.mezrab') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('mousique.mezrab', suggestMezrab ? '1' : '0');
    } catch {
      // A per-viewer preference only.
    }
  }, [suggestMezrab]);
  const strokes = useMemo(() => mezrabs(score, suggestMezrab), [score, suggestMezrab]);

  // A voice that speaks each note's name or each beat's rhythm word while the score plays.
  const [voiceKind, setVoiceKind] = useState<VoiceChoice>(() => {
    try {
      const saved = localStorage.getItem('mousique.voice') as VoiceChoice | null;
      return saved && ['off', 'names', 'words', 'both'].includes(saved) ? saved : 'off';
    } catch {
      return 'off';
    }
  });
  const [instrument, setInstrument] = useState(true);
  // With both voices on: names on the left and rhythm words on the right, unless swapped.
  const [swapSides, setSwapSides] = useState(() => {
    try {
      return localStorage.getItem('mousique.voiceSwap') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('mousique.voiceSwap', swapSides ? '1' : '0');
    } catch {
      // A per-viewer preference only.
    }
  }, [swapSides]);
  const [labOpen, setLabOpen] = useState(false);
  const [wordDefaults, setWordDefaults] = useState<WordSettings>({});
  const [wordLocal, setWordLocal] = useState<WordSettings>({});
  const [rhythmBank, setRhythmBank] = useState<VoiceBank>();
  useEffect(() => {
    void loadWordSettings().then(({ defaults, local }) => {
      setWordDefaults(defaults);
      setWordLocal(local);
    });
  }, []);
  const wordSetting = useCallback((w: string) => settingFor(w, wordDefaults, wordLocal), [wordDefaults, wordLocal]);
  const changeWord = (w: string, st: WordSetting) =>
    setWordLocal((cur) => {
      const next = { ...cur, [w]: st };
      saveLocalSettings(next);
      return next;
    });
  const [voiceState, setVoiceState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  useEffect(() => {
    try {
      localStorage.setItem('mousique.voice', voiceKind);
    } catch {
      // A per-viewer preference only.
    }
  }, [voiceKind]);
  const names = useMemo(() => (nameSystem === 'off' ? undefined : noteNames(score, nameSystem)), [score, nameSystem]);
  const badMeasures = useMemo(
    () => new Set(problems.filter((p) => p.measureIndex !== undefined).map((p) => score.measures[p.measureIndex!]!.id)),
    [problems, score],
  );

  // Autosave: restore once, then save shortly after every change.
  const restored = useRef(false);
  useEffect(() => {
    void loadAutosave().then((s) => {
      if (s && s.format === 'mousique-score') api.load(s);
      restored.current = true;
      setSaved('saved');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    setSaved('saving');
    const t = window.setTimeout(() => void saveAutosave(score).then(() => setSaved('saved')), 400);
    return () => window.clearTimeout(t);
  }, [score]);

  useEffect(() => {
    const meterAt = (q: number) => {
      const m = timeline.measures[measureIndexAt(timeline, q)];
      const t = m?.time ?? { beats: 4, beatType: 4 };
      return { beats: t.beats, beatQ: 4 / t.beatType };
    };
    player.setMaterial(playbackNotes(timeline), beatGrid(timeline), timeline.totalQ, meterAt);
  }, [player, timeline]);

  const bpm = score.tempo.bpm;
  useEffect(() => player.setOptions({ bpm, speed, metronome, countIn, synth: instrument }), [player, bpm, speed, metronome, countIn, instrument]);

  // Load the voice banks once (each is cached for the page) and give the player its tracks. With both
  // voices on, the note names and the rhythm words sit on opposite sides of the stereo field.
  useEffect(() => {
    const kinds: VoiceKind[] = voiceKind === 'off' ? [] : voiceKind === 'both' ? ['names', 'words'] : [voiceKind];
    if (kinds.length === 0) {
      player.setVoices([]);
      setVoiceState('idle');
      return;
    }
    let cancelled = false;
    setVoiceState('loading');
    const side = (kind: VoiceKind) => (kinds.length < 2 ? 0 : (kind === 'names') !== swapSides ? -0.8 : 0.8);
    Promise.all(kinds.map((k) => VoiceBank.load(player.synth.ctx, voiceBank(k)))).then(
      (banks) => {
        if (cancelled) return;
        player.setVoices(
          kinds.map((k, i) => ({
            bank: banks[i]!,
            cues: voiceCues(score, k, timeline),
            perBeat: k === 'words',
            setting: wordSetting,
            pan: side(k),
          })),
        );
        const words = kinds.indexOf('words');
        if (words >= 0) setRhythmBank(banks[words]);
        setVoiceState('ready');
      },
      () => !cancelled && setVoiceState('failed'),
    );
    return () => {
      cancelled = true;
    };
  }, [player, voiceKind, swapSides, score, timeline, wordSetting]);

  const getQ = useCallback(() => player.q(), [player]);

  // While not playing, the cursor follows the selection, so Play starts from the selected note.
  useEffect(() => {
    if (player.isPlaying || state.selection?.kind !== 'event') return;
    const occ = nearestOccurrence(timeline, state.selection.id, player.q());
    if (occ) player.seek(occ.q);
  }, [player, state.selection, timeline]);

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

  const apiRef = useRef(api);
  apiRef.current = api;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        void togglePlay();
        return;
      }
      if (e.code === 'Home') {
        player.seek(0);
        return;
      }
      if (handleEditorKey(e, apiRef.current)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, togglePlay]);

  const setTuning = (patch: Partial<Tuning>) => api.update((s) => ({ ...s, tuning: { ...s.tuning, ...patch } }));
  const setBpm = (v: number) => api.update((s) => ({ ...s, tempo: { bpm: v } }));

  const openFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Score;
      if (data.format !== 'mousique-score' || !Array.isArray(data.measures)) {
        throw new Error('not a mousique score (expected "format": "mousique-score")');
      }
      stop();
      api.load(data);
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

  const startNew = () => {
    if (!window.confirm('Start a new, empty score? The current one is replaced (save it first if you want to keep it).')) return;
    stop();
    api.load(newScore());
    api.actions.setWriting(true);
  };

  const t = score.tuning;
  const tuningCheck = () =>
    player.tuningCheck({
      natural: frequencyHz('A', 4, undefined, t),
      koron: frequencyHz('A', 4, 'koron', t),
      sori: frequencyHz('A', 4, 'sori', t),
    });

  const event = selectedEvent(score, state.selection);
  const mi = selectedMeasureIndex(score, state.selection);

  return (
    <div className="m-app">
      <header className="m-top">
        <div className="m-brand">mousique</div>
        <h1 className="m-title" dir="auto">
          {score.meta.title}
        </h1>
        <div className="m-file">
          <button className="m-button" onClick={startNew}>
            New
          </button>
          <label className="m-button">
            Open…
            <input type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
          </label>
          <button className="m-button" onClick={saveFile}>
            Save file
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
          <NumberField min={20} max={300} value={bpm} onChange={setBpm} />
          <span className="m-unit">♩/min</span>
        </label>
        <label className="m-field">
          Speed
          <input type="range" min={0.25} max={1.25} step={0.01} value={speed} onChange={(e) => setSpeed(+e.target.value)} />
          <span className="m-unit m-num">{speed.toFixed(2)}×</span>
        </label>
        <label className="m-check">
          <input type="checkbox" checked={metronome} onChange={(e) => setMetronome(e.target.checked)} /> Metronome
        </label>
        <label className="m-check">
          <input type="checkbox" checked={countIn} onChange={(e) => setCountIn(e.target.checked)} /> Count-in
        </label>
        <label className="m-check" title="Tahmasbi's rhythm words (وزن‌خوانی واژگانی) over the notes, for beats in quarter-note meters">
          <input type="checkbox" checked={showWords} onChange={(e) => setShowWords(e.target.checked)} /> <span lang="fa">وزن‌خوانی</span> words
        </label>
        <label className="m-check" title="Suggest مضراب راست ∧ and چپ ∨ from each note's place in the beat, where none is written">
          <input type="checkbox" checked={suggestMezrab} onChange={(e) => setSuggestMezrab(e.target.checked)} /> <span lang="fa">مضراب</span> ∧∨
        </label>
        <label className="m-field" title="A voice speaks each note's name, or each beat's rhythm word, fitted to the notes">
          Voice
          <select value={voiceKind} onChange={(e) => setVoiceKind(e.target.value as VoiceChoice)}>
            <option value="off">off</option>
            <option value="names">note names (French)</option>
            <option value="words">rhythm words (وزن‌خوانی)</option>
            <option value="both">both, one each side</option>
          </select>
          {voiceKind === 'both' && (
            <button
              className="m-button"
              onClick={() => setSwapSides((v) => !v)}
              title="Which side each voice is on; click to swap"
            >
              {swapSides ? 'words L · names R' : 'names L · words R'}
            </button>
          )}
          {(voiceKind === 'words' || voiceKind === 'both') && (
            <button className="m-button" onClick={() => setLabOpen(true)} title="Choose how each rhythm word is spoken">
              Voice lab
            </button>
          )}
          {voiceState === 'loading' && <span className="m-unit">loading…</span>}
          {voiceState === 'failed' && <span className="m-unit">not available</span>}
        </label>
        <label className="m-check" title="Play the instrument sound; turn it off to hear only the voice">
          <input type="checkbox" checked={instrument} onChange={(e) => setInstrument(e.target.checked)} /> Instrument
        </label>
        <label className="m-field" title="Note names under the notes, for beginners">
          Names
          <select value={nameSystem} onChange={(e) => setNameSystem(e.target.value as NameSystem | 'off')}>
            <option value="off">off</option>
            <option value="persian">Persian (دو ر می)</option>
            <option value="solfege">Do Ré Mi</option>
            <option value="letters">C D E</option>
          </select>
        </label>
        <label className="m-field">
          Zoom
          <input type="range" min={30} max={90} step={1} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
          <span className="m-unit m-num">{zoom}</span>
        </label>
      </section>

      {labOpen && (
        <VoiceLab
          bank={rhythmBank}
          player={player}
          bpm={bpm * speed}
          setting={wordSetting}
          onChange={changeWord}
          onClose={() => setLabOpen(false)}
          onAudition={() => {
            if (player.isPlaying) {
              player.pause();
              setPlaying(false);
            }
          }}
          onReset={() => {
            setWordLocal({});
            saveLocalSettings({});
          }}
          onExport={() => {
            const words = rhythmBank?.words().map((w) => w.word) ?? [];
            const blob = new Blob([exportSettings(words, wordDefaults, wordLocal)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'rhythm-choices.json';
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        />
      )}
      <Palette api={api} event={event} />

      <main className="m-main">
        <div className="m-center">
          <ScoreView
            score={score}
            timeline={timeline}
            getQ={getQ}
            zoom={deferredZoom}
            selection={state.selection}
            badMeasures={badMeasures}
            words={words}
            names={names}
            mezrabs={strokes}
            onSelect={(sel, q) => {
              api.select(sel);
              if (q !== undefined) player.seek(q);
            }}
          />
          <footer className="m-status" aria-live="polite">
            <span className={`m-mode${state.writing ? ' m-on' : ''}`}>{state.writing ? 'Writing' : 'Editing'}</span>
            <span className="m-status-text">
              {event
                ? `${state.writing ? 'After ' : ''}${describeEvent(event)} · bar ${(mi ?? 0) + 1}`
                : mi !== undefined
                  ? `Bar ${mi + 1}, empty — type a letter to write`
                  : 'Click a note, or press N and type letters to write'}
            </span>
            <span className="m-saved">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved in this browser' : ''}</span>
          </footer>
        </div>

        <aside className="m-side">
          <NotePanel api={api} event={event} measureNumber={mi !== undefined ? mi + 1 : undefined} />
          <BarPanel api={api} measureIndex={mi} />
          {(problems.length > 0 || loadError) && (
            <section className="m-panel">
              <h2>To check</h2>
              <ul className="m-problems">
                {loadError && <li>{loadError}</li>}
                {problems.map((p, i) => (
                  <li key={i}>
                    {p.measureIndex !== undefined ? (
                      <button className="m-link" onClick={() => api.select({ kind: 'measure', id: score.measures[p.measureIndex!]!.id })}>
                        {p.message}
                      </button>
                    ) : (
                      p.message
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <ScorePanel api={api} />
          <section className="m-panel">
            <h2>Tuning</h2>
            <label className="m-row">
              A4
              <span>
                <NumberField step={0.1} min={200} max={600} value={t.a4Hz} onChange={(v) => setTuning({ a4Hz: v })} /> <span className="m-unit">Hz</span>
              </span>
            </label>
            <label className="m-row">
              Offset
              <span>
                <NumberField min={-1200} max={1200} value={t.offsetCents} onChange={(v) => setTuning({ offsetCents: v })} /> <span className="m-unit">cents</span>
              </span>
            </label>
            <label className="m-row">
              Koron
              <span>
                <NumberField min={-100} max={0} value={t.koronCents} onChange={(v) => setTuning({ koronCents: v })} /> <span className="m-unit">cents</span>
              </span>
            </label>
            <label className="m-row">
              Sori
              <span>
                <NumberField min={0} max={100} value={t.soriCents} onChange={(v) => setTuning({ soriCents: v })} /> <span className="m-unit">cents</span>
              </span>
            </label>
            <button className="m-button" onClick={tuningCheck}>
              Hear A · A koron · A · A sori
            </button>
          </section>
          <Shortcuts />
        </aside>
      </main>
    </div>
  );
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

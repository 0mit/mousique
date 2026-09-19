// The voice lab: choose, by ear, how each rhythm word is spoken. Every word has a few generated candidates;
// each is auditioned in context — on the beat, four times, against the metronome at the score's tempo — and
// can be trimmed in loudness and nudged against the grid. Choices apply at once and can be exported.
import { TAHMASBI_WORDS } from '@mousique/core';
import { useRef, useState } from 'react';
import type { Player } from '../audio/player.ts';
import type { WordSetting } from '../audio/rhythmVoice.ts';
import type { VoiceBank } from '../audio/voice.ts';

interface Props {
  bank: VoiceBank | undefined;
  player: Player;
  /** Beats per minute as practised (tempo × speed). */
  bpm: number;
  setting: (word: string) => WordSetting;
  onChange: (word: string, s: WordSetting) => void;
  onExport: () => void;
  onReset: () => void;
  onClose: () => void;
}

const syllablesOf = (units: number[]) => TAHMASBI_WORDS[units.join('-')] ?? [];

export function VoiceLab({ bank, player, bpm, setting, onChange, onExport, onReset, onClose }: Props) {
  const [playing, setPlaying] = useState<string>();
  const timer = useRef<number>(undefined);
  const words = bank?.words() ?? [];

  /** Play words on consecutive beats after a bar of clicks; each entry is one beat. */
  const audition = async (label: string, beats: Array<{ word: string; s: WordSetting }>) => {
    if (!bank) return;
    const synth = player.synth;
    await synth.resume();
    synth.stopAll();
    const beat = 60 / bpm;
    const t0 = synth.ctx.currentTime + 0.3;
    const lead = 4;
    for (let i = 0; i < lead + beats.length; i++) synth.click(t0 + i * beat, i % 4 === 0);
    beats.forEach(({ word, s }, i) => {
      const node = bank.speakBeat(synth.ctx, synth.output, word, t0 + (lead + i) * beat, beat, 1.1, s);
      if (node) synth.adopt(node);
    });
    setPlaying(label);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPlaying(undefined), (0.3 + (lead + beats.length) * beat) * 1000);
  };

  const stop = () => {
    player.synth.stopAll();
    window.clearTimeout(timer.current);
    setPlaying(undefined);
  };

  return (
    <section className="m-lab" role="dialog" aria-label="Voice lab">
      <header className="m-lab-head">
        <h2>Voice lab — rhythm words</h2>
        <span className="m-unit">
          at {Math.round(bpm)} ♩/min, after a bar of clicks · choices apply at once and stay in this browser
        </span>
        <div className="m-lab-actions">
          <button className="m-button" onClick={() => audition('all', words.map((w) => ({ word: w.word, s: setting(w.word) })))}>
            ▶ All eight words
          </button>
          {playing && (
            <button className="m-button" onClick={stop}>
              ■ Stop
            </button>
          )}
          <button className="m-button" onClick={onExport} title="Download the choices, to commit as the defaults">
            Export choices
          </button>
          <button className="m-button" onClick={onReset} title="Forget this browser's changes">
            Reset
          </button>
          <button className="m-button" onClick={onClose}>
            Close
          </button>
        </div>
      </header>
      {!bank && <p className="m-hint">Loading the voice…</p>}
      <div className="m-lab-words">
        {words.map((w) => {
          const s = setting(w.word);
          const sylls = syllablesOf(w.units);
          return (
            <div key={w.word} className={`m-lab-word${playing === w.word ? ' m-on' : ''}`}>
              <div className="m-lab-figure" aria-label={`${w.text}: ${w.units.join(' + ')} sixteenths`}>
                {w.units.map((u, i) => (
                  <span key={i} style={{ flexGrow: u }} lang="fa">
                    {sylls[i] ?? ''}
                  </span>
                ))}
              </div>
              <div className="m-lab-row">
                <span className="m-lab-name" lang="fa">
                  {w.text}
                </span>
                <span className="m-lab-cands" role="radiogroup" aria-label="Candidate">
                  {w.candidates.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      role="radio"
                      aria-checked={s.candidate === i}
                      className={`m-tool${s.candidate === i ? ' m-on' : ''}`}
                      title={`Candidate ${i + 1}: speaking rate ${c.params.length}, variation ${c.params.noise}; distance from the pattern ${c.cost}`}
                      onClick={() => {
                        const next = { ...s, candidate: i };
                        onChange(w.word, next);
                        void audition(w.word, Array.from({ length: 4 }, () => ({ word: w.word, s: next })));
                      }}
                    >
                      {i + 1}
                    </button>
                  ))}
                </span>
                <button className="m-button" onClick={() => audition(w.word, Array.from({ length: 4 }, () => ({ word: w.word, s })))}>
                  ▶
                </button>
              </div>
              <label className="m-row">
                Loudness
                <span>
                  <input type="range" min={-6} max={6} step={0.5} value={s.gainDb} onChange={(e) => onChange(w.word, { ...s, gainDb: +e.target.value })} />
                  <span className="m-unit m-num">{s.gainDb > 0 ? '+' : ''}{s.gainDb} dB</span>
                </span>
              </label>
              <label className="m-row">
                Timing
                <span>
                  <input type="range" min={-40} max={40} step={2} value={s.nudgeMs} onChange={(e) => onChange(w.word, { ...s, nudgeMs: +e.target.value })} />
                  <span className="m-unit m-num">{s.nudgeMs > 0 ? '+' : ''}{s.nudgeMs} ms</span>
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </section>
  );
}

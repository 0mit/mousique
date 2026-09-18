// The on-screen palette: every editing key as a button, for the mouse and for touch screens.
import { STEPS, type BaseDuration, type Duration, type ScoreEvent } from '@mousique/core';
import type { ReactNode } from 'react';
import type { EditorApi } from './useEditor.ts';

const SOLFEGE: Record<string, string> = { C: 'دو', D: 'ر', E: 'می', F: 'فا', G: 'سل', A: 'لا', B: 'سی' };

const DURATIONS: Array<{ base: BaseDuration; key: string; name: string }> = [
  { base: 'whole', key: '7', name: 'Whole' },
  { base: 'half', key: '6', name: 'Half' },
  { base: 'quarter', key: '5', name: 'Quarter' },
  { base: 'eighth', key: '4', name: 'Eighth' },
  { base: '16th', key: '3', name: 'Sixteenth' },
  { base: '32nd', key: '2', name: 'Thirty-second' },
];

/** A small drawn note value, so it looks the same whatever fonts are installed. */
export function NoteIcon({ base }: { base: BaseDuration }) {
  const hollow = base === 'whole' || base === 'half';
  const stem = base !== 'whole';
  const flags = { whole: 0, half: 0, quarter: 0, eighth: 1, '16th': 2, '32nd': 3, '64th': 4 }[base];
  return (
    <svg viewBox="0 0 20 28" width="16" height="22" aria-hidden className="m-icon">
      <ellipse cx="7" cy="22" rx="5" ry="3.6" transform="rotate(-20 7 22)" fill={hollow ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="1.6" />
      {stem && <line x1="11.4" y1="21" x2="11.4" y2="3" stroke="currentColor" strokeWidth="1.5" />}
      {Array.from({ length: flags }, (_, i) => (
        <path key={i} d={`M11.4 ${3 + i * 4.5} q6 3 5 9`} fill="none" stroke="currentColor" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

function KoronIcon() {
  return (
    <svg viewBox="0 0 16 24" width="13" height="20" aria-hidden className="m-icon">
      <line x1="4" y1="2" x2="4" y2="22" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 13 L13 17.5 L4 22" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function SoriIcon() {
  return (
    <svg viewBox="0 0 18 24" width="14" height="20" aria-hidden className="m-icon">
      <line x1="7" y1="3" x2="7" y2="21" stroke="currentColor" strokeWidth="1.5" />
      <line x1="11" y1="2" x2="11" y2="19" stroke="currentColor" strokeWidth="1.5" />
      <line x1="3" y1="10" x2="15" y2="7" stroke="currentColor" strokeWidth="2.6" />
      <line x1="3" y1="16" x2="15" y2="13" stroke="currentColor" strokeWidth="2.6" />
      <path d="M11 13 L16 20" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function Btn(props: { label: ReactNode; title: string; onClick: () => void; active?: boolean; disabled?: boolean; wide?: boolean }) {
  return (
    <button
      type="button"
      className={`m-tool${props.active ? ' m-on' : ''}${props.wide ? ' m-wide' : ''}`}
      title={props.title}
      aria-label={props.title}
      aria-pressed={props.active}
      disabled={props.disabled}
      // Keep keyboard focus on the page so the next key press still edits.
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

interface Props {
  api: EditorApi;
  event: ScoreEvent | undefined;
}

export function Palette({ api, event }: Props) {
  const { state, actions: a } = api;
  const pitch = event?.pitches?.[event.pitches.length - 1];
  const hasNote = !!event && !!event.pitches?.length;
  const dur: Duration = state.writing || !event ? state.inputDuration : event.duration;

  return (
    <div className="m-palette" role="toolbar" aria-label="Note entry">
      <div className="m-group">
        <Btn
          wide
          active={state.writing}
          title="Write mode: letters add new notes after the selection (N)"
          label={state.writing ? '✎ Writing' : '✎ Write'}
          onClick={a.toggleWriting}
        />
      </div>

      <div className="m-group" aria-label="Duration">
        {DURATIONS.map((d) => (
          <Btn key={d.base} active={dur.base === d.base} title={`${d.name} (${d.key})`} label={<NoteIcon base={d.base} />} onClick={() => a.duration(d.base)} />
        ))}
        <Btn active={!!dur.dots} title="Dot (.)" label={<span className="m-big">•</span>} onClick={a.dot} />
      </div>

      <div className="m-group" aria-label="Pitch">
        {STEPS.map((s) => (
          <Btn
            key={s}
            title={`${s} — ${SOLFEGE[s]} (${s}; Shift+${s} adds it to a chord)`}
            label={
              <span className="m-letter">
                {s}
                <small>{SOLFEGE[s]}</small>
              </span>
            }
            onClick={() => a.pitch(s)}
          />
        ))}
        <Btn title="Rest (R or 0)" label={<span className="m-small">rest</span>} onClick={a.rest} />
      </div>

      <div className="m-group" aria-label="Accidental">
        <Btn active={pitch?.accidental === 'koron'} disabled={!hasNote} title="Koron — a quarter tone down (K)" label={<KoronIcon />} onClick={() => a.accidental('koron')} />
        <Btn active={pitch?.accidental === 'sori'} disabled={!hasNote} title="Sori — a quarter tone up (S)" label={<SoriIcon />} onClick={() => a.accidental('sori')} />
        <Btn active={pitch?.accidental === 'flat' || pitch?.accidental === 'double-flat'} disabled={!hasNote} title="Flat (−); again for double flat" label={<span className="m-big">♭</span>} onClick={() => a.accidental('flat')} />
        <Btn active={pitch?.accidental === 'sharp' || pitch?.accidental === 'double-sharp'} disabled={!hasNote} title="Sharp (#); again for double sharp" label={<span className="m-big">♯</span>} onClick={() => a.accidental('sharp')} />
        <Btn active={pitch?.accidental === 'natural'} disabled={!hasNote} title="Natural (=)" label={<span className="m-big">♮</span>} onClick={() => a.accidental('natural')} />
      </div>

      <div className="m-group" aria-label="Move">
        <Btn disabled={!hasNote} title="Up a step (↑)" label="↑" onClick={() => a.step(1)} />
        <Btn disabled={!hasNote} title="Down a step (↓)" label="↓" onClick={() => a.step(-1)} />
        <Btn disabled={!hasNote} title="Up an octave (Ctrl+↑)" label="8va" onClick={() => a.octave(1)} />
        <Btn disabled={!hasNote} title="Down an octave (Ctrl+↓)" label="8vb" onClick={() => a.octave(-1)} />
      </div>

      <div className="m-group" aria-label="Articulation">
        <Btn active={!!event?.tie} disabled={!hasNote} title="Tie to the next note (T)" label="‿" onClick={a.tie} />
        <Btn active={!!event?.slurTo} disabled={!hasNote} title="Slur: each press reaches one note further (L); Shift+L pulls it back" label={<span className="m-small">slur</span>} onClick={() => a.slur(false)} />
        <Btn active={!!event?.lineTo} disabled={!hasNote} title="Finger line (slide) to the next note: each press reaches one note further (J); Shift+J pulls it back" label={<span className="m-small">line</span>} onClick={() => a.line(false)} />
        <Btn active={!!event?.grace} disabled={!hasNote} title="Grace note (/)" label={<span className="m-small">grace</span>} onClick={a.grace} />
        <Btn active={!!event?.duration.tuplet} disabled={!event} title="Triplet (Alt+3)" label="³" onClick={a.tuplet} />
        <Btn active={!!event?.tremolo} disabled={!hasNote} title="Riz / tremolo: 3, 2, 1 strokes, off (Z)" label={<span className="m-small">riz{event?.tremolo ? ` ${event.tremolo}` : ''}</span>} onClick={a.tremolo} />
      </div>

      <div className="m-group" aria-label="Edit">
        <Btn disabled={!state.canUndo} title="Undo (Ctrl+Z)" label="↶" onClick={a.undo} />
        <Btn disabled={!state.canRedo} title="Redo (Ctrl+Shift+Z)" label="↷" onClick={a.redo} />
        <Btn disabled={!event} title="Delete the note (Delete)" label="⌫" onClick={a.remove} />
        <Btn wide title="Add a bar after this one (Ctrl+B)" label="+ Bar" onClick={() => a.addMeasure(false)} />
        <Btn wide title="Delete this bar (Ctrl+Delete)" label="− Bar" onClick={a.removeMeasure} />
      </div>
    </div>
  );
}

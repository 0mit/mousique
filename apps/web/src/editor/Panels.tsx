import {
  measureFill,
  setMeasure,
  STEPS,
  timeAt,
  type Accidental,
  type Clef,
  type KeyAccidental,
  type KeySignature,
  type Score,
  type ScoreEvent,
  type Step,
} from '@mousique/core';
import { useEffect, useState } from 'react';
import type { EditorApi } from './useEditor.ts';

const ACC_NAME: Record<Accidental, string> = {
  natural: 'natural',
  sharp: 'sharp',
  flat: 'flat',
  koron: 'koron',
  sori: 'sori',
  'double-sharp': 'double sharp',
  'double-flat': 'double flat',
};

const DUR_NAME: Record<string, string> = {
  whole: 'whole',
  half: 'half',
  quarter: 'quarter',
  eighth: 'eighth',
  '16th': 'sixteenth',
  '32nd': 'thirty-second',
  '64th': 'sixty-fourth',
};

export function describeEvent(e: ScoreEvent): string {
  const d = `${e.duration.dots === 2 ? 'double-dotted ' : e.duration.dots ? 'dotted ' : ''}${DUR_NAME[e.duration.base]}`;
  const tup = e.duration.tuplet ? ` (${e.duration.tuplet.actual}:${e.duration.tuplet.normal})` : '';
  if (!e.pitches?.length) return `${d} rest${tup}`;
  const ps = e.pitches.map((p) => `${p.step}${p.octave}${p.accidental ? ` ${ACC_NAME[p.accidental]}` : ''}`).join(' + ');
  const extras = [e.grace && 'grace', e.tie && 'tied', e.slurTo && 'slurred', e.lineTo && 'finger line', e.tremolo && `riz ×${e.tremolo}`].filter(Boolean).join(', ');
  return `${ps}, ${d}${tup}${extras ? ` — ${extras}` : ''}`;
}

/** A text field that commits on Enter or when it loses focus, so typing does not flood undo history. */
function CommitInput(props: { value: string; onCommit: (v: string) => void; placeholder?: string; dir?: string; id?: string; type?: string }) {
  const [v, setV] = useState(props.value);
  useEffect(() => setV(props.value), [props.value]);
  return (
    <input
      id={props.id}
      type={props.type ?? 'text'}
      dir={props.dir}
      value={v}
      placeholder={props.placeholder}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => v !== props.value && props.onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setV(props.value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function NotePanel({ api, event, measureNumber }: { api: EditorApi; event: ScoreEvent | undefined; measureNumber: number | undefined }) {
  if (!event) {
    return (
      <section className="m-panel">
        <h2>Note</h2>
        <p className="m-hint">
          {measureNumber ? `Bar ${measureNumber} is selected. Type a letter (A–G) to write the first note.` : 'Click a note to select it.'}
        </p>
      </section>
    );
  }
  return (
    <section className="m-panel">
      <h2>Note</h2>
      <p className="m-desc">{describeEvent(event)}</p>
      <label className="m-stack" htmlFor="m-note-text">
        Text above the note <span className="m-unit">(fingering, a gusheh name…)</span>
        <CommitInput id="m-note-text" dir="auto" value={event.text ?? ''} placeholder="e.g. T or حجاز" onCommit={(v) => api.actions.text(v || undefined)} />
      </label>
      <label className="m-stack" htmlFor="m-note-below">
        Below the note <span className="m-unit">(fingering)</span>
        <CommitInput id="m-note-below" dir="auto" value={event.below ?? ''} placeholder="e.g. ۲" onCommit={(v) => api.actions.below(v || undefined)} />
      </label>
    </section>
  );
}

const CLEFS: Array<[Clef, string]> = [
  ['treble', 'Treble'],
  ['treble-8vb', 'Treble, octave below'],
  ['bass', 'Bass'],
  ['alto', 'Alto'],
  ['tenor', 'Tenor'],
];

const KEY_CHOICES: Array<[Accidental | '', string]> = [
  ['', '—'],
  ['flat', '♭'],
  ['koron', 'koron'],
  ['sharp', '♯'],
  ['sori', 'sori'],
];

/** Flats and korons are written in the order of flats, sharps and soris in the order of sharps. */
function orderKey(accs: KeyAccidental[]): KeyAccidental[] {
  const flatOrder: Step[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
  const sharpOrder: Step[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const down = accs.filter((k) => k.accidental === 'flat' || k.accidental === 'koron' || k.accidental === 'double-flat');
  const up = accs.filter((k) => !down.includes(k));
  down.sort((a, b) => flatOrder.indexOf(a.step) - flatOrder.indexOf(b.step));
  up.sort((a, b) => sharpOrder.indexOf(a.step) - sharpOrder.indexOf(b.step));
  return [...down, ...up];
}

const TIME_PRESETS = ['2/4', '3/4', '4/4', '6/8', '5/8', '7/8', '3/8', '6/4'];

export function BarPanel({ api, measureIndex }: { api: EditorApi; measureIndex: number | undefined }) {
  const score = api.state.score;
  if (measureIndex === undefined) return null;
  const m = score.measures[measureIndex]!;
  const fill = measureFill(score, measureIndex);
  const time = timeAt(score, measureIndex);
  let key: KeySignature = { accidentals: [] };
  let clef: Clef = 'treble';
  for (let i = 0; i <= measureIndex; i++) {
    key = score.measures[i]!.key ?? key;
    clef = score.measures[i]!.clef ?? clef;
  }
  const keyOf = new Map(key.accidentals.map((k) => [k.step, k.accidental]));
  const first = measureIndex === 0;
  const patch = (p: Parameters<typeof setMeasure>[2]) => api.update((s: Score) => setMeasure(s, m.id, p));

  const setKeyStep = (step: Step, acc: Accidental | '') => {
    const next = key.accidentals.filter((k) => k.step !== step);
    if (acc) next.push({ step, accidental: acc });
    patch({ key: { accidentals: orderKey(next) } });
  };

  return (
    <section className="m-panel">
      <h2>Bar {measureIndex + 1}</h2>
      <p className={`m-desc${fill.capacity !== undefined && Math.abs(fill.filled - fill.capacity) > 1e-9 ? ' m-warn' : ''}`}>
        {fill.capacity === undefined
          ? `Free rhythm · ${fmtQ(fill.filled)} ♩ written`
          : `${fmtQ(fill.filled)} of ${fmtQ(fill.capacity)} ♩${fill.filled > fill.capacity + 1e-9 ? ' — too full' : fill.filled < fill.capacity - 1e-9 ? (first ? ' — a pickup, or not yet full' : ' — not yet full') : ''}`}
      </p>

      <label className="m-row">
        Clef
        <select value={clef} onChange={(e) => patch({ clef: e.target.value as Clef })}>
          {CLEFS.map(([c, n]) => (
            <option key={c} value={c}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <div className="m-row">
        Time
        <select
          value={m.unmetered ? 'free' : time ? `${time.beats}/${time.beatType}` : ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'free') patch({ unmetered: true });
            else {
              const [b, t] = v.split('/').map(Number);
              patch({ unmetered: undefined, time: { beats: b!, beatType: t! } });
            }
          }}
        >
          {time && !TIME_PRESETS.includes(`${time.beats}/${time.beatType}`) && <option value={`${time.beats}/${time.beatType}`}>{`${time.beats}/${time.beatType}`}</option>}
          {TIME_PRESETS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value="free">Free rhythm (avaz)</option>
        </select>
      </div>
      {!first && (m.time || m.key || m.clef) && (
        <button className="m-link" onClick={() => patch({ time: undefined, key: undefined, clef: undefined })}>
          Remove the changes made at this bar
        </button>
      )}

      <div className="m-keysig" role="group" aria-label="Key signature">
        <span className="m-row-label">Key signature</span>
        {STEPS.map((step) => (
          <label key={step} className="m-keystep">
            <span>{step}</span>
            <select value={keyOf.get(step) ?? ''} onChange={(e) => setKeyStep(step, e.target.value as Accidental | '')}>
              {KEY_CHOICES.map(([a, n]) => (
                <option key={a} value={a}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="m-row m-checks">
        <label className="m-check">
          <input type="checkbox" checked={!!m.repeatStart} onChange={(e) => patch({ repeatStart: e.target.checked })} /> 𝄆 Repeat from here
        </label>
        <label className="m-check">
          <input type="checkbox" checked={!!m.repeatEnd} onChange={(e) => patch({ repeatEnd: e.target.checked })} /> Repeat back 𝄇
        </label>
      </div>
      <div className="m-row m-checks">
        <label className="m-check" title={m.events.length ? 'Delete the notes in this bar first' : 'Play the previous bar again'}>
          <input type="checkbox" checked={!!m.repeatPrevious} disabled={first || (!m.repeatPrevious && m.events.length > 0)} onChange={(e) => patch({ repeatPrevious: e.target.checked })} /> 𝄎 Repeat the previous bar
        </label>
        <label className="m-check">
          <input type="checkbox" checked={!!m.doubleBar} onChange={(e) => patch({ doubleBar: e.target.checked })} /> Double bar line
        </label>
      </div>
      <label className="m-stack">
        Text above the bar <span className="m-unit">(a mark with no note under it, such as a bow mark over 𝄎)</span>
        <CommitInput dir="auto" value={m.text ?? ''} placeholder="e.g. ⊓ or V" onCommit={(v) => patch({ text: v.trim() || undefined })} />
      </label>
      <label className="m-row">
        Ending
        <select value={m.ending ?? ''} onChange={(e) => patch({ ending: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">none</option>
          <option value="1">1st time</option>
          <option value="2">2nd time</option>
        </select>
      </label>
    </section>
  );
}

function fmtQ(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/0$/, '');
}

export function ScorePanel({ api }: { api: EditorApi }) {
  const s = api.state.score;
  const meta = (p: Partial<Score['meta']>) => api.update((x) => ({ ...x, meta: { ...x.meta, ...p } }));
  return (
    <section className="m-panel">
      <h2>Score</h2>
      <label className="m-stack">
        Title
        <CommitInput dir="auto" value={s.meta.title} onCommit={(v) => meta({ title: v || 'Untitled' })} />
      </label>
      <label className="m-stack">
        Composer
        <CommitInput dir="auto" value={s.meta.composer ?? ''} onCommit={(v) => meta({ composer: v || undefined })} />
      </label>
      <label className="m-stack">
        Dastgah / avaz
        <CommitInput dir="auto" value={s.meta.dastgah ?? ''} onCommit={(v) => meta({ dastgah: v || undefined })} />
      </label>
    </section>
  );
}

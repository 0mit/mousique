import { durationQ } from './duration.ts';
import type { Accidental, Clef, KeySignature, Score, Step, TimeSignature } from './model.ts';
import { frequencyHz, midiFloat, pitchKey } from './tuning.ts';

export interface TimelineNote {
  step: Step;
  octave: number;
  /** The accidental that actually sounds, after key signature, measure carry-over and ties. */
  sounding: Accidental | undefined;
  midi: number;
  hz: number;
  /** This note continues a tie from the previous event and must not be re-attacked. */
  tiedFromPrevious: boolean;
}

export interface TimelineEvent {
  id: string;
  measureIndex: number;
  /** Onset in quarter notes from the start of the score. A grace note sits on its principal's onset. */
  q: number;
  /** Sounding length in quarter notes; 0 for grace notes. */
  dq: number;
  grace: boolean;
  rest: boolean;
  tremolo: 1 | 2 | 3 | undefined;
  notes: TimelineNote[];
}

export interface TimelineMeasure {
  id: string;
  index: number;
  number: number;
  q: number;
  dq: number;
  unmetered: boolean;
  clef: Clef;
  key: KeySignature;
  time: TimeSignature | undefined;
}

export interface Timeline {
  events: TimelineEvent[];
  measures: TimelineMeasure[];
  totalQ: number;
  byId: Map<string, TimelineEvent>;
}

/**
 * Lay the score out in quarter-note time and resolve what every note sounds like.
 * No repeats exist in the v1 model, so this is already the "unfolded" order.
 */
export function buildTimeline(score: Score): Timeline {
  const events: TimelineEvent[] = [];
  const measures: TimelineMeasure[] = [];
  let clef: Clef = 'treble';
  let key: KeySignature = { accidentals: [] };
  let time: TimeSignature | undefined;
  let q = 0;
  // Sounding accidental per step+octave carried from the previous event through a tie.
  let tiedIn = new Map<string, Accidental | undefined>();

  score.measures.forEach((m, index) => {
    if (m.clef) clef = m.clef;
    if (m.key) key = m.key;
    if (m.time) time = m.time;
    const keyByStep = new Map<Step, Accidental>(key.accidentals.map((k) => [k.step, k.accidental]));
    const written = new Map<string, Accidental>();
    const start = q;
    const pendingGrace: TimelineEvent[] = [];

    for (const e of m.events) {
      const grace = !!e.grace;
      const dq = grace ? 0 : durationQ(e.duration);
      const nextTied = new Map<string, Accidental | undefined>();
      const notes: TimelineNote[] = (e.pitches ?? []).map((p) => {
        const k = pitchKey(p);
        const fromTie = tiedIn.has(k) && !grace;
        let sounding: Accidental | undefined;
        if (p.accidental) {
          sounding = p.accidental;
          if (!grace) written.set(k, p.accidental);
        } else if (fromTie) {
          sounding = tiedIn.get(k);
        } else if (written.has(k)) {
          sounding = written.get(k);
        } else {
          sounding = keyByStep.get(p.step);
        }
        if (e.tie && !grace) nextTied.set(k, sounding);
        return {
          step: p.step,
          octave: p.octave,
          sounding,
          midi: midiFloat(p.step, p.octave, sounding, score.tuning),
          hz: frequencyHz(p.step, p.octave, sounding, score.tuning),
          tiedFromPrevious: fromTie,
        };
      });
      const te: TimelineEvent = {
        id: e.id,
        measureIndex: index,
        q,
        dq,
        grace,
        rest: notes.length === 0,
        tremolo: e.tremolo,
        notes,
      };
      if (grace) {
        pendingGrace.push(te);
      } else {
        for (const g of pendingGrace) g.q = q;
        pendingGrace.length = 0;
        tiedIn = nextTied;
        q = snapQ(q + dq);
      }
      events.push(te);
    }
    // Grace notes at the end of a measure attach to the next measure's first onset, which is `q`.
    for (const g of pendingGrace) g.q = q;

    measures.push({
      id: m.id,
      index,
      number: index + 1,
      q: start,
      dq: q - start,
      unmetered: !!m.unmetered,
      clef,
      key,
      time,
    });
  });

  return { events, measures, totalQ: q, byId: new Map(events.map((e) => [e.id, e])) };
}

/**
 * Tuplet thirds, fifths and sevenths do not add up exactly in floating point, so onsets drift
 * (three triplet eighths end at 0.9999999). Every duration the model can express is a multiple of
 * 1/13440 of a quarter (64th x 3 x 5 x 7), so snap to that grid when within rounding distance.
 */
const Q_GRID = 13440;
export function snapQ(q: number): number {
  const snapped = Math.round(q * Q_GRID) / Q_GRID;
  return Math.abs(snapped - q) < 1e-7 ? snapped : q;
}

/** Index of the last non-grace event whose onset is <= q (binary search); -1 before the first. */
export function eventIndexAt(tl: Timeline, q: number): number {
  const ev = tl.events;
  let lo = 0;
  let hi = ev.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ev[mid]!.q <= q + 1e-9) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  while (ans >= 0 && ev[ans]!.grace) ans--;
  return ans;
}

export function measureIndexAt(tl: Timeline, q: number): number {
  let ans = 0;
  for (const m of tl.measures) {
    if (m.q <= q + 1e-9) ans = m.index;
    else break;
  }
  return ans;
}

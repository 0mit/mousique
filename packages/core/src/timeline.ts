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
  /** Index of the measure in the score (not in play order). */
  measureIndex: number;
  /** 0 the first time this event is played, 1 on the repeat, ... */
  occurrence: number;
  /** Onset in quarter notes from the start, repeats unfolded. A grace note sits on its principal's onset. */
  q: number;
  /** Sounding length in quarter notes; 0 for grace notes. */
  dq: number;
  grace: boolean;
  rest: boolean;
  tremolo: 1 | 2 | 3 | undefined;
  /** Inside a slur, after its first note: played without a new stroke. */
  legato: boolean;
  /**
   * The id of what to show for this event when it is not drawn itself: the bar-repeat sign of the measure
   * that plays it again. Undefined when the event is drawn in place.
   */
  display?: string;
  /** For an event replayed by a bar-repeat sign: the bar that shows the sign, and the bar it repeats. */
  replay?: { measureId: string; sourceMeasureId: string };
  notes: TimelineNote[];
}

export interface TimelineMeasure {
  id: string;
  /** Index of the measure in the score. */
  index: number;
  /** Printed bar number. */
  number: number;
  occurrence: number;
  q: number;
  dq: number;
  unmetered: boolean;
  clef: Clef;
  key: KeySignature;
  time: TimeSignature | undefined;
}

export interface Timeline {
  /** Every event in play order, repeats unfolded. */
  events: TimelineEvent[];
  /** Every measure in play order, repeats unfolded. */
  measures: TimelineMeasure[];
  totalQ: number;
  /** The first occurrence of each event. */
  byId: Map<string, TimelineEvent>;
  /** Every occurrence of each event, in play order. */
  occurrences: Map<string, TimelineEvent[]>;
}

/**
 * The order measures are played in. A backward repeat returns once to the last forward repeat (or to
 * the start, or to just after the previous backward repeat); a measure with `ending` n is played only on
 * pass n. Returns score indices.
 */
export function playOrder(score: Score): number[] {
  const ms = score.measures;
  const order: number[] = [];
  const taken = new Set<number>();
  let from = 0;
  let pass = 1;
  let lastTakenEnd = -1;
  let i = 0;
  let guard = 0;
  while (i < ms.length && guard++ < ms.length * 8) {
    const m = ms[i]!;
    if (m.repeatStart && i > lastTakenEnd) from = i;
    if (!m.ending && i > lastTakenEnd) pass = 1;
    if (m.ending && m.ending !== pass) {
      i++;
      continue;
    }
    order.push(i);
    if (m.repeatEnd && !taken.has(i)) {
      taken.add(i);
      lastTakenEnd = i;
      pass++;
      i = from;
      continue;
    }
    if (m.repeatEnd) from = i + 1;
    i++;
  }
  return order;
}

/**
 * Lay the score out in quarter-note time, repeats unfolded, and resolve what every note sounds like.
 */
export function buildTimeline(score: Score): Timeline {
  const events: TimelineEvent[] = [];
  const measures: TimelineMeasure[] = [];
  const seen = new Map<string, number>();
  const seenMeasure = new Map<string, number>();
  let clef: Clef = 'treble';
  let key: KeySignature = { accidentals: [] };
  let time: TimeSignature | undefined;
  let q = 0;
  // Sounding accidental per step+octave carried from the previous event through a tie.
  let tiedIn = new Map<string, Accidental | undefined>();
  // The id a running slur ends on.
  let slurEnd: string | undefined;

  for (const index of playOrder(score)) {
    const m = score.measures[index]!;
    const source = sourceMeasure(score, index);
    const display = source === m ? undefined : `${m.id}-rpt`;
    if (m.clef) clef = m.clef;
    if (m.key) key = m.key;
    if (m.time) time = m.time;
    const keyByStep = new Map<Step, Accidental>(key.accidentals.map((k) => [k.step, k.accidental]));
    const written = new Map<string, Accidental>();
    const start = q;
    const pendingGrace: TimelineEvent[] = [];

    for (const e of source.events) {
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
      const occurrence = seen.get(e.id) ?? 0;
      seen.set(e.id, occurrence + 1);
      const legato = slurEnd !== undefined && !grace;
      if (e.id === slurEnd) slurEnd = undefined;
      if (e.slurTo) slurEnd = e.slurTo;
      const te: TimelineEvent = {
        id: e.id,
        measureIndex: index,
        occurrence,
        q,
        dq,
        grace,
        rest: notes.length === 0,
        tremolo: e.tremolo,
        legato,
        notes,
        ...(display ? { display, replay: { measureId: m.id, sourceMeasureId: source.id } } : {}),
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

    const occurrence = seenMeasure.get(m.id) ?? 0;
    seenMeasure.set(m.id, occurrence + 1);
    measures.push({
      id: m.id,
      index,
      number: index + 1,
      occurrence,
      q: start,
      dq: q - start,
      unmetered: !!m.unmetered,
      clef,
      key,
      time,
    });
  }

  const occurrences = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const list = occurrences.get(e.id);
    if (list) list.push(e);
    else occurrences.set(e.id, [e]);
  }
  const byId = new Map<string, TimelineEvent>();
  for (const [id, list] of occurrences) byId.set(id, list[0]!);
  return { events, measures, totalQ: q, byId, occurrences };
}

/** The measure whose notes a measure plays: itself, or for a bar-repeat sign the bar it repeats. */
export function sourceMeasure(score: Score, index: number): Score['measures'][number] {
  let i = index;
  while (i > 0 && score.measures[i]!.repeatPrevious) i--;
  return score.measures[i]!;
}

/** The occurrence of an event nearest to position q — where a click on a repeated note should go. */
export function nearestOccurrence(tl: Timeline, id: string, q: number): TimelineEvent | undefined {
  const list = tl.occurrences.get(id);
  if (!list) return undefined;
  let best = list[0]!;
  for (const e of list) if (Math.abs(e.q - q) < Math.abs(best.q - q)) best = e;
  return best;
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

/** Position in `tl.measures` (play order, repeats unfolded) of the measure sounding at q. */
export function measureIndexAt(tl: Timeline, q: number): number {
  let ans = 0;
  tl.measures.forEach((m, i) => {
    if (m.q <= q + 1e-9) ans = i;
  });
  return ans;
}

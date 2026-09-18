import { measureCapacityQ } from './duration.ts';
import type { Timeline } from './timeline.ts';
import { pitchKey } from './tuning.ts';

export interface PlayNote {
  eventId: string;
  /** Onset in quarter notes. Grace notes carry their principal's onset; see `graceRank`. */
  q: number;
  /** Length in quarter notes, extended through ties. 0 for grace notes. */
  dq: number;
  hz: number;
  midi: number;
  /** For grace notes: 1 for the one just before the principal, 2 for the one before that, ... */
  graceRank: number;
  /** Re-attack interval in quarter notes for tremolo (riz), or 0. */
  tremoloQ: number;
  /** Under a slur after its first note: sounded without a new stroke, so softer. */
  legato: boolean;
}

const TREMOLO_Q = { 1: 0.5, 2: 0.25, 3: 0.125 } as const;

/**
 * Everything the synth has to play, in onset order. A tied continuation is not re-attacked: its
 * length is added to the note that started the tie.
 */
export function playbackNotes(tl: Timeline): PlayNote[] {
  const out: PlayNote[] = [];
  // The note currently holding each pitch through a tie.
  let holding = new Map<string, PlayNote>();
  let graceRun: PlayNote[] = [];

  for (const e of tl.events) {
    const nextHolding = new Map<string, PlayNote>();
    for (const n of e.notes) {
      const key = pitchKey(n);
      const held = holding.get(key);
      if (n.tiedFromPrevious && held && !e.grace) {
        held.dq += e.dq;
        nextHolding.set(key, held);
        continue;
      }
      const pn: PlayNote = {
        eventId: e.id,
        q: e.q,
        dq: e.dq,
        hz: n.hz,
        midi: n.midi,
        graceRank: 0,
        tremoloQ: e.tremolo ? TREMOLO_Q[e.tremolo] : 0,
        legato: e.legato,
      };
      out.push(pn);
      if (e.grace) graceRun.push(pn);
      else nextHolding.set(key, pn);
    }
    if (!e.grace) {
      graceRun.forEach((g, i) => (g.graceRank = graceRun.length - i));
      graceRun = [];
      holding = nextHolding;
    }
  }
  graceRun.forEach((g, i) => (g.graceRank = graceRun.length - i));
  return out;
}

export interface Beat {
  q: number;
  /** First beat of a measure. */
  downbeat: boolean;
}

/** Metronome positions: every beat-type unit of each metered measure. Free-rhythm measures get none. */
export function beatGrid(tl: Timeline): Beat[] {
  const beats: Beat[] = [];
  for (const m of tl.measures) {
    if (m.unmetered || !m.time) continue;
    const step = 4 / m.time.beatType;
    const cap = measureCapacityQ(m.time);
    // A pickup bar is aligned to its end, so its beats fall where they would in a full bar.
    const offset = m.index === 0 && m.dq < cap ? cap - m.dq : 0;
    for (let b = 0; b < m.time.beats; b++) {
      const rel = b * step - offset;
      if (rel < -1e-9 || rel >= m.dq - 1e-9) continue;
      beats.push({ q: m.q + rel, downbeat: b === 0 });
    }
  }
  return beats;
}

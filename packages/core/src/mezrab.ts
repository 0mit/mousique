// Plectrum strokes (مضراب) for the tar and setar: راست, the down-stroke, drawn ∧; چپ, the up-stroke, drawn ∨.
// A stroke written on a note is part of the score. Where none is written, the usual rule suggests one from
// the note's place in the beat: a note starting on the beat or on its eighth-note half is راست, a note on an
// off-beat sixteenth is چپ. The rule is the one on the operator's teaching chart; it covers quarter-beat
// meters on the sixteenth grid, and suggests nothing for tuplets, grace notes, tied continuations, or notes
// under a slur after its first (those are played by the left hand, without a new stroke).

import { durationQ, measureCapacityQ } from './duration.ts';
import type { Mezrab, Score, TimeSignature } from './model.ts';

export const MEZRAB_GLYPH: Record<Mezrab, string> = { rast: '∧', chap: '∨' };
export const MEZRAB_NAME: Record<Mezrab, string> = { rast: 'راست', chap: 'چپ' };

export interface MezrabMark {
  stroke: Mezrab;
  /** True when the rule suggested it; false when it is written in the score. */
  suggested: boolean;
}

/** The stroke of every note: written ones, and — when `suggest` is on — the rule's for the rest. */
export function mezrabs(score: Score, suggest: boolean): Map<string, MezrabMark> {
  const out = new Map<string, MezrabMark>();
  let time: TimeSignature | undefined;
  let tiedIn = false;
  let slurEnd: string | undefined;
  for (const m of score.measures) {
    if (m.time) time = m.time;
    const events = m.events.filter((e) => !e.grace);
    const quarterBeat = !m.unmetered && time?.beatType === 4;
    const filled = events.reduce((sum, e) => sum + durationQ(e.duration), 0);
    // A short first bar is a pickup, aligned to the end of the bar.
    let pos = quarterBeat && time ? Math.max(0, measureCapacityQ(time) - filled) : 0;
    for (const e of m.events) {
      if (e.mezrab) out.set(e.id, { stroke: e.mezrab, suggested: false });
      if (e.grace) continue;
      const underSlur = slurEnd !== undefined;
      if (e.id === slurEnd) slurEnd = undefined;
      if (e.slurTo) slurEnd = e.slurTo;
      const sounded = !!e.pitches?.length && !tiedIn && !underSlur;
      if (suggest && !e.mezrab && sounded && quarterBeat && !e.duration.tuplet) {
        const sixteenths = pos / 0.25;
        if (Math.abs(sixteenths - Math.round(sixteenths)) < 1e-9) {
          out.set(e.id, { stroke: Math.round(sixteenths) % 2 === 0 ? 'rast' : 'chap', suggested: true });
        }
      }
      tiedIn = !!e.tie;
      pos += durationQ(e.duration);
    }
  }
  return out;
}

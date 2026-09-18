import { approxEqual, durationQ, measureCapacityQ } from './duration.ts';
import { ACCIDENTALS, BASE_DURATIONS, STEPS, type Score, type TimeSignature } from './model.ts';

export interface Problem {
  measureIndex?: number;
  eventId?: string;
  message: string;
}

/** Structural and rhythmic checks. An empty list means the score is valid. */
export function validateScore(score: Score): Problem[] {
  const problems: Problem[] = [];
  const ids = new Set<string>();
  let time: TimeSignature | undefined;

  if (!(score.tempo.bpm > 0)) problems.push({ message: `tempo must be positive, got ${score.tempo.bpm}` });
  if (!(score.tuning.a4Hz > 0)) problems.push({ message: `reference pitch must be positive, got ${score.tuning.a4Hz}` });

  score.measures.forEach((m, measureIndex) => {
    if (ids.has(m.id)) problems.push({ measureIndex, message: `duplicate id ${m.id}` });
    ids.add(m.id);
    if (m.time) {
      if (!(m.time.beats > 0) || ![1, 2, 4, 8, 16, 32].includes(m.time.beatType)) {
        problems.push({ measureIndex, message: `bad time signature ${m.time.beats}/${m.time.beatType}` });
      }
      time = m.time;
    }
    for (const k of m.key?.accidentals ?? []) {
      if (!STEPS.includes(k.step) || !ACCIDENTALS.includes(k.accidental)) {
        problems.push({ measureIndex, message: `bad key signature entry ${k.step} ${k.accidental}` });
      }
    }
    let total = 0;
    for (const e of m.events) {
      if (ids.has(e.id)) problems.push({ measureIndex, eventId: e.id, message: `duplicate id ${e.id}` });
      ids.add(e.id);
      if (!BASE_DURATIONS.includes(e.duration.base)) {
        problems.push({ measureIndex, eventId: e.id, message: `bad duration ${e.duration.base}` });
      }
      for (const p of e.pitches ?? []) {
        if (!STEPS.includes(p.step) || !Number.isInteger(p.octave) || p.octave < 0 || p.octave > 9) {
          problems.push({ measureIndex, eventId: e.id, message: `bad pitch ${p.step}${p.octave}` });
        }
        if (p.accidental && !ACCIDENTALS.includes(p.accidental)) {
          problems.push({ measureIndex, eventId: e.id, message: `bad accidental ${p.accidental}` });
        }
      }
      if (e.grace && (!e.pitches || e.pitches.length === 0)) {
        problems.push({ measureIndex, eventId: e.id, message: 'a grace note cannot be a rest' });
      }
      if (!e.grace) total += durationQ(e.duration);
    }
    if (!m.unmetered) {
      if (!time) {
        problems.push({ measureIndex, message: 'no time signature in force; mark the measure unmetered or add one' });
      } else {
        const cap = measureCapacityQ(time);
        // The first measure may be a pickup (anacrusis): shorter is allowed there, never longer.
        const pickup = measureIndex === 0 && total < cap;
        if (!approxEqual(total, cap) && !pickup) {
          problems.push({
            measureIndex,
            message: `measure ${measureIndex + 1} holds ${fmt(total)} quarters, time signature ${time.beats}/${time.beatType} needs ${fmt(cap)}`,
          });
        }
      }
    }
  });
  return problems;
}

function fmt(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(3).replace(/0+$/, '');
}

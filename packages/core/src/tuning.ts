import type { Accidental, Pitch, Step, Tuning } from './model.ts';

const STEP_SEMITONES: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Cents an accidental moves a natural note, using the score's koron and sori sizes. */
export function accidentalCents(acc: Accidental | undefined, tuning: Tuning): number {
  switch (acc) {
    case undefined:
    case 'natural':
      return 0;
    case 'sharp':
      return 100;
    case 'flat':
      return -100;
    case 'double-sharp':
      return 200;
    case 'double-flat':
      return -200;
    case 'koron':
      return tuning.koronCents;
    case 'sori':
      return tuning.soriCents;
  }
}

/**
 * Fractional MIDI pitch of a step/octave with a SOUNDING accidental, not counting the global offset.
 * A4 = 69. Used by the aligner, which wants pitch relative to 12-TET.
 */
export function midiFloat(step: Step, octave: number, sounding: Accidental | undefined, tuning: Tuning): number {
  return 12 * (octave + 1) + STEP_SEMITONES[step] + accidentalCents(sounding, tuning) / 100;
}

/** Frequency in Hz: equal temperament from the reference, plus the accidental, plus the global offset. */
export function frequencyHz(step: Step, octave: number, sounding: Accidental | undefined, tuning: Tuning): number {
  const semis = midiFloat(step, octave, sounding, tuning) - 69 + tuning.offsetCents / 100;
  return tuning.a4Hz * Math.pow(2, semis / 12);
}

export function pitchKey(p: Pick<Pitch, 'step' | 'octave'>): string {
  return `${p.step}${p.octave}`;
}

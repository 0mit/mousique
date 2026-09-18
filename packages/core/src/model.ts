// The score model: the one source of truth. MEI is generated from it for rendering;
// MusicXML is only an import/export format.

export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export const STEPS: readonly Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

export type Accidental =
  | 'natural'
  | 'sharp'
  | 'flat'
  | 'koron'
  | 'sori'
  | 'double-sharp'
  | 'double-flat';

export const ACCIDENTALS: readonly Accidental[] = [
  'natural',
  'sharp',
  'flat',
  'koron',
  'sori',
  'double-sharp',
  'double-flat',
];

export interface Pitch {
  step: Step;
  octave: number;
  /** The WRITTEN accidental. Absent means none is written; the sounding one comes from context. */
  accidental?: Accidental;
}

export type BaseDuration = 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd' | '64th';

export const BASE_DURATIONS: readonly BaseDuration[] = [
  'whole',
  'half',
  'quarter',
  'eighth',
  '16th',
  '32nd',
  '64th',
];

export interface Tuplet {
  /** Notes played... */
  actual: number;
  /** ...in the time of this many. A triplet is { actual: 3, normal: 2 }. */
  normal: number;
}

export interface Duration {
  base: BaseDuration;
  dots?: number;
  tuplet?: Tuplet;
}

export interface ScoreEvent {
  /** Stable id; becomes the MEI xml:id so Verovio's ids map straight back to the model. */
  id: string;
  duration: Duration;
  /** Absent or empty means a rest. More than one pitch is a chord or double stop. */
  pitches?: Pitch[];
  /** Tied to the next event. */
  tie?: boolean;
  /** A grace note takes no time in the measure. */
  grace?: boolean;
  /** Tremolo (riz) strokes through the stem: 1 = eighths, 2 = sixteenths, 3 = thirty-seconds. */
  tremolo?: 1 | 2 | 3;
  text?: string;
}

export type Clef = 'treble' | 'treble-8vb' | 'bass' | 'alto' | 'tenor';

export interface KeyAccidental {
  step: Step;
  accidental: Accidental;
}

/** An explicit list, not a count: dastgah signatures mix flats and korons. */
export interface KeySignature {
  accidentals: KeyAccidental[];
}

export interface TimeSignature {
  beats: number;
  beatType: number;
}

export interface Measure {
  id: string;
  clef?: Clef;
  key?: KeySignature;
  time?: TimeSignature;
  /** Free rhythm (avaz): the duration check is skipped. */
  unmetered?: boolean;
  events: ScoreEvent[];
}

export interface Tuning {
  /** Reference pitch in Hz. */
  a4Hz: number;
  /** Global offset in cents, to match a recording that is not at the reference. */
  offsetCents: number;
  /** Size of koron in cents (negative). Varies by tradition and performer. */
  koronCents: number;
  /** Size of sori in cents (positive). */
  soriCents: number;
}

export const DEFAULT_TUNING: Tuning = { a4Hz: 440, offsetCents: 0, koronCents: -50, soriCents: 50 };

export interface Score {
  format: 'mousique-score';
  version: 1;
  meta: {
    title: string;
    composer?: string;
    dastgah?: string;
    notes?: string;
  };
  /** Nominal tempo in quarter notes per minute. */
  tempo: { bpm: number };
  tuning: Tuning;
  measures: Measure[];
}

export function isRest(e: ScoreEvent): boolean {
  return !e.pitches || e.pitches.length === 0;
}

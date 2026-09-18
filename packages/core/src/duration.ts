import type { BaseDuration, Duration, TimeSignature } from './model.ts';

const BASE_Q: Record<BaseDuration, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  '16th': 0.25,
  '32nd': 0.125,
  '64th': 0.0625,
};

/** The written length in quarter notes, before any tuplet ratio. */
export function writtenQ(d: Duration): number {
  const base = BASE_Q[d.base];
  let total = base;
  let add = base;
  for (let i = 0; i < (d.dots ?? 0); i++) {
    add /= 2;
    total += add;
  }
  return total;
}

/** The sounding length in quarter notes. */
export function durationQ(d: Duration): number {
  const w = writtenQ(d);
  return d.tuplet ? (w * d.tuplet.normal) / d.tuplet.actual : w;
}

export function measureCapacityQ(t: TimeSignature): number {
  return (t.beats * 4) / t.beatType;
}

/** Durations are sums of dyadic fractions and tuplet thirds/fifths; compare with a tolerance. */
export function approxEqual(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) < eps;
}

export function baseQ(b: BaseDuration): number {
  return BASE_Q[b];
}

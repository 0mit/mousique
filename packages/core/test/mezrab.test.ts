import { describe, expect, it } from 'vitest';
import { cycleMezrab, mezrabs, newScore, type Duration, type Score, type ScoreEvent } from '../src/index.ts';

let n = 0;
const note = (duration: Duration, extra: Partial<ScoreEvent> = {}): ScoreEvent => ({ id: `n${++n}`, duration, pitches: [{ step: 'C', octave: 5 }], ...extra });
const s16: Duration = { base: '16th' };
const e8: Duration = { base: 'eighth' };

function bar(events: ScoreEvent[]): Score {
  const s = newScore();
  s.measures[0]!.time = { beats: 2, beatType: 4 };
  s.measures[0]!.events = events;
  return s;
}
const strokes = (s: Score, suggest = true) => {
  const m = mezrabs(s, suggest);
  return s.measures[0]!.events.map((e) => ({ rast: '∧', chap: '∨' })[m.get(e.id)?.stroke ?? 'x' as 'rast'] ?? '·').join('');
};

describe('mezrab', () => {
  it('suggests the strokes of the teaching chart', () => {
    expect(strokes(bar([note(s16), note(s16), note(s16), note(s16), note(e8), note(s16), note(s16)]))).toBe('∧∨∧∨∧∧∨');
    expect(strokes(bar([note(s16), note(s16), note(e8), note({ base: 'quarter' })]))).toBe('∧∨∧∧');
  });
  it('lets a written stroke win, and suggests nothing for rests or tied continuations', () => {
    const s = bar([note(s16, { mezrab: 'chap' }), { id: 'r', duration: s16 }, note(e8, { tie: true }), note(e8), note({ base: 'quarter' })]);
    expect(strokes(s)).toBe('∨·∧·∧');
    expect(strokes(s, false)).toBe('∨····');
  });
  it('suggests no stroke for a note under a slur after its first', () => {
    const a = note({ base: 'eighth', dots: 1 });
    const b = note(s16);
    a.slurTo = b.id;
    expect(strokes(bar([a, b, note(e8), note(e8)]))).toBe('∧·∧∧');
  });

  it('cycles the written stroke', () => {
    const s = bar([note({ base: 'half' })]);
    const sel = { kind: 'event', id: s.measures[0]!.events[0]!.id } as const;
    const a = cycleMezrab(s, sel).score;
    expect(a.measures[0]!.events[0]!.mezrab).toBe('rast');
    const b = cycleMezrab(a, sel).score;
    expect(b.measures[0]!.events[0]!.mezrab).toBe('chap');
    expect(cycleMezrab(b, sel).score.measures[0]!.events[0]!.mezrab).toBeUndefined();
  });
});

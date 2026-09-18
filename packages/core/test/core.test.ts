import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  demoScore,
  durationQ,
  eventIndexAt,
  frequencyHz,
  DEFAULT_TUNING,
  validateScore,
  type Score,
} from '../src/index.ts';

const clone = (s: Score): Score => JSON.parse(JSON.stringify(s)) as Score;

describe('durations', () => {
  it('handles dots and tuplets', () => {
    expect(durationQ({ base: 'quarter' })).toBe(1);
    expect(durationQ({ base: 'half', dots: 1 })).toBe(3);
    expect(durationQ({ base: 'quarter', dots: 2 })).toBe(1.75);
    expect(durationQ({ base: 'eighth', tuplet: { actual: 3, normal: 2 } })).toBeCloseTo(1 / 3);
  });
});

describe('tuning', () => {
  it('puts koron and sori a quarter tone from the natural by default', () => {
    expect(frequencyHz('A', 4, undefined, DEFAULT_TUNING)).toBeCloseTo(440, 9);
    expect(frequencyHz('A', 4, 'koron', DEFAULT_TUNING)).toBeCloseTo(440 * 2 ** (-0.5 / 12), 9);
    expect(frequencyHz('A', 4, 'sori', DEFAULT_TUNING)).toBeCloseTo(440 * 2 ** (0.5 / 12), 9);
    expect(frequencyHz('C', 4, undefined, DEFAULT_TUNING)).toBeCloseTo(261.6256, 3);
  });
  it('uses the score sizes and the global offset', () => {
    const t = { a4Hz: 442, offsetCents: -30, koronCents: -40, soriCents: 60 };
    expect(frequencyHz('A', 4, 'koron', t)).toBeCloseTo(442 * 2 ** (-0.7 / 12), 9);
    expect(frequencyHz('A', 4, 'sori', t)).toBeCloseTo(442 * 2 ** (0.3 / 12), 9);
  });
});

describe('timeline', () => {
  const tl = buildTimeline(demoScore);
  const ev = (id: string) => tl.byId.get(id)!;

  it('lays events out in quarter notes', () => {
    expect(ev('e1').q).toBe(0);
    expect(ev('e5').q).toBe(2);
    expect(ev('e11').q).toBeCloseTo(5, 9);
    expect(tl.measures.map((m) => m.q)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(tl.totalQ).toBeCloseTo(13, 9);
  });

  it('takes accidentals from the key signature', () => {
    expect(ev('e2').notes[0]!.sounding).toBe('koron');
    expect(ev('e3').notes[0]!.sounding).toBe('flat');
    expect(ev('e1').notes[0]!.sounding).toBeUndefined();
  });

  it('lets a written accidental carry through the rest of its measure only', () => {
    const s = clone(demoScore);
    s.measures[0]!.events[1]!.pitches![0]!.accidental = 'natural';
    s.measures[0]!.events.push(); // no-op, keeps shape
    s.measures[1]!.events[2]!.pitches![0]!.accidental = undefined;
    const t = buildTimeline(s);
    expect(t.byId.get('e2')!.notes[0]!.sounding).toBe('natural');
    expect(t.byId.get('e7')!.notes[0]!.sounding).toBe('koron');
    s.measures[0]!.events[3] = { id: 'e4', duration: { base: 'eighth' }, pitches: [{ step: 'A', octave: 4 }] };
    expect(buildTimeline(s).byId.get('e4')!.notes[0]!.sounding).toBe('natural');
  });

  it('carries a tied note across the barline without re-attacking', () => {
    const s = clone(demoScore);
    s.measures[0]!.events[3] = { id: 'e4', duration: { base: 'eighth' }, pitches: [{ step: 'C', octave: 5, accidental: 'sori' }], tie: true };
    s.measures[1]!.events[0] = { id: 'e5', duration: { base: 'quarter' }, pitches: [{ step: 'C', octave: 5 }] };
    const t = buildTimeline(s);
    expect(t.byId.get('e5')!.notes[0]!.sounding).toBe('sori');
    expect(t.byId.get('e5')!.notes[0]!.tiedFromPrevious).toBe(true);
    expect(buildTimeline(demoScore).byId.get('e6')!.notes[0]!.tiedFromPrevious).toBe(true);
  });

  it('puts a grace note on its principal onset with no length', () => {
    expect(ev('e12g').q).toBe(ev('e12').q);
    expect(ev('e12g').dq).toBe(0);
    expect(tl.events[eventIndexAt(tl, ev('e12').q)]!.id).toBe('e12');
  });

  it('finds the event sounding at q', () => {
    expect(eventIndexAt(tl, -1)).toBe(-1);
    expect(tl.events[eventIndexAt(tl, 0.7)]!.id).toBe('e2');
    expect(tl.events[eventIndexAt(tl, 100)]!.id).toBe('e23');
  });
});

describe('validation', () => {
  it('accepts the demo score', () => {
    expect(validateScore(demoScore)).toEqual([]);
  });
  it('reports an overfull measure and a duplicate id', () => {
    const s = clone(demoScore);
    s.measures[1]!.events.push({ id: 'e1', duration: { base: 'quarter' }, pitches: [{ step: 'G', octave: 4 }] });
    const msgs = validateScore(s).map((p) => p.message);
    expect(msgs.some((m) => m.includes('holds 3 quarters'))).toBe(true);
    expect(msgs.some((m) => m.includes('duplicate id e1'))).toBe(true);
  });
  it('allows a short pickup bar and skips unmetered measures', () => {
    const s = clone(demoScore);
    s.measures[0]!.events.pop();
    s.measures[5]!.events.pop();
    expect(validateScore(s)).toEqual([]);
  });
  it('rejects an underfull measure that is not the pickup', () => {
    const s = clone(demoScore);
    s.measures[2]!.events.pop();
    expect(validateScore(s)).toHaveLength(1);
  });
});

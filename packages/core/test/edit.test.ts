import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  cycleTremolo,
  deleteMeasure,
  deleteSelected,
  enterPitch,
  enterRest,
  insertMeasure,
  moveOctave,
  moveSelection,
  moveStep,
  nearestOctave,
  newScore,
  setAccidental,
  setDuration,
  setMeasure,
  toggleDot,
  toggleGrace,
  toggleTie,
  toggleTuplet,
  validateScore,
  type Duration,
  type Score,
  type Selection,
  type Step,
} from '../src/index.ts';

const eighth: Duration = { base: 'eighth' };
const quarter: Duration = { base: 'quarter' };

/** Type a melody the way a user would: letters in insert mode. */
function type(score: Score, sel: Selection, steps: string, duration = eighth) {
  let r = { score, selection: sel };
  for (const ch of steps) {
    r = ch === 'r' ? enterRest(r.score, r.selection, { insert: true, duration }) : enterPitch(r.score, r.selection, ch as Step, { insert: true, duration });
  }
  return r;
}

const pitches = (s: Score) => s.measures.map((m) => m.events.map((e) => (e.pitches ?? []).map((p) => `${p.step}${p.octave}${p.accidental ? ':' + p.accidental : ''}`).join('+') || 'r'));

describe('entering notes', () => {
  it('chooses the nearest octave to the previous note', () => {
    expect(nearestOctave('C', { step: 'B', octave: 4 })).toBe(5);
    expect(nearestOctave('A', { step: 'C', octave: 5 })).toBe(4);
    expect(nearestOctave('G', { step: 'D', octave: 4 })).toBe(4);
  });

  it('flows across bar lines, creating measures as it goes', () => {
    const s0 = setMeasure(newScore(), 'm1', { time: { beats: 2, beatType: 4 } });
    const { score, selection } = type(s0, { kind: 'measure', id: 'm1' }, 'CECEDCBA');
    // After the treble clef's middle line (B4), C is nearest a step up: C5.
    expect(pitches(score)).toEqual([['C5', 'E5', 'C5', 'E5'], ['D5', 'C5', 'B4', 'A4']]);
    expect(validateScore(score)).toEqual([]);
    expect(selection).toEqual({ kind: 'event', id: score.measures[1]!.events[3]!.id });
  });

  it('changes the selected note in place when not inserting', () => {
    const { score, selection } = type(newScore(), null, 'CDE', quarter);
    const r = enterPitch(score, selection, 'G', { insert: false, duration: quarter });
    expect(pitches(r.score)).toEqual([['C5', 'D5', 'G5']]);
  });

  it('builds chords upward and enters rests', () => {
    let r = type(newScore(), null, 'C', quarter);
    r = enterPitch(r.score, r.selection, 'E', { insert: false, chord: true, duration: quarter });
    r = enterPitch(r.score, r.selection, 'C', { insert: false, chord: true, duration: quarter });
    r = enterRest(r.score, r.selection, { insert: true, duration: quarter });
    expect(pitches(r.score)).toEqual([['C5+E5+C6', 'r']]);
  });
});

describe('changing notes', () => {
  const base = type(newScore(), null, 'AB', quarter);
  const sel = base.selection;

  it('applies koron, sori, sharp and flat, and removes them again', () => {
    let s = setAccidental(base.score, sel, 'koron').score;
    expect(pitches(s)[0]![1]).toBe('B4:koron');
    s = setAccidental(s, sel, 'koron').score;
    expect(pitches(s)[0]![1]).toBe('B4');
    s = setAccidental(s, sel, 'sori').score;
    expect(pitches(s)[0]![1]).toBe('B4:sori');
    s = setAccidental(s, sel, 'flat').score;
    s = setAccidental(s, sel, 'flat').score;
    expect(pitches(s)[0]![1]).toBe('B4:double-flat');
    s = setAccidental(s, sel, 'flat').score;
    expect(pitches(s)[0]![1]).toBe('B4');
  });

  it('moves by step and octave, and sets duration and dots', () => {
    let s = moveStep(base.score, sel, 1).score;
    expect(pitches(s)[0]![1]).toBe('C5');
    s = moveOctave(s, sel, -1).score;
    expect(pitches(s)[0]![1]).toBe('C4');
    s = setDuration(s, sel, 'half').score;
    s = toggleDot(s, sel).score;
    expect(s.measures[0]!.events[1]!.duration).toEqual({ base: 'half', dots: 1 });
  });

  it('toggles tie, grace and tremolo', () => {
    let s = toggleTie(base.score, sel).score;
    expect(s.measures[0]!.events[1]!.tie).toBe(true);
    s = toggleGrace(s, sel).score;
    expect(s.measures[0]!.events[1]).toMatchObject({ grace: true });
    expect(s.measures[0]!.events[1]!.tie).toBeUndefined();
    s = cycleTremolo(s, sel).score;
    expect(s.measures[0]!.events[1]!.tremolo).toBe(3);
  });

  it('makes a triplet from three eighths and removes it again', () => {
    const r = type(newScore(), null, 'CDEF');
    const first = { kind: 'event', id: r.score.measures[0]!.events[0]!.id } as const;
    const t = toggleTuplet(r.score, first).score;
    expect(t.measures[0]!.events.map((e) => !!e.duration.tuplet)).toEqual([true, true, true, false]);
    expect(buildTimeline(t).totalQ).toBeCloseTo(1.5);
    const u = toggleTuplet(t, { kind: 'event', id: t.measures[0]!.events[1]!.id }).score;
    expect(u.measures[0]!.events.every((e) => !e.duration.tuplet)).toBe(true);
  });

  it('deletes events and measures, keeping the opening signature', () => {
    const d = deleteSelected(base.score, sel);
    expect(pitches(d.score)).toEqual([['A4']]);
    const m = insertMeasure(d.score, d.selection);
    expect(m.score.measures).toHaveLength(2);
    const gone = deleteMeasure(m.score, { kind: 'measure', id: 'm1' }).score;
    expect(gone.measures).toHaveLength(1);
    expect(gone.measures[0]!.time).toEqual({ beats: 4, beatType: 4 });
  });

  it('walks the selection through events and empty measures', () => {
    const m = insertMeasure(base.score, sel).score;
    const first = moveSelection(m, null, 1);
    const second = moveSelection(m, first, 1);
    const third = moveSelection(m, second, 1);
    expect(third).toEqual({ kind: 'measure', id: m.measures[1]!.id });
    expect(moveSelection(m, third, 5)).toEqual(third);
  });
});

describe('repeats', () => {
  // |: A | B ;1 C :| ;2 D | E  ->  A B C A B D E
  const s: Score = newScore();
  s.measures = ['A', 'B', 'C', 'D', 'E'].map((step, i) => ({
    id: `m${i + 1}`,
    ...(i === 0 ? { time: { beats: 1, beatType: 4 } } : {}),
    events: [{ id: `e${i + 1}`, duration: quarter, pitches: [{ step: step as Step, octave: 4 }] }],
  }));
  s.measures[0]!.repeatStart = true;
  s.measures[2]!.ending = 1;
  s.measures[2]!.repeatEnd = true;
  s.measures[3]!.ending = 2;

  it('unfolds endings into play order', () => {
    const tl = buildTimeline(s);
    expect(tl.events.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e1', 'e2', 'e4', 'e5']);
    expect(tl.occurrences.get('e1')!.map((e) => e.q)).toEqual([0, 3]);
    expect(tl.totalQ).toBe(7);
  });

  it('repeats from the start when there is no forward sign, and only once', () => {
    const t: Score = JSON.parse(JSON.stringify(s));
    delete t.measures[0]!.repeatStart;
    delete t.measures[2]!.ending;
    delete t.measures[3]!.ending;
    expect(buildTimeline(t).events.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e1', 'e2', 'e3', 'e4', 'e5']);
  });
});

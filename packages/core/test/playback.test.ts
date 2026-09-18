import { describe, expect, it } from 'vitest';
import { beatGrid, buildTimeline, demoScore, playbackNotes, type Score } from '../src/index.ts';

describe('playback notes', () => {
  const notes = playbackNotes(buildTimeline(demoScore));
  const byId = (id: string) => notes.filter((n) => n.eventId === id);

  it('does not re-attack a tied continuation and lengthens the first note instead', () => {
    expect(byId('e6')).toHaveLength(0);
    expect(byId('e5')[0]!.dq).toBeCloseTo(1.5);
  });
  it('sounds koron and sori at their quarter-tone pitches', () => {
    expect(byId('e2')[0]!.midi).toBeCloseTo(68.5); // A koron from the key signature
    expect(byId('e16')[0]!.midi).toBeCloseTo(72.5); // written C sori
    expect(byId('e3')[0]!.midi).toBeCloseTo(70); // B flat
  });
  it('ranks grace notes back from the principal and marks tremolo', () => {
    expect(byId('e12g')[0]).toMatchObject({ graceRank: 1, dq: 0, q: 6 });
    expect(byId('e11')[0]!.tremoloQ).toBe(0.125);
  });
  it('skips rests', () => {
    expect(byId('e15')).toHaveLength(0);
  });
});

describe('beat grid', () => {
  it('clicks each beat of metered bars and none in free rhythm', () => {
    const beats = beatGrid(buildTimeline(demoScore));
    expect(beats).toHaveLength(10); // five bars of 2/4, then the unmetered bar
    expect(beats[0]).toEqual({ q: 0, downbeat: true });
    expect(beats[1]).toEqual({ q: 1, downbeat: false });
  });
  it('aligns a pickup bar to its end', () => {
    const s = JSON.parse(JSON.stringify(demoScore)) as Score;
    s.measures[0]!.events = s.measures[0]!.events.slice(0, 2); // one quarter of a 2/4 bar
    const beats = beatGrid(buildTimeline(s));
    expect(beats[0]).toEqual({ q: 0, downbeat: false });
    expect(beats[1]).toEqual({ q: 1, downbeat: true });
  });
});

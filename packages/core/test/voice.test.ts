import { describe, expect, it } from 'vitest';
import { demoScore, voiceBank, voiceCues } from '../src/index.ts';

describe('voice cues', () => {
  it('names each sounded note with the accidental it sounds with, held through ties', () => {
    const cues = voiceCues(demoScore, 'names');
    const at = (id: string) => cues.find((c) => c.eventId === id);
    expect(at('e2')!.key).toBe('A-koron'); // from the key signature
    expect(at('e3')!.key).toBe('B-flat');
    expect(at('e16')!.key).toBe('C-sori');
    expect(at('e5')!.dq).toBeCloseTo(1.5); // tied into e6
    expect(at('e6')).toBeUndefined();
    expect(at('e15')).toBeUndefined(); // rest
  });

  it('speaks one whole rhythm word per beat, fitted to the beat, rests included', () => {
    const cues = voiceCues(demoScore, 'words');
    const first = cues.slice(0, 2);
    expect(first.map((c) => [c.key, c.q, c.dq])).toEqual([['میزد', 0, 1], ['میزد', 1, 1]]);
    expect(cues.find((c) => c.eventId === 'e15')!.key).toBe('میزد'); // rest + eighth in bar 5
    expect(cues.every((c) => !c.key.includes('ـ') && Math.abs(c.dq - 1) < 1e-9)).toBe(true);
  });

  it('picks the bank for the kind and naming system', () => {
    expect(voiceBank('words', 'persian')).toBe('rhythm-words');
    expect(voiceBank('names', 'letters')).toBe('names-french'); // spoken names are French whatever is shown
  });
});

describe('metric accent', () => {
  it('ranks positions in the bar: downbeat, beat, half beat, finer', async () => {
    const { metricStrength } = await import('../src/index.ts');
    expect([0, 1, 0.5, 0.25, 1.75].map((p) => metricStrength(p, 1))).toEqual(['downbeat', 'beat', 'half', 'weak', 'weak']);
    expect(metricStrength(1.5, 1.5)).toBe('beat'); // compound meter: the beat is a dotted quarter
  });

  it('gives each spoken name the strength of its place in the bar', () => {
    const cues = voiceCues(demoScore, 'names');
    const at = (id: string) => cues.find((c) => c.eventId === id)!.strength;
    expect([at('e1'), at('e2'), at('e3'), at('e4')]).toEqual(['downbeat', 'half', 'beat', 'half']);
    expect(at('e9')).toBe('weak'); // the second note of a triplet
  });

  it('feels a dotted-quarter beat in 6/8 and counts a pickup from the end of its bar', async () => {
    const { newScore } = await import('../src/index.ts');
    const s = newScore();
    s.measures[0]!.time = { beats: 6, beatType: 8 };
    s.measures[0]!.events = ['C', 'D', 'E', 'F', 'G', 'A'].map((step, i) => ({ id: `n${i}`, duration: { base: 'eighth' as const }, pitches: [{ step: step as 'C', octave: 5 }] }));
    expect(voiceCues(s, 'names').map((c) => c.strength)).toEqual(['downbeat', 'weak', 'weak', 'beat', 'weak', 'weak']);
    const p = newScore();
    p.measures[0]!.time = { beats: 2, beatType: 4 };
    p.measures[0]!.events = [{ id: 'up', duration: { base: 'quarter' }, pitches: [{ step: 'G', octave: 4 }] }];
    expect(voiceCues(p, 'names')[0]!.strength).toBe('beat'); // the second beat of an incomplete 2/4 bar
  });
});

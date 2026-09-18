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
    expect(voiceBank('names', 'letters')).toBe('names-letters');
  });
});

import { describe, expect, it } from 'vitest';
import { durationQ, newScore, rhythmWords, TAHMASBI_WORDS, type BaseDuration, type Duration, type Score, type ScoreEvent } from '../src/index.ts';

const d = (base: BaseDuration, dots = 0) => ({ base, ...(dots ? { dots } : {}) });
let n = 0;
const note = (dur: Duration, extra: Partial<ScoreEvent> = {}): ScoreEvent => ({ id: `n${++n}`, duration: dur, pitches: [{ step: 'C', octave: 5 }], ...extra });

function bar(events: ScoreEvent[], beats = 2): Score {
  const s = newScore();
  s.measures[0]!.time = { beats, beatType: 4 };
  s.measures[0]!.events = events;
  return s;
}

const syl = (s: Score) => {
  const w = rhythmWords(s);
  return s.measures.flatMap((m) => m.events.map((e) => w.get(e.id)?.syllable ?? '·')).join(' ');
};

describe('rhythm words', () => {
  it('has one word for each of the eight ways to fill a quarter beat, and each adds up to a beat', () => {
    expect(Object.keys(TAHMASBI_WORDS)).toHaveLength(8);
    for (const [key, sylls] of Object.entries(TAHMASBI_WORDS)) {
      expect(key.split('-').map(Number).reduce((a, b) => a + b)).toBe(4);
      expect(sylls).toHaveLength(key.split('-').length);
    }
  });

  it('reads every figure of the flash cards', () => {
    expect(syl(bar([note(d('quarter')), note(d('eighth', 1)), note(d('16th'))]))).toBe('راست راسـ تُ');
    expect(syl(bar([note(d('16th')), note(d('eighth', 1)), note(d('eighth')), note(d('eighth'))]))).toBe('رُ باب می زد');
    expect(syl(bar([note(d('eighth')), note(d('16th')), note(d('16th')), note(d('16th')), note(d('16th')), note(d('eighth'))]))).toBe('می زَ دُ بَـ زَ دَم');
    expect(syl(bar([note(d('16th')), note(d('16th')), note(d('16th')), note(d('16th')), note(d('16th')), note(d('eighth')), note(d('16th'))]))).toBe('بَـ زَ دَ مُ رُ با بُ');
  });

  it('gives no words to a beat with a rest, a tie or a tuplet, nor to a half note', () => {
    const rest: ScoreEvent = { id: 'r1', duration: d('eighth') };
    expect(syl(bar([rest, note(d('eighth')), note(d('eighth')), note(d('eighth'))]))).toBe('· · می زد');
    expect(syl(bar([note(d('quarter'), { tie: true }), note(d('eighth')), note(d('eighth'))]))).toBe('· · ·');
    const t = { actual: 3, normal: 2 };
    expect(syl(bar([note({ base: 'eighth', tuplet: t }), note({ base: 'eighth', tuplet: t }), note({ base: 'eighth', tuplet: t }), note(d('quarter'))]))).toBe('· · · راست');
    expect(syl(bar([note(d('half'))]))).toBe('·');
  });

  it('keeps the beat through a note that crosses it, and aligns a pickup to the end of its bar', () => {
    // ♪ ♩ ♪ in 2/4: the quarter straddles the beat, so neither beat has a word.
    expect(syl(bar([note(d('eighth')), note(d('quarter')), note(d('eighth'))]))).toBe('· · ·');
    const pickup = bar([note(d('eighth')), note(d('eighth'))]);
    expect(durationQ(pickup.measures[0]!.events[0]!.duration)).toBe(0.5);
    expect(syl(pickup)).toBe('می زد');
  });

  it('skips meters without a quarter-note beat', () => {
    const s = bar([note(d('eighth')), note(d('eighth')), note(d('eighth'))]);
    s.measures[0]!.time = { beats: 3, beatType: 8 };
    expect(syl(s)).toBe('· · ·');
  });
});

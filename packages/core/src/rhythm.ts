// Rhythm words — Arshad Tahmasbi's وزن‌خوانی واژگانی. Each quarter-note beat is read as one Persian word
// whose syllables have the lengths of the notes, one syllable per note. The word table is data: the eight
// words below cover every way of filling a quarter beat with sixteenths, eighths, dotted eighths and
// quarters; a teacher can replace or extend it.
//
// Scope, by the operator's decision of 2026-09-18: meters with a quarter-note beat only; a beat holding a
// rest, a tie, a tuplet, a note longer than the beat or a value off the sixteenth grid gets no words.

import { durationQ, measureCapacityQ } from './duration.ts';
import type { Score, TimeSignature } from './model.ts';

/** Pattern of note lengths in sixteenths, joined by '-', to the syllables read on those notes. */
export type RhythmDictionary = Record<string, string[]>;

// A tatweel (ـ) after a syllable whose last letter joins the next keeps the word visibly one word when its
// syllables are spread over several notes (بَـ زَ دَم).
export const TAHMASBI_WORDS: RhythmDictionary = {
  '4': ['راست'],
  '3-1': ['راسـ', 'تُ'],
  '1-3': ['رُ', 'باب'],
  '2-2': ['می', 'زد'],
  '2-1-1': ['می', 'زَ', 'دُ'],
  '1-1-2': ['بَـ', 'زَ', 'دَم'],
  '1-1-1-1': ['بَـ', 'زَ', 'دَ', 'مُ'],
  '1-2-1': ['رُ', 'با', 'بُ'],
};

export interface RhythmWord {
  syllable: string;
  /** The whole word this syllable belongs to, for a tooltip or a screen reader. */
  word: string;
  /** Index of the beat in its measure, from 0. */
  beat: number;
}

const UNIT_Q = 0.25;

function isQuarterBeat(t: TimeSignature | undefined): t is TimeSignature {
  return !!t && t.beatType === 4;
}

/** The syllable each note is read with, by event id. Notes that get no word are absent. */
export function rhythmWords(score: Score, dictionary: RhythmDictionary = TAHMASBI_WORDS): Map<string, RhythmWord> {
  const out = new Map<string, RhythmWord>();
  let time: TimeSignature | undefined;
  let tiedIn = false;

  for (const m of score.measures) {
    if (m.time) time = m.time;
    const events = m.events.filter((e) => !e.grace);
    if (m.unmetered || !isQuarterBeat(time)) {
      tiedIn = !!events[events.length - 1]?.tie;
      continue;
    }
    // A short first bar is a pickup, aligned to the end of the bar.
    const filled = events.reduce((sum, e) => sum + durationQ(e.duration), 0);
    let pos = Math.max(0, measureCapacityQ(time) - filled);

    let beat: typeof events = [];
    let beatIndex = Math.floor(pos + 1e-9);
    let ok = true;
    const flush = () => {
      if (ok && beat.length) {
        const key = beat.map((e) => Math.round(durationQ(e.duration) / UNIT_Q)).join('-');
        const syllables = dictionary[key];
        if (syllables && syllables.length === beat.length) {
          const word = syllables.join('').replace(/ـ/g, '');
          beat.forEach((e, i) => out.set(e.id, { syllable: syllables[i]!, word, beat: beatIndex }));
        }
      }
      beat = [];
      ok = true;
    };

    for (const e of events) {
      const dq = durationQ(e.duration);
      const b = Math.floor(pos + 1e-9);
      if (b !== beatIndex) {
        flush();
        beatIndex = b;
      }
      const units = dq / UNIT_Q;
      const fits = pos + dq <= b + 1 + 1e-9;
      const onGrid = Math.abs(units - Math.round(units)) < 1e-9 && Math.abs(pos / UNIT_Q - Math.round(pos / UNIT_Q)) < 1e-9;
      if (!e.pitches?.length || e.tie || tiedIn || e.duration.tuplet || !fits || !onGrid) ok = false;
      tiedIn = !!e.tie;
      beat.push(e);
      pos += dq;
      if (!fits) {
        // A note running over the beat takes the beats it covers with it.
        flush();
        beatIndex = Math.floor(pos + 1e-9);
      }
    }
    flush();
  }
  return out;
}

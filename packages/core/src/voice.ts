// What a voice says while the score plays: a note's name, or its rhythm syllable, timed to the note. The app
// plays these from pre-generated voice banks (tools/voice/generate.py) instead of synthesizing speech.

import type { Accidental, Score } from './model.ts';
import type { NameSystem } from './names.ts';
import { playbackNotes } from './playback.ts';
import { rhythmWords, type RhythmDictionary, TAHMASBI_WORDS } from './rhythm.ts';
import { buildTimeline, type Timeline } from './timeline.ts';

export type VoiceKind = 'names' | 'words';

export interface VoiceCue {
  /** Onset in quarter notes, repeats unfolded. */
  q: number;
  /** How long the note sounds, in quarter notes (through ties). The clip is fitted to this. */
  dq: number;
  /** Clip key in the voice bank: "A-koron", "F-sharp", "C" for names; the whole word for rhythm words. */
  key: string;
  eventId: string;
}

/**
 * A colour of the rhythm-word voice: as synthesized (amir); softened at its own pitch; warmer (2 semitones
 * lower, formants kept, more low-mid body) and softened; or the other free Persian voice (ganji).
 */
export type VoiceColour = 'natural' | 'soft' | 'warm' | 'ganji';

/** The voice bank that holds the clips for a kind of cue. Colours exist for the rhythm words. */
export function voiceBank(kind: VoiceKind, system: NameSystem, colour: VoiceColour = 'natural'): string {
  if (kind === 'words') return colour === 'natural' ? 'rhythm-words' : `rhythm-words-${colour}`;
  return `names-${system}`;
}

const SPOKEN_ACC: Partial<Record<Accidental, string>> = { sharp: 'sharp', flat: 'flat', koron: 'koron', sori: 'sori' };

/** Bank key of a note name: the accidental that sounds, if it is one the banks hold. */
export function nameKey(step: string, sounding: Accidental | undefined): string {
  const acc = sounding ? SPOKEN_ACC[sounding] : undefined;
  return acc ? `${step}-${acc}` : step;
}

/**
 * Rhythm words are spoken whole, one per beat, fitted to the beat. In Tahmasbi's method a word's syllables
 * already have the lengths of the notes, so each syllable lands on its note; single syllables are not used
 * because the voice renders them unreliably.
 */

export function voiceCues(score: Score, kind: VoiceKind, timeline: Timeline = buildTimeline(score), dictionary: RhythmDictionary = TAHMASBI_WORDS): VoiceCue[] {
  // Sounding length through ties, per onset.
  const held = new Map<string, number>();
  for (const n of playbackNotes(timeline)) {
    const k = `${n.eventId}@${n.q}`;
    held.set(k, Math.max(held.get(k) ?? 0, n.dq));
  }
  const words = kind === 'words' ? rhythmWords(score, dictionary) : undefined;
  const cues: VoiceCue[] = [];
  let beat: VoiceCue | undefined;
  let beatKey = '';
  for (const e of timeline.events) {
    if (e.grace) continue;
    if (words) {
      const w = words.get(e.id);
      if (!w) {
        beat = undefined;
        continue;
      }
      // Consecutive events of one pass through a bar, in the same beat, share one spoken word.
      const k = `${e.measureIndex}:${w.beat}`;
      if (beat && k === beatKey && Math.abs(beat.q + beat.dq - e.q) < 1e-9) {
        beat.dq += e.dq;
      } else {
        beat = { q: e.q, dq: e.dq, key: w.word, eventId: e.id };
        beatKey = k;
        cues.push(beat);
      }
      continue;
    }
    const fresh = e.notes.filter((n) => !n.tiedFromPrevious);
    if (e.rest || fresh.length === 0) continue;
    // In a chord, the top note is named.
    const top = fresh.reduce((a, b) => (b.midi > a.midi ? b : a));
    cues.push({ q: e.q, dq: held.get(`${e.id}@${e.q}`) ?? e.dq, key: nameKey(top.step, top.sounding), eventId: e.id });
  }
  return cues;
}

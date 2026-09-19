// What a voice says while the score plays: a note's name, or its rhythm syllable, timed to the note. The app
// plays these from pre-generated voice banks (tools/voice/generate.py) instead of synthesizing speech.

import type { Accidental, Score } from './model.ts';
import type { NameSystem } from './names.ts';
import { playbackNotes } from './playback.ts';
import { rhythmWords, type RhythmDictionary, TAHMASBI_WORDS } from './rhythm.ts';
import { buildTimeline, type Timeline, type TimelineEvent } from './timeline.ts';

export type VoiceKind = 'names' | 'words';

export interface VoiceCue {
  /** Onset in quarter notes, repeats unfolded. */
  q: number;
  /** How long the note sounds, in quarter notes (through ties). The clip is fitted to this. */
  dq: number;
  /** Clip key in the voice bank: "A-koron", "F-sharp", "C" for names; the whole word for rhythm words. */
  key: string;
  eventId: string;
  /** Where the note falls in the bar, which decides how strongly it is said. */
  strength: MetricStrength;
}

/**
 * Metric position of an onset: the bar's first beat, another beat, the half of a beat, or anything finer.
 * A voice says a word more strongly the stronger its position — the accent follows the meter.
 */
export type MetricStrength = 'downbeat' | 'beat' | 'half' | 'weak';

/** Loudness in dB for each metric position. */
export const METRIC_ACCENT_DB: Record<MetricStrength, number> = { downbeat: 3, beat: 1.5, half: 0, weak: -2.5 };

export function metricStrength(posInBar: number, beatQ: number): MetricStrength {
  const on = (unit: number) => Math.abs(posInBar / unit - Math.round(posInBar / unit)) < 1e-6;
  if (Math.abs(posInBar) < 1e-6) return 'downbeat';
  if (on(beatQ)) return 'beat';
  if (on(beatQ / 2)) return 'half';
  return 'weak';
}

/**
 * The voice bank that holds the clips for a kind of cue. Note names are always spoken in French, by a French
 * voice (the operator's choice), whichever naming system is shown on the page.
 */
export function voiceBank(kind: VoiceKind, _system?: NameSystem): string {
  return kind === 'words' ? 'rhythm-words' : 'names-french';
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
  // The bar each event sounds in (in play order), for its metric position.
  const barOf = new Map<TimelineEvent, { q: number; beatQ: number }>();
  {
    let mi = 0;
    for (const e of timeline.events) {
      while (mi + 1 < timeline.measures.length && timeline.measures[mi + 1]!.q <= e.q + 1e-9) mi++;
      const m = timeline.measures[mi]!;
      const t = m.time;
      // The felt beat: a dotted quarter in compound meters (6/8, 9/8, 12/8), otherwise the beat unit.
      const beatQ = !t ? 1 : t.beatType === 8 && t.beats % 3 === 0 && t.beats > 3 ? 1.5 : 4 / t.beatType;
      // A short first bar is a pickup: its positions count back from the bar's end.
      const capacity = t ? (t.beats * 4) / t.beatType : m.dq;
      const start = m.index === 0 && m.dq < capacity - 1e-9 ? m.q - (capacity - m.dq) : m.q;
      barOf.set(e, { q: start, beatQ });
    }
  }
  const strengthOf = (e: TimelineEvent): MetricStrength => {
    const b = barOf.get(e)!;
    return metricStrength(e.q - b.q, b.beatQ);
  };
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
        beat = { q: e.q, dq: e.dq, key: w.word, eventId: e.id, strength: strengthOf(e) };
        beatKey = k;
        cues.push(beat);
      }
      continue;
    }
    const fresh = e.notes.filter((n) => !n.tiedFromPrevious);
    if (e.rest || fresh.length === 0) continue;
    // In a chord, the top note is named.
    const top = fresh.reduce((a, b) => (b.midi > a.midi ? b : a));
    cues.push({ q: e.q, dq: held.get(`${e.id}@${e.q}`) ?? e.dq, key: nameKey(top.step, top.sounding), eventId: e.id, strength: strengthOf(e) });
  }
  return cues;
}

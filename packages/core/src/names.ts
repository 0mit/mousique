// Note names for beginners: what each written note is called, with the accidental it actually sounds with
// (from the key signature, an earlier accidental in the bar, or a tie).

import type { Accidental, Score, Step } from './model.ts';
import { buildTimeline } from './timeline.ts';

export type NameSystem = 'persian' | 'solfege' | 'letters';

const PERSIAN: Record<Step, string> = { C: 'دو', D: 'ر', E: 'می', F: 'فا', G: 'سل', A: 'لا', B: 'سی' };
const SOLFEGE: Record<Step, string> = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

const PERSIAN_ACC: Record<Accidental, string> = {
  sharp: 'دیز',
  flat: 'بمل',
  natural: '',
  koron: 'کرن',
  sori: 'سری',
  'double-sharp': 'دوبل‌دیز',
  'double-flat': 'دوبل‌بمل',
};

const LATIN_ACC: Record<Accidental, string> = {
  sharp: '♯',
  flat: '♭',
  natural: '',
  koron: ' koron',
  sori: ' sori',
  'double-sharp': '𝄪',
  'double-flat': '𝄫',
};

export function noteName(step: Step, sounding: Accidental | undefined, system: NameSystem): string {
  if (system === 'persian') {
    const acc = sounding ? PERSIAN_ACC[sounding] : '';
    return acc ? `${PERSIAN[step]} ${acc}` : PERSIAN[step];
  }
  const base = system === 'solfege' ? SOLFEGE[step] : step;
  return base + (sounding ? LATIN_ACC[sounding] : '');
}

/**
 * The name of every sounded note, by event id. Rests, grace notes and the continuation of a tie get none
 * (nothing new is played there). A chord's names are joined from the top down.
 */
export function noteNames(score: Score, system: NameSystem): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of buildTimeline(score).byId.values()) {
    if (e.rest || e.grace) continue;
    const fresh = e.notes.filter((n) => !n.tiedFromPrevious);
    if (fresh.length === 0) continue;
    out.set(
      e.id,
      [...fresh]
        .reverse()
        .map((n) => noteName(n.step, n.sounding, system))
        .join(' / '),
    );
  }
  return out;
}

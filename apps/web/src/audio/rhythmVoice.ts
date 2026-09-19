// How each rhythm word is spoken: which of its generated candidates, a loudness trim and a timing nudge.
// Defaults come from voice/rhythm-choices.json (committed, chosen by ear in the voice lab); changes made in
// the lab are kept in this browser until they are exported and committed as the new defaults.

export interface WordSetting {
  /** Index into the word's candidates (0 = the generator's best guess). */
  candidate: number;
  /** Loudness trim in dB. */
  gainDb: number;
  /** Moves the word against the grid, in milliseconds (+ later), for a consonant that feels early or late. */
  nudgeMs: number;
}

export type WordSettings = Record<string, WordSetting>;

export const DEFAULT_SETTING: WordSetting = { candidate: 0, gainDb: 0, nudgeMs: 0 };

const STORAGE_KEY = 'mousique.rhythmVoice';
const BASE = `${import.meta.env.BASE_URL}voice/`;

export async function loadWordSettings(): Promise<{ defaults: WordSettings; local: WordSettings }> {
  let defaults: WordSettings = {};
  try {
    const r = await fetch(`${BASE}rhythm-choices.json`);
    if (r.ok) defaults = ((await r.json()) as { words?: WordSettings }).words ?? {};
  } catch {
    // No committed choices yet: every word uses its first candidate.
  }
  let local: WordSettings = {};
  try {
    local = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as WordSettings;
  } catch {
    // Storage refused or corrupt: start from the defaults.
  }
  return { defaults, local };
}

export function saveLocalSettings(local: WordSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
  } catch {
    // A per-viewer convenience; the export button is the durable path.
  }
}

export function settingFor(word: string, defaults: WordSettings, local: WordSettings): WordSetting {
  return { ...DEFAULT_SETTING, ...defaults[word], ...local[word] };
}

/** The file to commit as the new defaults (apps/web/public/voice/rhythm-choices.json). */
export function exportSettings(words: string[], defaults: WordSettings, local: WordSettings): string {
  const out: WordSettings = {};
  for (const w of words) out[w] = settingFor(w, defaults, local);
  return JSON.stringify({ chosen: new Date().toISOString().slice(0, 10), words: out }, null, 1) + '\n';
}

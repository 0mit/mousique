import * as ed from '@mousique/core';
import type { Accidental, BaseDuration, Duration, EditResult, Score, Selection, Step } from '@mousique/core';
import { useCallback, useMemo, useRef, useState } from 'react';

const HISTORY_LIMIT = 300;

export interface EditorState {
  score: Score;
  selection: Selection;
  /** Write mode: letters add new notes after the selection instead of changing it. */
  writing: boolean;
  /** The duration new notes and rests get. */
  inputDuration: Duration;
  canUndo: boolean;
  canRedo: boolean;
}

export type EditorApi = ReturnType<typeof useEditor>;

/** Keys 1 to 7 choose durations, from the sixty-fourth up to the whole note, as in MuseScore. */
export const DURATION_KEYS: Record<string, BaseDuration> = {
  '1': '64th',
  '2': '32nd',
  '3': '16th',
  '4': 'eighth',
  '5': 'quarter',
  '6': 'half',
  '7': 'whole',
};

/**
 * The editor: the score with undo history, the selection, write mode and the input duration. Every
 * change goes through `apply`, which records history, so undo covers panel edits as well as keys.
 */
export function useEditor(initial: Score, onEdited?: (sel: Selection, score: Score) => void) {
  // History lives in refs, not state: undo must move exactly one step even when React replays updaters.
  const pastRef = useRef<Score[]>([]);
  const futureRef = useRef<Score[]>([]);
  const [score, setScore] = useState<Score>(initial);
  const [selection, setSelection] = useState<Selection>(null);
  const [writing, setWriting] = useState(false);
  const [inputDuration, setInputDuration] = useState<Duration>({ base: 'eighth' });
  const onEditedRef = useRef(onEdited);
  onEditedRef.current = onEdited;

  // Refs mirror state so keyboard handlers never act on a stale score.
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const selRef = useRef(selection);
  selRef.current = selection;

  const commit = useCallback((next: Score, sel: Selection, audition = true) => {
    const prev = scoreRef.current;
    if (next === prev) {
      setSelection(sel);
      return;
    }
    pastRef.current = [...pastRef.current.slice(-HISTORY_LIMIT + 1), prev];
    futureRef.current = [];
    scoreRef.current = next;
    selRef.current = sel;
    setScore(next);
    setSelection(sel);
    if (audition) onEditedRef.current?.(sel, next);
  }, []);

  const apply = useCallback(
    (f: (s: Score, sel: Selection) => EditResult, audition = true) => {
      const r = f(scoreRef.current, selRef.current);
      commit(r.score, r.selection, audition);
    },
    [commit],
  );

  /** Replace the score without an edit to undo (opening a file, starting anew). */
  const load = useCallback((s: Score) => {
    pastRef.current = [];
    futureRef.current = [];
    scoreRef.current = s;
    setScore(s);
    const first = s.measures[0]?.events[0];
    setSelection(first ? { kind: 'event', id: first.id } : s.measures[0] ? { kind: 'measure', id: s.measures[0].id } : null);
  }, []);

  /** A change from a panel (title, tempo, tuning, bar properties), recorded for undo. */
  const update = useCallback((f: (s: Score) => Score) => commit(f(scoreRef.current), selRef.current, false), [commit]);

  const undo = useCallback(() => {
    const prev = pastRef.current[pastRef.current.length - 1];
    if (!prev) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [scoreRef.current, ...futureRef.current];
    scoreRef.current = prev;
    setScore(prev);
    setSelection((sel) => keepSelection(prev, sel));
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current[0];
    if (!next) return;
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current, scoreRef.current];
    scoreRef.current = next;
    setScore(next);
    setSelection((sel) => keepSelection(next, sel));
  }, []);

  const select = useCallback((sel: Selection) => {
    selRef.current = sel;
    setSelection(sel);
  }, []);

  const opts = useCallback(
    (): ed.EntryOptions => ({ insert: writing || selRef.current?.kind !== 'event', duration: inputDuration }),
    [writing, inputDuration],
  );

  const actions = useMemo(
    () => ({
      pitch: (step: Step, chord = false) => apply((s, sel) => ed.enterPitch(s, sel, step, { ...opts(), chord })),
      rest: () => apply((s, sel) => ed.enterRest(s, sel, opts())),
      duration: (base: BaseDuration) => {
        setInputDuration({ base });
        if (!writing) apply((s, sel) => ed.setDuration(s, sel, base), false);
      },
      dot: () => {
        if (writing || selRef.current?.kind !== 'event') {
          setInputDuration((d) => {
            const dots = ((d.dots ?? 0) + 1) % 3;
            return dots ? { base: d.base, dots } : { base: d.base };
          });
        } else {
          apply((s, sel) => ed.toggleDot(s, sel), false);
        }
      },
      accidental: (a: Accidental) => apply((s, sel) => ed.setAccidental(s, sel, a)),
      step: (n: number) => apply((s, sel) => ed.moveStep(s, sel, n)),
      octave: (n: number) => apply((s, sel) => ed.moveOctave(s, sel, n)),
      tie: () => apply((s, sel) => ed.toggleTie(s, sel), false),
      grace: () => apply((s, sel) => ed.toggleGrace(s, sel), false),
      tuplet: () => apply((s, sel) => ed.toggleTuplet(s, sel), false),
      tremolo: () => apply((s, sel) => ed.cycleTremolo(s, sel), false),
      text: (t: string | undefined) => apply((s, sel) => ed.setText(s, sel, t), false),
      below: (t: string | undefined) => apply((s, sel) => ed.setBelow(s, sel, t), false),
      slur: (shrink = false) => apply((s, sel) => ed.extendSlur(s, sel, shrink), false),
      remove: () => apply((s, sel) => ed.deleteSelected(s, sel), false),
      addMeasure: (before = false) => apply((s, sel) => ed.insertMeasure(s, sel, before), false),
      removeMeasure: () => apply((s, sel) => ed.deleteMeasure(s, sel), false),
      move: (delta: number) => select(ed.moveSelection(scoreRef.current, selRef.current, delta)),
      moveBar: (delta: number) => select(ed.moveMeasure(scoreRef.current, selRef.current, delta)),
      toggleWriting: () => setWriting((w) => !w),
      setWriting,
      undo,
      redo,
    }),
    [apply, opts, select, undo, redo, writing],
  );

  const state: EditorState = {
    score,
    selection,
    writing,
    inputDuration,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
  return { state, actions, select, load, update };
}

/** After undo or redo, keep the selection if it still exists; otherwise fall back to the first bar. */
function keepSelection(score: Score, sel: Selection): Selection {
  if (!sel) return null;
  if (sel.kind === 'event' && ed.locateEvent(score, sel.id)) return sel;
  if (sel.kind === 'measure' && score.measures.some((m) => m.id === sel.id)) return sel;
  const m = score.measures[0];
  return m ? { kind: 'measure', id: m.id } : null;
}

/**
 * The keyboard map. Returns true when the key was an editing command. Letters are read from `e.code`
 * so they work with a Persian keyboard layout too.
 */
export function handleEditorKey(e: KeyboardEvent, api: EditorApi): boolean {
  const { actions: a } = api;
  const mod = e.ctrlKey || e.metaKey;
  const code = e.code;

  if (mod && code === 'KeyZ') {
    if (e.shiftKey) a.redo();
    else a.undo();
    return true;
  }
  if (mod && code === 'KeyY') return a.redo(), true;
  if (mod && code === 'KeyB') return a.addMeasure(e.shiftKey), true;
  if (mod && (code === 'Delete' || code === 'Backspace')) return a.removeMeasure(), true;
  if (mod && code === 'ArrowUp') return a.octave(1), true;
  if (mod && code === 'ArrowDown') return a.octave(-1), true;
  if (mod && code === 'ArrowRight') return a.moveBar(1), true;
  if (mod && code === 'ArrowLeft') return a.moveBar(-1), true;
  if (mod) return false;
  if (e.altKey && code === 'Digit3') return a.tuplet(), true;
  if (e.altKey) return false;

  const letter = /^Key([A-G])$/.exec(code)?.[1];
  if (letter) return a.pitch(letter as Step, e.shiftKey), true;

  switch (code) {
    case 'KeyN':
      a.toggleWriting();
      return true;
    case 'Escape':
      a.setWriting(false);
      return true;
    case 'KeyR':
    case 'Digit0':
      a.rest();
      return true;
    case 'KeyK':
      a.accidental('koron');
      return true;
    case 'KeyS':
      a.accidental('sori');
      return true;
    case 'Minus':
      a.accidental('flat');
      return true;
    case 'Equal':
      if (e.shiftKey) a.accidental('sharp'); // "+"
      else a.accidental('natural');
      return true;
    case 'Digit3':
      if (e.shiftKey) {
        a.accidental('sharp'); // "#"
        return true;
      }
      break;
    case 'KeyT':
      a.tie();
      return true;
    case 'KeyL':
      a.slur(e.shiftKey);
      return true;
    case 'Slash':
      a.grace();
      return true;
    case 'KeyZ':
      a.tremolo();
      return true;
    case 'Period':
      a.dot();
      return true;
    case 'ArrowUp':
      a.step(1);
      return true;
    case 'ArrowDown':
      a.step(-1);
      return true;
    case 'ArrowRight':
      a.move(1);
      return true;
    case 'ArrowLeft':
      a.move(-1);
      return true;
    case 'Delete':
    case 'Backspace':
      a.remove();
      return true;
  }
  const digit = /^Digit([1-7])$/.exec(code)?.[1];
  if (digit && !e.shiftKey) return a.duration(DURATION_KEYS[digit]!), true;
  return false;
}

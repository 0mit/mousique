// Editing operations on the score model. Every operation is pure: it takes a score and a selection and
// returns a new score and the selection that should follow, so the UI can keep undo history as a list
// of scores and never needs to know how an edit was made.

import { approxEqual, durationQ, measureCapacityQ } from './duration.ts';
import {
  STEPS,
  type Accidental,
  type BaseDuration,
  type Clef,
  type Duration,
  type Measure,
  type Pitch,
  type Score,
  type ScoreEvent,
  type Step,
  type TimeSignature,
  DEFAULT_TUNING,
} from './model.ts';
import { sourceMeasure } from './timeline.ts';

export type Selection = { kind: 'event'; id: string } | { kind: 'measure'; id: string } | null;

export interface EditResult {
  score: Score;
  selection: Selection;
}

interface Located {
  mi: number;
  ei: number;
}

function clone(score: Score): Score {
  return JSON.parse(JSON.stringify(score)) as Score;
}

export function locateEvent(score: Score, id: string): Located | undefined {
  for (let mi = 0; mi < score.measures.length; mi++) {
    const ei = score.measures[mi]!.events.findIndex((e) => e.id === id);
    if (ei >= 0) return { mi, ei };
  }
  return undefined;
}

/** Index of the measure a selection is in, or undefined. */
export function selectedMeasureIndex(score: Score, sel: Selection): number | undefined {
  if (!sel) return undefined;
  if (sel.kind === 'measure') {
    const mi = score.measures.findIndex((m) => m.id === sel.id);
    return mi >= 0 ? mi : undefined;
  }
  return locateEvent(score, sel.id)?.mi;
}

export function selectedEvent(score: Score, sel: Selection): ScoreEvent | undefined {
  if (sel?.kind !== 'event') return undefined;
  const loc = locateEvent(score, sel.id);
  return loc ? score.measures[loc.mi]!.events[loc.ei] : undefined;
}

function maxSuffix(ids: Iterable<string>, prefix: string): number {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of ids) {
    const m = re.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

function allIds(score: Score): Set<string> {
  const ids = new Set<string>();
  for (const m of score.measures) {
    ids.add(m.id);
    for (const e of m.events) ids.add(e.id);
  }
  return ids;
}

/** A fresh id with the given prefix that the score does not use. */
export function freshId(score: Score, prefix: 'e' | 'm'): string {
  const ids = allIds(score);
  let n = maxSuffix(ids, prefix) + 1;
  while (ids.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

// --- pitch helpers -----------------------------------------------------------------------------------

function diatonicIndex(p: Pick<Pitch, 'step' | 'octave'>): number {
  return p.octave * 7 + STEPS.indexOf(p.step);
}

function fromDiatonic(i: number): { step: Step; octave: number } {
  const octave = Math.floor(i / 7);
  return { step: STEPS[i - octave * 7]!, octave };
}

/** The octave that puts `step` closest to `ref` — how a letter key picks its octave. */
export function nearestOctave(step: Step, ref: Pick<Pitch, 'step' | 'octave'>): number {
  const r = diatonicIndex(ref);
  let best = ref.octave;
  let bestDist = Infinity;
  for (let o = ref.octave - 1; o <= ref.octave + 1; o++) {
    const d = Math.abs(o * 7 + STEPS.indexOf(step) - r);
    if (d < bestDist) {
      bestDist = d;
      best = o;
    }
  }
  return best;
}

function clefFor(score: Score, mi: number): Clef {
  for (let i = mi; i >= 0; i--) {
    const c = score.measures[i]!.clef;
    if (c) return c;
  }
  return 'treble';
}

const CLEF_MIDDLE: Record<Clef, Pick<Pitch, 'step' | 'octave'>> = {
  treble: { step: 'B', octave: 4 },
  'treble-8vb': { step: 'B', octave: 3 },
  bass: { step: 'D', octave: 3 },
  alto: { step: 'C', octave: 4 },
  tenor: { step: 'A', octave: 3 },
};

/** The last pitch at or before a position, to choose the octave of the next note from. */
function referencePitch(score: Score, mi: number, ei: number): Pick<Pitch, 'step' | 'octave'> {
  for (let m = mi; m >= 0; m--) {
    const evs = score.measures[m]!.events;
    for (let e = m === mi ? ei : evs.length - 1; e >= 0; e--) {
      const ps = evs[e]?.pitches;
      if (ps && ps.length > 0) return ps[ps.length - 1]!;
    }
  }
  return CLEF_MIDDLE[clefFor(score, mi)];
}

// --- measure fill ------------------------------------------------------------------------------------

export function timeAt(score: Score, mi: number): TimeSignature | undefined {
  for (let i = mi; i >= 0; i--) {
    const t = score.measures[i]!.time;
    if (t) return t;
  }
  return undefined;
}

export function measureFillQ(m: Measure): number {
  return m.events.reduce((sum, e) => sum + (e.grace ? 0 : durationQ(e.duration)), 0);
}

/** How full a measure is: its content, its capacity (undefined when unmetered), and whether it is full. */
export function measureFill(score: Score, mi: number): { filled: number; capacity: number | undefined; full: boolean } {
  const m = score.measures[mi]!;
  const filled = measureFillQ(sourceMeasure(score, mi));
  const t = timeAt(score, mi);
  if (m.unmetered || !t) return { filled, capacity: undefined, full: false };
  const capacity = measureCapacityQ(t);
  return { filled, capacity, full: filled > capacity - 1e-9 || approxEqual(filled, capacity) };
}

// --- navigation --------------------------------------------------------------------------------------

/** Every selectable position in reading order: each event, or the measure itself when it is empty. */
function positions(score: Score): Selection[] {
  const out: Selection[] = [];
  for (const m of score.measures) {
    if (m.events.length === 0) out.push({ kind: 'measure', id: m.id });
    for (const e of m.events) out.push({ kind: 'event', id: e.id });
  }
  return out;
}

export function moveSelection(score: Score, sel: Selection, delta: number): Selection {
  const ps = positions(score);
  if (ps.length === 0) return null;
  if (!sel) return delta >= 0 ? ps[0]! : ps[ps.length - 1]!;
  let i = ps.findIndex((p) => p!.kind === sel.kind && p!.id === sel.id);
  if (i < 0 && sel.kind === 'measure') {
    // A selected measure that has events: step from its first or last event.
    const m = score.measures.find((x) => x.id === sel.id);
    const e = delta >= 0 ? m?.events[0] : m?.events[m.events.length - 1];
    if (e) return { kind: 'event', id: e.id };
    i = 0;
  }
  return ps[Math.max(0, Math.min(ps.length - 1, i + delta))]!;
}

/** Move to the first position of the next (delta 1) or previous (-1) measure. */
export function moveMeasure(score: Score, sel: Selection, delta: number): Selection {
  const mi = selectedMeasureIndex(score, sel) ?? 0;
  const target = score.measures[Math.max(0, Math.min(score.measures.length - 1, mi + delta))]!;
  const first = target.events[0];
  return first ? { kind: 'event', id: first.id } : { kind: 'measure', id: target.id };
}

// --- helpers to apply an edit to the selected event --------------------------------------------------

function onSelectedEvent(score: Score, sel: Selection, f: (e: ScoreEvent, s: Score, loc: Located) => void): EditResult {
  if (sel?.kind !== 'event') return { score, selection: sel };
  const s = clone(score);
  const loc = locateEvent(s, sel.id);
  if (!loc) return { score, selection: sel };
  f(s.measures[loc.mi]!.events[loc.ei]!, s, loc);
  return { score: s, selection: sel };
}

// --- entering notes ----------------------------------------------------------------------------------

export interface EntryOptions {
  /** Insert a new event after the selection (true) or change the selected event (false). */
  insert: boolean;
  duration: Duration;
}

/**
 * Where a new event goes: after the selected event, or at the start of a selected measure. When the
 * selection is the last event of a full metered measure the new event starts the next measure, which is
 * created if there is none — so typing a melody in from paper moves across bar lines by itself.
 */
function insertionPoint(s: Score, sel: Selection): Located {
  if (!sel) {
    if (s.measures.length === 0) s.measures.push({ id: freshId(s, 'm'), events: [] });
    const last = s.measures.length - 1;
    return { mi: last, ei: s.measures[last]!.events.length };
  }
  if (sel.kind === 'measure') {
    const mi = Math.max(0, s.measures.findIndex((m) => m.id === sel.id));
    return { mi, ei: 0 };
  }
  const loc = locateEvent(s, sel.id);
  if (!loc) return { mi: 0, ei: 0 };
  const m = s.measures[loc.mi]!;
  const atEnd = loc.ei === m.events.length - 1;
  if (atEnd && measureFill(s, loc.mi).full) {
    if (loc.mi === s.measures.length - 1) s.measures.push({ id: freshId(s, 'm'), events: [] });
    return { mi: loc.mi + 1, ei: 0 };
  }
  return { mi: loc.mi, ei: loc.ei + 1 };
}

function insertEvent(score: Score, sel: Selection, make: (s: Score, at: Located) => ScoreEvent): EditResult {
  const s = clone(score);
  const at = insertionPoint(s, sel);
  const ev = make(s, at);
  s.measures[at.mi]!.events.splice(at.ei, 0, ev);
  return { score: s, selection: { kind: 'event', id: ev.id } };
}

/** A letter key: A to G. `chord` adds the pitch to the selected event instead. */
export function enterPitch(score: Score, sel: Selection, step: Step, opts: EntryOptions & { chord?: boolean }): EditResult {
  if (opts.chord && sel?.kind === 'event') {
    return onSelectedEvent(score, sel, (e, s, loc) => {
      const ps = e.pitches ?? [];
      const ref = ps.length ? ps[ps.length - 1]! : referencePitch(s, loc.mi, loc.ei);
      // A chord note goes above the one before it.
      let octave = nearestOctave(step, ref);
      if (ps.length && diatonicIndex({ step, octave }) <= diatonicIndex(ref)) octave++;
      e.pitches = [...ps, { step, octave }];
    });
  }
  if (!opts.insert && sel?.kind === 'event') {
    return onSelectedEvent(score, sel, (e, s, loc) => {
      const ref = e.pitches?.length ? e.pitches[0]! : referencePitch(s, loc.mi, loc.ei - 1);
      e.pitches = [{ step, octave: nearestOctave(step, ref) }];
    });
  }
  return insertEvent(score, sel, (s, at) => {
    const ref = referencePitch(s, at.mi, at.ei - 1);
    return { id: freshId(s, 'e'), duration: { ...opts.duration }, pitches: [{ step, octave: nearestOctave(step, ref) }] };
  });
}

/** Enter a rest, or turn the selected event into one. */
export function enterRest(score: Score, sel: Selection, opts: EntryOptions): EditResult {
  if (!opts.insert && sel?.kind === 'event') {
    return onSelectedEvent(score, sel, (e) => {
      delete e.pitches;
      delete e.tie;
      delete e.grace;
      delete e.tremolo;
    });
  }
  return insertEvent(score, sel, (s) => ({ id: freshId(s, 'e'), duration: { ...opts.duration } }));
}

// --- changing the selected event ---------------------------------------------------------------------

export function setDuration(score: Score, sel: Selection, base: BaseDuration): EditResult {
  return onSelectedEvent(score, sel, (e) => {
    e.duration = { ...e.duration, base };
  });
}

export function toggleDot(score: Score, sel: Selection): EditResult {
  return onSelectedEvent(score, sel, (e) => {
    const dots = ((e.duration.dots ?? 0) + 1) % 3;
    if (dots) e.duration.dots = dots;
    else delete e.duration.dots;
  });
}

/**
 * Apply an accidental to the selected event's last-entered pitch (the only one, for a single note).
 * Applying the one already written removes it. Sharp and flat step on to double sharp and double flat.
 */
export function setAccidental(score: Score, sel: Selection, acc: Accidental): EditResult {
  return onSelectedEvent(score, sel, (e) => {
    const p = e.pitches?.[e.pitches.length - 1];
    if (!p) return;
    const cur = p.accidental;
    let next: Accidental | undefined = acc;
    if (acc === 'sharp' && cur === 'sharp') next = 'double-sharp';
    else if (acc === 'flat' && cur === 'flat') next = 'double-flat';
    else if (cur === acc || (acc === 'sharp' && cur === 'double-sharp') || (acc === 'flat' && cur === 'double-flat')) next = undefined;
    if (next) p.accidental = next;
    else delete p.accidental;
  });
}

/** Move every pitch of the selected event by diatonic steps; a written accidental is dropped. */
export function moveStep(score: Score, sel: Selection, steps: number): EditResult {
  return onSelectedEvent(score, sel, (e) => {
    e.pitches = e.pitches?.map((p) => ({ ...fromDiatonic(diatonicIndex(p) + steps) }));
  });
}

export function moveOctave(score: Score, sel: Selection, octaves: number): EditResult {
  return onSelectedEvent(score, sel, (e) => {
    e.pitches = e.pitches?.map((p) => ({ ...p, octave: Math.max(0, Math.min(9, p.octave + octaves)) }));
  });
}

export function toggleTie(score: Score, sel: Selection): EditResult {
  return onSelectedEvent(score, sel, (e) => {
    if (e.tie || !e.pitches?.length) delete e.tie;
    else e.tie = true;
  });
}

export function toggleGrace(score: Score, sel: Selection): EditResult {
  return onSelectedEvent(score, sel, (e) => {
    if (e.grace || !e.pitches?.length) {
      delete e.grace;
    } else {
      e.grace = true;
      delete e.tie;
      delete e.duration.tuplet;
    }
  });
}

/** Cycle the tremolo (riz) strokes: none, 3, 2, 1, none. */
export function cycleTremolo(score: Score, sel: Selection): EditResult {
  return onSelectedEvent(score, sel, (e) => {
    if (!e.pitches?.length) return;
    const next = ({ 0: 3, 3: 2, 2: 1, 1: 0 } as const)[e.tremolo ?? 0];
    if (next) e.tremolo = next;
    else delete e.tremolo;
  });
}

/**
 * Make the selected event and the ones after it in the same measure a tuplet (3 in the time of 2 by
 * default), until the group's written length is `actual` times the selected value. Applied to an event
 * already in a tuplet, it removes the tuplet from that event's group.
 */
export function toggleTuplet(score: Score, sel: Selection, actual = 3, normal = 2): EditResult {
  return onSelectedEvent(score, sel, (e, s, loc) => {
    const evs = s.measures[loc.mi]!.events;
    if (e.duration.tuplet) {
      for (let i = loc.ei; i < evs.length && evs[i]!.duration.tuplet; i++) delete evs[i]!.duration.tuplet;
      for (let i = loc.ei - 1; i >= 0 && evs[i]!.duration.tuplet; i--) delete evs[i]!.duration.tuplet;
      return;
    }
    const target = actual * durationQ({ base: e.duration.base, dots: e.duration.dots });
    let written = 0;
    for (let i = loc.ei; i < evs.length && written < target - 1e-9; i++) {
      const x = evs[i]!;
      if (x.grace) continue;
      x.duration.tuplet = { actual, normal };
      written += durationQ({ base: x.duration.base, dots: x.duration.dots });
    }
  });
}

export function setText(score: Score, sel: Selection, text: string | undefined): EditResult {
  return onSelectedEvent(score, sel, (e) => {
    if (text && text.trim()) e.text = text.trim();
    else delete e.text;
  });
}

/** Text below the note — fingering. */
export function setBelow(score: Score, sel: Selection, text: string | undefined): EditResult {
  return onSelectedEvent(score, sel, (e) => {
    if (text && text.trim()) e.below = text.trim();
    else delete e.below;
  });
}

/** Pitched, non-grace events in reading order: what a slur can start or end on. */
function slurrable(score: Score): ScoreEvent[] {
  return score.measures.flatMap((m) => m.events.filter((e) => !e.grace && e.pitches?.length));
}

/**
 * Slur from the selected note: the first press slurs it to the next note, each further press reaches
 * one note further. `shrink` pulls the end back by one note, and removes the slur at its last step.
 */
export function extendSlur(score: Score, sel: Selection, shrink = false): EditResult {
  return extendLink(score, sel, 'slurTo', shrink);
}

/** The same for a straight line between notes (a finger slide). */
export function extendLine(score: Score, sel: Selection, shrink = false): EditResult {
  return extendLink(score, sel, 'lineTo', shrink);
}

function extendLink(score: Score, sel: Selection, key: 'slurTo' | 'lineTo', shrink: boolean): EditResult {
  return onSelectedEvent(score, sel, (e, s) => {
    if (!e.pitches?.length || e.grace) return;
    const notes = slurrable(s);
    const start = notes.findIndex((x) => x.id === e.id);
    const target = e[key];
    const end = target ? notes.findIndex((x) => x.id === target) : start;
    const next = shrink ? end - 1 : end + 1;
    if (next <= start || !notes[next]) {
      if (shrink) delete e[key];
      return;
    }
    e[key] = notes[next]!.id;
  });
}

/** Delete the selected event; the selection moves to the one before it (or its measure, if now empty). */
export function deleteSelected(score: Score, sel: Selection): EditResult {
  if (sel?.kind !== 'event') return { score, selection: sel };
  const s = clone(score);
  const loc = locateEvent(s, sel.id);
  if (!loc) return { score, selection: sel };
  const m = s.measures[loc.mi]!;
  m.events.splice(loc.ei, 1);
  // A slur that ended on the deleted note is removed with it.
  for (const mm of s.measures)
    for (const e of mm.events) {
      if (e.slurTo === sel.id) delete e.slurTo;
      if (e.lineTo === sel.id) delete e.lineTo;
    }
  const prev = m.events[loc.ei - 1] ?? m.events[0];
  return { score: s, selection: prev ? { kind: 'event', id: prev.id } : { kind: 'measure', id: m.id } };
}

// --- measures ----------------------------------------------------------------------------------------

export function insertMeasure(score: Score, sel: Selection, before = false): EditResult {
  const s = clone(score);
  const mi = selectedMeasureIndex(s, sel) ?? s.measures.length - 1;
  const m: Measure = { id: freshId(s, 'm'), events: [] };
  s.measures.splice(before ? Math.max(0, mi) : mi + 1, 0, m);
  return { score: s, selection: { kind: 'measure', id: m.id } };
}

/**
 * Delete the selected measure. The first measure's clef, key and time move to the new first measure,
 * so deleting it never loses the score's opening signature.
 */
export function deleteMeasure(score: Score, sel: Selection): EditResult {
  const mi = selectedMeasureIndex(score, sel);
  if (mi === undefined || score.measures.length <= 1) return { score, selection: sel };
  const s = clone(score);
  const [gone] = s.measures.splice(mi, 1);
  if (mi === 0 && gone) {
    const first = s.measures[0]!;
    first.clef ??= gone.clef;
    first.key ??= gone.key;
    first.time ??= gone.time;
  }
  const target = s.measures[Math.min(mi, s.measures.length - 1)]!;
  return { score: s, selection: { kind: 'measure', id: target.id } };
}

export type MeasurePatch = Partial<
  Pick<Measure, 'clef' | 'key' | 'time' | 'unmetered' | 'repeatStart' | 'repeatEnd' | 'ending' | 'repeatPrevious' | 'doubleBar'>
>;

/** Set or clear measure properties. A key whose value is undefined is removed from the measure. */
export function setMeasure(score: Score, measureId: string, patch: MeasurePatch): Score {
  const s = clone(score);
  const m = s.measures.find((x) => x.id === measureId);
  if (!m) return score;
  for (const [k, v] of Object.entries(patch) as [keyof MeasurePatch, unknown][]) {
    if (v === undefined || v === false) delete m[k];
    else (m as unknown as Record<string, unknown>)[k] = v;
  }
  return s;
}

/** A blank score to start from: one empty 4/4 measure in the treble clef. */
export function newScore(title = 'Untitled'): Score {
  return {
    format: 'mousique-score',
    version: 1,
    meta: { title },
    tempo: { bpm: 80 },
    tuning: { ...DEFAULT_TUNING },
    measures: [{ id: 'm1', clef: 'treble', key: { accidentals: [] }, time: { beats: 4, beatType: 4 }, events: [] }],
  };
}

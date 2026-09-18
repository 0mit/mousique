// The sync map ties score position q (quarter notes from the start, repeats unfolded) to media time t
// (seconds). Between anchors both directions interpolate linearly; beyond the ends the nearest
// segment's slope is extended. With fewer than two anchors the score's nominal tempo gives the slope.

export type AnchorSource = 'manual' | 'auto';

export interface Anchor {
  q: number;
  t: number;
  source: AnchorSource;
}

export interface SyncMap {
  anchors: Anchor[];
}

export class SyncMapError extends Error {}

/** Throws unless both q and t are strictly increasing and finite. */
export function assertValid(map: SyncMap): void {
  const a = map.anchors;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    if (!Number.isFinite(x.q) || !Number.isFinite(x.t)) throw new SyncMapError(`anchor ${i} is not finite`);
    if (i > 0) {
      const p = a[i - 1]!;
      if (!(x.q > p.q)) throw new SyncMapError(`anchor ${i}: q ${x.q} does not increase past ${p.q}`);
      if (!(x.t > p.t)) throw new SyncMapError(`anchor ${i}: t ${x.t} does not increase past ${p.t}`);
    }
  }
}

export function isValid(map: SyncMap): boolean {
  try {
    assertValid(map);
    return true;
  } catch {
    return false;
  }
}

/** Seconds per quarter note between two anchors. */
function slope(a: Anchor, b: Anchor): number {
  return (b.t - a.t) / (b.q - a.q);
}

/** Index i of the segment [i, i+1] used for position x along `key`, clamped to the end segments. */
function segmentIndex(anchors: Anchor[], x: number, key: 'q' | 't'): number {
  const n = anchors.length;
  if (x <= anchors[0]![key]) return 0;
  if (x >= anchors[n - 1]![key]) return n - 2;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid]![key] <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Media time for score position q. `nominalBpm` is used only when there are fewer than two anchors. */
export function qToT(map: SyncMap, q: number, nominalBpm: number): number {
  const a = map.anchors;
  const spq = 60 / nominalBpm;
  if (a.length === 0) return q * spq;
  if (a.length === 1) return a[0]!.t + (q - a[0]!.q) * spq;
  const i = segmentIndex(a, q, 'q');
  const p = a[i]!;
  return p.t + (q - p.q) * slope(p, a[i + 1]!);
}

/** Score position for media time t. Exact inverse of qToT. */
export function tToQ(map: SyncMap, t: number, nominalBpm: number): number {
  const a = map.anchors;
  const spq = 60 / nominalBpm;
  if (a.length === 0) return t / spq;
  if (a.length === 1) return a[0]!.q + (t - a[0]!.t) / spq;
  const i = segmentIndex(a, t, 't');
  const p = a[i]!;
  return p.q + (t - p.t) / slope(p, a[i + 1]!);
}

/** Local tempo in quarter notes per minute at media time t: 60 * dq / dt of the segment in force. */
export function tempoAtT(map: SyncMap, t: number, nominalBpm: number): number {
  const a = map.anchors;
  if (a.length < 2) return nominalBpm;
  const i = segmentIndex(a, t, 't');
  return 60 / slope(a[i]!, a[i + 1]!);
}

export interface TempoSegment {
  t0: number;
  t1: number;
  q0: number;
  q1: number;
  bpm: number;
}

/** The tempo curve: one constant-tempo segment between each pair of anchors. */
export function tempoCurve(map: SyncMap): TempoSegment[] {
  const a = map.anchors;
  const out: TempoSegment[] = [];
  for (let i = 0; i + 1 < a.length; i++) {
    const p = a[i]!;
    const n = a[i + 1]!;
    out.push({ t0: p.t, t1: n.t, q0: p.q, q1: n.q, bpm: (60 * (n.q - p.q)) / (n.t - p.t) });
  }
  return out;
}

/**
 * Insert or replace an anchor at q. Returns a new map; throws if the result would not be strictly
 * increasing in both q and t. An anchor at the same q (within 1e-6) is replaced, and a manual anchor
 * is never replaced by an automatic one.
 */
export function upsertAnchor(map: SyncMap, anchor: Anchor): SyncMap {
  const existing = map.anchors.find((a) => Math.abs(a.q - anchor.q) < 1e-6);
  if (existing && existing.source === 'manual' && anchor.source === 'auto') return map;
  const anchors = map.anchors.filter((a) => a !== existing);
  anchors.push(anchor);
  anchors.sort((x, y) => x.q - y.q);
  const next = { anchors };
  assertValid(next);
  return next;
}

export function removeAnchorAt(map: SyncMap, q: number): SyncMap {
  return { anchors: map.anchors.filter((a) => Math.abs(a.q - q) >= 1e-6) };
}

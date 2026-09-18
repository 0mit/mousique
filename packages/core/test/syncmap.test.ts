import { describe, expect, it } from 'vitest';
import { qToT, tToQ, tempoAtT, tempoCurve, upsertAnchor, removeAnchorAt, assertValid, type SyncMap } from '../src/index.ts';

const map: SyncMap = {
  anchors: [
    { q: 0, t: 1.0, source: 'manual' },
    { q: 4, t: 3.0, source: 'manual' }, // 120 bpm
    { q: 8, t: 7.0, source: 'auto' }, // 60 bpm
  ],
};

describe('sync map', () => {
  it('interpolates both ways and the two are inverses', () => {
    expect(qToT(map, 2, 90)).toBeCloseTo(2.0);
    expect(qToT(map, 6, 90)).toBeCloseTo(5.0);
    for (const q of [-3, 0, 1.3, 4, 5.9, 8, 12.5]) {
      expect(tToQ(map, qToT(map, q, 90), 90)).toBeCloseTo(q, 9);
    }
  });
  it('extends the end segments beyond the anchors', () => {
    expect(qToT(map, -2, 90)).toBeCloseTo(0.0); // before the first anchor, 120 bpm slope
    expect(qToT(map, 10, 90)).toBeCloseTo(9.0); // media longer than the score, 60 bpm slope
    expect(tToQ(map, 0, 90)).toBeCloseTo(-2);
  });
  it('falls back to the nominal tempo with fewer than two anchors', () => {
    expect(qToT({ anchors: [] }, 3, 60)).toBe(3);
    const one: SyncMap = { anchors: [{ q: 2, t: 10, source: 'manual' }] };
    expect(qToT(one, 4, 120)).toBeCloseTo(11);
    expect(tToQ(one, 9, 120)).toBeCloseTo(0);
    expect(tempoAtT(one, 0, 77)).toBe(77);
  });
  it('reports local tempo', () => {
    expect(tempoAtT(map, 2, 90)).toBeCloseTo(120);
    expect(tempoAtT(map, 5, 90)).toBeCloseTo(60);
    expect(tempoAtT(map, 100, 90)).toBeCloseTo(60);
    expect(tempoCurve(map).map((s) => s.bpm)).toEqual([120, 60]);
  });
  it('keeps anchors strictly increasing and manual anchors in charge', () => {
    expect(() => upsertAnchor(map, { q: 5, t: 2.5, source: 'manual' })).toThrow();
    const m2 = upsertAnchor(map, { q: 6, t: 5.5, source: 'manual' });
    expect(m2.anchors.map((a) => a.q)).toEqual([0, 4, 6, 8]);
    expect(upsertAnchor(map, { q: 4, t: 3.2, source: 'auto' })).toBe(map);
    expect(upsertAnchor(map, { q: 8, t: 6.5, source: 'manual' }).anchors[2]!.t).toBe(6.5);
    expect(removeAnchorAt(map, 4).anchors).toHaveLength(2);
    expect(() => assertValid({ anchors: [{ q: 1, t: 1, source: 'manual' }, { q: 1, t: 2, source: 'manual' }] })).toThrow();
  });
});

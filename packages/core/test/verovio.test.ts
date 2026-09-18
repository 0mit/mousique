// Renders the model's MEI with the real Verovio build and checks what the app relies on:
// ids survive into the SVG and timemap, koron and sori glyphs are drawn, and our onsets
// agree with Verovio's.
import { beforeAll, describe, expect, it } from 'vitest';
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { buildTimeline, demoScore, scoreToMei, type Score } from '../src/index.ts';

let tk: VerovioToolkit;
beforeAll(async () => {
  tk = new VerovioToolkit(await createVerovioModule());
  tk.setOptions({ adjustPageHeight: true, header: 'auto', footer: 'none', breaks: 'auto', xmlIdSeed: 1 });
}, 60_000);

interface TimemapEntry { qstamp: number; tstamp: number; on?: string[]; off?: string[]; restsOn?: string[]; measureOn?: string }

describe('Verovio on generated MEI', () => {
  it('loads cleanly, keeps every id, and draws koron and sori', () => {
    expect(tk.loadData(scoreToMei(demoScore))).toBeTruthy();
    const log = tk.getLog();
    expect(log.replace(/\s+/g, '')).toBe('');
    const svg = tk.renderToSVG(1);
    for (const m of demoScore.measures) {
      expect(svg).toContain(`id="${m.id}"`);
      for (const e of m.events) expect(svg).toContain(`id="${e.id}"`);
    }
    expect(svg).toMatch(/href="#E460/); // accidentalKoron
    expect(svg).toMatch(/href="#E461/); // accidentalSori
    expect(svg).toContain('bTrem');
    // Four eighths in 2/4 beam as two pairs; the triplet beams inside its bracket.
    expect((svg.match(/class="beam"/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(svg).toContain('آزاد');
  });

  it('agrees with our timeline on every onset', () => {
    tk.loadData(scoreToMei(demoScore));
    const tm = tk.renderToTimemap({ includeMeasures: true, includeRests: true }) as unknown as TimemapEntry[];
    const verovioQ = new Map<string, number>();
    for (const entry of tm) for (const id of [...(entry.on ?? []), ...(entry.restsOn ?? [])]) if (!verovioQ.has(id)) verovioQ.set(id, entry.qstamp);
    const tl = buildTimeline(demoScore);
    for (const e of tl.events) {
      const vq = verovioQ.get(e.id);
      expect(vq, `timemap has ${e.id}`).toBeDefined();
      // Verovio delays a note that follows an unaccented grace note by a few hundredths of a quarter.
      const tolerance = e.grace || tl.events[tl.events.indexOf(e) - 1]?.grace ? 0.05 : 1e-6;
      expect(Math.abs(vq! - e.q), `${e.id}: ours ${e.q}, Verovio ${vq}`).toBeLessThan(tolerance);
    }
  });
});

describe('Verovio on the harder MEI shapes', () => {
  it('renders key, clef and meter changes, chords, back-to-back triplets and a Persian key change', () => {
    const t3 = { actual: 3, normal: 2 };
    const s = JSON.parse(JSON.stringify(demoScore)) as Score;
    s.measures.push(
      {
        id: 'x1',
        clef: 'bass',
        time: { beats: 3, beatType: 4 },
        key: { accidentals: [{ step: 'E', accidental: 'koron' }, { step: 'B', accidental: 'flat' }] },
        events: [
          { id: 'x1a', duration: { base: 'eighth', tuplet: t3 }, pitches: [{ step: 'C', octave: 3 }] },
          { id: 'x1b', duration: { base: 'eighth', tuplet: t3 }, pitches: [{ step: 'D', octave: 3 }] },
          { id: 'x1c', duration: { base: 'eighth', tuplet: t3 }, pitches: [{ step: 'E', octave: 3 }] },
          { id: 'x1d', duration: { base: 'quarter', tuplet: t3 }, pitches: [{ step: 'F', octave: 3 }] },
          { id: 'x1e', duration: { base: 'eighth', tuplet: t3 }, pitches: [{ step: 'G', octave: 3 }] },
          { id: 'x1f', duration: { base: 'quarter' }, pitches: [{ step: 'G', octave: 2 }, { step: 'D', octave: 3, accidental: 'sori' }] },
        ],
      },
    );
    tk.loadData(scoreToMei(s));
    expect(tk.getLog().replace(/\s+/g, '')).toBe('');
    const svg = tk.renderToSVG(1);
    for (const id of ['x1', 'x1a', 'x1d', 'x1f', 'x1f-n0', 'x1f-n1']) expect(svg).toContain(`id="${id}"`);
    expect((svg.match(/class="tuplet"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    const tm = tk.renderToTimemap({ includeRests: true }) as unknown as TimemapEntry[];
    const x1f = tm.find((e) => e.on?.includes('x1f-n0'));
    expect(x1f?.qstamp).toBeCloseTo(buildTimeline(s).byId.get('x1f')!.q, 6);
  });
});

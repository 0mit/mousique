import { writtenQ } from './duration.ts';
import type {
  Accidental,
  BaseDuration,
  Clef,
  KeySignature,
  Measure,
  Pitch,
  Score,
  ScoreEvent,
  TimeSignature,
} from './model.ts';
import { pitchKey } from './tuning.ts';

const MEI_DUR: Record<BaseDuration, string> = {
  whole: '1',
  half: '2',
  quarter: '4',
  eighth: '8',
  '16th': '16',
  '32nd': '32',
  '64th': '64',
};

const MEI_ACCID: Record<Accidental, string> = {
  natural: 'n',
  sharp: 's',
  flat: 'f',
  'double-sharp': 'x',
  'double-flat': 'ff',
  koron: 'koron',
  sori: 'sori',
};

const CLEF_ATTRS: Record<Clef, string> = {
  treble: 'clef.shape="G" clef.line="2"',
  'treble-8vb': 'clef.shape="G" clef.line="2" clef.dis="8" clef.dis.place="below"',
  bass: 'clef.shape="F" clef.line="4"',
  alto: 'clef.shape="C" clef.line="3"',
  tenor: 'clef.shape="C" clef.line="4"',
};

const TREMOLO_UNIT: Record<1 | 2 | 3, string> = { 1: '8', 2: '16', 3: '32' };

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function keySigXml(key: KeySignature): string {
  if (key.accidentals.length === 0) return '<keySig sig="0"/>';
  const accids = key.accidentals
    .map((k) => `<keyAccid pname="${k.step.toLowerCase()}" accid="${MEI_ACCID[k.accidental]}"/>`)
    .join('');
  return `<keySig>${accids}</keySig>`;
}

function meterSigXml(t: TimeSignature): string {
  return `<meterSig count="${t.beats}" unit="${t.beatType}"/>`;
}

function staffDefXml(clef: Clef, key: KeySignature | undefined, time: TimeSignature | undefined): string {
  return (
    `<staffDef n="1" lines="5" ${CLEF_ATTRS[clef]}>` +
    (key ? keySigXml(key) : '') +
    (time ? meterSigXml(time) : '') +
    `</staffDef>`
  );
}

function durAttrs(e: ScoreEvent): string {
  const dots = e.duration.dots ? ` dots="${e.duration.dots}"` : '';
  return `dur="${MEI_DUR[e.duration.base]}"${dots}`;
}

function noteAttrs(p: Pitch, tie: string | undefined): string {
  let a = `pname="${p.step.toLowerCase()}" oct="${p.octave}"`;
  if (p.accidental) a += ` accid="${MEI_ACCID[p.accidental]}"`;
  if (tie) a += ` tie="${tie}"`;
  return a;
}

function tieValue(into: boolean, out: boolean): string | undefined {
  if (into && out) return 'm';
  if (out) return 'i';
  if (into) return 't';
  return undefined;
}

/** One event as MEI, with ties resolved against the keys tied in from the previous event. */
function eventXml(e: ScoreEvent, tiedIn: Set<string>): string {
  const pitches = e.pitches ?? [];
  const grace = e.grace ? ' grace="unacc"' : '';
  const out = !!e.tie && !e.grace;
  let body: string;
  if (pitches.length === 0) {
    body = `<rest xml:id="${escapeXml(e.id)}" ${durAttrs(e)}/>`;
  } else if (pitches.length === 1) {
    const p = pitches[0]!;
    const tie = tieValue(tiedIn.has(pitchKey(p)) && !e.grace, out);
    body = `<note xml:id="${escapeXml(e.id)}" ${durAttrs(e)}${grace} ${noteAttrs(p, tie)}/>`;
  } else {
    const notes = pitches
      .map((p, i) => {
        const tie = tieValue(tiedIn.has(pitchKey(p)) && !e.grace, out);
        return `<note xml:id="${escapeXml(e.id)}-n${i}" ${noteAttrs(p, tie)}/>`;
      })
      .join('');
    body = `<chord xml:id="${escapeXml(e.id)}" ${durAttrs(e)}${grace}>${notes}</chord>`;
  }
  if (e.tremolo && pitches.length > 0) {
    body = `<bTrem unitdur="${TREMOLO_UNIT[e.tremolo]}">${body}</bTrem>`;
  }
  return body;
}

/**
 * Group consecutive events carrying the same tuplet ratio into <tuplet> elements. A group closes once
 * its written length equals `actual` times its shortest written value (three eighths, or quarter + eighth
 * for a triplet), so two triplets in a row get two brackets rather than one of six.
 */
function layerXml(m: Measure, tiedIn: Set<string>): { xml: string; tiedOut: Set<string> } {
  let xml = '';
  let group: string[] = [];
  let groupRatio: string | undefined;
  let groupWritten = 0;
  let groupMin = Infinity;
  let tied = tiedIn;

  const flush = () => {
    if (group.length === 0) return;
    const [num, numbase] = groupRatio!.split(':');
    xml += `<tuplet num="${num}" numbase="${numbase}">${group.join('')}</tuplet>`;
    group = [];
    groupRatio = undefined;
    groupWritten = 0;
    groupMin = Infinity;
  };

  for (const e of m.events) {
    const x = eventXml(e, tied);
    if (!e.grace) {
      tied = new Set(e.tie ? (e.pitches ?? []).map(pitchKey) : []);
    }
    const tuplet = e.duration.tuplet;
    const ratio = tuplet ? `${tuplet.actual}:${tuplet.normal}` : undefined;
    if (e.grace) {
      // A grace note belongs with whatever follows it, so it joins the open group if there is one.
      if (groupRatio) group.push(x);
      else xml += x;
      continue;
    }
    if (ratio !== groupRatio) flush();
    if (!ratio) {
      xml += x;
      continue;
    }
    groupRatio = ratio;
    group.push(x);
    const w = writtenQ(e.duration);
    groupWritten += w;
    groupMin = Math.min(groupMin, w);
    if (Math.abs(groupWritten - tuplet!.actual * groupMin) < 1e-9) flush();
  }
  flush();
  return { xml, tiedOut: tied };
}

export interface MeiOptions {
  /** Include the title and composer in the MEI header so Verovio draws them. Default true. */
  header?: boolean;
}

/** Generate an MEI document from the score. Every event's id becomes its xml:id. */
export function scoreToMei(score: Score, opts: MeiOptions = {}): string {
  const header = opts.header ?? true;
  const first = score.measures[0];
  const clef0: Clef = first?.clef ?? 'treble';
  let clef = clef0;
  let tiedIn = new Set<string>();

  let section = '';
  score.measures.forEach((m, i) => {
    if (i > 0 && (m.clef || m.key || m.time)) {
      const newClef = m.clef ?? clef;
      section += `<scoreDef><staffGrp>${staffDefXml(newClef, m.key, m.time)}</staffGrp></scoreDef>`;
    }
    if (m.clef) clef = m.clef;
    const { xml, tiedOut } = layerXml(m, tiedIn);
    tiedIn = tiedOut;
    const dirs = m.events
      .filter((e) => e.text)
      .map((e) => `<dir staff="1" place="above" startid="#${escapeXml(e.id)}">${escapeXml(e.text!)}</dir>`)
      .join('');
    const metcon = m.unmetered ? ' metcon="false"' : '';
    section +=
      `<measure xml:id="${escapeXml(m.id)}" n="${i + 1}"${metcon}>` +
      `<staff n="1"><layer n="1">${xml}</layer></staff>${dirs}</measure>`;
  });

  const title = header
    ? `<title>${escapeXml(score.meta.title)}</title>` +
      (score.meta.composer ? `<composer>${escapeXml(score.meta.composer)}</composer>` : '')
    : '<title/>';

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">` +
    `<meiHead><fileDesc><titleStmt>${title}</titleStmt><pubStmt/></fileDesc></meiHead>` +
    `<music><body><mdiv><score>` +
    `<scoreDef midi.bpm="${score.tempo.bpm}"><staffGrp>` +
    staffDefXml(clef0, first?.key, first?.time) +
    `</staffGrp></scoreDef>` +
    `<section>${section}</section>` +
    `</score></mdiv></body></music></mei>`
  );
}

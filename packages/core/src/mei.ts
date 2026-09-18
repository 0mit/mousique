import { durationQ, writtenQ } from './duration.ts';
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

const BEAMABLE = new Set<BaseDuration>(['eighth', '16th', '32nd', '64th']);

/** Beam groups follow the beat: a quarter in x/4 and x/2, a dotted quarter in compound x/8, else a quarter. */
function beamSpanQ(time: TimeSignature | undefined): number {
  if (!time) return 1;
  if (time.beatType === 8 && time.beats % 3 === 0 && time.beats > 3) return 1.5;
  if (time.beatType === 2) return 1;
  return Math.max(1, 4 / time.beatType);
}

/**
 * The layer's content. Consecutive events with the same tuplet ratio become a <tuplet> (closing once its
 * written length is `actual` times its shortest value, so two triplets in a row get two brackets), and
 * notes shorter than a quarter are beamed together within each beat, as printed music does.
 */
function layerXml(m: Measure, tiedIn: Set<string>, time: TimeSignature | undefined): { xml: string; tiedOut: Set<string> } {
  const span = beamSpanQ(time);
  let xml = '';
  let tied = tiedIn;
  let pos = 0;

  // The open tuplet group.
  let group: Array<{ x: string; beamable: boolean }> = [];
  let groupRatio: string | undefined;
  let groupWritten = 0;
  let groupMin = Infinity;

  // The open beam run (outside tuplets).
  let run: string[] = [];
  let runBeat = -1;

  const flushRun = () => {
    xml += run.length >= 2 ? `<beam>${run.join('')}</beam>` : run.join('');
    run = [];
    runBeat = -1;
  };
  const flushGroup = () => {
    if (group.length === 0) return;
    const [num, numbase] = groupRatio!.split(':');
    const inner = group.map((g) => g.x).join('');
    const beam = group.filter((g) => g.beamable).length >= 2 && group.every((g) => g.beamable);
    xml += `<tuplet num="${num}" numbase="${numbase}">${beam ? `<beam>${inner}</beam>` : inner}</tuplet>`;
    group = [];
    groupRatio = undefined;
    groupWritten = 0;
    groupMin = Infinity;
  };

  for (const e of m.events) {
    const x = eventXml(e, tied);
    if (e.grace) {
      // A grace note joins an open tuplet; otherwise it stands alone before its principal.
      if (groupRatio) group.push({ x, beamable: true });
      else {
        flushRun();
        xml += x;
      }
      continue;
    }
    tied = new Set(e.tie ? (e.pitches ?? []).map(pitchKey) : []);
    const dq = durationQ(e.duration);
    const tuplet = e.duration.tuplet;
    const ratio = tuplet ? `${tuplet.actual}:${tuplet.normal}` : undefined;
    const beamable = BEAMABLE.has(e.duration.base) && !!e.pitches?.length;

    if (ratio !== groupRatio) flushGroup();
    if (ratio) {
      flushRun();
      groupRatio = ratio;
      group.push({ x, beamable });
      const w = writtenQ(e.duration);
      groupWritten += w;
      groupMin = Math.min(groupMin, w);
      if (Math.abs(groupWritten - tuplet!.actual * groupMin) < 1e-9) flushGroup();
      pos += dq;
      continue;
    }

    const beat = Math.floor(pos / span + 1e-9);
    const fitsBeat = pos + dq <= (beat + 1) * span + 1e-9;
    if (!beamable || !fitsBeat || beat !== runBeat) flushRun();
    if (beamable && fitsBeat) {
      run.push(x);
      runBeat = beat;
    } else {
      xml += x;
    }
    pos += dq;
  }
  flushRun();
  flushGroup();
  return { xml, tiedOut: tied };
}

/** Text above a note; each line is its own direction, so a gusheh name and a mark can stack. */
function textAbove(e: ScoreEvent): string {
  if (!e.text) return '';
  return e.text
    .split('\n')
    .filter((l) => l.trim())
    .reverse() // Verovio stacks later directions further from the staff; the first line should be on top.
    .map((l) => `<dir staff="1" place="above" startid="#${escapeXml(e.id)}">${escapeXml(l.trim())}</dir>`)
    .join('');
}

/** Text below: digits are fingering (<fing>); anything else, such as "rit.", is a direction. */
function textBelow(e: ScoreEvent): string {
  if (!e.below) return '';
  const t = escapeXml(e.below);
  return /^[\d۰-۹٠-٩\s,.-]+$/.test(e.below) && !/^[.\s]+$/.test(e.below)
    ? `<fing staff="1" place="below" startid="#${escapeXml(e.id)}">${t}</fing>`
    : `<dir staff="1" place="below" startid="#${escapeXml(e.id)}">${t}</dir>`;
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
  let time: TimeSignature | undefined;
  let tiedIn = new Set<string>();

  const ids = new Set(score.measures.flatMap((m) => m.events.map((e) => e.id)));
  let section = '';
  let openEnding: number | undefined;
  score.measures.forEach((m, i) => {
    if (m.ending !== openEnding) {
      if (openEnding !== undefined) section += '</ending>';
      if (m.ending !== undefined) section += `<ending n="${m.ending}" label="${m.ending}.">`;
      openEnding = m.ending;
    }
    if (i > 0 && (m.clef || m.key || m.time)) {
      const newClef = m.clef ?? clef;
      section += `<scoreDef><staffGrp>${staffDefXml(newClef, m.key, m.time)}</staffGrp></scoreDef>`;
    }
    if (m.clef) clef = m.clef;
    if (m.time) time = m.time;
    const { xml, tiedOut } = layerXml(m, tiedIn, time);
    tiedIn = tiedOut;
    // An empty measure still needs something to draw and to click on.
    const content = xml || `<mRest xml:id="${escapeXml(m.id)}-empty"/>`;
    const dirs = m.events
      .map(
        (e) =>
          textAbove(e) + textBelow(e) +
          (e.slurTo && ids.has(e.slurTo)
            ? `<slur startid="#${escapeXml(e.id)}" endid="#${escapeXml(e.slurTo)}"/>`
            : ''),
      )
      .join('');
    const metcon = m.unmetered ? ' metcon="false"' : '';
    const left = m.repeatStart ? ' left="rptstart"' : '';
    const right = m.repeatEnd ? ' right="rptend"' : i === score.measures.length - 1 ? ' right="end"' : '';
    section +=
      `<measure xml:id="${escapeXml(m.id)}" n="${i + 1}"${metcon}${left}${right}>` +
      `<staff n="1"><layer n="1">${content}</layer></staff>${dirs}</measure>`;
  });
  if (openEnding !== undefined) section += '</ending>';

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

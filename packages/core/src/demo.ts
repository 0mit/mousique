import { DEFAULT_TUNING, type Score } from './model.ts';

/**
 * A short practice phrase in Shur on G, written for testing rather than taken from the repertoire.
 * It exercises a mixed key signature (B flat, E flat, A koron), a written sori, a tie across a
 * barline, a grace note, a triplet, a riz (tremolo), a rest and a closing free-rhythm measure.
 */
export const demoScore: Score = {
  format: 'mousique-score',
  version: 1,
  meta: { title: 'تمرینِ شور — practice phrase', composer: 'mousique', dastgah: 'shur' },
  tempo: { bpm: 72 },
  tuning: { ...DEFAULT_TUNING },
  measures: [
    {
      id: 'm1',
      clef: 'treble',
      key: {
        accidentals: [
          { step: 'B', accidental: 'flat' },
          { step: 'E', accidental: 'flat' },
          { step: 'A', accidental: 'koron' },
        ],
      },
      time: { beats: 2, beatType: 4 },
      events: [
        { id: 'e1', duration: { base: 'eighth' }, pitches: [{ step: 'G', octave: 4 }] },
        { id: 'e2', duration: { base: 'eighth' }, pitches: [{ step: 'A', octave: 4 }] },
        { id: 'e3', duration: { base: 'eighth' }, pitches: [{ step: 'B', octave: 4 }] },
        { id: 'e4', duration: { base: 'eighth' }, pitches: [{ step: 'C', octave: 5 }] },
      ],
    },
    {
      id: 'm2',
      events: [
        { id: 'e5', duration: { base: 'quarter' }, pitches: [{ step: 'B', octave: 4 }], tie: true },
        { id: 'e6', duration: { base: 'eighth' }, pitches: [{ step: 'B', octave: 4 }] },
        { id: 'e7', duration: { base: 'eighth' }, pitches: [{ step: 'A', octave: 4 }] },
      ],
    },
    {
      id: 'm3',
      events: [
        { id: 'e8', duration: { base: 'eighth', tuplet: { actual: 3, normal: 2 } }, pitches: [{ step: 'C', octave: 5 }] },
        { id: 'e9', duration: { base: 'eighth', tuplet: { actual: 3, normal: 2 } }, pitches: [{ step: 'B', octave: 4 }] },
        { id: 'e10', duration: { base: 'eighth', tuplet: { actual: 3, normal: 2 } }, pitches: [{ step: 'A', octave: 4 }] },
        { id: 'e11', duration: { base: 'quarter' }, pitches: [{ step: 'G', octave: 4 }], tremolo: 3 },
      ],
    },
    {
      id: 'm4',
      events: [
        { id: 'e12g', duration: { base: 'eighth' }, pitches: [{ step: 'B', octave: 4 }], grace: true },
        { id: 'e12', duration: { base: 'quarter' }, pitches: [{ step: 'A', octave: 4 }] },
        { id: 'e13', duration: { base: 'eighth' }, pitches: [{ step: 'G', octave: 4 }] },
        { id: 'e14', duration: { base: 'eighth' }, pitches: [{ step: 'F', octave: 4 }] },
      ],
    },
    {
      id: 'm5',
      events: [
        { id: 'e15', duration: { base: 'eighth' } },
        { id: 'e16', duration: { base: 'eighth' }, pitches: [{ step: 'C', octave: 5, accidental: 'sori' }] },
        { id: 'e17', duration: { base: 'eighth' }, pitches: [{ step: 'B', octave: 4 }] },
        { id: 'e18', duration: { base: 'eighth' }, pitches: [{ step: 'A', octave: 4 }] },
      ],
    },
    {
      id: 'm6',
      unmetered: true,
      events: [
        { id: 'e19', duration: { base: '16th' }, pitches: [{ step: 'G', octave: 4 }], text: 'آزاد' },
        { id: 'e20', duration: { base: '16th' }, pitches: [{ step: 'A', octave: 4 }] },
        { id: 'e21', duration: { base: '16th' }, pitches: [{ step: 'B', octave: 4 }] },
        { id: 'e22', duration: { base: '16th' }, pitches: [{ step: 'A', octave: 4 }] },
        { id: 'e23', duration: { base: 'half' }, pitches: [{ step: 'G', octave: 4 }] },
      ],
    },
  ],
};

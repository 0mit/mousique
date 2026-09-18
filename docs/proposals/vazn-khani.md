# Proposal: rhythm words over the notes (وزن‌خوانی واژگانی, Arshad Tahmasbi)

Status: **proposed**, 2026-09-18. Nothing here is built yet.

## What the method is

Arshad Tahmasbi's *وزن‌خوانی واژگانی* (Mahoor; 126 pages, 6th printing) teaches reading rhythm by reading
Persian words. Every syllable has a length from Persian prosody, and a figure is read by saying the word
whose syllables have those lengths. Anyone who speaks Persian already says these lengths correctly, so the
reader only has to learn which word goes with which figure.

The operator supplied the method's flash cards and a teacher's handwritten page (kept locally, not in this
repository). They settle the basic table: with the quarter as the beat and the sixteenth as the unit, there
are exactly eight ways to fill a beat with sixteenths, eighths, dotted eighths and quarters, and the method
has one word for each.

| figure (one beat) | word | syllables → units (1 = sixteenth) |
|---|---|---|
| ♩ | راست | راست 4 |
| ♪. 𝅘𝅥𝅯 | راستُ | راس 3 · تُ 1 |
| 𝅘𝅥𝅯 ♪. | رُباب | رُ 1 · باب 3 |
| ♪ ♪ | می‌زد | می 2 · زد 2 |
| ♪ 𝅘𝅥𝅯 𝅘𝅥𝅯 | می‌زدُ | می 2 · زَ 1 · دُ 1 |
| 𝅘𝅥𝅯 𝅘𝅥𝅯 ♪ | بَزَدم | بَ 1 · زَ 1 · دَم 2 |
| 𝅘𝅥𝅯 𝅘𝅥𝅯 𝅘𝅥𝅯 𝅘𝅥𝅯 | بَزَدَمُ | بَ 1 · زَ 1 · دَ 1 · مُ 1 |
| 𝅘𝅥𝅯 ♪ 𝅘𝅥𝅯 | رُبابُ | رُ 1 · با 2 · بُ 1 |

The syllable lengths are Persian prosody itself: a short syllable (CV: رُ، بَ، زَ، تُ) is one unit, a long one
(CV̄ or CVC: می، با، زد، دَم) two, an extended one (CV̄C: راس، باب) three, and راست four. The four base
words (راست، رباب، می‌زد، بزدم) each gain a final ـُ to make the next figure, which is why the method
needs so few words.

The handwritten page adds two things:

- **Plectrum strokes** (mezrab): ∧ (down) and ∨ (up) above the notes. They follow the position in the
  beat, not the word: a note starting on an eighth-note position is ∧, one on an off-beat sixteenth is ∨
  (four sixteenths: ∧∨∧∨; ♪ 𝅘𝅥𝅯 𝅘𝅥𝅯: ∧ ∧∨; 𝅘𝅥𝅯 𝅘𝅥𝅯 ♪: ∧∨∧). The ۷-shaped marks on the Abu'ata test sheet are
  the same strokes, so the app can show them from the same analysis.
- **The dot**: «نقطه: زمان مورد نظر + نصف خودش» — a dot adds half the value: ♩. = ♩ + ♪, ♪. = ♪ + 𝅘𝅥𝅯.

Public sources name three more base words — نی، تار، زدم (2, 3 and 1 + 2 units) — that the supplied pages do
not use. They fit figures that fill part of a beat (after a rest or a tie, or in eighth-note meters), which
is a guess to check.

## Proposed implementation

1. **A pure function in `packages/core`**, `rhythmWords(timeline, dictionary, unit)`: split every metered
   measure into beats, express each note in the beat as a whole number of units, and look the pattern up
   in the dictionary (for example `1-1-2` → بزدم). Each note gets its syllable.
   - Rests: shown in brackets and dimmed, spoken silently.
   - Ties: the continuation gets a lengthening mark (ـــ) instead of a new syllable.
   - Grace notes: none.
   - Tuplets and free-rhythm bars: no words, rather than wrong ones.
   - A pattern with no word in the dictionary (a triplet, a thirty-second, a beat starting with a rest)
     falls back to syllables by weight (رُ / را / راس / راست), shown in a lighter style, so the reader can
     still read it and knows it is not one of the method's words.
   - Mezrab: ∧ or ∨ from the note's position in the beat, as a separate switch.
2. **The dictionary is data, not code.** It ships with the eight words above. A teacher can add the
   book's variants in the app, and the dictionary is saved with the app, exported with a project, and
   can be shared. This keeps the book's own tables out of the public repository unless the teacher
   chooses to publish them.
3. **Display over the notes.** Each note's syllable goes into the MEI as a `<verse>` placed above the
   staff, so Verovio lays it out and spaces the notes for it, and Persian shapes correctly. A toolbar
   switch shows or hides the words. During playback the syllable lights up with its note, because it is
   drawn inside the note's own SVG group.
4. **Options:** the unit (sixteenth by default; eighth for slow pieces, thirty-second for dense ones)
   and the beat grouping for compound meters.
5. **Tests:** every word in the dictionary round-trips (word → units → pattern → word); fallback
   coverage for every figure the editor can make; and the demo phrase and the test sheets get words
   where the method gives them and fallbacks where it does not.

## Open questions for the operator

1. How are rests and ties read — silently, with the word of the whole figure, or another way?
2. Beats longer than one word: a half note in 2/4 (راست + a lengthening mark, or something else)?
3. Eighth-note meters (6/8, 7/8, and the aksak rhythms of the repertoire): is the beat still split into
   sixteenths with these words, or do نی، تار، زدم come in?
4. Where should the words go when fingering or mezrab marks are already above the staff: above them,
   or below the staff like lyrics?

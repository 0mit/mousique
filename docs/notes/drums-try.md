# Trying a drum page with the current model (2026-09-18)

The operator asked to try a drum page — seven two-voice sixteenth-note exercises for cymbal, snare and bass
drum on a three-line percussion staff — with the model as it is, before designing instrument layers. The
page (a published method) stays local like the other test material.

## How it was entered

One voice per staff is all the model has, so each moment something is struck became one chord lasting to
the next hit (the *composite rhythm* — also what the printed count "1 e + a 2 e + a" follows). Cymbal,
snare and bass drum became three pitches (G5, C5, F4). Accents became a ">" text mark above the note.

## What worked

- Every exercise's rhythm is exact, and the result validates, renders and plays.
- Repeat barlines and one-bar repeat signs (𝄎) carried over as they are.
- **Rhythm words:** all 128 written beats got a word, because a drum part's composite rhythm on a
  sixteenth grid is always one of the eight quarter-beat figures. Exercise 3 prints "1 e + a" under the
  notes; the words fill the same role (بِـ زَ دَ مُ for four sixteenths).

## What the model could not express (the drum layer's to-do list)

1. **Separate voices.** Cymbal eighths (stems up) and snare/bass drum (stems down) were merged into
   chords; the drummer's two independent lines are lost, and the rhythm words read the merged line.
   Exercise 7's lower voice alone is 𝅘𝅥𝅯 ♪ 𝅘𝅥𝅯 (رُبابُ), but merged with the cymbal it becomes four
   sixteenths (بِـ زَ دَ مُ). Which one a student should say is a teaching decision.
2. **Percussion staff and clef**: three lines (or five) with a neutral clef, not a treble clef.
3. **Noteheads**: × for cymbals; normal for drums.
4. **Instrument, not pitch**: a note should name its instrument (Cym, SD, BD), with a staff position
   and a notehead per instrument; playback should use a drum sound, not a pitched pluck.
5. **Accents** as articulation on the accented note (>), not text above the whole chord.
6. **Rests per voice** (a snare rest while the bass drum plays).
7. **A pickup mid-score** (exercise 2 starts with a sixteenth): held in a free-rhythm bar as a workaround.
8. **Multi-bar repeat sign** (exercise 5 ends with a two-bar repeat): written out as two bars instead.
9. **Instrument labels** at the start of the staff (Cym / SD / BD).

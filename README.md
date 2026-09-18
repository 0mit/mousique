# mousique

Practise an instrument from sheet music that follows a master's recording — made first for Persian
classical music, so **koron** and **sori** are part of the notation and sound at their real pitch.

- Write a score with the keyboard or the on-screen palette, import one *(planned)*, or photograph one and
  correct an AI draft *(planned)*.
- Hear it played with the current note animated, at any tempo and practice speed.
- Attach a recording, map the score to it, and practise against it slowed down, looped, with the
  master's actual tempo shown *(planned)*.

Self-hosted and local-first. The design is in [`HANDOVER.md`](HANDOVER.md); where the build departs from
it, [`DECISIONS.md`](DECISIONS.md) says so and why. Milestone notes are in [`docs/notes`](docs/notes).

## Status

| Milestone | State |
|---|---|
| M0 spikes | Verovio, synth and a first transcription test on printed pages held |
| M1 model, rendering, playback with cursor | working |
| M2 editor | working: keyboard and palette entry, repeats and endings, slurs, finger lines, bar-repeat signs, fingering, autosave |
| Rhythm words (وزن‌خوانی واژگانی) | working for quarter-note beats, rests included ([design](docs/proposals/vazn-khani.md)) |
| Note names for beginners | working: Persian solfège, Do Re Mi, letters |
| M3 media overlay and manual sync | next; the sync-map maths is done and tested |
| M4 automatic alignment · M5 AI transcription · M6 interchange | not started |

## What it does today

- **Write and change notes** from the keyboard (MuseScore-style keys; K and S for koron and sori) or the
  on-screen palette. The Keyboard panel in the app lists every key.
- **Notation** for the repertoire it was tested on: mixed key signatures (B♭ E♭ A-koron), koron and sori,
  ties, slurs, grace notes, triplets, riz, repeats with first and second endings, bar-repeat signs,
  finger lines, fingering below the staff, marks and gusheh names above it.
- **Playback** at exact quarter-tone pitches, with the cursor on the sounding note (through repeats and
  bar-repeat signs too), tempo, practice speed, metronome and count-in, and a tuning block per score.
- **Reading aids**, each optional: Tahmasbi's rhythm words above the notes, and note names below them.
- **Autosave** in the browser; scores open from and save to JSON files.

## Run it

Needs Node 22 or newer.

```sh
npm install
npm run dev     # the app, at http://localhost:5173
npm test        # packages/core, including checks against the real Verovio build
npm run typecheck
```

## Layout

```
packages/core   framework-free TypeScript: score model, validation, timeline, tuning,
                MEI writer, playback notes, sync-map maths. Unit tested.
apps/web        Vite + React: Verovio rendering, Web Audio synth, cursor and transport.
spikes/         the M0 experiments, kept as evidence.
```

## A score file

A score is a small JSON document (`"format": "mousique-score"`). Key signatures are an explicit list,
so a dastgah signature can mix flats and korons; the tuning block sets the reference pitch, a global
offset and the size of koron and sori in cents. See `packages/core/src/model.ts` and the demo phrase in
`packages/core/src/demo.ts`.

## Licence

[AGPL-3.0](LICENSE). Verovio, which renders the notation, is LGPL-3.0.

# Decisions

Dated deviations from, and findings against, `HANDOVER.md`. Newest last. Each line says what changed and why.

## 2026-09-18

- **npm workspaces, not pnpm.** pnpm is not installed on the dev machine and the handover allows either; `npm install` at the root sets up `packages/core` and `apps/web`.
- **Verovio's timemap shape, checked.** Entries are `{ qstamp, tstamp, on, off, restsOn, restsOff, measureOn, tempo }`: `qstamp` is quarter notes (our `q`), `tstamp` milliseconds. Rests are listed under `restsOn`/`restsOff`, not `on`.
- **The app computes its own timeline; Verovio's timemap is a cross-check, not the source.** `buildTimeline` in `packages/core` lays out `q` for every event, and `test/verovio.test.ts` renders the generated MEI with the real Verovio build and asserts that every onset agrees. The cursor and the synth read our timeline; Verovio supplies positions on the page. This keeps timing in tested, framework-free code and means a Verovio upgrade that changes the timemap fails a test instead of the cursor.
- **Two timemap behaviours the app does not copy.** A tied continuation is its own onset in the timemap (we merge ties for playback, and keep the continuation as a cursor step). A note after an unaccented grace note is delayed about 0.03 q by Verovio; our timeline keeps the principal on its beat.
- **MEI for Persian accidentals, checked.** `accid="koron"` / `accid="sori"` on notes, and `<keySig>` with `<keyAccid pname accid>` children for mixed signatures such as B flat, E flat, A koron, render with the SMuFL glyphs U+E460 (koron) and U+E461 (sori).
- **Verovio's MIDI ignores koron:** A koron comes back as MIDI 69, confirming that playback must be ours.
- **Titles are drawn in HTML, not by Verovio.** Verovio does shape Persian text correctly (checked in Chromium), but its page header places the composer awkwardly on wide pages; the app renders with `header: none` and shows the title in the page with `dir="auto"`.
- **Onsets snap to a 1/13440-quarter grid.** Triplet thirds do not add up exactly in floating point, so bar lines drifted to 5.9999999. Every duration the model can express is a multiple of 1/13440 of a quarter (64th x 3 x 5 x 7).
- **A short first measure is a pickup**, not a validation error; its metronome beats are aligned to the bar's end.
- **Grace notes sound before the beat** (75 ms each, nearest first); the cursor stays on the principal.
- **No repeats in the v1 model**, so the timeline's order is already the unfolded order the handover asks `q` to be measured in. Adding repeats means adding an unfold step in `buildTimeline`, and nothing downstream changes.

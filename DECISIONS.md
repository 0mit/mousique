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
- **Licence: AGPL-3.0** (the operator's decision). It lifts the handover's interim rule against bundling GPL code: GPL-3.0 (and GPL-2.0-or-later) code may be combined with AGPL-3.0 code, so Rubber Band is an option if the browser's time-stretching proves too poor at low speeds.
- **Test material stays out of the repository.** The operator's test sheets are photographs of published editions (a Ma'rufi radif page and a Shahnazi piece), so `test_sheets/` and `fixtures/private/` are git-ignored. Tests that need them skip when they are absent.
- **Repeats and first/second endings are in the model** (`repeatStart`, `repeatEnd`, `ending` on a measure), because the operator's Mahur test sheet needs them. `buildTimeline` unfolds them, so `q` is measured with repeats unfolded, as the handover asks; an event played twice has two occurrences, and a click on it goes to the one nearest the cursor.
- **Beams are written into the MEI by beat.** Verovio beams only what the MEI groups, and unbeamed eighths and sixteenths are hard to read. Notes shorter than a quarter are beamed within each beat (a dotted quarter in compound meters), and inside a tuplet the whole group is beamed.
- **Editing keys follow MuseScore where the browser allows**: 1–7 durations, A–G letters, `.` dot, `0`/`R` rest, arrows, Ctrl+Z. Two differ: the triplet is Alt+3, since browsers keep Ctrl+3 for switching tabs; koron and sori are K and S. Letters are read from the physical key (`KeyboardEvent.code`), so a Persian keyboard layout types the same notes.
- **Write mode is explicit (N)**, as MuseScore's note input mode: letters add notes after the selection. Outside it, a letter changes the selected note. An empty bar always takes new notes. When the selected note ends a full bar, the next note starts the next bar, which is created if needed, so a melody can be typed from paper without thinking about bar lines.
- **Every edit is a pure function in `packages/core/src/edit.ts`**, tested without a browser; undo keeps whole scores, which at this size costs nothing and cannot drift from the edits.

# Handover: web app for practising from sheet music synced to a master's recording (with koron and sori)

You are picking this up from a planning conversation. Nothing has been built yet. This document gives you the goal, the decisions already made and why, what is verified versus assumed, and a milestone plan. Where something is marked as an assumption, check it before building on it. Where a decision here turns out to be wrong once you touch the real libraries, say so and propose the change rather than working around it silently.

## 1. What we are building and for whom

A self-hosted, free and open source web app for instrument practice, aimed first at Persian classical music. A player should be able to:

1. Get a score into the app, either by entering notes by hand, by importing MusicXML, or by photographing a written sheet and letting a vision-capable AI model (the user supplies their own API key) produce a draft transcription that they then correct.
2. Play the score back simply, with the current note visibly animated in time.
3. Attach a real audio or video recording of a master playing that piece, and map score positions to media time with key points, placed by hand, by an automatic aligner, or both.
4. Practise against the recording: the cursor follows the master's actual timing (including rubato), the recording can be slowed down without changing pitch, passages can be looped, and the app shows the tempo the master is actually playing at.

The score must support the Persian accidentals **koron** (lowers a note by roughly a quarter tone) and **sori** (raises by roughly a quarter tone), both on individual notes and inside key signatures, and playback must sound them at the right pitch. This requirement drives most of the architecture below.

### Assumptions to confirm with the user (edit these lines if wrong)

- Scores are single-staff: one melodic line, with occasional chords or double stops and grace notes. Multi-staff and multi-part scores are out of scope for v1.
- "Written sheet" includes handwritten pages, not only printed ones.
- Single user, local-first. No accounts, no multi-user server.
- Dev machine is Linux (Slackware, so do not assume apt, systemd or Docker). Plain `python -m venv` plus pnpm/npm scripts should be enough to run everything.
- Project licence is undecided. Until it is, keep frontend dependencies to MIT/BSD/ISC/MPL/LGPL and avoid bundling GPL or AGPL code.

## 2. Decisions already made, with reasons

**Do not build on alphaTab or OpenVoicing.** An earlier survey found alphaTab (MPL-2.0) has an excellent sync-point system for following external audio, and OpenVoicing (MIT, early stage) wraps it into nearly this app. Both are out because alphaTab's model has no koron or sori as far as we know, and microtonal accidentals are core here. Their design is still worth copying: sync points that anchor score positions to media time, a waveform editor for dragging them, and the media element acting as the master clock.

**Render with Verovio.** Verovio (LGPL-3.0, WASM build for browsers) explicitly lists support for Persian accidentals (sori and koron) in its changelog, is actively maintained (6.3 at time of writing), renders MEI to SVG where every note keeps its `xml:id`, and produces a timemap that tells you which note ids turn on and off at which time. That combination gives us rendering, click-to-select and cursor animation from one library. Its editor API is labelled experimental, so we do not depend on it.

**Own the score model.** The source of truth is our own small JSON document, not MEI or MusicXML. Reasons: the editor needs a simple structure to mutate, the AI transcription needs a compact schema it can emit reliably, and playback needs exact pitch in cents. MEI is generated from the model for rendering. MusicXML is an import/export format only.

**Do our own playback.** Verovio's MIDI output cannot express quarter tones cleanly, so playback is a small Web Audio scheduler driven by our model, with per-note detune in cents.

**The recording is the clock when one is attached.** Cursor position is computed from `media.currentTime` through the sync map. Without media, the AudioContext clock drives everything.

**Slow-down in v1 uses the browser.** `HTMLMediaElement.playbackRate` with `preservesPitch = true` handles audio and video with no extra code. A higher quality stretcher (Signalsmith Stretch, MIT, or Rubber Band WASM, GPL) can replace it later for audio if quality at low speeds is not good enough.

**Automatic alignment runs in a small Python backend.** The mature tooling (librosa, ISC; Sync Toolbox, MIT, which ships a worked audio-to-score example) is Python. The backend also proxies the AI transcription call so the API key is not baked into frontend code. The frontend must remain fully usable without the backend, minus those two features.

## 3. What is verified and what is not

Verified by reading project pages during planning:

- Verovio changelog: "Support for persian accidentals (sori and koron)". Verovio 6.3 also added Turkish accidentals and updated the experimental editor API.
- alphaTab 1.6 sync-point design and its Media Sync Editor (reference for our design only).
- Sync Toolbox provides DTW-based synchronisation with an audio-to-score notebook.

Believed but not checked, so verify before relying on them:

- MusicXML's accidental values include `koron` and `sori`, and MuseScore exports them that way. Get a fixture file exported from MuseScore containing both and look at what it actually writes, including the `<alter>` values.
- MEI (as Verovio accepts it) encodes them as `accid="koron"` / `accid="sori"`, and custom key signatures mixing flats and korons can be written with `keySig` containing `keyAccid` children.
- The Verovio timemap shape (entries with a millisecond timestamp, a quarter-note timestamp, and `on`/`off` id lists). Check the Verovio reference book.
- Verovio renders Persian (right-to-left) text correctly in titles and lyrics. If not, render titles in HTML outside the SVG.
- `preservesPitch` behaves acceptably in current Firefox and Chromium down to 0.5x.
- Vision models can transcribe notation well enough to save time. This is the least certain item in the whole plan. See the spike in M0.

## 4. Architecture

### 4.1 Layout

```
packages/core        framework-free TypeScript: score model, validation, MEI writer,
                     MusicXML subset reader/writer, sync map maths, tuning. Unit tested.
apps/web             Vite + TypeScript + React UI: renderer host, editor, player,
                     media overlay, sync editor, OMR review screen.
services/api         Python FastAPI: /align and /omr. Optional at runtime.
fixtures/            real material from the user: score photos, MusicXML exports,
                     one recording with a hand-made ground-truth sync map.
DECISIONS.md         append a dated line whenever you deviate from this document.
```

React is a default, not a requirement. Everything that matters lives in `packages/core` so the UI layer stays replaceable.

### 4.2 Score model

Keep it small. A score has metadata, a tuning block, and an ordered list of measures. A measure has optional clef, key signature and time signature changes, an `unmetered` flag, and a list of events. An event has a stable `id` (used as the `xml:id` in MEI so Verovio ids map straight back to the model), a duration (base value, dots, optional tuplet ratio), and is either a rest or one or more pitches. A pitch is step, octave and an accidental from: none, natural, sharp, flat, koron, sori, plus double sharp/flat. Also per event: tie, grace flag, tremolo marks, an optional text annotation.

Key signatures are an explicit list of (step, accidental) pairs rather than a count of sharps or flats, because dastgah signatures mix flats and korons.

Tuning block, per score: reference pitch (A4 in Hz, default 440), a global offset in cents, and the size of koron and sori in cents (defaults -50 and +50). These sizes vary by tradition and by performer, so they are numbers the user can change, never constants. The global offset exists because recordings of Persian instruments are rarely at A=440 and the synth needs to be able to match the recording.

`unmetered` measures exist because avaz sections are in free rhythm. Validation skips the duration check for them and sync anchors for them will sit on notes rather than bar lines.

Score position everywhere in the app is measured in **quarter notes from the start of the score with repeats unfolded**, called `q`. Use the same unit Verovio's timemap reports so no conversion layer is needed.

### 4.3 Rendering and cursor

Model to MEI string, MEI into the Verovio toolkit, SVG out, timemap out. Cache per layout: for each event id, its page and the x position of its notehead (from the SVG bounding box). Recompute on resize or zoom.

Two visual layers during playback. First, a CSS class toggled on the SVG group of the sounding note or notes. Second, a thin vertical playhead whose x is interpolated between consecutive onsets on each animation frame, so movement is smooth rather than jumping note to note. Auto-scroll or turn the page slightly before the playhead reaches the edge.

Clicking a note seeks to its `q` (and therefore to the mapped media time when a recording is attached).

### 4.4 Editor

Keyboard-first step entry, in the style of MuseScore: digit keys choose duration, letter keys A to G enter a pitch at the nearest octave to the previous note, arrow keys move pitch and selection, a period adds a dot, `0` or `R` enters a rest, and dedicated keys apply sharp, flat, natural, **koron** and **sori**. Plus: tie, grace note, tuplet, insert and delete measure, change clef, time and key signature (with a key signature builder that allows any mix of accidentals), undo and redo. An on-screen palette mirrors the keys for touch devices. Every edit mutates the model, re-renders, and keeps the selection by event id. Autosave to IndexedDB.

Do not try to make this a full engraving program. Anything elaborate can be written in MuseScore and imported.

### 4.5 Synth playback

Web Audio with a lookahead scheduler (timer every ~25 ms scheduling ~100 ms ahead). Frequency for a pitch is equal temperament from the reference pitch, plus the accidental's cents, plus the global offset. Start with a simple plucked-string-like voice (a couple of oscillators with a fast decay envelope, or a single sample pitched by `detune`), since the point is pitch and rhythm reference, not realism. Tempo comes from the score, multiplied by a practice speed factor. Include a metronome and count-in.

### 4.6 Media overlay and the sync map

A sync map is a sorted list of anchors `{ q, t, source }` where `t` is media time in seconds and `source` is `manual` or `auto`. Both `q` and `t` must be strictly increasing. Between anchors, interpolate linearly in both directions; beyond the ends, extend the nearest segment's slope. Put this in `packages/core` with tests, including the inverse mapping and edge cases (one anchor, seeking before the first anchor, media longer than the score).

Local tempo inside a segment is `60 * Δq / Δt` beats per minute (for a quarter-note beat). Showing this as a curve over the piece, and as a live readout during playback, is the "find the recording's tempo" feature. It falls out of the sync map for free and is more truthful than a single BPM estimate, because a master's tempo is not constant.

Manual sync workflow, in order of importance:

1. **Tap-along.** Play the media; the user taps a key on every bar line (or every note, for unmetered passages). Each tap creates an anchor at the next bar's `q`. This gets a usable map in one listen.
2. **Refine.** A waveform strip (wavesurfer.js, BSD-3, is a reasonable choice) with anchors as draggable markers labelled by bar number. Selecting an anchor and nudging with arrow keys moves it by 10 ms. Anchors can be added at any selected note and deleted.
3. **Check.** A toggle that plays a metronome click at every beat as mapped onto media time. Wrong anchors are immediately audible.

Practice controls with media attached: speed 0.25x to 1.25x with pitch preserved, A to B loop chosen by selecting notes in the score, count-in before a loop restarts, and an optional "synth along" mode that plays the score's notes at their mapped media times so the player can hear the written line over the master. For synth-along, convert each onset `q` to media time, then to AudioContext time taking the current playback rate into account, and reschedule on every seek, rate change or loop jump.

Video uses a plain `<video>` element and the same clock. Use `requestVideoFrameCallback` where available, otherwise `requestAnimationFrame`. YouTube embedding is a later, optional addition and must never download the video.

### 4.7 Automatic alignment (`POST /align`)

Input: the media file (or its extracted audio; use ffmpeg for video) and the score as a list of `{ q_on, q_off, midi_pitch_float }` where the pitch includes the koron/sori offsets. Output: a list of proposed anchors.

Method for v1. Build a score-side feature matrix directly from the note list, without synthesising audio: a quarter-tone-resolution chroma (24 bins per octave) sampled at a fixed frame rate against the score's nominal tempo. Compute the matching feature from the audio with a constant-Q transform at 24 bins per octave, folded to one octave, with a tuning estimate applied first so the recording's reference pitch does not smear the bins. Standard 12-bin chroma would fold koron and sori into their neighbours and throw away exactly the information that distinguishes Persian modes, which is why we use 24. Run DTW (librosa's is fine to start; Sync Toolbox's multiscale variant if memory or time becomes a problem), read the warping path at every bar line, then thin the anchors so that only points where local tempo changes meaningfully are kept. Return them marked `auto`. The UI shows them in a different colour and the user accepts, drags or deletes them. A manual anchor always wins: if manual anchors exist, run the alignment piecewise between them.

Expect this to be weakest on tremolo (riz), dense ornamentation and free-rhythm passages. That is acceptable because manual anchors are first-class. A later improvement for solo instruments is aligning on a pitch track (pYIN) plus onsets instead of chroma.

Build the evaluation before tuning the method: with the ground-truth sync map in `fixtures/`, report median and 95th percentile error in milliseconds at bar lines.

### 4.8 AI transcription of a written sheet (`POST /omr`)

Be realistic about this feature. General vision models are not reliable music readers, handwriting is harder than print, and rhythm errors are common. Classical OMR engines (Audiveris, homr) are better on clean printed Western scores but almost certainly do not know koron or sori and do poorly on handwriting. So the design goal is a **draft that is faster to correct than typing from scratch**, and the first job is to measure whether that is true (M0).

Design that gives the model the best chance:

- The user uploads a page image and drags boxes around each system (line of music). Cropping to one system per request matters more than any prompt wording.
- Each request sends one system crop plus context: clef, key signature, time signature, and the number of the first measure. The prompt explains koron and sori and what their glyphs look like, and requires output in a strict JSON schema that mirrors the model's measures and events. Do not ask for MusicXML; it is verbose and models make structural mistakes in it.
- Validate every returned measure: durations must add up to the time signature unless the measure is marked unmetered, pitches must sit in a plausible range for the clef. For a failing measure, retry once with the validator's complaint included.
- Review screen: the system crop on top, the rendered transcription beneath, invalid measures outlined, editor active. The user fixes and accepts system by system.

Keys and providers: define a small provider interface (`transcribeSystem(image, context) -> measures`) with one implementation to start and the model name as configuration, never hard-coded. Check the provider's current documentation for model names, image input format and structured-output support rather than relying on memory. The key is entered in the app's settings, stored only in the browser, sent to `/omr` in a request header, forwarded to the provider, and never logged or persisted server-side.

### 4.9 Persistence and interchange

Projects live in IndexedDB. Export and import a single bundle file (a zip) containing `score.json`, `syncmap.json`, the media file or a reference to it, and the source page images. MusicXML import and export cover the subset our model supports; on import, report anything dropped instead of failing silently.

## 5. Milestones

Work in this order. Each milestone should end with something the user can open in a browser, a short note of what was done and what was learned, and tests for anything in `packages/core`.

**M0. Spikes, before any real code. Stop and report after this.**
- Verovio: generate MEI by hand containing koron and sori on notes and in a custom key signature, a grace note, a tie and an unmetered bar. Confirm rendering, that our ids survive into the SVG and timemap, and how Persian text renders.
- Synth: play a short phrase with a koron and confirm the detune is audibly right against a reference.
- OMR: ask the user for three to five real pages (printed and handwritten). Run them system by system through at least one vision model with a first-draft prompt. Count wrong pitches, wrong durations and missed accidentals per system, and estimate correction time against typing the page from scratch. If the draft does not save time, say so plainly; the feature then moves to the end of the plan or is replaced.
- Report: what held, what did not, and any change you recommend to this document.

**M1. Model, rendering, playback with cursor.** Load a hard-coded score from JSON, render it, play it with the synth, highlight notes and move the playhead, tempo and speed controls, click a note to seek. Done when a phrase with koron and sori plays in tune with the cursor visibly on the right note.

**M2. Editor.** Everything in 4.4, with autosave. Done when the user can enter one of their own pieces from paper without touching JSON.

**M3. Media overlay and manual sync.** Attach audio or video, tap-along, waveform refinement, click-check, speed with pitch preserved, A to B loop, live tempo readout and tempo curve. Done when the cursor stays on the right note through a rubato recording after one tap-along pass and a few corrections.

**M4. Automatic alignment.** Backend, evaluation script, auto anchors shown for review, piecewise alignment between manual anchors. Done when the numbers on the fixture are reported and the user judges the proposals a time saving.

**M5. AI transcription.** As in 4.8, shaped by what M0 found.

**M6. Interchange and polish.** Bundle export and import, MusicXML in and out, synth-along mode, responsive layout for a tablet on a music stand, English and Persian UI strings with right-to-left layout where appropriate.

## 6. How to work

- Ask the user for fixtures early: page photos, a MuseScore-exported MusicXML file with both accidentals, and one recording they know well. Most of the uncertainty in this plan is resolved by real material, not by reasoning.
- Keep `packages/core` free of DOM and framework imports and cover it with unit tests. The sync map maths and duration validation are where subtle bugs will hide.
- When a library behaves differently from what this document says, trust the library, note it in `DECISIONS.md`, and adjust.
- When you report progress, separate what you ran and saw working from what you expect to work. If a feature is only partly done, say which part.
- Prefer finishing a thin, working slice of each milestone over a broad, half-working one.

# Two real films, one method

Both projects below render the same song (`world.execute(me);` by Mili, 211.9 s) with zero
video footage. Neither was made by a video editor. Read them as proof that the method in
SKILL.md scales to very different art directions.

|  | **lyric-mv** (JS) | **dsh-pv** (Python) |
|---|---|---|
| Author | anonymous | MisakaZentai (Bilibili BV1xCai6aE9g) |
| Language | JavaScript, 11 482 lines | Python, 30 065 lines |
| Delivery | 60 fps, 1080p / 4K | 24 fps, 720p master, 4K by 3x nearest |
| Frames | 13 017 | 4 968 |
| Chat UI | drawn with Canvas 2D path calls | **real HTML + the real CSS**, screenshotted |
| "Inside the model" | WebGL2 post-processing shaders | PIL, drawn character by character (TUI) |
| Dancer | none | MMD motion -> AI video -> ASCII (repo ships a stand-in) |
| License | non-commercial fan work, Mili guidelines | CC BY-NC-SA 4.0 |

## Case 1 — lyric-mv: everything is a pure function of song time

`src/engine/engine.js` line 2 states the whole contract:

> `renderFrame(t)` is the only entry for preview and export. It is a pure function of t:
> no frame-to-frame state, no wall clock.

Consequences the author relied on, worth copying:

- Three offscreen canvases: `A` = current scene, `B` = the other side of a transition,
  `over` = transparent HUD. All 2D-drawn. Then all three go through WebGL2:
  bloom is a 5-level downsampled blur pyramid on half-float buffers (prevents banding in
  darks), then rays, stripes, chromatic aberration, scanlines, vignette, grain, dither,
  mosaic, invert.
- **Time grid, not seconds.** `data/audio_features.json` (1.8 MB) holds beats and onsets;
  scenes reference `Bt(63)`, `B(24)`. Every cut lands on the grid. Lyric timing lives in
  `data/lyric_timing.json` (129 rows, times only — the words come from the user's own file).
- **Colour is state, not decoration.** `config.json → palettes` defines `off`, `on`, `warm`,
  `error`, `errWarm`, `ash`, each entered by an event at a named second
  (first colour at 15.11 s, first red at 129.34 s). Orange = the AI, cream = the user,
  red = error, grey = absence.
- **Three kinds of picture**, and a test for each: *interface* ("which moment of the
  conversation is this?"), *plate* ("which word is this, and what ends it?"), *code*
  (the EXECUTION stretch only).
- Guard rails in code: missing lyrics abort before any output is written; missing glyph in a
  font throws; `tools/luma.py` reports per-frame brightness so the climax can be verified as
  a ratchet rather than guessed at.
- Docs left in the repo: `docs/v4/PROMPT_v4.md` (~23 000 characters, the director's brief),
  `PROMPT_v4_fix.md` (the repair round after screening), `PROGRESS.md` (what was actually
  built, and where it departed from the brief), `KIT.md` (how to write one section).

## Case 2 — dsh-pv: two renderers, one compositor

- Left half: one static HTML page per frame, using the real product's CSS and class names,
  screenshotted by headless Chromium via Playwright — 4 968 pages.
- Right half: a PIL TUI engine that draws the model's internals character by character.
- `dsh_her.py` swaps the right engine's `her_layer` function **in memory** to inject that
  frame's screenshot, so the camera moves the engine owns (push, isolate, slide-out) act on
  the real screenshot. README is explicit: no server, no model call, at render time.
- `build.py` is the whole pipeline in 148 lines: `check → lyrics → dancer → pages → render`.
- `data/song.json` pins the expected audio by **sha256** and duration. `check` warns when
  your file differs and tells you to trim the silence instead of pretending it matches.

## What both agree on

1. A pinned audio file is the clock; everything else derives from it.
2. The frame is a pure function of song time — never of "the previous frame".
3. Timing is authored on a beat grid, not by typing seconds.
4. Colour and picture-kind are rules with named entry events, not per-shot taste.
5. Screening happens by producing stills and watching them; never by reasoning about code.
6. The human supplies direction and screening notes; the agent writes the code.
7. Delivery is ffmpeg muxing at the end, BT.709 tagged, `+faststart`.

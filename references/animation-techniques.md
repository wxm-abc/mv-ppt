# Animation techniques, by situation

How to put motion into a code-rendered film, and — more importantly — **which** motion to use
where. Every entry names what it is, the situation it is for, and where it lives in the two
reference films so you can go read a working version.

## First, the diagnosis that matters most

If the picture only swaps text, the missing thing is **not effects — it is the shot**. The
reference films are shot lists (lyric-mv: 15 section files; dsh-pv: **96 shots**), not one
canvas held for the whole song. **Cut the timeline into shots before adding any technique.**
Techniques have nowhere to attach until a shot exists.

Shot boundaries are written on the grid (`bar(13)`), never as seconds.

### The second diagnosis: motion without a subject is not readable

Before adding a technique to a shot, ask what the frame would mean **if you took the words
away**. If the answer is "something is moving", the shot is not finished. Two shapes of this
failure came up on a real 30-second film and needed the shots rebuilt:

- **"rise", drawn as embers climbing the whole frame.** Motion, no subject. Nothing said
  *what* was rising, or that it had ever been anywhere else. Fix: give it a horizon, a row
  of points that **stay**, and a hollow ring on the line where the departed one used to be.
  Now every element is measured against the others — one left, the rest did not — and 擅自
  ("on my own, without being allowed") finally has something to be against.
- **"here", drawn as rays and a beating ring.** That is a generic burst, and a burst has no
  position. Fix: give it a **place** — a dim field of points (everywhere it is not), a lit
  one, and crosshairs fixing it. The rings leaving on every two beats then read as a signal
  going out, and the field answering in the last bars pays off saying it aloud.

Two more rules fall out of the same lesson:

- **A still frame carries the direction of travel or it does not.** Even-width lines and
  plain vertical dashes read as a static column and as rain. A wake that is tight and white
  at the tip and spread and cooled further back reads one way only, and the object sits at
  the tip. Density is the cue, not the drawing.
- **Check that the subject still dominates after you add the scenery.** The field above was
  first authored too bright and too large and turned the frame into a halftone, burying the
  single point the shot was about. Look at where the eye lands, not at whether each element
  individually looks fine.

## The seven layers

| # | Layer | What it buys you | Cost | Do it when |
|---|---|---|---|---|
| 1 | Time and easing | Things feel alive rather than switched on | low | always (you already have this) |
| 2 | Element entrances / exits | Attention lands where you want inside a shot | low | the shot has more than one object |
| 3 | **Camera** | It stops being a slide and becomes a film | **low** | **first — biggest gain per line of code** |
| 4 | **Transitions** | Shots connect; the cut means something | medium | **second** |
| 5 | Shape match cuts | Two shots read as one continuous object | medium | a motif recurs across a cut |
| 6 | Post-processing | Texture, light, grit | **high** | last — it is the most work and hides bad timing |
| 7 | Structure and attention | A three-minute film stays watchable | medium | once there are shots to arrange |

Recommended order: **3 → 4 → 2 → 5 → 7 → 6.** Do not start at 6.

---

## Layer 3 · Camera (do this first)

Two functions cover it, in `lyric-mv/src/engine/draw.js`:

```js
camera({ x = 0, y = 0, zoom = 1, rot = 0 })   // pan in virtual px, zoom about screen centre
frame(r, margin = 0)                          // returns camera params that make rect r fill the screen
```

`frame()` is the useful one: describe what must be visible and let it compute the framing. Give
every shot a start and end framing and interpolate — that single change is the difference
between "a plate with words" and "a film".

| Situation | Use |
|---|---|
| Arriving on a detail, then revealing the whole | start framed on the detail, ease out to `frame()` of the whole |
| A word has weight | slow push-in across the word's duration |
| Section is ending | slow pull-out, or drift, never a hard stop |
| A hit lands | `rot` or `zoom` of a few percent, decaying with `pulse()` |
| Nothing is happening (a held shot) | add a barely-perceptible drift; a perfectly static frame reads as broken |

## Layer 4 · Transitions

Defined by the **incoming** shot: `enter: { type: 'scan', dur: 0.46, align: 'end' }`.
Source: `lyric-mv/src/engine/transitions.js`, which ships a "when to use what" table.
Any type (including plain `cut`) can also take `flash` / `flashColor` / `flashDecay`.

| Type | Effect | Use it when the content is |
|---|---|---|
| `cut` | hard cut (`+ flash` = white/colour flash cut) | a hit, a keyword slamming down |
| `flashcut` | cut hidden inside a colour bloom | a big section change |
| `fade` | plain dissolve | fading, loss, the ending |
| `glitch` | blocks and torn rows swap between the shots | instability, errors |
| `scan` | scanline wipe with a hot edge (`dir` 0 down 1 up 2 right 3 left) | printing, booting, being written |
| `circle` | iris from a point (`inverse: true` closes it) | focusing onto / away from an object |
| `diag` | slatted diagonal wipe | a brisk change of topic |
| `grid` | cells flip in a diagonal cascade | data, parameters |
| `zoom` | fly through the picture (`out: true` reverses) | going deeper, or pulling out |
| `shatter` | picture breaks into falling shards | breaking, fragments |
| `dissolve` | pixel blocks flip at random (`size` = block scale) | erasing, decay |
| `winclose` | outgoing picture collapses like a closed window / CRT | leaving, shutting down |
| `winpop` | incoming picture pops up as a window | dialogs, errors, a new process |
| `push` | both pictures slide (`dir` 0 left 1 right 2 up 3 down) | switching between two states |
| `slices` | horizontal slices slide apart | tearing |

**Choose by motive, never by looks.** The rule in the source file is explicit: keep it
motivated by the lyric, not decorative. If you cannot say in one sentence why *this* word wants
*this* transition, use `cut`.

### The part almost everyone misses: `align`

The same transition reads completely differently depending on where its window sits relative to
the beat:

| `align` | Window | Reads as | Typical types |
|---|---|---|---|
| `end` | ends on the cut | **anticipation** — the change is already finished when the beat lands | `zoom`, `scan`, wipes |
| `start` | starts on the cut | **reaction** — the beat hits, then the picture breaks | `glitch`, `shatter`, `flashcut` |
| `center` | straddles the cut | softest, least assertive | `fade`, `dissolve` |

Pick `end` when the music should arrive into an already-new picture; pick `start` when the beat
is the cause and the picture is the effect.

## Layer 5 · Shape match cuts

Not in the transition library — it is not an image-space blend. The same outline is carried
across a hard cut and morphed, done inside the scene code (`shapes.js` in lyric-mv). Use it when
one object/motif must survive a cut and stay recognisable.

## Layer 2 · Element entrances and exits

Easing lives in `lyric-mv/src/engine/util.js`:

```js
smooth(k)  easeOut(k)  easeIn(k)  easeInOut(k)  easeBack(k)
pulse(since, decay)                 // exponential decay from an event — the workhorse for hits
window01(t, a, b, fin, fout)        // fade-in/out envelope for an object's lifetime
```

| Situation | Use |
|---|---|
| Several objects in one shot | stagger them — identical timing reads as one object |
| Text appearing | type-on, or mask-reveal; `easeOut` for entering, `easeIn` for leaving |
| An object should feel physical | overshoot with `easeBack` |
| Emphasis on one word | delay it, then `easeBack`; let it be the last thing to settle |
| A hit | `pulse(t - hitTime, decay)` — never a linear ramp |

Trails / after-images: `trail(n, dt, fn, strength)` re-draws the previous `n` frames. See the
constraint below — you cannot use a frame buffer.

## Layer 6 · Post-processing

`lyric-mv/src/engine/post.js` is WebGL2, three passes:

1. **mix** — combine the layers
2. **bloom** — 5-level downsample blur pyramid, half-float buffers (banding in dark falloff is
   the failure mode this avoids)
3. **final** — camera (zoom / rotate / shake), glitch rows, mosaic, datamosh blocks, RGB split,
   desaturate, invert, scanlines, vignette, flash, grain, dither

Plus optional `fx.bloomAll`, `fx.rays` (rays running outwards from one point), `fx.streak`
(a horizontal streak through what blooms).

This is the most expensive layer and the one that most easily hides unfounded timing. On a
Canvas-2D engine, a `glow()` helper plus deterministic grain gets you most of the way; only add
the shader stack when the film already cuts well.

## Layer 7 · Structure and attention

What keeps a long film watchable. dsh-pv drives it with two tables in
`film/pv_dsh_frontend_20260927/dsh_her.py`:

- `COVER` — the time ranges in which one pane takes over the screen; inside a covered range an
  incoming transition is simply dropped (the new frame is already there).
- `LEAD` — which side is the subject; the other side drops to **42 %** brightness.

Use it whenever two things share the frame: say which one the viewer is meant to watch, and
dim the other. A film where everything is equally bright has no centre of attention.

---

## Situation → technique quick table

| I want… | Reach for |
|---|---|
| It to stop looking like a slideshow | camera (layer 3) + a shot list |
| A word to hit | `cut` + `flash`, `align: 'start'`, `pulse()` on the beat |
| To arrive somewhere new | `zoom` or `scan`, `align: 'end'` |
| To leave a section | `winclose` or a slow pull-out |
| To show a system booting / being written | `scan` |
| To show something breaking | `shatter`, or `slices` |
| To switch between two states | `push` |
| To show data or parameters | `grid` |
| It to feel unstable / wrong | `glitch`, plus glitch rows in post |
| Attention on one of two things | `LEAD`-style dimming of the other |
| A held shot that is not dead | barely-perceptible drift |
| Texture and light | post (layer 6) — last |
| Something to read as *rising* | a horizon it leaves + a wake tight at the tip and spread behind + the ones that stay |
| Something to read as *here* | a field of dim points + crosshairs + one lit point |
| To show a signal going out | a ring leaving the source on the beat, and something answering |

## Constraints specific to code rendering

These are why some ordinary animation tricks do not port directly:

- **No frame buffer.** `renderFrame(t)` is pure, so you cannot accumulate. Trails mean
  re-drawing the previous `n` frames inside the current call (`trail(n, dt, fn)`), or faking
  history from a pure function.
- **Randomness must be deterministic.** `Math.random()` makes frame 8000 unreproducible and
  breaks law 1. Use a hash (`hash2(x, y, seed)`) so the same frame always gives the same grain.
- **A transition needs two live layers.** Both the outgoing and incoming shot are rendered
  during their overlap; a single-layer engine cannot cross-dissolve at all.
- **Everything stays on the grid.** A transition duration in seconds is fine (`dur: 0.46`), but
  the cut it belongs to is authored as `bar(n)`.

## The loop

Add one layer at a time, and each time: choose the shots it applies to → state the bar → change
the code → render a contact sheet before and after → compare → move on. A contact sheet is the
evidence; "it should look better now" is not.

**But a contact sheet cannot judge small elements.** A line of points on a horizon, a dim
field of dots, a hairline crosshair — all of them are sub-pixel once the sheet downscales,
so the sheet passes things it should fail. Render the doubtful frame again on its own at
1920×1080 (`--times X --cols 1 --width 1920 --height 1080`) before deciding. On the film
above, the first version of both rebuilt shots passed their sheet and only came apart at
full resolution, where the wake turned out to read as rain and the field as a halftone.

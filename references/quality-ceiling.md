# The quality ceiling — why a code-rendered film looks cheap, and the measured fix

Written after actually closing the gap, not from theory. The numbers below are real
measurements (ffprobe `signalstats` + a high-pass + `edgedetect`, all at **960x540** so
frames of different resolutions can be compared).

## First: find out what the reference actually is

A user brings a clip and says "the quality gap is big". **Do not treat it as a target to
reverse-engineer until you have checked whether it is output of a project you already
have.** Two of three times it has been.

Check, in this order:

1. **Container metadata.** `ffprobe -show_format` → look at `TAG:comment`. An exporter that
   stamps `mv_start=...` has told you exactly which second of which song the clip came from.
2. **Resolution and encoder.** `TAG:encoder=Lavf<version>` means ffmpeg, i.e. a project, not
   a camera. A resolution that equals some project's *preview* size (960x540 is a very
   common preview preset) is a strong tell.
3. **Grep the on-screen words.** Any text visible in a frame — a UI label, a button, a
   placeholder — search for it in the sources you have. Strings like `Write to me` /
   `New conversation` / `Recents` are unique enough to find the component that draws them
   in one `grep -rl`.
4. **SSIM the overlap.** If you have a candidate export of the same range:
   ```
   ffmpeg -i clip.mp4 -i candidate.mp4 -lavfi "[0:v][1:v]ssim=stats_file=-" -f null -
   ```
   `All: 0.96+` over hundreds of frames = same content, different compression. Done.

In the case that produced this file, all four agreed and the "reference" turned out to be
the sibling project's own 540p preview export of song time 8–28 s. The user's problem was
never "reach this quality" — it was "use the engine you already downloaded".

## The gap is almost never encoding

Measured on that pair:

| | reference | the film | verdict |
|---|---|---|---|
| resolution | 960x540 | 1920x1080 | **ours higher** |
| video bitrate | 1.53 Mbps | 2.2 Mbps | **ours higher** |
| audio | AAC 72 kbps | AAC 320 kbps | **ours higher** |
| mean luma Y | 39.6 | 35.2 | theirs lighter |
| saturation | 5.4 | 10.7 | ours too hot |
| high-frequency energy | 1.13 | 0.71 | theirs 1.6x denser |
| edge density | 1.40 | 1.03 | theirs 1.4x denser |

The film won every encoding metric and lost every *picture* metric. That is the whole
diagnosis, and it generalises: **a code-rendered film that looks cheap is not badly
encoded, it is empty.** Specifically it is:

- **glow on black** (luma 20–35, saturation high, detail almost zero) — the signature of
  abstract shapes on a void;
- **one typeface, one size** — no typographic hierarchy, so nothing reads as designed;
- **no place** — nothing in the frame answers "where is this".

## The three levers, in order of effect

### 1. A place to be (largest)

Give the film a room and put a piece of interface in it, then draw the picture *between*
the two:

```
back   the wall — a lit surface, a faint repeated motif, a dot lattice. Never pure black.
middle the picture
front  a window, drawn from real UI components, at glass ~0.30 so the light shows through it
```

Two layers rather than one is the whole trick: it creates depth for free, because the
picture is behind glass and the type is in front of both. The luma jump (35 → 38, and the
blacks come up from YMIN 5 to YMIN 18) comes from the back layer alone.

Draw the chrome from **parameterised components** (`windowFrame`, `sidebar`, `header`,
`chatLayout`, `composer`, a thread renderer), not as a bitmap, so the interface can carry
the film's own words and change state with the song. The conversation is not decoration:
the thread holds the lines already spoken and the composer types the line being sung.

### 2. A post-processing pass (second largest, and it is not optional)

A real WebGL pass, in this order:

1. **Bloom as a 5-level blur pyramid**, where the first level is gated by **saturation**
   (`smoothstep(satKnee[0], satKnee[1], (max-min)/max)`) and by luminance above the palette
   background. This is what makes it look expensive: cream text and grey surfaces stay
   matte while only the accent glows. A plain "add a blurred copy" bloom greys the whole
   frame. Use half-float buffers or the dark glow falloff bands.
2. **Vignette + grain**, always on. Grain is what stops a flat render reading as a flat
   render; it also happens to be why a real film looks like film.
3. **Radial aberration** (RGB split outwards from centre) and **scanlines**, both tiny
   (`0.0005`, `0.03`). Big values read as an effect; small ones read as a lens.
4. **A camera** (zoom/rotate/shake) applied in the composite pass, not in the 2D layer.
5. **Flash**, tinted by the palette's bloom colour rather than white, added *after* the
   vignette so it does not wash the corners, and capped by a `safety.maxFlash`.

Drive all of it per frame from one pure function of film time, sitting next to the shots —
because a cut, a key-word hit and a flash are events in the words, not settings on a shader.
Let the key word's decay envelope drive bloom + rays + aberration so the moment that matters
is also the moment the lens reacts.

**Delete any vignette and grain that were painted in canvas.** Doing them twice makes the
frame muddy and costs render time.

### 3. A type system (cheapest per unit of effect)

Load real faces before the first frame (a face that arrives late makes early frames wrap
differently from late ones). Fix the roles and never break them:

| role | means | example |
|---|---|---|
| serif | the voice that speaks | the lines in the thread |
| sans | the interface and the user | buttons, labels, the composer |
| mono | the system | timecode, codes, status counters |

Then hold a size ladder across the whole frame, and give the lyric band its own scrim —
the picture is brightest exactly where the words are, so the band is unreadable on its own
climax without one.

## Colour must be a state machine, not a set of hex triples

Define N states, each with the **same role structure**
(`bg panel raised line text sub mute me meHot meDim err bloom glow sat`), and have the
picture, the room, the interface and the bloom all read the same state. One state per
section, each entered by an event in the words — never by taste.

The trap: let the wall take the state's colour and the film turns into orange soup
(saturation 10.7 in the measurement above). **Keep the surfaces neutral grey in every
state and let only the accent roles carry the temperature.** That single rule dropped
saturation from 10.7 to 6.4 without touching one picture, and put it in the reference's band.

Keep the saturation curve monotonic and re-measure it after every change to the pictures —
it is the cheapest way to catch "the climax is no longer the hottest frame".

## Targets to aim at

At 960x540, against a reference the user likes:

| | aim for |
|---|---|
| mean luma Y | 38–50; **YMIN above 12** (no crushed black) |
| saturation | within ~30% of the reference |
| high-frequency energy | ≥ the reference, or the frame is emptier than it looks |
| edge density | ≥ the reference |
| saturation curve over the film | monotonic, spike at each cut |

The last three are the ones that go wrong when a film is "beautiful but cheap".

## What this does not fix

Post, a room and a type system raise the *ceiling*. They cannot raise the *floor*, which is
set by two things only the author can supply:

- **a figure** — the reference had cut-paper silhouettes behind the glass. Abstract shapes
  have no face, and no amount of bloom gives them one;
- **incident** — the reference had 87 shots in 3:32. Five shots in 30 s is a different art
  form, and it will read as sparser no matter how good each frame is.

Say both out loud when reporting the result. "It now matches the reference's density and
exposure" is true and useful; "it now looks like the reference" is not.

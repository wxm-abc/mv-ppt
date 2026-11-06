# From song to world

Read this **before the first shot**, and again the moment a user says any of:

> 这个视频的歌曲和上一个不一样，素材也没那么符合
> the material doesn't fit this song
> this looks like the same video again / it could be any song

That complaint is almost never about the pictures. It is about the **place**.

## What happened, so it is not repeated

A five-shot film was built for a song. It worked, and it was still wrong: the room behind
the pictures was an **AI chat client** — window chrome, sidebar, a composer that typed the
line being sung, "session not started". That is a very good room. It was also the literal
subject of a *different* song (`world.execute (me);`, a song about an AI persona), borrowed
because it was the fastest way to raise the quality numbers.

It raised them. Mean luma 35 → 38, high-frequency energy 0.71 → 2.94, edge density 1.03 →
3.69 — all past the reference film it was being compared to. And the film was wearing another
film's clothes. **A borrowed world scores well and means nothing.** The numbers cannot see
this; only the user can, and they will.

## The rule

> **A lens is borrowable. A place is not.**

| Borrowable — it is a camera, not a meaning | Not borrowable — it is meaning |
|---|---|
| bloom, rays, streak, aberration, RGB split | the room / the set / the location |
| grain, vignette, scanlines, halation | the props (`calendar`, `window`, `throne`, `phone`) |
| flash / smear / glitch transitions | the subject (a character, a figure, a silhouette) |
| a type-role system (serif/sans/mono = who speaks) | the specific typeface pairing a film was branded with |
| the renderer, the beat grid, the export chain | a specific palette a film made its own |

Everything in the left column is a *way of looking*. Everything in the right column is a *thing
being looked at*, and a thing carries the story it was chosen for.

## The diagnostic

Ask: **would this frame still make sense scored to the other song?**

If yes, the world is borrowed. Delete it and start again from the song. Do not "adapt" it,
do not re-tint it — the props are the problem, not the colours.

## The procedure

1. **Put the song's own nouns on a page.** Not the mood, the nouns. Take the lyrics and the
   public analysis of the song and list the concrete things it names. For one song this was:
   *a tear-off calendar · a lace curtain · a window · a gentle wind · a place to go back to ·
   the star everyone is said to descend from · a hum.* Seven nouns, which is more than five
   shots need.
2. **The room is those nouns.** Not a metaphor of them. If the song says there is a curtain,
   there is a curtain, and it is drawn from the song's side of the frame.
3. **Cut the shot list into the song's own arc, not a generic one.** A swell → a chorus →
   a fade is not the same film as a verse → a break → a chorus. Re-measure the excerpt: for one
   song the "final chorus" the user asked for was at 250–268 s, ten seconds later than the
   obvious reading, and only the per-second onset density showed it.
4. **Draw every prop for this song.** No file copied from another project. If you catch
   yourself naming an asset after the other film, stop.
5. **Build the room first and shoot into it.** One place for the whole film, in fractions of
   the frame, in one module (`src/room.js`) that both the stage and the pictures import. One
   place is also what makes the last two shots readable: "further away" needs a distance to be
   measured in, and "the place I want to go back to" needs somewhere to be outside of.
6. **Then, and only then, put the borrowed lens on it.** The post pass and the type roles from
   the left column go on last, unchanged.

## The world layer must share the camera

The single bug this design produces, every time:

```
back()          wall, window, sky, light      <- painted with the camera
DRAW[i]()       the picture                   <- painted with the camera
frontLayer()    curtain, dust, haze           <- painted WITHOUT the camera  ← wrong
```

The curtain slid off its own window the moment a shot moved, and a star came out from behind
the lace. All three layers are the same world; pass the **same camera object** to all three.
If a world layer ignores the camera, the frame is not a room, it is three pictures stacked.

## What the place buys you, measured

Once the room was the song's own (a window, a lace curtain, a tear-off calendar, a shaft of
light, a star):

| | mean luma Y | saturation | high-frequency energy | edge density |
|---|---|---|---|---|
| reference film | 39.6 | 5.4 | 1.13 | 1.40 |
| borrowed chat-client world | 38.4 | 6.4 | 2.94 | 3.69 |
| this song's own room | **75 → 114** | 3.3 → 14.2 | **2.5 – 3.0** | **3.4 – 4.7** |

The detail is not lower for being honest — the lace alone carries more high-frequency energy
than the whole borrowed interface did. And the arc now *means* something: luma climbs across
the five shots because the room is getting warmer, and saturation dips exactly once, in the
shot about distance, then climbs to its highest value on the last frame.

## Props worth knowing

These came out of one song and generalise to many — but only use the ones *your* song names.

- **A tear-off calendar** — days physically leaving. One prop does "time passing" without a
  clock, and it gives the film continuity: tear the page in shot 1 and every later shot shows
  tomorrow. Two translucent pages on a wall at once reads as a bug — paint the paper opaque.
- **A lace curtain in front of a window** — the front layer. You look at the room *through*
  something, which is what gives a flat room depth, and the fabric carries fine detail the
  post pass can bite on.
- **A shaft of light on the floor** — says where the light comes from, which is what stops the
  frame being "a backdrop with a light on it".
- **A splinter that arrives and then stays** — for any line about a wound that is also warmth:
  the event is the arrival, the *picture* is the staying.
- **A row of the same object receding** — for "further away". Perspective does the work; give
  the near one a legible label and the far ones none.
- **A star above a small light on the horizon** — for "a place to go back to". Two lights at
  two distances, and neither is the room.
- **A gust as a front crossing the frame** — wind cannot be drawn as an object, only as
  something crossing: a band of light with a leading edge, dust going with it, and the room
  measurably warmer after it has passed.

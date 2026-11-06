# Screening, sync and delivery

## 1. Screen by producing pictures, never by reading code

The author of the reference film put this in the kit as a numbered rule: *check your work
repeatedly — look at the frames.* Every check below is one command.

```bash
# stills at given song times, one PNG. Do it after every cut, keyword hit and transition.
node export/export.mjs --sheet out/qa_cut.png --times 61.98,62.2,62.67 --cols 3

# a still every 0.9 s across a section, to see the shape of a whole stretch
node export/export.mjs --sheet out/qa_chorus.png --from 58 --to 76 --step 0.9 --cols 4

# check cards: one picture alone, no lyrics, through the real pipeline
node export/export.mjs --lab plates --sheet out/chk.png --times 0,1,2 --cols 1
```

Rules of thumb from the source projects:

- A picture should read at a glance on its **first frame**. If it needs motion to be
  understood, redesign it.
- Judge a plate **alone**, stripped of lyrics and chrome (that is what `--lab` is for).
- Render a suspect frame at full size once and look at a 100% crop. Down-scaled sheets hide
  torn edges and thin strokes.
- Brightness is measurable: `tools/luma.py` in the reference film reports the brightest frame
  and every local dip, so "the climax ratchets up" can be *verified* rather than assumed.
  Port the idea, not the file: sample the mean luma of each frame and print the series.
- A cut that cannot be described as "on the grid" is a bug, not a style.

**Sheet size is a real constraint.** A 75-shot film at 15×5 with 960×540 cells is
**14400×2700, 61 MB** — too heavy to open quickly, and some previewers refuse it. Export the
sheet at the size you actually need, then make a half-scale companion for looking at:

```bash
ffmpeg -y -loglevel error -i out/sheet.png -vf scale=7200:-1 out/sheet_half.png   # 61 MB -> 12 MB
```

## 1b. When the model cannot see the picture

Some environments refuse to return image content (reading a PNG yields "the current model does
not support images"). You cannot eyeball the film, and no amount of re-reading the file will
change that — **stop trying, and switch the whole review to numbers.** Three layers, in order:

1. **Arithmetic on the deck.** The shot-list script should print the numbers that would
   otherwise need eyes: shot count, average/shortest shot, subtitle count vs shot count,
   caption boxes under a width threshold, motif repeats. See `subtitles.md` §验收.
2. **Pixel statistics from a real browser.** `scripts/qa_pixels.mjs` reads the canvas and
   reports ink %, coverage of the graphic area, edge density, p95−p05 range per page. It catches
   "did not crash but the page is empty".
3. **Hand the pictures to the human.** Present the sheet and the film, and ask them to look for
   exactly the four things the numbers cannot see: a caption landing on a body, a caption
   squeezed between two bodies, a caption that wrapped, a caption that is missing. Give them the
   shot's timestamp so a fix is one edit in the shot list.

State the limitation plainly in your report. **Arithmetic and pixel statistics are a
substitute, not a confirmation** — never claim a film "looks right" from them.

## 2. Audio: the clock, the offset, and the version trap

The film's timing is baked against **one specific copy of the song**. Before anything else,
probe the file you actually have:

```bash
python scripts/song_probe.py input/song.wav --expect-sec 211.96 --ref-lead 0.183
```

It reports duration, where sound really starts and ends, and the offset needed to line your
copy up with the copy the film was timed on.

**Offset semantics.** In the engine, `tv = t - offset`; a positive offset means the picture
plays later. The correct value is

```
offset = head_silence(your file) - head_silence(reference file)
```

In the case that produced this skill: reference 0.183 s, user's file 0.45 s, so offset ≈ 0.27 s.

**When offset cannot save you.** If your copy is a different master (extra bars, different
edit, longer tail), a single offset fixes the start and the film drifts afterwards. Two
independent projects timed the same song to 211.91 s and 211.96 s; a 224.5 s copy is a
different release. Say so plainly instead of tuning numbers forever. Verify by ear on a
mid-song sample, not only on the intro:

```bash
node export/export.mjs --start 100 --end 120 --out out/sync_mid.mp4
```

**Never trust an alignment you cannot measure.** Envelope cross-correlation fails between a
brick-walled master and a dynamic copy (correlations around 0.0–0.3 here). The reliable
signals are: total duration, head silence, tail silence, and the ear.

## 2b. Measuring the beat grid (and knowing when it is good enough)

`scripts/beatgrid.cjs <audio> --out data/features.json` does it in under a second: spectral
flux → autocorrelation for tempo → refinement that maximises how many onsets actually sit on
the grid → comb filter for the phase → the phase is shifted by whole beats onto the music so
`beat(0)` is usable.

Two traps, both met while building the demo:

- **`gridFit` is not a pass/fail number.** Onsets include every vocal and melodic attack, so
  only ~⅓ of them land on a beat. 0.25–0.45 is normal and does not mean the tempo is wrong.
  Do not "fix" it by hunting for a higher-scoring tempo — a denser grid always scores higher
  (a 272 BPM grid scored 36.7% where the true 136 BPM scored 19.4% on the same onsets).
- **A short clip cannot pin the tempo.** Over 45 s, 130 and 138 BPM differ by under 50 ms of
  total drift, while the onset measurement itself scatters over ~120 ms. Measure the **whole
  song** if absolute accuracy matters; for a 45 s section, anything within a percent is fine.

The check that actually works: compute the first beat at or after where the sound starts and
compare it to where the sound starts. A correct grid puts them tens of milliseconds apart.
In the demo, `soundStart` 0.522 s vs `beat(1)` 0.539 s — 17 ms.

## 3. Delivery recipe

```bash
ffmpeg -i master.mp4 -i song.wav \
  -map 0:v -map 1:a -ss 0 -t 211.9 \
  -vf scale=out_color_matrix=bt709:out_range=limited,format=yuv420p \
  -c:v libx264 -preset slow -crf 16 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 320k -shortest -movflags +faststart out/film.mp4
```

- **Colour tags matter.** A browser canvas is full-range RGB; without the BT.709 tag the film
  looks washed out on playback.
- **`+faststart`** so it streams.
- **4K from a 720p master**: `scale=3840:2160:flags=neighbor` keeps the pixel art pixel-exact.
  Never let a scaler invent pixels for pixel art.
- **The delivery is always re-encoded.** The reference film's config pins
  `-c:a aac -b:a 320k`, so sourcing a lossless master changes the final file by exactly zero
  bytes. Do not send a user hunting for a FLAC to fix an audio problem that is really a
  sync problem.
- **Strip silence, don't hide it.** If the extra seconds are at the head or tail, cut them
  with ffmpeg rather than absorbing them into an offset.

## 3b. The delivery is the only place the channel count is decided

**Check the channels before you deliver, not after.** The wav you built for analysis is often a
mono downmix (feature extraction only needs one channel, and mono halves the bytes). `export.mjs`
muxes whatever `config.paths.audio` points at, so if that is the mono wav, **the finished film is
mono** — and nothing in the render, the smoke test or the pixel QA will say so.

```bash
ffprobe -v error -show_entries stream=codec_name,channels -of default=noprint_wrappers=1 out/lulu.mp4
# channels=1  <-- the film is mono. Fix it.
```

Do **not** re-render. The picture is already correct; remux the audio from the lossless original
(video stream `copy`, so this costs seconds, not twenty minutes):

```bash
ffmpeg -i "<original>.flac" -c:a pcm_s16le -ar 44100 _song_stereo.wav
ffmpeg -y -i out/lulu.mp4 -i _song_stereo.wav -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart out/_fixed.mp4
```

Two things to verify first: the original and the analysis wav must have the **same duration**
(here 270.626667 s for both) and the same head silence, otherwise you are introducing a sync
error to fix a channel count. If a large FLAC prints one `invalid sync code` / `invalid frame
header` on the first frame, that is the ID3 tag at the head, not corruption — decode to wav once
and check the output duration before trusting it.

Better still: **make `input/song.wav` stereo from the start** and keep the mono copy under
another name for the analyser, so this never comes up again.

## 4. Failure modes seen in practice

| Symptom | Cause | Fix |
|---|---|---|
| `ffmpeg not found` though it is on PATH | `spawnSync('ffmpeg', …)` probe returns EBUSY on some Windows hosts | never probe with `spawnSync`; honour `FFMPEG_BIN` and spawn directly |
| `npm install` fails at the last step, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | binary download blocked by TLS interception | use the system ffmpeg; the JS deps are already installed |
| ffmpeg exits -22 (EINVAL) with two inputs | an output option was placed before the second `-i` | all inputs first, then all output options |
| `width/height must be even` | yuv420p requires even dimensions | round both down to even |
| export aborts before writing anything | missing lyrics, missing beat grid | validate inputs in a `check` step and fail loudly before output |
| text silently wrong / missing glyph | webfont has no coverage for the character | throw on a missing glyph; never let the browser substitute |
| export is slow | it is the encoder, not the renderer | measure both; try `h264_nvenc` and compare |
| 404 in the console during export | favicon | ignore, or add one |
| finished film is mono | `config.paths.audio` is the mono analysis downmix | remux from the lossless original with `-c:v copy` (§3b); do not re-render |
| one `invalid sync code` reading a FLAC | ID3 tag at the head of the file | decode to wav and check the output duration; it is not corruption |
| sheet PNG is 60 MB and will not open | too many cells at too large a cell size | `ffmpeg -vf scale=7200:-1` a half-scale companion (§1) |
| reading a PNG returns "model does not support images" | the environment filters images | switch to §1b; stop re-reading the file |

## 5. Performance reality (measured on an RTX 5060 laptop)

At 1080p60, per frame: **render 2.2 ms, read 8.1 ms, send 70.9 ms** — the picture costs almost
nothing, the pipeline to the encoder costs everything. A five-second 1080p60 clip took 47 s;
a 13 017-frame film extrapolates to about 34 minutes. Consequences:

- Iterate at 960×540 and export only a range. Never render the whole film to check a change.
- If `h264_nvenc` is unavailable, ffmpeg silently falls back to libx264 `-preset slow -crf 16`;
  check the log line and fix the GPU path before rendering hours of footage.
- Check the WebGL renderer string at export time (`ANGLE (NVIDIA …)` vs `swiftshader`) — software
  WebGL is 10–50x slower and indicates the GPU flags did not take.

## 5b. When the instrument lies — always run the three-row self-check

A high-frequency metric was run over three completely different films, including the reference: it
returned **45.6, 45.6, 45.6**, to four significant figures. That is not a measurement, it is a
saturated instrument. The tell was that changing the picture did not change the number.

The same frame at `pts_time=10` measured **45.73** in one chain and **2.17** in another. Isolating
it:

| filter chain | flat grey | 8 px checkerboard | film, frame 300 |
|---|---|---|---|
| `ffmpeg -i film -vf …` (whole file, no seek) | 0 | 45.32 | 45.73 |
| `ffmpeg -ss 0 -t 30 -i film -vf …` | 0 | 54.37 | 2.17 |
| frame extracted to PNG, then measured | — | — | **2.17** |

The PNG never touches the video decoder and is the ground truth; it agrees with the seek path. So
on that host a plain whole-file read of that MP4 was the broken one — and nothing said so.

```bash
# run this before trusting ANY ffmpeg signalstat-style number, on every new host and file
ffmpeg -v error -f lavfi -i "color=gray:s=1920x1080:d=1:r=30" -vf "<chain>" -f null -   # must be 0
ffmpeg -v error -i film.mp4 -vf "select=eq(n\,300)" -vframes 1 -y _tmp/f.png            # then measure it
```

Rule: **a number that does not move when the picture changes is not measuring the picture.** Make
a controlled input with a known answer part of the measurement, not a separate debugging session.

**And check what you are comparing against.** The reference film used for calibration was a
**1.6 Mbps** web copy (20.0 s, 4.0 MB). Its own encoder threw away high frequencies, so any
"your grain is N× the reference" conclusion is an **upper bound, not a reading** — on this project
1.81×. Report the direction, refuse to report the magnitude, and say why. Edge density against the
same file was usable (0.96×, and it tracked the film correctly from 1.39 on the quiet shot to 2.01
on the busiest), because `edgedetect` measures structure the encoder kept.

## 6. Rights

A lyric film built on someone else's song is a derivative work. Publish it only under the
rights holder's own terms (Mili publishes copyright guidelines; dsh-pv ships under
CC BY-NC-SA 4.0), non-commercially, with the AI-generated content disclosed, and mark
flashing-light stretches in the title or description when the film has them. State this to the
user once, plainly, and do not fetch or redistribute the song on their behalf.

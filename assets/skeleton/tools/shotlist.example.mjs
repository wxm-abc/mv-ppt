// Builds data/deck.json from a shot list.  Copy this to <project>/tools/build_deck.mjs.
//
// THE CUT COMES FROM THE VOCAL. Every shot starts where the next line is sung, so the film
// changes when the song changes — it is a lyric video, not a set of wallpapers with a
// soundtrack. Authoring a shot therefore means writing `t` (seconds) and `zh` (the subtitle),
// never a bar number: snapping to the grid is this file's job.
//
// The `t` values come from the track's own lyric timeline (LRC / official MV subtitle timing),
// checked against the measured grid in data/features.json. Watch out for one trap: an official
// MV is often cut differently from the single you are rendering, so its subtitle track can sit
// many seconds off your audio. Verify the first word against the waveform, do not assume.
//
// EVERY SHOT CARRIES A LINE. A lyric MV that leaves gaps reads as unfinished — the viewer is
// left staring at scenery waiting for the next card. Where nothing is sung (scat refrains,
// hummed passages, the outro) put the song's own syllables up, or hold the last line.
//
// There is a protagonist. She is not in every frame, but the film is ABOUT her, and that is
// what separates this from a set of wallpapers: the same motif photographed twice is two
// different shots because she is somewhere else in the frame doing something else.
//
// Each shot carries a PLACE (motif) and, orthogonally, her state:
//   pose    walk | stand | sit | kneel | reach | lookup | crouch
//   facing  1 = right, -1 = left, 0 = seen from behind (no face; the hair reads instead)
//   s       height as a fraction of frame height — 0.10 far away, 0.46 close
//   x       0..1 across the frame; DRIFTS inside each act so consecutive shots read as one walk
//   g       1 = the one she remembers is standing beside her (drawn as a ghost)
//   noFig   1 = no protagonist in this shot — pure motif. `pose`/`facing`/`s`/`x` go inert.
//   slot    'head' (default: the bottom band, like a subtitle) | 'top' (the upper band)
//
// A shot with `noFig` is not a shot with the person deleted: nothing is anchoring the frame
// any more, so composition has to come from the motif alone. That is fine for a landscape or
// an object, and wrong for anything the figure was carrying. Check the render, not the idea.
//
// and, derived from that place and state, a SUBTITLE BOX: the line goes on whichever side of
// the frame she is NOT standing on, so the words never land on her body. That is the one thing
// a lyric MV cannot get wrong, and it is why `x` here is chosen for the caption as much as for
// the composition. See references/subtitles.md.
//
// With `noFig` there is nothing to dodge, so the line takes the whole slot and centres. If the
// motif is bottom-heavy (a field, a stack of pages) send the line up with `slot: 'top'`;
// if it is top-heavy (rain, a beam) leave it in `head`. Keep ONE slot across the film — a
// caption that jumps between bands shot to shot reads as a mistake, not as a layout decision.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const F = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/features.json'), 'utf8'));

// The grid. HALF is four pulses; a musical bar is usually two of those. Cut on the vocal and
// snap to an EIGHTH note — snapping harder (to the half bar) puts a cut up to a third of a
// second off the word, which on a lyric video is exactly the jitter you notice; not snapping
// at all loses the grid and the whole point of measuring it.
const P = F.grid.periodSec, B0 = F.grid.beat0;
const HALF = 4 * P;
const Q = P / 2;
const snapped = (t) => Math.max(0, Math.round((t - B0) / Q) * Q);

// ---- themes -------------------------------------------------------------------
// A theme is a STATE the film is in, not a per-page colour. Four to seven changes in a song,
// each landing on a measured energy jump (loudness_scan.cjs or per-bar RMS). Changing more
// often than that makes the film twitch.
const THEMES = [
  [0, 'dark-tech'],
  [48, 'warm-paper'],
  [88, 'dark-tech'],
  [115, 'gradient-dark'],
  [128, 'warm-paper'],
];
const themeAt = (t) => THEMES.filter((x) => t >= x[0]).pop()[1];
// she carries the lamp where there is no other light; in the warm acts the room is already lit
const lampAt = (t) => themeAt(t) !== 'warm-paper';

// where the ground is in each motif, as a fraction of frame height (her feet go here)
const GROUND = {
  bridge: 0.665, stairs: 0.735, ruin: 0.845, horizon: 0.865, snow: 0.870,
  drift: 0.870, wide: 0.880, frames: 0.880, wrap: 0.885, path: 0.900,
  rain: 0.900, calendar: 0.900, curtain: 0.900, hum: 0.900, duality: 0.900,
  firefly: 0.900, ember: 0.905, star: 0.905, layers: 0.905, bloom: 0.905,
  thorn: 0.900, wind: 0.895, door: 0.920, window: 0.905,
  lanterns: 0.875, field: 0.820, moon: 0.735, mirror: 0.660, cliff: 0.605, corridor: 0.880,
};

// ---- the cut list --------------------------------------------------------------
// t     when the line is sung (seconds) — the shot starts here
// zh    the subtitle for that line. Write one for EVERY shot.
// m/p/f/s/x as described above;  g the other one is there;  e an explicit transition
//
// `sec: 1` marks the first shot of a section: the camera reacts there and nowhere else, so
// the `hit` means something. A hit on a third of the shots is not a hit.
const SHOTS = [
  // ===== ACT I — she is walking, and she is alone ==============================
  // Replace this with the real lyric timeline of your song. Twelve shots is a skeleton, not
  // a film: a 270s song cut on the vocal comes out at 70–85 shots, average ~3.5s.
  // The lines below are written for this skeleton and quote no song — overwrite all of them.
  { t: 1.50, zh: '天还没有亮', m: 'horizon', p: 'walk', f: -1, s: 0.22, x: 0.74, sec: 1 },
  { t: 5.02, zh: '街灯还开着', m: 'moon', p: 'lookup', f: -1, s: 0.26, x: 0.62 },
  { t: 8.54, zh: '我数着步子', m: 'hum', p: 'walk', f: -1, s: 0.30, x: 0.32 },
  { t: 12.06, zh: '走过第二个路口', m: 'wide', p: 'walk', f: -1, s: 0.32, x: 0.44 },

  { t: 17.93, zh: '你说的那些话', m: 'frames', p: 'walk', f: -1, s: 0.32, x: 0.46 },
  { t: 21.45, zh: '还贴在耳朵上', m: 'thorn', p: 'stand', f: 1, s: 0.42, x: 0.70 },
  { t: 24.97, zh: '像一件旧外套', m: 'duality', p: 'stand', f: 0, s: 0.42, x: 0.34 },
  // the band lands here. Everything before it was a room with one lamp in it.
  { t: 28.49, zh: '忽然就安静了', m: 'ember', p: 'stand', f: 1, s: 0.44, x: 0.66, e: 'flash' },

  // ===== ACT II — the wind arrives, and she is not alone any more ===============
  { t: 32.01, zh: '风从河那边来', m: 'wind', p: 'lookup', f: 1, s: 0.40, x: 0.70, e: 'flash', sec: 1 },
  { t: 35.53, zh: '把影子吹长', m: 'lanterns', p: 'lookup', f: 1, s: 0.36, x: 0.50 },
  // the promise, and the first time he is in the frame
  { t: 39.05, zh: '我们说好不回头', m: 'wrap', p: 'stand', f: 1, s: 0.40, x: 0.64, g: 1 },
  { t: 42.57, zh: '就一直往前走', m: 'ember', p: 'stand', f: 1, s: 0.42, x: 0.32, g: 1, e: 'flash' },
];

// ---- the subtitle box ----------------------------------------------------------
// How much of the frame the body actually takes up, per pose. figure.js draws the cloak hem at
// `hw * 0.185` where `hw = h / BONES[pose].H` — so a seated body, whose BONES.H is 0.56, is
// nearly twice as wide as the number `s` suggests. A leg in `sit` and an arm in `reach` go
// further still. Underestimating this is how a subtitle ends up printed across a knee, so each
// pose gets its own half width, in units of her height.
const POSE_HW = { stand: 0.20, walk: 0.20, lookup: 0.20, crouch: 0.24, kneel: 0.27, reach: 0.27, sit: 0.37 };
const FIG_HW = (s, pose, W = 1920, H = 1080) => (POSE_HW[pose] ?? 0.20) * s * H / W;
const MARGIN = 0.026;                     // clearance between her hem and the first glyph
const CAP_L = 0.06, CAP_R = 0.94;         // the caption slot, in frame widths
const BOX_L = 0.06, BOX_W = 0.88;         // the `head` slot of the stage layout
const STEP = 0.145;                       // how far behind her the other one walks

/**
 * Which side of the frame the subtitle lives on, and the box it gets there.
 *
 * Her side is decided first, from her alone — whichever side leaves more room. Then the one
 * she remembers is put on the FAR side from the caption: a two-shot with the words squeezed
 * between two bodies leaves the line too narrow to hold a sentence.
 */
function captionBox(sh, W = 1920, H = 1080) {
  // No protagonist in this shot: nothing to dodge, so the line takes the whole slot and centres.
  if (sh.noFig) return { side: 'center', dx: 0, w: 1 };
  const hw = FIG_HW(sh.s, sh.p, W, H);
  const bareR = sh.x + hw, bareL = sh.x - hw;
  const side = (CAP_R - (bareR + MARGIN)) >= ((bareL - MARGIN) - CAP_L) ? 'right' : 'left';
  const gs = sh.g ? (side === 'right' ? -1 : 1) : 0;      // which way he stands
  const right = bareR + (gs > 0 ? STEP : 0);
  const left = bareL + (gs < 0 ? -STEP : 0);
  if (side === 'right') {
    const x0 = Math.max(CAP_L, right + MARGIN);
    return { side, dx: +((x0 - BOX_L) / BOX_W).toFixed(4), w: +Math.min(1, (CAP_R - x0) / BOX_W).toFixed(4) };
  }
  const x1 = Math.min(CAP_R, left - MARGIN);
  return { side, dx: 0, w: +Math.min(1, (x1 - CAP_L) / BOX_W).toFixed(4) };
}

// ---- build ---------------------------------------------------------------------
const slides = SHOTS.map((sh, i) => {
  const box = captionBox(sh);
  const ground = GROUND[sh.m] ?? 0.90;
  const fig = { at: [sh.x, ground], s: sh.s, facing: sh.f, pose: sh.p, lamp: lampAt(sh.t), seed: i };
  // on water she draws her own reflection, flipped about the waterline
  if (sh.m === 'mirror') fig.mirror = ground;
  if (sh.g) {
    // beside her, half a step behind, made of the room rather than of body. He stands on the
    // far side from the subtitle, so a two-shot never squeezes the line between two bodies.
    fig.also = {
      at: [sh.x + (box.side === 'right' ? -1 : 1) * STEP, ground],
      s: sh.s * 0.97,
      facing: sh.f,
      pose: sh.p === 'walk' ? 'walk' : 'stand',
      ghost: true,
      seed: i + 60,
    };
  }
  const blocks = [
    {
      type: 'scene', motif: sh.m, at: 0, dur: 0.45, fill: 1, slot: 'main', from: 'none',
      hit: !!(sh.e === 'flash' || sh.sec),
      ...(sh.noFig ? {} : { figure: fig }),
      ...(sh.params || {}),
    },
  ];
  if (sh.zh) {
    blocks.push({
      type: 'lyric', text: sh.zh, at: 0.25, dur: 0.6, slot: sh.slot || 'head', scale: 1.26,
      dx: box.dx, w: box.w,
    });
  }
  return {
    id: `${sh.m}-${String(sh.t).replace('.', '_')}`,
    atBar: +((snapped(sh.t) - B0) / HALF).toFixed(4),
    at: +sh.t.toFixed(3),
    enter: sh.e || 'cut',
    theme: themeAt(sh.t),
    layout: 'stage',
    enterBeats: 1.2,
    blocks,
  };
});

const deck = {
  _doc: 'Generated by tools/build_deck.mjs — do not hand-edit; edit the SHOTS list instead.\n'
    + 'A page here is a SHOT, not a slide: one motif (src/scenes.js) filling the frame, with a\n'
    + 'protagonist (src/figure.js) standing in it, and one line of the song. Shots are cut where\n'
    + 'the vocal moves (the SHOTS `t` field), then snapped to an eighth note.\n'
    + '`figure`: {at:[x,y] ground point, s: height/frame, facing: 1|-1|0,\n'
    + 'pose: walk|stand|sit|kneel|reach|lookup|crouch, lamp, also:{ghost:true} for the one she\n'
    + 'remembers}. y comes from GROUND[motif] so her feet land on that motif\'s floor.\n'
    + 'The lyric block carries dx/w so the subtitle sits on the side of the frame she is NOT\n'
    + 'standing on. No progress bar, no page number: this is not a slide deck.',
  camera: { mode: 'drift', amp: 0.010, zoom: 0.006, follow: 0.5 },
  slides,
};

fs.writeFileSync(path.join(ROOT, 'data/deck.json'), JSON.stringify(deck, null, 2) + '\n');

// ---- report --------------------------------------------------------------------
// These five numbers are the whole review. If `subtitles` is not equal to the shot count, the
// film has wordless gaps; if a caption box is under 0.40 the line has been squeezed; if a
// motif repeats within two shots it reads as a stuck frame.
const motifs = slides.map((s) => s.blocks[0].motif);
const cnt = {};
motifs.forEach((m) => { cnt[m] = (cnt[m] || 0) + 1; });
const adj = [], near = [];
for (let i = 1; i < motifs.length; i++) if (motifs[i] === motifs[i - 1]) adj.push(`${slides[i].at}s:${motifs[i]}`);
for (let i = 2; i < motifs.length; i++) if (motifs[i] === motifs[i - 2]) near.push(`${slides[i].at}s:${motifs[i]}`);
const span = slides.map((s, i) => (i + 1 < slides.length ? slides[i + 1].at : F.duration) - s.at);
const avg = span.reduce((a, b) => a + b, 0) / span.length;
const caps = slides.filter((s) => s.blocks.some((b) => b.type === 'lyric')).length;
const ghosts = slides.filter((s) => s.blocks[0].figure?.also).length;

console.log(`shots ${slides.length}   average ${avg.toFixed(2)}s   `
  + `shortest ${Math.min(...span).toFixed(2)}s   longest ${Math.max(...span).toFixed(2)}s`);
console.log(`motifs ${Object.keys(cnt).length}   uses/motif ${(slides.length / Object.keys(cnt).length).toFixed(1)}`
  + `   subtitles ${caps}/${slides.length}   two-shots ${ghosts}`);
console.log(`adjacent repeats: ${adj.length ? adj.join(' ') : 'none'}`);
console.log(`one-apart repeats: ${near.length ? near.join(' ') : 'none'}`);
const narrow = slides.map((s) => {
  const b = s.blocks.find((x) => x.type === 'lyric');
  return b && b.w < 0.40 ? `${s.at}s w=${b.w.toFixed(2)} "${b.text}"` : null;
}).filter(Boolean);
console.log(`caption boxes under 0.40 of the frame: ${narrow.length ? '\n  ' + narrow.join('\n  ') : 'none'}`);
// A short example list does not reach the end of the track, so its last shot measures as
// enormously long. Say so, otherwise the number looks like a bug in the shot list.
if (Math.max(...span) > 3 * avg) {
  console.log('note: the longest shot is just the gap to the end of the song — this example '
    + 'list does not cover the whole track. A real one will.');
}

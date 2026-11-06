// The ONE rule of this skeleton, and of every film built with it:
//
//     renderFrame(t) is a pure function of song time t.
//     No frame-to-frame state. No wall clock. No Math.random().
//
// Because of that: preview == export, any frame can be rendered alone, and any
// range can be re-rendered without touching the rest of the film.
//
// What this skeleton adds on top of a plain pure-frame renderer is a DECK:
//
//   data/deck.json   the pages, declared — what is on them, in what order, on which bar
//   src/deck.js      the slide master — grid, type scale, slots, entrances, graphics
//   src/engine.js    the clock — bar boundaries, page turns, camera, transitions, the post pass
//
// A page turn is a cut on the beat grid. An element's entrance is measured in beats from that
// turn. Nothing is typed in seconds. That is the whole trick: a slide deck that is ALSO a
// frame-accurate music video.
//
// Beat helpers replace hand-typed seconds. Author page turns as atBar: 24, never as 62.4.
import { buildPalettes } from '../vendor/lyricmv/engine/palette.js';
import { initDeck, drawSlide, enterK, stagger, hexA } from './deck.js';

let FEATURES = null;
let LYRICS = [];
let DECK = { slides: [] };

export async function loadData() {
  const [f, l, d] = await Promise.all([
    fetch('data/features.json').then((r) => r.json()),
    fetch('data/lyrics.json').then((r) => r.json()),
    fetch('data/deck.json').then((r) => r.json()).catch(() => ({ slides: [] })),
  ]);
  FEATURES = f;
  LYRICS = l.lines || l;
  DECK = d;
  return { features: f, lines: LYRICS, deck: DECK };
}

export function setData(features, lines, deck) {
  FEATURES = features;
  LYRICS = lines;
  if (deck) DECK = deck;
}

/** The pages, in order. */
export const slides = () => DECK.slides || [];
export const deckInfo = () => DECK;
export { initDeck };

/** Seconds of beat n (0 = the first beat of the grid). */
export function beat(n) {
  const g = FEATURES.grid;
  return g.beat0 + n * (60 / g.bpm);
}

/** Seconds of bar n (4/4). */
export function bar(n) {
  return beat(n * 4);
}

/** Seconds per beat. Every entrance and every transition is measured in these. */
export const spb = () => 60 / FEATURES.grid.bpm;

/** How many beats since the last beat line (0 at the beat, 1 just before the next). */
export function beatPhase(tv) {
  const p = spb();
  return (((tv - FEATURES.grid.beat0) % p) + p) % p / p;
}

/** The lyric line being sung at t, or null. Lines carry {t, dur, text}. */
export function lineAt(t) {
  for (let i = 0; i < LYRICS.length; i++) {
    const l = LYRICS[i];
    if (t >= l.t && t < l.t + (l.dur || 2)) return l;
  }
  return null;
}

export function lineIndexAt(t) {
  for (let i = 0; i < LYRICS.length; i++) {
    const l = LYRICS[i];
    if (t >= l.t && t < l.t + (l.dur || 2)) return i;
  }
  return -1;
}

// ---- easing -----------------------------------------------------------------
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeIn = (x) => Math.pow(clamp01(x), 3);
export const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const span = (t, a, b) => clamp01((t - a) / (b - a));
export const smooth = (x) => x * x * (3 - 2 * clamp01(x));
export const easeBack = (x) => {
  const c = 1.70158, k = clamp01(x);
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};
export const pulse = (since, decay = 6) => (since < 0 ? 0 : Math.exp(-decay * since));
export const lerp = (a, b, k) => a + (b - a) * k;

// ---- camera -----------------------------------------------------------------
// A deck that never moves is a slideshow with music under it. The camera is the cheapest thing
// that makes the same page read as a shot: it settles on entry, drifts, and breathes on hits.

export function camera(ctx, W, H, { x = 0, y = 0, zoom = 1, rot = 0 } = {}) {
  ctx.translate(W / 2, H / 2);
  if (rot) ctx.rotate(rot);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2 - x, -H / 2 - y);
}

export function lerpCam(a, b, k) {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), zoom: lerp(a.zoom, b.zoom, k), rot: lerp(a.rot || 0, b.rot || 0, k) };
}

// ---- themes ------------------------------------------------------------------
// config.json -> palettes holds the deck THEMES (dark-tech / warm-paper / clean-white /
// cyber-red / gradient-dark ...). One theme per page, chosen by what the page is for — colour is
// a state, entered by an event in the song, never redecorated per page.

let PALETTES = null;
let THEMES = [];

const rgbHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Turn one palette into the colour roles src/deck.js draws with. */
function themeOf(p, name, vig) {
  return {
    name,
    bg: rgbHex(p.bg), plate: rgbHex(p.panel), raised: rgbHex(p.raised), line: rgbHex(p.line),
    paper: rgbHex(p.raised),
    ink: rgbHex(p.text), sub: rgbHex(p.sub), mute: rgbHex(p.mute),
    accent: rgbHex(p.me), accentHot: rgbHex(p.meHot), accentDim: rgbHex(p.meDim),
    err: rgbHex(p.err), glow: rgbHex(p.bloom),
    vig,
  };
}

/** Vignette per page: the last page opens up, the first one is still closed in. */
const VIG = [0.62, 0.55, 0.48, 0.42, 0.34, 0.30];

/** Build the themes from config.json -> palettes. Call once, before the first frame. */
export function initPalettes(defs) {
  PALETTES = buildPalettes(defs);
  THEMES = Object.keys(PALETTES).map((name, i) => themeOf(PALETTES[name], name, VIG[Math.min(i, VIG.length - 1)]));
  return PALETTES;
}
export const palettes = () => PALETTES;
export const themes = () => THEMES;

/** The theme for page i: the page names one, or it falls through by index. */
export const themeOfIndex = (i) => {
  const s = slides()[i] || {};
  const byName = THEMES.find((t) => t.name === s.theme);
  return byName || THEMES[Math.min(i, THEMES.length - 1)] || null;
};

// ---- the page clock -----------------------------------------------------------

/** [a, b) in seconds for page i. Page starts are BARS, not seconds. */
export function slideBounds(i) {
  const S = slides();
  const a = i === 0 ? 0 : bar(S[i].atBar ?? i * 2);
  const b = i + 1 < S.length ? bar(S[i + 1].atBar ?? (i + 1) * 2) : (FEATURES.duration || 30);
  return { a, b };
}

export function slideIndexAt(tv) {
  const S = slides();
  for (let i = S.length - 1; i >= 0; i--) if (tv >= slideBounds(i).a) return i;
  return 0;
}

export const slideOf = (i) => ({ index: i, state: (slides()[i] || {}).theme || `page${i}`, bounds: slideBounds(i) });

/** How each page is entered. Chosen for what the music does at the turn, not for variety. */
const enterOf = (i) => (slides()[i] || {}).enter || 'cut';
/** A transition is a fraction of a beat, never a typed 0.38 that ignores tempo. */
const transSec = () => Math.min(0.42, spb() * 0.85);

// ---- the hit ------------------------------------------------------------------
// One element per page may be marked "hit": the moment the page is actually about. Its landing
// drives the bloom, the rays and the aberration, so the one thing that matters is also the one
// moment the lens reacts.

function pageFlare(tv, i, B) {
  const blocks = stagger(slides()[i]?.blocks || [], slides()[i]?.enterBeats ?? 4);
  const u = (tv - B.a) / spb();
  let f = 0;
  for (const b of blocks) {
    if (!b.hit) continue;
    const d = u - (b.at + b.dur * 0.6);                 // beats from the landing
    f = Math.max(f, d < 0 ? Math.exp(d * 2.4) : Math.exp(-d * 1.7));
  }
  return Math.min(1, f);
}

// ---- drawing -------------------------------------------------------------------

let STAGE = null;
export function attachStage(stage) { STAGE = stage; return stage; }

/** The camera for page i: settles on entry, drifts slowly, and pushes in on the hit. */
function camFor(i, tv, B, W, H) {
  const p = span(tv, B.a, B.b);
  const settle = easeOut(span(tv, B.a, B.a + transSec() * 2.5));
  const fl = pageFlare(tv, i, B);
  const drift = (DECK.camera ?? {}).drift ?? 1;
  return {
    x: Math.sin(tv * 0.21) * W * 0.0045 * drift,
    y: Math.cos(tv * 0.17) * H * 0.0045 * drift,
    zoom: 1.038 - 0.038 * settle + 0.007 * fl + 0.006 * p,
    rot: 0,
  };
}

/** One page, complete: backdrop, the page itself, and the light in front of it. */
function drawScene(ctx, W, H, tv, i) {
  const B = slideBounds(i);
  const slide = slides()[i] || {};
  const th = themeOfIndex(i);
  const cam = camFor(i, tv, B, W, H);
  const flare = pageFlare(tv, i, B);

  ctx.save();

  // 1. the backdrop: the light in the room the deck is projected into. Flat colour without a stage.
  if (STAGE) ctx.drawImage(STAGE.update(tv, slideOf(i), th).back(cam), 0, 0, W, H);
  else { ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H); }

  // 2. the page itself, under the camera
  ctx.save();
  camera(ctx, W, H, cam);
  drawSlide(ctx, W, H, slide, th, {
    u: (tv - B.a) / spb(),
    p: span(tv, B.a, B.b),
    index: i,
    total: slides().length,
    flare,
  });
  ctx.restore();

  // 3. and the light in front of it — dust in the beam, so the page is IN the room
  if (STAGE) ctx.drawImage(STAGE.frontLayer(cam), 0, 0, W, H);

  ctx.restore();
}

/** Draw one frame. Replace the body with the film; keep the contract. */
export function renderFrame(t, ctx, W, H, offset = 0) {
  const tv = t - offset;
  ctx.save();
  ctx.clearRect(0, 0, W, H);

  const i = slideIndexAt(tv);
  const B = slideBounds(i);

  if (i > 0 && tv < B.a + transSec()) {
    const k = span(tv, B.a, B.a + transSec());
    const pB = slideBounds(i - 1);
    const tFrozen = pB.b - 1 / 60;                  // the previous page, held at its last frame
    switch (enterOf(i)) {
      case 'flash':
        // the flash is raised in postState() and added by the WebGL pass, tinted by the theme
        drawScene(ctx, W, H, tv, i);
        break;
      case 'push': {
        ctx.save(); ctx.translate(0, -H * easeInOut(k)); drawScene(ctx, W, H, tFrozen, i - 1); ctx.restore();
        ctx.save(); ctx.translate(0, H * (1 - easeInOut(k))); drawScene(ctx, W, H, tv, i); ctx.restore();
        break;
      }
      case 'wipe': {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, W * easeInOut(k), H); ctx.clip();
        drawScene(ctx, W, H, tv, i);
        ctx.restore();
        ctx.save();
        ctx.beginPath(); ctx.rect(W * easeInOut(k), 0, W, H); ctx.clip();
        drawScene(ctx, W, H, tFrozen, i - 1);
        ctx.restore();
        ctx.strokeStyle = hexA(themeOfIndex(i).accent, 0.55 * (1 - k * 0.4));
        ctx.lineWidth = Math.max(1.5, W * 0.0022);
        ctx.beginPath(); ctx.moveTo(W * easeInOut(k), 0); ctx.lineTo(W * easeInOut(k), H); ctx.stroke();
        break;
      }
      case 'flip': {
        // a page turning: the outgoing one foreshortens about the spine, the new one is under it
        const s = Math.max(0.001, Math.cos(k * Math.PI / 2));
        ctx.save();
        ctx.translate(W * 0.5, H * 0.5); ctx.scale(1, s); ctx.translate(-W * 0.5, -H * 0.5);
        drawScene(ctx, W, H, tFrozen, i - 1);
        ctx.restore();
        if (k > 0.5) drawScene(ctx, W, H, tv, i);
        break;
      }
      default:
        drawScene(ctx, W, H, tv, i);
    }
  } else {
    drawScene(ctx, W, H, tv, i);
  }

  ctx.restore();
}

// ---- what the WebGL pass is told ------------------------------------------------
// One pure function of film time: the per-frame effect bag (fx) and the theme-derived look the
// post chain reads. Kept here, next to the pages, because a page turn and a hit are events in
// the song — not settings on a shader.
export function postState(tv) {
  const i = slideIndexAt(tv);
  const B = slideBounds(i);
  const th = themeOfIndex(i);
  const p = PALETTES[themeOfIndex(i).name] || PALETTES[Object.keys(PALETTES)[0]];
  const flare = pageFlare(tv, i, B);
  const prog = span(tv, B.a, B.b);
  const into = i > 0 ? span(tv, B.a, B.a + transSec()) : 1;      // 1 = the transition is over
  const turning = i > 0 && into < 1;

  const fx = {
    hud: 0,
    // how much of the film's light blooms: rises through the deck, spikes on the hit
    glow: 0.55 + 0.20 * (i / Math.max(1, slides().length - 1)) + 0.75 * flare,
    flash: i > 0 && enterOf(i) === 'flash' ? Math.pow(1 - into, 2) * 0.9 : 0,
    zoom: 1, rot: 0, shake: [0, 0],
    aberration: 0.0008 + 0.0016 * flare + (turning ? 0.0022 * (1 - into) : 0),
    rgbSplit: 0,
    glitch: 0, mosh: 0, mosaic: 0, invert: 0, desat: 0,
    scan: 1,
    vignette: th.vig,
    bright: 1.0,
    rays: flare > 0.01 ? 2.0 * flare : 0,
    raysAt: [960, 540],
    streak: 0.30 * flare,
    // No zoom-blur on a page turn. Radial smearing of a FLAT page (unlike of a filmed scene) beats
    // against the scanlines and the result reads as moiré, not as motion — the translate already
    // says "push". Keep this at 0 unless the page has depth to smear.
    zoomBlur: 0,
    zoomAt: [960, 540],
    bloomAll: 0.30 + 0.22 * prog + 0.60 * flare,
    bloomThreshold: 0.44,
  };

  const look = {
    tint: p.bloom.map((v) => v / 255),
    flashCol: p.bloom.map((v) => v / 255),
    moshCol: p.me.map((v) => v / 255),
    glow: p.glow,
    bg: p.bg.map((v) => v / 255),
  };
  return { fx, look, index: i, state: th.name, flare, beat: (tv - B.a) / spb() };
}

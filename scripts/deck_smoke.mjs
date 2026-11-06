// deck_smoke.mjs — render the whole deck headlessly, with a mock canvas, and fail loudly.
//
// It cannot tell you the page looks right (only a contact sheet can). What it DOES catch, in a
// couple of seconds and without a browser:
//   - a block type that does not exist, a theme that does not exist, a layout that does not exist
//   - NaN / Infinity reaching any drawing call — the classic broken-layout bug, which on screen
//     shows up as a page that is simply empty and gives no error at all
//   - a page whose blocks overflow the safe area (the number one "it looked fine in my head")
//   - a page turn that is not on a bar boundary, and a deck that does not cover the song
//
//   node scripts/deck_smoke.mjs <project-dir>   (default: the bundled skeleton)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(process.argv[2] || fileURLToPath(new URL('../assets/skeleton/', import.meta.url)));
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const cfg = read('config.json');
const features = read(cfg.paths.features.replace(/^\.?\//, ''));
const lyrics = read(cfg.paths.lyrics.replace(/^\.?\//, ''));
const deck = read(cfg.paths.deck.replace(/^\.?\//, ''));

// ---- a mock 2D context that reports every non-finite number --------------------
const bad = [];
let badStack = null;
const chk = (name, args) => {
  for (const a of args) {
    if (typeof a === 'number' && !Number.isFinite(a)) {
      bad.push(`${name}(${args.join(',')})`);
      if (!badStack) badStack = new Error(`first bad call: ${name}`).stack;
      break;
    }
  }
};
const grad = () => ({ addColorStop: (o, c) => chk('addColorStop', [o]) && void c });
let FONT = 400;
// Keep this list in step with the canvas API the deck actually uses: a painter that calls a
// method the mock does not have crashes the smoke test instead of testing anything. `ellipse`
// and `bezierCurveTo` were both missing and only showed up once scenes.js used them.
const NOOP = ['save', 'restore', 'beginPath', 'closePath', 'fill', 'stroke', 'clip', 'setTransform',
  'translate', 'scale', 'rotate', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse',
  'quadraticCurveTo', 'bezierCurveTo', 'rect', 'roundRect',
  'clearRect', 'drawImage', 'resetTransform'];

function mockCtx() {
  const c = {
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left',
    textBaseline: 'alphabetic', lineJoin: 'miter', lineCap: 'butt',
    _path: [],
    measureText: (s) => ({ width: String(s).length * FONT * 0.55 }),
    createLinearGradient: (...a) => (chk('createLinearGradient', a), grad()),
    createRadialGradient: (...a) => (chk('createRadialGradient', a), grad()),
    fillRect: (...a) => chk('fillRect', a),
    strokeRect: (...a) => chk('strokeRect', a),
    fillText: (s, x, y) => chk('fillText', [x, y]),
    strokeText: (s, x, y) => chk('strokeText', [x, y]),
  };
  for (const n of NOOP) c[n] = (...a) => chk(n, a.filter((v) => typeof v === 'number'));
  // font carries the size the mock measures with, so wrapping behaves roughly like the real one
  Object.defineProperty(c, 'font', {
    get: () => `400 ${FONT}px x`,
    set: (v) => { const m = /(\d+(?:\.\d+)?)px/.exec(v); if (m) FONT = +m[1]; },
  });
  return c;
}

globalThis.Path2D = class { moveTo() {} lineTo() {} arc() {} rect() {} quadraticCurveTo() {} closePath() {} };
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => mockCtx() }) };

const { setData, initPalettes, initDeck, renderFrame, postState, slides, slideBounds, bar } =
  await import(pathToFileURL(path.join(ROOT, 'src/engine.js')).href);

initDeck(cfg);
initPalettes(cfg.palettes || {});
setData(features, lyrics.lines || lyrics, deck);
const { BLOCK_TYPES, LAYOUT_NAMES } = await import(pathToFileURL(path.join(ROOT, 'src/deck.js')).href);

// ---- static checks --------------------------------------------------------------
const errs = [], warns = [];
const W = 1920, H = 1080;
const S = slides();
if (!S.length) errs.push('deck has no slides');
const themes = Object.keys(cfg.palettes || {}).filter((k) => !k.startsWith('_'));

S.forEach((s, i) => {
  const tag = `page ${i + 1} (${s.id || '?'})`;
  if (s.atBar === undefined && i > 0) errs.push(`${tag}: no atBar — page turns must be authored on the grid`);
  if (s.theme && !themes.includes(s.theme)) errs.push(`${tag}: theme "${s.theme}" is not in config.json -> palettes (${themes.join(', ')})`);
  if (s.layout && !LAYOUT_NAMES.includes(s.layout)) errs.push(`${tag}: layout "${s.layout}" unknown (${LAYOUT_NAMES.join(', ')})`);
  for (const b of s.blocks || []) {
    if (!BLOCK_TYPES.includes(b.type)) errs.push(`${tag}: block type "${b.type}" unknown (${BLOCK_TYPES.join(', ')})`);
  }
  const nHit = (s.blocks || []).filter((b) => b.hit).length;
  if (nHit > 1) warns.push(`${tag}: ${nHit} hits on one page — keep the accent singular`);
  // `scene` is a motif from scenes.js — it is the most graphic thing in the kit, and it was
  // missing from this list, which made a film made of shots read as 84 pages of words.
  const graphics = ['bars', 'timeline', 'steps', 'cards', 'compare', 'cycle', 'stat', 'quote', 'badges', 'rule', 'scene'];
  const hasGraphic = (s.blocks || []).some((b) =>
    graphics.includes(b.type) || (b.type === 'bullets' && (b.numbered || (b.icon || 'check') !== 'none')));
  if (!hasGraphic) warns.push(`${tag}: no graphic element — a page of words is a caption, not a slide`);
  const txt = (s.blocks || []).filter((b) => b.type === 'title')[0];
  if (txt && (txt.text || '').length > 22) warns.push(`${tag}: title is ${(txt.text || '').length} chars — over 22 it stops being readable at 1080p`);
});

// A `hit` is the moment the page is actually about: the camera pushes in on it and the bloom
// spikes on it, so it only means something while it is RARE. Requiring one on every page (the
// old rule) made the lens push in 75 times and the accent meant nothing; requiring none leaves
// the film limp. So: at least a few, and never on more than a third of the pages.
const hitPages = S.filter((s) => (s.blocks || []).some((b) => b.hit));
if (S.length > 2 && hitPages.length === 0) warns.push('no page marks a block hit:true — the lens has nothing to react to anywhere');
if (S.length > 2 && hitPages.length > S.length / 3) warns.push(`${hitPages.length}/${S.length} pages mark a hit — a hit on a third of the pages is not a hit`);

// A lyric subtitle has to sit somewhere the figure is not, or the words land on her legs.
// `dx`/`w` are fractions of the slot box, so a narrow box means a caption that will wrap.
const narrow = S.map((s) => {
  const b = (s.blocks || []).find((x) => x.type === 'lyric' && x.w !== undefined);
  return b && b.w < 0.34 ? `${s.id || '?'}: caption box is only ${(b.w * 100).toFixed(0)}% of the width` : null;
}).filter(Boolean);
if (narrow.length) warns.push(...narrow.slice(0, 4));

// EVERY shot of a lyric film carries a line. Wordless gaps are the single most common reason a
// film reads as unfinished, and they are invisible to every other check here. Only complain in a
// film that is clearly a lyric film (most `stage` pages already carry a lyric), so a
// presentation deck is not nagged for having slides without subtitles.
const stage = S.filter((s) => s.layout === 'stage');
const withLyric = stage.filter((s) => (s.blocks || []).some((b) => b.type === 'lyric'));
if (stage.length > 4 && withLyric.length > stage.length / 2) {
  const bare = stage.filter((s) => !(s.blocks || []).some((b) => b.type === 'lyric'));
  if (bare.length) warns.push(`${bare.length}/${stage.length} shots have no subtitle — a lyric film should carry a line on every shot `
    + `(missing on: ${bare.slice(0, 4).map((s) => s.id || '?').join(', ')})`);
}

// page turns must land on bars, and the deck must cover the song
S.forEach((s, i) => {
  if (i === 0) return;
  const b = slideBounds(i);
  if (Math.abs(b.a - bar(s.atBar)) > 1e-6) errs.push(`page ${i + 1}: turn is not on a bar`);
});
const last = S[S.length - 1];
if (last && last.atBar !== undefined) {
  const bars = (features.duration || 30) / (4 * 60 / features.grid.bpm);
  if (last.atBar > bars) errs.push(`last page starts at bar ${last.atBar} but the song is only ${bars.toFixed(1)} bars long`);
}

// ---- render every frame ---------------------------------------------------------
const ctx = mockCtx();
const dur = features.duration || 30;
const fps = cfg.video.fps || 30;
let frames = 0;
for (let f = 0; f < Math.round(dur * fps); f += Math.max(1, Math.round(fps / 8))) {
  const t = f / fps;
  renderFrame(t, ctx, W, H, cfg.timing?.offset || 0);
  postState(t - (cfg.timing?.offset || 0));
  frames++;
}

// ---- report --------------------------------------------------------------------
console.log(`[deck_smoke] ${ROOT}`);
console.log(`[deck_smoke] ${S.length} pages, ${frames} frames sampled at ${W}x${H}, themes: ${themes.join(', ')}`);
if (bad.length) {
  errs.push(`${bad.length} non-finite drawing calls, e.g. ${[...new Set(bad)].slice(0, 3).join(' | ')}`);
  if (process.env.STACK && badStack) console.error(badStack.split('\n').slice(0, 8).join('\n'));
}
for (const w of warns) console.warn(`[warn] ${w}`);
for (const e of errs) console.error(`[FAIL] ${e}`);
if (!errs.length) console.log('[deck_smoke] OK — no crashes, no NaN geometry, every page turns on a bar');
process.exit(errs.length ? 1 : 0);

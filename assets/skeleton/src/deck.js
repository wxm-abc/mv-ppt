// deck.js — the slide layout engine.
//
// A deck (data/deck.json) is DECLARATIVE: it says what is on each page, not how to draw it.
// This file is the "slide master": grids, type scale, slots, entrances, graphic primitives.
//
// It is still a pure function of (slide, beats since the page turned). No wall clock, no
// Math.random(), no state carried between frames — so `deck_check.mjs` can render page 4 at
// beat 3 without ever having drawn pages 1-3, and the exporter can render frame 6000 alone.
//
// Everything is expressed as a fraction of W/H, so the same deck renders at 960x540 (preview
// and contact sheets) and 1920x1080 (export) with identical composition.

import { drawScene } from './scenes.js';

const TAU = Math.PI * 2;

// ---- the grid ----------------------------------------------------------------
// 12 columns, generous margins (a slide that breathes reads as designed; one that uses the
// whole frame reads as a screenshot).
export const GRID = { cols: 12, gutter: 0.016, mx: 0.078, my: 0.105 };

/** The safe area: nothing but full-bleed art is allowed outside it. */
export function safe(W, H) {
  return { x: GRID.mx * W, y: GRID.my * H, w: W * (1 - 2 * GRID.mx), h: H * (1 - 2 * GRID.my) };
}

/** Pixel rect of column `i` spanning `n` columns inside box b. */
export function col(b, i, n = 1) {
  const u = (b.w - (GRID.cols - 1) * GRID.gutter * b.w) / GRID.cols;
  return { x: b.x + i * (u + GRID.gutter * b.w), y: b.y, w: u * n + (n - 1) * GRID.gutter * b.w, h: b.h };
}

/** Sub-rect of box b, given as fractions of b. */
export function part(b, x, y, w, h) {
  return { x: b.x + x * b.w, y: b.y + y * b.h, w: w * b.w, h: h * b.h };
}

// ---- type scale ---------------------------------------------------------------
// Six roles, sized in fractions of H so the hierarchy survives any resolution.
// A slide with fewer than three of these in play looks like a poster, not a slide.
const SCALE = { kicker: 0.028, title: 0.082, sub: 0.040, body: 0.030, caption: 0.022, stat: 0.155 };

let FONTS = { mono: 'ui-monospace', serif: 'Georgia', sans: 'system-ui' };

/**
 * Bind the three type roles from config.json -> fonts. Call once, before the first frame.
 *
 * The bundled faces are Latin only, so every role ends with a CJK chain (config.json -> fonts.cjk).
 * WITHOUT IT, a Chinese kicker falls back to whatever the browser picks, and a dense character at
 * 30px turns into a black blob — 翻 and 暖 do, 风 and 远 do not. That is not a font bug; it is a
 * size bug, and the fix is either the fallback chain or a bigger step.
 */
export function initDeck(cfg) {
  const cjk = (cfg?.fonts?.cjk || ['Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC'])
    .map((f) => `"${f}"`).join(', ');
  const tail = cjk ? `, ${cjk}, sans-serif` : ', sans-serif';
  FONTS = {
    mono: (cfg?.fonts?.mono?.family || 'ui-monospace, Consolas, monospace') + tail,
    serif: (cfg?.fonts?.serif?.family || 'Georgia, serif') + tail,
    sans: (cfg?.fonts?.sans?.family || 'Inter, system-ui, sans-serif') + tail,
  };
  return FONTS;
}

const px = (frac, H) => Math.max(8, Math.round(frac * H));
/** Font shorthand for a role + step. `step` is a key of SCALE or a plain number of px. */
function font(role, step, H, weight = 400, italic = false) {
  const size = typeof step === 'number' ? step : px(SCALE[step] || SCALE.body, H);
  return `${italic ? 'italic ' : ''}${weight} ${size}px ${FONTS[role]}`;
}

// ---- inline emphasis ----------------------------------------------------------
// PPT slides emphasise with colour, boxes and underlines; a slide that is one flat paragraph
// has no hierarchy. Markup in block text:
//   [[accent]]   accent colour + bold      {{boxed}}   accent plate, inverted text
//   __under__    underline                 **strong**  heavier weight, ink colour
const MARK = /\[\[(.*?)\]\]|\{\{(.*?)\}\}|__(.*?)__|\*\*(.*?)\*\*/g;

function parseRich(s) {
  const out = [];
  let last = 0, m;
  MARK.lastIndex = 0;
  while ((m = MARK.exec(s))) {
    if (m.index > last) out.push({ t: s.slice(last, m.index), m: '' });
    const mark = m[1] !== undefined ? 'accent' : m[2] !== undefined ? 'box' : m[3] !== undefined ? 'under' : 'strong';
    out.push({ t: (m[1] ?? m[2] ?? m[3] ?? m[4]), m: mark });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last), m: '' });
  return out.length ? out : [{ t: s, m: '' }];
}

/**
 * Split rich text into wrappable tokens. CJK breaks per character (there are no spaces to
 * break on); Latin breaks per word. Each token keeps its mark, so emphasis survives wrapping.
 */
function tokenize(ctx, rich, role, step, H, weight) {
  const out = [];
  for (const seg of rich) {
    ctx.font = font(role, step, H, weight);
    const latin = /[A-Za-z0-9'’\-.]+|\s+|./gu;
    for (const w of seg.t.match(latin) || []) out.push({ t: w, m: seg.m, w: ctx.measureText(w).width });
  }
  return out;
}

/** Greedy wrap of tokens into lines no wider than maxW. */
function wrapTokens(tokens, maxW) {
  const lines = [];
  let cur = [], cw = 0;
  for (const tk of tokens) {
    if (tk.t.trim() === '' && cur.length === 0) continue;
    if (cw + tk.w > maxW && cur.length) { lines.push({ toks: cur, w: cw }); cur = []; cw = 0; }
    // a single token wider than the line (one long CJK run, or a long word): let it overflow
    // rather than loop forever — deck_lint.mjs is what should have caught it first
    cur.push(tk); cw += tk.w;
  }
  if (cur.length) lines.push({ toks: cur, w: cw });
  return lines;
}

/** Draw wrapped rich lines. Returns the y of the last baseline + descent. */
function drawLines(ctx, lines, r, H, { align = 'left', lh = 1.35, weight = 400, role = 'sans', step = 'body', pal, track = 0 } = {}) {
  const size = typeof step === 'number' ? step : px(SCALE[step], H);
  const lineH = size * lh;
  let y = r.y + size * 0.92;
  ctx.textBaseline = 'alphabetic';
  for (const line of lines) {
    let x = r.x;
    if (align === 'center') x = r.x + (r.w - (line.w + track * line.toks.length)) / 2;
    if (align === 'right') x = r.x + r.w - (line.w + track * line.toks.length);
    for (const tk of line.toks) {
      const w = ctx.font && ctx.measureText(tk.t).width;
      if (tk.m === 'box') {
        const pad = size * 0.18;
        ctx.fillStyle = pal.accent;
        roundRect(ctx, x - pad, y - size * 0.86, tk.w + pad * 2, size * 1.18, size * 0.12);
        ctx.fill();
        ctx.fillStyle = pal.bg;
      } else if (tk.m === 'accent') ctx.fillStyle = pal.accent;
      else if (tk.m === 'strong') ctx.fillStyle = pal.ink;
      else ctx.fillStyle = pal.ink;
      ctx.font = font(role, step, H, tk.m === 'accent' || tk.m === 'box' || tk.m === 'strong' ? Math.min(900, weight + 300) : weight);
      ctx.fillText(tk.t, x, y);
      if (tk.m === 'under') {
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = Math.max(1, size * 0.055);
        ctx.beginPath();
        ctx.moveTo(x, y + size * 0.16);
        ctx.lineTo(x + tk.w, y + size * 0.16);
        ctx.stroke();
      }
      x += (w ?? tk.w) + track;
    }
    y += lineH;
  }
  return y - lineH + size * 0.3;
}

/** Paragraph height of text before it is drawn, so a slot can be filled top-down or centred. */
export function textHeight(ctx, text, r, H, { lh = 1.35, step = 'body', role = 'sans', weight = 400 } = {}) {
  const toks = tokenize(ctx, parseRich(text), role, step, H, weight);
  const lines = wrapTokens(toks, r.w);
  const size = typeof step === 'number' ? step : px(SCALE[step], H);
  return { h: lines.length * size * lh, lines, size };
}

// ---- entrances ----------------------------------------------------------------
// PPT's "elements fade in one after another" is the whole reason a slide reads as designed.
// Here the stagger is measured in BEATS, not milliseconds, so the sequence lands on the grid.

/** Default length of one element's entrance, in beats. */
const ENTER_BEATS = 1.4;

/**
 * Resolve each block's entrance start (in beats from the page turn).
 * Explicit `at` wins; otherwise the blocks share `enterBeats` evenly, back to back.
 */
export function stagger(blocks, enterBeats = 4) {
  const n = blocks.length;
  const d = Math.min(ENTER_BEATS, Math.max(0.6, enterBeats / Math.max(1, n)));
  const stride = n > 1 ? Math.max(d * 0.55, (enterBeats - d) / (n - 1)) : 0;
  return blocks.map((b, i) => ({ ...b, at: b.at ?? +(i * stride).toFixed(3), dur: b.dur ?? +d.toFixed(3) }));
}

/**
 * Entrance progress 0..1 of a block: `u` = beats since the page turned.
 * The block also leaves: `outAt`/`outDur` let a block exit before the page does.
 */
export function enterK(b, u) {
  if (b.outAt !== undefined && u >= b.outAt) {
    return 1 - clamp01((u - b.outAt) / (b.outDur ?? ENTER_BEATS * 0.5));
  }
  return easeOut(clamp01((u - (b.at || 0)) / (b.dur || ENTER_BEATS)));
}

/** The transform an entrance applies, chosen by `from`. */
function entrance(ctx, b, k, H) {
  const e = easeOut(clamp01(k));
  // A full-bleed motif must not slide: moving it leaves a bare edge at the frame.
  const from = b.from || (b.type === 'scene' ? 'none' : 'up');
  if (from === 'none') return 1;
  if (from === 'scale') {
    const s = 0.9 + 0.1 * e;
    ctx.translate(b._cx, b._cy); ctx.scale(s, s); ctx.translate(-b._cx, -b._cy);
  } else if (from === 'left' || from === 'right') {
    ctx.translate((1 - e) * H * 0.06 * (from === 'left' ? -1 : 1), 0);
  } else {
    ctx.translate(0, (1 - e) * H * 0.045);
  }
  return e;
}

// ---- slots --------------------------------------------------------------------
// A layout is a set of named boxes. Blocks are assigned to a slot by their `slot` field, or
// by what they are: titles go to the head, graphics to the main area, page numbers to the foot.
const LAYOUTS = {
  cover:    { head: [0, 0.14, 1, 0.50], main: [0, 0.66, 1, 0.22], foot: [0, 0.92, 1, 0.08] },
  headline: { head: [0, 0.00, 1, 0.30], main: [0, 0.34, 1, 0.58], foot: [0, 0.94, 1, 0.06] },
  split:    { head: [0, 0.00, 1, 0.24], main: [0, 0.28, 0.47, 0.66], side: [0.53, 0.28, 0.47, 0.66], foot: [0, 0.96, 1, 0.04] },
  bullets:  { head: [0, 0.02, 0.44, 0.88], main: [0.48, 0.06, 0.52, 0.82], foot: [0, 0.94, 1, 0.06] },
  cards:    { head: [0, 0.00, 1, 0.26], main: [0, 0.30, 1, 0.62], foot: [0, 0.96, 1, 0.04] },
  chart:    { head: [0, 0.00, 1, 0.26], main: [0, 0.30, 1, 0.60], foot: [0, 0.94, 1, 0.06] },
  compare:  { head: [0, 0.00, 1, 0.26], main: [0, 0.30, 1, 0.60], foot: [0, 0.94, 1, 0.06] },
  quote:    { head: [0.06, 0.08, 0.88, 0.18], main: [0.06, 0.32, 0.88, 0.48], foot: [0, 0.92, 1, 0.08] },
  full:     { head: [0, 0.00, 1, 0.20], main: [0, 0.22, 1, 0.72], foot: [0, 0.96, 1, 0.04] },
  // `stage`: the MV layout. The motif is full-bleed art, the lyric sits over it near the
  // bottom like a subtitle, and there is no footer furniture at all.
  // `top` exists for the two-shots: when she has someone standing next to her the line goes
  // where the frame is empty, instead of on top of both bodies.
  stage:    { main: [0, 0.00, 1, 1.00], head: [0.06, 0.735, 0.88, 0.16],
              top: [0.06, 0.070, 0.88, 0.16], foot: [0, 0.94, 1, 0.06] },
};

const HEAD_TYPES = new Set(['kicker', 'title', 'sub']);
const FOOT_TYPES = new Set(['pagenum', 'progress', 'footnote']);

/** Slots of `layout`, as pixel rects inside the safe area. */
export function slots(W, H, layout) {
  const s = safe(W, H);
  const def = LAYOUTS[layout] || LAYOUTS.headline;
  const out = {};
  for (const [k, f] of Object.entries(def)) out[k] = part(s, f[0], f[1], f[2], f[3]);
  return out;
}

// ---- graphic primitives --------------------------------------------------------
// Every page carries at least one of these. That is the rule a text-only MV breaks first:
// a page of words is a caption, not a slide.

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Flat icon glyphs, drawn as paths — no image files, no fonts, no network. */
const GLYPHS = {
  bolt: (c, s) => { c.moveTo(0.1 * s, -0.5 * s); c.lineTo(0.42 * s, -0.06 * s); c.lineTo(0.26 * s, -0.02 * s); c.lineTo(0.58 * s, 0.5 * s); c.lineTo(0.3 * s, 0.02 * s); c.lineTo(0.46 * s, -0.02 * s); c.closePath(); },
  check: (c, s) => { c.moveTo(-0.42 * s, 0.02 * s); c.lineTo(-0.12 * s, 0.34 * s); c.lineTo(0.44 * s, -0.34 * s); },
  shield: (c, s) => { c.moveTo(0, -0.48 * s); c.lineTo(0.42 * s, -0.26 * s); c.lineTo(0.42 * s, 0.12 * s); c.quadraticCurveTo(0.42 * s, 0.42 * s, 0, 0.5 * s); c.quadraticCurveTo(-0.42 * s, 0.42 * s, -0.42 * s, 0.12 * s); c.lineTo(-0.42 * s, -0.26 * s); c.closePath(); },
  arrow: (c, s) => { c.moveTo(-0.46 * s, 0); c.lineTo(0.24 * s, 0); c.moveTo(0.02 * s, -0.26 * s); c.lineTo(0.3 * s, 0); c.lineTo(0.02 * s, 0.26 * s); },
  star: (c, s) => { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = (i % 2 ? 0.2 : 0.5) * s; const m = i ? 'lineTo' : 'moveTo'; c[m](Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); },
  gear: (c, s) => { c.arc(0, 0, 0.28 * s, 0, TAU); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; c.moveTo(Math.cos(a) * 0.36 * s, Math.sin(a) * 0.36 * s); c.lineTo(Math.cos(a) * 0.5 * s, Math.sin(a) * 0.5 * s); } },
  cloud: (c, s) => { c.arc(-0.18 * s, 0.04 * s, 0.2 * s, 0, TAU); c.arc(0.12 * s, -0.06 * s, 0.26 * s, 0, TAU); c.arc(0.34 * s, 0.1 * s, 0.18 * s, 0, TAU); },
  lock: (c, s) => { c.rect(-0.26 * s, -0.04 * s, 0.52 * s, 0.44 * s); c.moveTo(-0.16 * s, -0.04 * s); c.lineTo(-0.16 * s, -0.22 * s); c.arc(0, -0.22 * s, 0.16 * s, Math.PI, 0); c.lineTo(0.16 * s, -0.04 * s); },
  chart: (c, s) => { c.rect(-0.44 * s, 0.02 * s, 0.2 * s, 0.4 * s); c.rect(-0.12 * s, -0.2 * s, 0.2 * s, 0.62 * s); c.rect(0.2 * s, -0.36 * s, 0.2 * s, 0.78 * s); },
  eye: (c, s) => { c.moveTo(-0.48 * s, 0); c.quadraticCurveTo(0, -0.44 * s, 0.48 * s, 0); c.quadraticCurveTo(0, 0.44 * s, -0.48 * s, 0); c.arc(0, 0, 0.14 * s, 0, TAU); },
};

function glyph(ctx, name, x, y, size, color, lw) {
  const p = new Path2D();
  (GLYPHS[name] || GLYPHS.star)(p, size);
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.stroke(p);
  ctx.restore();
}

// ---- block renderers -----------------------------------------------------------
// Each takes (ctx, b, r, H, pal, k) where k is the entrance progress, and returns the height used.

const R = {};

R.kicker = (ctx, b, r, H, pal, k) => {
  const size = px(SCALE.kicker, H);
  ctx.font = font('mono', 'kicker', H, 700);
  ctx.fillStyle = pal.accent;
  ctx.textBaseline = 'alphabetic';
  let x = r.x, y = r.y + size;
  if (b.bar) {                                    // a short accent rule before the kicker
    ctx.fillRect(r.x, y - size * 0.34, H * 0.052, Math.max(2, size * 0.08));
    x += H * 0.052 + size * 0.5;
  }
  for (const ch of (b.text || '')) {              // tracked out by hand: letter-spacing is the
    ctx.fillText(ch, x, y);                       // cheapest thing that says "this is a label"
    x += ctx.measureText(ch).width + size * 0.16;
  }
  return size * 1.9;
};

R.title = (ctx, b, r, H, pal, k) => {
  const m = textHeight(ctx, b.text || '', r, H, { step: 'title', lh: 1.16, weight: 800 });
  let y = r.y;
  if (b.valign === 'middle') y = r.y + Math.max(0, (r.h - m.h) / 2);
  if (b.valign === 'bottom') y = r.y + Math.max(0, r.h - m.h);
  drawLines(ctx, m.lines, { x: r.x, y, w: r.w }, H, { step: 'title', lh: 1.16, weight: 800, pal, align: b.align || 'left' });
  return m.h + px(SCALE.title, H) * 0.28;
};

// The MV subtitle: one line of the song over the image. Centred, larger than a slide caption,
// and sitting on a soft scrim so it holds over any motif. The scrim is the THEME background,
// not a fixed black — it darkens a light page and lightens a dark one, which is the only way
// one block can stay readable across five themes.
R.lyric = (ctx, b, r, H, pal, k) => {
  const size = px(SCALE.sub * (b.scale || 1.3), H);
  const m = textHeight(ctx, b.text || '', r, H, { step: size, lh: 1.32, weight: 700 });
  const g = ctx.createLinearGradient(0, r.y - H * 0.08, 0, r.y + r.h + H * 0.06);
  g.addColorStop(0, hexA(pal.bg, 0));
  g.addColorStop(0.45, hexA(pal.bg, 0.72));
  g.addColorStop(1, hexA(pal.bg, 0));
  ctx.fillStyle = g;
  ctx.fillRect(r.x - r.w * 0.25, r.y - H * 0.08, r.w * 1.5, r.h + H * 0.14);
  // a short accent rule, so the line reads as a subtitle and not as a floated caption.
  // It is anchored to the TEXT, not to the box: `r.h` is the measured height of the block, so
  // `r.y + r.h * 0.06` landed on the first line's cap height when the lyric sat in `head`, and
  // floated alone in the middle of the page when it sat in `top`. Below the last line is the
  // only placement that is correct in every slot.
  const ruleY = r.y + size * 0.92 + (m.lines.length - 1) * size * 1.32 + size * 0.34;
  ctx.fillStyle = hexA(pal.accent, 0.85);
  ctx.fillRect(r.x + r.w / 2 - r.w * 0.022, ruleY, r.w * 0.044, Math.max(1.5, H * 0.0022));
  drawLines(ctx, m.lines, r, H, { step: size, lh: 1.32, weight: 700, pal, align: 'center' });
  return m.h + px(size, H) * 0.34;
};

R.sub = (ctx, b, r, H, pal, k) => {
  const m = textHeight(ctx, b.text || '', r, H, { step: 'sub', lh: 1.34, weight: 600 });
  ctx.globalAlpha *= 0.92;
  drawLines(ctx, m.lines, r, H, { step: 'sub', lh: 1.34, weight: 600, pal, align: b.align || 'left' });
  ctx.globalAlpha /= 0.92;
  return m.h + px(SCALE.sub, H) * 0.3;
};

R.body = (ctx, b, r, H, pal, k) => {
  const m = textHeight(ctx, b.text || '', r, H, { step: 'body', lh: b.lh || 1.55, weight: 400 });
  ctx.fillStyle = pal.sub;
  drawLines(ctx, m.lines, r, H, { step: 'body', lh: b.lh || 1.55, weight: 400, pal, align: b.align || 'left' });
  return m.h + px(SCALE.body, H) * 0.4;
};

R.bullets = (ctx, b, r, H, pal, k) => {
  const size = px(b.size || SCALE.body, H);
  const lh = size * (b.lh || 1.62);
  const items = b.items || [];
  const pad = size * 1.9;
  let y = r.y + size * 0.9;
  const grow = b.reveal === false ? 1 : k;         // items can arrive one by one, or all at once
  for (let i = 0; i < items.length; i++) {
    const ki = b.reveal === false ? k : easeOut(clamp01(k * (items.length + 0.6) - i * 0.75));
    if (ki <= 0.001) { y += lh; continue; }
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * ki;
    ctx.translate(0, (1 - ki) * H * 0.02);
    const it = items[i];
    const text = typeof it === 'string' ? it : it.text;
    const icon = (typeof it === 'object' && it.icon) || b.icon || 'check';
    if (b.numbered) {
      ctx.font = font('mono', size * 0.82, H, 800);
      ctx.fillStyle = pal.accent;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(i + 1).padStart(2, '0'), r.x, y);
    } else if (icon !== 'none') {
      glyph(ctx, icon, r.x + size * 0.28, y - size * 0.28, size * 0.72, pal.accent, Math.max(1.4, size * 0.075));
    }
    const m = textHeight(ctx, text, { x: r.x + pad, y, w: r.w - pad }, H, { step: size, lh: b.lh || 1.62, weight: 500 });
    drawLines(ctx, m.lines, { x: r.x + pad, y: y - size * 0.9, w: r.w - pad }, H, { step: size, lh: b.lh || 1.62, weight: 500, pal });
    y += Math.max(lh, m.h + size * 0.42);
    ctx.restore();
  }
  return y - r.y;
};

R.badges = (ctx, b, r, H, pal, k) => {
  const size = px(SCALE.caption, H) * (b.scale || 1.1);
  ctx.font = font('sans', size, H, 700);
  ctx.textBaseline = 'middle';
  let x = r.x, y = r.y + size * 0.9, used = 0;
  for (const t of b.items || []) {
    const w = ctx.measureText(t).width + size * 1.3;
    if (x + w > r.x + r.w && x > r.x) { x = r.x; y += size * 2.0; }
    ctx.fillStyle = hexA(pal.accent, 0.16);
    roundRect(ctx, x, y - size * 0.95, w, size * 1.9, size * 0.95); ctx.fill();
    ctx.strokeStyle = hexA(pal.accent, 0.45); ctx.lineWidth = Math.max(1, size * 0.06);
    roundRect(ctx, x, y - size * 0.95, w, size * 1.9, size * 0.95); ctx.stroke();
    ctx.fillStyle = pal.accent;
    ctx.fillText(t, x + size * 0.65, y);
    x += w + size * 0.5;
    used = y + size * 1.2 - r.y;
  }
  return used;
};

// A motif from src/scenes.js: a picture, not a diagram. This is what makes a page read as a
// SHOT rather than as a slide — the lyric's idea drawn as vectors and animated by the beat.
// Params in `b` are passed straight through to the painter (b.motif picks which one).
R.scene = (ctx, b, r, H, pal, k, env) => drawScene(ctx, b, r, H, pal, k, env || {});

R.rule = (ctx, b, r, H, pal, k) => {
  const y = r.y + (b.h || 0) * 0.5;
  const w = (b.w || 1) * r.w;
  const g = ctx.createLinearGradient(r.x, 0, r.x + w, 0);
  g.addColorStop(0, hexA(pal.accent, 0));
  g.addColorStop(0.18, hexA(pal.accent, 0.85));
  g.addColorStop(1, hexA(pal.accent, 0));
  ctx.fillStyle = g;
  ctx.fillRect(r.x, y, w * k, Math.max(1.5, H * 0.0022));
  return b.h || px(SCALE.body, H) * 0.9;
};

R.stat = (ctx, b, r, H, pal, k) => {
  const size = px(SCALE.stat * (b.scale || 1), H);
  ctx.textBaseline = 'alphabetic';
  ctx.font = font('sans', size, H, 800);
  ctx.fillStyle = pal.ink;
  const value = b.count !== undefined ? (b.count * k).toFixed(b.decimals ?? 0) : (b.value ?? '');
  ctx.fillText(value + (b.unit || ''), r.x, r.y + size * 0.86);
  let y = r.y + size * 1.06;
  if (b.delta) {
    const ds = px(SCALE.body, H);
    ctx.font = font('mono', ds, H, 700);
    ctx.fillStyle = b.delta.startsWith('-') ? pal.err : pal.accent;
    ctx.fillText(b.delta, r.x, y + ds);
    y += ds * 1.5;
  }
  if (b.label) {
    const ls = px(SCALE.caption * 1.35, H);
    ctx.font = font('sans', ls, H, 600);
    ctx.fillStyle = pal.sub;
    ctx.fillText(b.label, r.x, y + ls);
    y += ls * 1.3;
  }
  return y - r.y;
};

R.quote = (ctx, b, r, H, pal, k) => {
  const size = px(SCALE.sub * (b.scale || 1.05), H);
  ctx.textBaseline = 'alphabetic';
  ctx.font = font('serif', size * 2.6, H, 900);
  ctx.fillStyle = hexA(pal.accent, 0.30);
  ctx.fillText('“', r.x, r.y + size * 1.15);
  const m = textHeight(ctx, b.text || '', { x: r.x + size * 1.5, y: 0, w: r.w - size * 1.5 }, H,
    { step: size, lh: 1.5, role: 'serif', weight: 400 });
  drawLines(ctx, m.lines, { x: r.x + size * 1.5, y: r.y + size * 0.1, w: r.w - size * 1.5 }, H,
    { step: size, lh: 1.5, role: 'serif', weight: 400, pal, align: b.align || 'left' });
  let y = r.y + m.h + size * 0.9;
  if (b.by) {
    const as = px(SCALE.caption * 1.25, H);
    ctx.font = font('sans', as, H, 600);
    ctx.fillStyle = pal.sub;
    ctx.fillText('— ' + b.by, r.x + size * 1.5, y);
    y += as * 1.4;
  }
  return y - r.y;
};

R.bars = (ctx, b, r, H, pal, k) => {
  const items = b.items || [];
  const size = px(SCALE.caption * 1.25, H);
  const rowH = Math.min(r.h / Math.max(1, items.length), size * 3.0);
  const max = b.max ?? Math.max(...items.map((i) => i.value), 1);
  const labelW = b.labelW || 0.30;
  let y = r.y;
  for (let i = 0; i < items.length; i++) {
    const ki = easeOut(clamp01(k * (items.length + 0.8) - i * 0.8));
    const it = items[i];
    const cy = y + rowH * 0.5;
    ctx.font = font('sans', size, H, 600);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.sub;
    ctx.fillText(it.label || '', r.x, cy);
    const bx = r.x + r.w * labelW, bw = r.w * (1 - labelW) - size * 2.6;
    ctx.fillStyle = hexA(pal.line, 0.55);
    roundRect(ctx, bx, cy - rowH * 0.17, bw, rowH * 0.34, rowH * 0.17); ctx.fill();
    const g = ctx.createLinearGradient(bx, 0, bx + bw * Math.max(0.02, (it.value / max) * ki), 0);
    g.addColorStop(0, pal.accentDim); g.addColorStop(1, pal.accent);
    ctx.fillStyle = g;
    roundRect(ctx, bx, cy - rowH * 0.17, Math.max(rowH * 0.34, bw * (it.value / max) * ki), rowH * 0.34, rowH * 0.17); ctx.fill();
    ctx.font = font('mono', size * 0.95, H, 700);
    ctx.fillStyle = pal.ink;
    ctx.fillText((b.fmt ? b.fmt(it.value) : String(it.value)) + (b.unit || ''), bx + bw + size * 0.6, cy);
    y += rowH;
  }
  return y - r.y;
};

R.timeline = (ctx, b, r, H, pal, k) => {
  const items = b.items || [];
  const size = px(SCALE.caption * 1.2, H);
  const cy = r.y + (b.axis || 0.34) * r.h;
  ctx.strokeStyle = hexA(pal.line, 0.85); ctx.lineWidth = Math.max(1.5, H * 0.0025);
  ctx.beginPath(); ctx.moveTo(r.x, cy); ctx.lineTo(r.x + r.w * k, cy); ctx.stroke();
  const step = items.length > 1 ? r.w / (items.length - 1) : 0;
  for (let i = 0; i < items.length; i++) {
    const ki = easeOut(clamp01(k * (items.length + 1) - i));
    if (ki <= 0.001) continue;
    const x = r.x + step * i, it = items[i];
    ctx.globalAlpha *= ki;
    ctx.beginPath(); ctx.arc(x, cy, size * 0.34, 0, TAU);
    ctx.fillStyle = i === (b.hot ?? items.length - 1) ? pal.accent : pal.bg; ctx.fill();
    ctx.strokeStyle = pal.accent; ctx.lineWidth = Math.max(1.4, size * 0.09); ctx.stroke();
    ctx.font = font('mono', size * 0.92, H, 700); ctx.fillStyle = pal.accent;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = i === 0 ? 'left' : i === items.length - 1 ? 'right' : 'center';
    ctx.fillText(it.label || '', x, cy - size * 1.5);
    if (it.sub) {
      ctx.font = font('sans', size * 0.92, H, 500); ctx.fillStyle = pal.sub;
      const m = textHeight(ctx, it.sub, { x: 0, y: 0, w: r.w / items.length }, H, { step: size * 0.92, lh: 1.3 });
      drawLines(ctx, m.lines, { x: x - (r.w / items.length) * (i === 0 ? 0 : i === items.length - 1 ? 1 : 0.5), y: cy + size * 1.5, w: r.w / items.length }, H,
        { step: size * 0.92, lh: 1.3, weight: 500, pal, align: i === 0 ? 'left' : i === items.length - 1 ? 'right' : 'center' });
    }
    ctx.textAlign = 'left';
    ctx.globalAlpha /= ki;
  }
  return r.h;
};

R.steps = (ctx, b, r, H, pal, k) => {
  const items = b.items || [];
  const gap = H * 0.016;
  const w = (r.w - gap * (items.length - 1)) / Math.max(1, items.length);
  const h = Math.min(r.h, H * 0.17);
  const size = px(SCALE.caption * 1.3, H);
  for (let i = 0; i < items.length; i++) {
    const ki = easeOut(clamp01(k * (items.length + 0.8) - i * 0.8));
    if (ki <= 0.001) continue;
    const x = r.x + i * (w + gap), it = items[i];
    ctx.save(); ctx.globalAlpha *= ki; ctx.translate(0, (1 - ki) * H * 0.02);
    ctx.fillStyle = hexA(pal.raised, 0.92);
    roundRect(ctx, x, r.y, w, h, H * 0.012); ctx.fill();
    ctx.strokeStyle = hexA(pal.line, 0.9); ctx.lineWidth = Math.max(1, H * 0.0016);
    roundRect(ctx, x, r.y, w, h, H * 0.012); ctx.stroke();
    ctx.fillStyle = hexA(pal.accent, 0.22);
    ctx.fillRect(x, r.y, w * 0.014, h);
    ctx.font = font('mono', size * 0.9, H, 800); ctx.fillStyle = pal.accent;
    ctx.textBaseline = 'alphabetic'; ctx.fillText(String(i + 1).padStart(2, '0'), x + size * 0.7, r.y + size * 1.5);
    const m = textHeight(ctx, it.text || it, { x: 0, y: 0, w: w - size * 1.4 }, H, { step: size, lh: 1.35, weight: 600 });
    drawLines(ctx, m.lines, { x: x + size * 0.7, y: r.y + h - m.h - size * 0.5, w: w - size * 1.4 }, H,
      { step: size, lh: 1.35, weight: 600, pal });
    if (i < items.length - 1) glyph(ctx, 'arrow', x + w + gap * 0.5, r.y + h * 0.5, gap * 1.5, hexA(pal.mute, 0.9), Math.max(1.4, H * 0.0022));
    ctx.restore();
  }
  return h;
};

R.cards = (ctx, b, r, H, pal, k) => {
  const items = b.items || [];
  const cols = b.cols || Math.min(items.length, 3);
  const rows = Math.ceil(items.length / cols);
  const gap = H * 0.022;
  const w = (r.w - gap * (cols - 1)) / cols;
  const h = (r.h - gap * (rows - 1)) / rows;
  const size = px(SCALE.caption * 1.25, H);
  for (let i = 0; i < items.length; i++) {
    const ki = easeOut(clamp01(k * (items.length + 1) - i * 0.9));
    if (ki <= 0.001) continue;
    const cx = i % cols, cy = Math.floor(i / cols), it = items[i];
    const x = r.x + cx * (w + gap), y = r.y + cy * (h + gap);
    ctx.save(); ctx.globalAlpha *= ki; ctx.translate(0, (1 - ki) * H * 0.028);
    ctx.fillStyle = hexA(pal.raised, 0.95);
    roundRect(ctx, x, y, w, h, H * 0.014); ctx.fill();
    ctx.strokeStyle = hexA(pal.line, 0.95); ctx.lineWidth = Math.max(1, H * 0.0016);
    roundRect(ctx, x, y, w, h, H * 0.014); ctx.stroke();
    const pad = size * 1.1;
    if (it.icon) glyph(ctx, it.icon, x + pad + size * 0.42, y + pad + size * 0.42, size * 0.85, pal.accent, Math.max(1.5, size * 0.075));
    let ty = y + pad + (it.icon ? size * 1.5 : size * 0.5);
    const tm = textHeight(ctx, it.title || '', { x: 0, y: 0, w: w - pad * 2 }, H, { step: size * 1.25, lh: 1.25, weight: 700 });
    drawLines(ctx, tm.lines, { x: x + pad, y: ty, w: w - pad * 2 }, H, { step: size * 1.25, lh: 1.25, weight: 700, pal });
    ty += tm.h + size * 0.55;
    const bm = textHeight(ctx, it.text || '', { x: 0, y: 0, w: w - pad * 2 }, H, { step: size, lh: 1.45, weight: 400 });
    ctx.fillStyle = pal.sub;
    drawLines(ctx, bm.lines, { x: x + pad, y: ty, w: w - pad * 2 }, H, { step: size, lh: 1.45, weight: 400, pal });
    ctx.restore();
  }
  return r.h;
};

R.compare = (ctx, b, r, H, pal, k) => {
  const gap = H * 0.03;
  const w = (r.w - gap) / 2;
  const size = px(SCALE.caption * 1.25, H);
  ['left', 'right'].forEach((side, s) => {
    const it = b[side]; if (!it) return;
    const x = r.x + s * (w + gap);
    const ki = easeOut(clamp01(k * 2.6 - s * 0.9));
    ctx.save(); ctx.globalAlpha *= ki;
    ctx.fillStyle = hexA(pal.raised, 0.94);
    roundRect(ctx, x, r.y, w, r.h, H * 0.014); ctx.fill();
    ctx.strokeStyle = s === (b.hot ?? 1) ? hexA(pal.accent, 0.75) : hexA(pal.line, 0.95);
    ctx.lineWidth = Math.max(1, H * (s === (b.hot ?? 1) ? 0.0032 : 0.0016));
    roundRect(ctx, x, r.y, w, r.h, H * 0.014); ctx.stroke();
    const pad = size * 1.2;
    ctx.font = font('mono', size * 0.95, H, 800);
    ctx.fillStyle = s === (b.hot ?? 1) ? pal.accent : pal.mute;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText((it.tag || '').toUpperCase(), x + pad, r.y + pad + size);
    const tm = textHeight(ctx, it.title || '', { x: 0, y: 0, w: w - pad * 2 }, H, { step: size * 1.5, lh: 1.25, weight: 800 });
    drawLines(ctx, tm.lines, { x: x + pad, y: r.y + pad + size * 2.1, w: w - pad * 2 }, H, { step: size * 1.5, lh: 1.25, weight: 800, pal });
    let y = r.y + pad + size * 2.1 + tm.h + size * 1.1;
    for (const li of it.items || []) {
      glyph(ctx, s === (b.hot ?? 1) ? 'check' : 'arrow', x + pad + size * 0.35, y, size * 0.7,
        s === (b.hot ?? 1) ? pal.accent : pal.mute, Math.max(1.4, size * 0.07));
      const m = textHeight(ctx, li, { x: 0, y: 0, w: w - pad * 2 - size * 1.3 }, H, { step: size, lh: 1.4, weight: 500 });
      drawLines(ctx, m.lines, { x: x + pad + size * 1.3, y: y - size * 0.5, w: w - pad * 2 - size * 1.3 }, H,
        { step: size, lh: 1.4, weight: 500, pal });
      y += m.h + size * 0.7;
    }
    ctx.restore();
  });
  return r.h;
};

R.cycle = (ctx, b, r, H, pal, k) => {
  const items = b.items || [];
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const R0 = Math.min(r.w, r.h) * 0.36;
  const size = px(SCALE.caption * 1.15, H);
  // A cycle drawn as a hairline ring and four words measures ~1% ink and reads as an empty page.
  // The ring gets a plate: it stays the lightest graphic in the kit, but it now occupies the page.
  ctx.save();
  ctx.globalAlpha *= easeOut(clamp01(k));
  ctx.beginPath(); ctx.arc(cx, cy, R0 * 1.08, 0, TAU);
  ctx.fillStyle = hexA(pal.raised, 0.94); ctx.fill();
  ctx.strokeStyle = hexA(pal.line, 0.95); ctx.lineWidth = Math.max(1, H * 0.0016); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = hexA(pal.line, 0.9); ctx.lineWidth = Math.max(1.4, H * 0.0022);
  ctx.beginPath(); ctx.arc(cx, cy, R0, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
  for (let i = 0; i < items.length; i++) {
    const a = -Math.PI / 2 + (i / items.length) * TAU;
    const ki = easeOut(clamp01(k * (items.length + 1) - i));
    if (ki <= 0.001) continue;
    const x = cx + Math.cos(a) * R0, y = cy + Math.sin(a) * R0;
    ctx.save(); ctx.globalAlpha *= ki;
    ctx.beginPath(); ctx.arc(x, y, size * 0.62, 0, TAU);
    ctx.fillStyle = pal.bg; ctx.fill();
    ctx.strokeStyle = pal.accent; ctx.lineWidth = Math.max(1.5, size * 0.09); ctx.stroke();
    ctx.font = font('mono', size * 0.8, H, 800); ctx.fillStyle = pal.accent;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x, y);
    const tx = cx + Math.cos(a) * (R0 + size * 1.9), ty = cy + Math.sin(a) * (R0 + size * 1.9);
    ctx.textAlign = Math.cos(a) > 0.2 ? 'left' : Math.cos(a) < -0.2 ? 'right' : 'center';
    ctx.font = font('sans', size, H, 600); ctx.fillStyle = pal.ink;
    const m = textHeight(ctx, items[i], { x: 0, y: 0, w: r.w * 0.34 }, H, { step: size, lh: 1.3, weight: 600 });
    const lx = ctx.textAlign === 'left' ? tx : ctx.textAlign === 'right' ? tx - r.w * 0.34 : tx - r.w * 0.17;
    drawLines(ctx, m.lines, { x: lx, y: ty - m.h / 2, w: r.w * 0.34 }, H,
      { step: size, lh: 1.3, weight: 600, pal, align: ctx.textAlign });
    ctx.textAlign = 'left';
    ctx.restore();
  }
  if (b.center) {
    ctx.font = font('sans', size * 1.5, H, 800); ctx.fillStyle = pal.ink;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.center, cx, cy);
    ctx.textAlign = 'left';
  }
  return r.h;
};

R.pagenum = (ctx, b, r, H, pal, k, ctxInfo) => {
  const size = px(SCALE.caption, H);
  const { index, total } = ctxInfo;
  ctx.font = font('mono', size, H, 700);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.mute;
  ctx.textAlign = 'right';
  ctx.fillText(`${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, r.x + r.w, r.y + size * 0.6);
  const dots = Math.min(total, 12), dw = size * 0.9;
  let x = r.x + r.w - size * 3.4 - (dots - 1) * dw;
  for (let i = 0; i < dots; i++) {
    const on = Math.floor((index / Math.max(1, total - 1)) * (dots - 1) + 0.5) === i;
    const d = Math.floor((index / Math.max(1, total - 1)) * (dots - 1));
    ctx.beginPath(); ctx.arc(x + i * dw, r.y + size * 0.6, size * (on ? 0.24 : 0.16), 0, TAU);
    ctx.fillStyle = on ? pal.accent : hexA(pal.mute, 0.55); ctx.fill();
    void d;
  }
  ctx.textAlign = 'left';
  return size * 1.6;
};

R.progress = (ctx, b, r, H, pal, k, ctxInfo) => {
  const h = Math.max(2, H * 0.0035);
  ctx.fillStyle = hexA(pal.line, 0.6);
  ctx.fillRect(r.x, r.y, r.w, h);
  const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
  g.addColorStop(0, pal.accentDim); g.addColorStop(1, pal.accent);
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w * clamp01(ctxInfo.p ?? 0), h);
  return h;
};

R.footnote = (ctx, b, r, H, pal, k) => {
  const size = px(SCALE.caption, H);
  ctx.font = font('mono', size, H, 500);
  ctx.fillStyle = pal.mute; ctx.textBaseline = 'middle';
  ctx.fillText(b.text || '', r.x, r.y + size * 0.6);
  return size * 1.6;
};

R.spacer = (ctx, b) => b.h || 0;

// ---- the page ------------------------------------------------------------------

/**
 * Draw one page.
 *
 * @param ctx   canvas 2D context, already sized to (W, H)
 * @param slide the declarative page from data/deck.json
 * @param pal   the deck theme for this page ({bg, ink, sub, mute, accent, accentHot, accentDim, glow, paper, line, raised, err})
 * @param env   { u: beats since the page turned, p: 0..1 through the page, index, total, flare }
 * Returns nothing; the page is complete when it returns.
 */
export function drawSlide(ctx, W, H, slide, pal, env) {
  const layout = slide.layout || 'headline';
  const S = slots(W, H, layout);
  const blocks = stagger(slide.blocks || [], slide.enterBeats ?? 4);

  // group blocks into slots and stack them top-down inside each slot
  const bySlot = new Map();
  for (const b of blocks) {
    const s = b.slot || (FOOT_TYPES.has(b.type) ? 'foot' : HEAD_TYPES.has(b.type) ? 'head' : 'main');
    if (!S[s]) continue;                        // a layout with no `side` slot drops `slot:"side"`
    if (!bySlot.has(s)) bySlot.set(s, []);
    bySlot.get(s).push(b);
  }

  for (const [name, list] of bySlot) {
    const box = S[name];
    // measure first, so a slot can be centred rather than always starting at its top
    let total = 0;
    const hs = list.map((b) => {
      const h = measure(ctx, b, box, H);
      total += h + (b.gap ?? H * 0.018);
      return h;
    });
    let y = box.y;
    if (slide.valign === 'middle' && name !== 'foot') y += Math.max(0, (box.h - total) / 2);
    list.forEach((b, i) => {
      const r = { x: box.x + (b.dx || 0) * box.w, y, w: box.w * (b.w || 1), h: hs[i] };
      b._cx = r.x + r.w / 2; b._cy = r.y + r.h / 2;
      const k = enterK(b, env.u);
      if (k <= 0.001) { y += hs[i] + (b.gap ?? H * 0.018); return; }
      ctx.save();
      const a = entrance(ctx, b, k, H);
      ctx.globalAlpha *= a * (b.alpha ?? 1);
      (R[b.type] || R.body)(ctx, b, r, H, pal, k, env);
      ctx.restore();
      y += hs[i] + (b.gap ?? H * 0.018);
    });
  }
}

/** Height a block will occupy inside box `box`, without drawing it. */
function measure(ctx, b, box, H) {
  const r = { x: box.x, y: box.y, w: box.w * (b.w || 1) };
  switch (b.type) {
    case 'kicker': return px(SCALE.kicker, H) * 1.9;
    case 'title': return textHeight(ctx, b.text || '', r, H, { step: 'title', lh: 1.16, weight: 800 }).h + px(SCALE.title, H) * 0.28;
    case 'sub': return textHeight(ctx, b.text || '', r, H, { step: 'sub', lh: 1.34, weight: 600 }).h + px(SCALE.sub, H) * 0.3;
    case 'lyric': {
      const size = px(SCALE.sub * (b.scale || 1.3), H);
      return textHeight(ctx, b.text || '', r, H, { step: size, lh: 1.32, weight: 700 }).h + px(size, H) * 0.34;
    }
    case 'body': return textHeight(ctx, b.text || '', r, H, { step: 'body', lh: b.lh || 1.55 }).h + px(SCALE.body, H) * 0.4;
    case 'quote': return textHeight(ctx, b.text || '', { ...r, w: r.w }, H, { step: px(SCALE.sub, H) * (b.scale || 1.05), lh: 1.5 }).h + px(SCALE.sub, H) * 2.2;
    case 'stat': return px(SCALE.stat * (b.scale || 1), H) * 1.06 + (b.delta ? px(SCALE.body, H) * 1.5 : 0) + (b.label ? px(SCALE.caption * 1.35, H) * 1.3 : 0);
    case 'bullets': {
      const size = px(b.size || SCALE.body, H);
      const items = b.items || [];
      let h = 0;
      for (const it of items) {
        const text = typeof it === 'string' ? it : it.text;
        h += Math.max(size * (b.lh || 1.62), textHeight(ctx, text, { x: 0, y: 0, w: r.w - size * 1.9 }, H, { step: size, lh: b.lh || 1.62, weight: 500 }).h + size * 0.42);
      }
      return h;
    }
    case 'steps': return Math.min(box.h, H * 0.17);
    case 'bars': return Math.min(box.h, (b.items || []).length * px(SCALE.caption * 1.25, H) * 3.0);
    case 'timeline': case 'cards': case 'cycle': case 'compare': case 'scene': return box.h * (b.fill ?? 1);
    case 'badges': return px(SCALE.caption, H) * (b.scale || 1.1) * 2.0 * (b.rows || 1);
    case 'rule': return b.h || px(SCALE.body, H) * 0.9;
    case 'pagenum': case 'footnote': return px(SCALE.caption, H) * 1.6;
    case 'progress': return Math.max(2, H * 0.0035);
    case 'spacer': return b.h || 0;
    default: return box.h * 0.4;
  }
}

// ---- small helpers -------------------------------------------------------------
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);

/** '#rrggbb' + alpha -> 'rgba(...)'. */
export function hexA(hex, a) {
  const h = (hex || '#ffffff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** The block types a deck may use — deck_lint.mjs checks against this list. */
export const BLOCK_TYPES = Object.keys(R);
/** The layout names a deck may use. */
export const LAYOUT_NAMES = Object.keys(LAYOUTS);

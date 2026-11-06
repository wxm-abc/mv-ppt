// scenes.js — motif painters.
//
// deck.js draws DIAGRAMS (bars, steps, compare, cycle). An MV needs IMAGES: something that
// carries what a line of lyric means without spelling it out. Every motif here is one noun
// from this song, drawn as vectors and animated by beats since the page turned.
//
// Same contract as a deck.js renderer: (ctx, b, r, H, pal, k, env) -> height used.
//   k   = entrance progress 0..1 of the block
//   env = { u: beats since the page turned, p: 0..1 through the page, beat, flare, index }
// Pure and deterministic: no Math.random, no wall clock, no state between frames — otherwise
// the exporter cannot render frame 6000 on its own. Jitter comes from a hash of the index.

import { drawFigure } from './figure.js';

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const px = (f, H) => Math.max(1, f * H);

function hexA(hex, a) {
  const h = (hex || '#ffffff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Blend two hex colours. Needed to build a "hot" core that is brighter than the page on a
 *  LIGHT theme: the palette's glow (#ffd9a8 on warm-paper) is still darker than the paper
 *  (#f2ece0), so a doorway filled with it reads as a wooden door instead of as light. */
function mixHex(a, b, t) {
  const p = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const m = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;   // hex, so hexA() can read it back
}

/** Deterministic 0..1 from an integer — the only source of "randomness" allowed in a frame. */
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Relative luminance of a '#rrggbb'. Used to tell a light theme from a dark one. */
function lum(hex) {
  const h = (hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/**
 * The colour an ambient halo should be.
 *
 * `pal.glow` is the palette's bloom and it is tuned for a dark page. On warm-paper it is
 * #ffd9a8, which is DARKER than the paper (#f2ece0) — a page lit with it measured 5% ink and
 * range 30, i.e. nothing. On a light theme an ambient light has to be tinted towards that
 * theme's accent to register at all; on a dark one the bloom is already correct.
 */
const ambient = (pal) => (lum(pal.bg) > 0.6 ? mixHex(pal.glow, pal.accent, 0.5) : pal.glow);

/**
 * The colour of a SOLID object (a window frame, a door jamb, a body).
 * Dark on a light page, darker than the page on a dark one — the one rule that reads in both.
 */
const bodyInk = (pal) => (lum(pal.bg) > 0.6 ? mixHex(pal.bg, pal.ink, 0.90) : mixHex(pal.bg, '#000000', 0.55));

/** Soft radial light. The single most useful thing in this file: it makes a flat vector look lit. */
function glow(ctx, x, y, r0, color, a) {
  if (!(r0 > 0) || !(a > 0)) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r0);
  g.addColorStop(0, hexA(color, a));
  g.addColorStop(0.45, hexA(color, a * 0.34));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r0, 0, TAU); ctx.fill();
}

/** A vertical or diagonal wash across the whole rect, so a page is never two flat colours. */
function wash(ctx, r, pal, a = 1) {
  const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w * 0.4, r.y + r.h);
  g.addColorStop(0, hexA(pal.raised, 0.55 * a));
  g.addColorStop(0.55, hexA(pal.bg, 0.10 * a));
  g.addColorStop(1, hexA(pal.raised, 0.40 * a));
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

const S = {};

// ---- 刺さってる — the thorn that stays in ------------------------------------
// A needle coming down out of frame, its tip at a point that keeps ringing.
S.thorn = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const cx = r.x + r.w * 0.42, cy = r.y + r.h * 0.60;
  const drop = (1 - easeOut(clamp01(u / 1.3))) * r.h * 0.55;

  // ripples that keep coming off the point of contact
  for (let i = 0; i < 5; i++) {
    const ph = (u * 0.5 + i * 0.2) % 1;
    ctx.strokeStyle = hexA(pal.accentHot, (1 - ph) * 0.5 * e);
    ctx.lineWidth = px(0.0035, H) * (1 - ph) + 0.5;
    ctx.beginPath(); ctx.arc(cx, cy, r.w * (0.05 + ph * 0.34), 0, TAU); ctx.stroke();
  }
  // hairlines radiating from the wound
  const n = 34;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hash(i) * 0.09;
    const l0 = r.w * 0.09, l1 = r.w * (0.17 + hash(i + 9) * 0.26);
    const ki = easeOut(clamp01(u * 0.8 - (i / n) * 0.5)) * e;
    if (ki <= 0.01) continue;
    ctx.strokeStyle = hexA(pal.sub, 0.45 * ki);
    ctx.lineWidth = px(0.0016, H);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * l0, cy + Math.sin(a) * l0);
    ctx.lineTo(cx + Math.cos(a) * l1, cy + Math.sin(a) * l1);
    ctx.stroke();
  }
  // the needle itself, tapered, entering from upper right
  const L = r.w * 0.60, wid = r.w * 0.052;
  const ax = cx + L * 0.70, ay = cy - L * 0.70 - drop;
  const nx = 0.707, ny = 0.707;
  const g = ctx.createLinearGradient(cx, cy, ax, ay);
  g.addColorStop(0, hexA(pal.accentHot, 0.98));
  g.addColorStop(0.6, hexA(pal.accentHot, 0.42));
  g.addColorStop(1, hexA(pal.accentHot, 0.06));
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(ax + nx * wid, ay + ny * wid);
  ctx.lineTo(ax - nx * wid, ay - ny * wid);
  ctx.closePath();
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = hexA(pal.ink, 0.30 * e); ctx.lineWidth = 1; ctx.stroke();
  glow(ctx, cx, cy, r.w * 0.13, pal.accentHot, 0.75 * e);
  return r.h;
};

// ---- 日めくりカレンダー — a page a day, torn off --------------------------------
S.calendar = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const n = b.n ?? 8;
  const pw = r.w * 0.20, ph2 = r.h * 0.30;
  for (let i = 0; i < n; i++) {
    const q = (u * 0.26 + i / n) % 1;
    const x = r.x + r.w * (0.06 + i * 0.028) + q * r.w * 0.42;
    const y = r.y + r.h * 0.10 + q * r.h * 0.92;
    const a = (0.35 + Math.sin(q * Math.PI) * 0.65) * e;
    if (a <= 0.01) continue;
    const rot = q * 1.15 + hash(i) * 0.5;
    ctx.save();
    ctx.translate(x + pw / 2, y + ph2 / 2); ctx.rotate(rot); ctx.globalAlpha *= a;
    glow(ctx, 0, 0, pw * 0.9, ambient(pal), 0.35);
    ctx.beginPath();
    // torn top edge: the tear mark is what makes it a page and not a card
    const teeth = 7;
    ctx.moveTo(-pw / 2, -ph2 / 2 + ph2 * 0.07);
    for (let t = 0; t < teeth; t++) {
      const tx = -pw / 2 + (t + 0.5) * (pw / teeth);
      ctx.lineTo(tx, -ph2 / 2 + (hash(i * 7 + t) - 0.5) * ph2 * 0.09);
    }
    ctx.lineTo(pw / 2, -ph2 / 2);
    ctx.lineTo(pw / 2, ph2 / 2); ctx.lineTo(-pw / 2, ph2 / 2);
    ctx.closePath();
    ctx.fillStyle = hexA(pal.raised, 0.94); ctx.fill();
    // A second pass in `ink` at low alpha is how a surface LIFTS off the page on both themes:
    // ink is near-white on the dark themes and near-black on the light ones, so this brightens
    // the paper on dark and shades it on light. A fixed light colour would only work on one.
    ctx.fillStyle = hexA(pal.ink, 0.11); ctx.fill();
    ctx.strokeStyle = hexA(pal.sub, 0.95); ctx.lineWidth = px(0.0016, H); ctx.stroke();
    ctx.fillStyle = hexA(pal.accent, 0.85);
    ctx.font = `700 ${px(0.062, H)}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(((b.start ?? 1) + i) % 31 || 31), 0, ph2 * 0.06);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
  // the block it is torn from, still hanging on the wall at the left
  ctx.save(); ctx.globalAlpha *= e;
  const bx = r.x + r.w * 0.05, by = r.y + r.h * 0.16;
  ctx.fillStyle = hexA(pal.raised, 0.96);
  ctx.fillRect(bx, by, pw * 0.92, ph2 * 0.86);
  ctx.fillStyle = hexA(pal.ink, 0.11);
  ctx.fillRect(bx, by, pw * 0.92, ph2 * 0.86);
  ctx.strokeStyle = hexA(pal.accent, 0.9); ctx.lineWidth = px(0.0022, H);
  ctx.strokeRect(bx, by, pw * 0.92, ph2 * 0.86);
  ctx.fillStyle = hexA(pal.mute, 0.9);
  ctx.font = `700 ${px(0.021, H)}px ui-monospace, Consolas, monospace`;
  ctx.fillText('めくる', bx + pw * 0.10, by + ph2 * 0.30);
  ctx.restore();
  return r.h;
};

// ---- 優しい風 — the wind that would change things ------------------------------
S.wind = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  glow(ctx, r.x + r.w * 0.06, r.y + r.h * 0.45, r.w * 0.42, ambient(pal), 0.55 * e);
  const rows = 30;
  for (let i = 0; i < rows; i++) {
    const y0 = r.y + ((i + 0.5) / rows) * r.h;
    const amp = r.h * 0.026 * (0.35 + hash(i));
    const off = u * (0.5 + hash(i + 3) * 0.9) + hash(i) * 12;
    const hot = i % 4 === 0, warm = i % 11 === 5;
    ctx.beginPath();
    for (let s = 0; s <= 44; s++) {
      const f = s / 44, x = r.x + f * r.w;
      const y = y0 + Math.sin(f * TAU * 1.35 + off) * amp * (0.35 + 0.65 * Math.sin(f * Math.PI));
      if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.strokeStyle = hexA(hot ? pal.accent : warm ? pal.accentHot : pal.sub,
      (hot ? 0.72 : warm ? 0.55 : 0.30) * e);
    ctx.lineWidth = px(0.0015, H) * (hot ? 2.2 : warm ? 1.6 : 1);
    ctx.stroke();
  }
  // motes carried along
  for (let i = 0; i < 40; i++) {
    const q = (u * 0.20 + hash(i)) % 1;
    const x = r.x + q * r.w * 1.05 - r.w * 0.02;
    const y = r.y + r.h * (0.10 + hash(i + 21) * 0.80) + Math.sin(q * 7 + i) * r.h * 0.02;
    ctx.fillStyle = hexA(pal.accent, Math.sin(q * Math.PI) * 0.6 * e);
    ctx.beginPath(); ctx.arc(x, y, px(0.0016, H) * (0.6 + hash(i + 4) * 1.7), 0, TAU); ctx.fill();
  }
  return r.h;
};

// ---- レースのカーテン — the curtain that moves because there is a wind ----------
S.curtain = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const wx = r.x + r.w * 0.14, wy = r.y + r.h * 0.08, ww = r.w * 0.72, wh = r.h * 0.74;
  // the light outside: the reason the curtain is the brightest thing on the page
  const g = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
  g.addColorStop(0, hexA(pal.glow, 0.95)); g.addColorStop(1, hexA(pal.accent, 0.55));
  ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
  glow(ctx, wx + ww * 0.5, wy + wh * 0.45, ww * 0.75, ambient(pal), 0.7 * e);

  // pleats: alternating light/dark vertical bands, swaying
  const pleats = 26;
  for (let i = 0; i < pleats; i++) {
    const f = i / pleats;
    const x0 = wx + f * ww;
    const sway = Math.sin(u * 1.05 + i * 0.26) * ww * 0.028 * e;
    const dark = i % 2 === 0;
    const pg = ctx.createLinearGradient(x0, 0, x0 + ww / pleats, 0);
    pg.addColorStop(0, hexA(pal.bg, dark ? 0.40 : 0.05));
    pg.addColorStop(0.5, hexA(pal.bg, dark ? 0.16 : 0.02));
    pg.addColorStop(1, hexA(pal.bg, dark ? 0.40 : 0.05));
    ctx.fillStyle = pg;
    ctx.fillRect(x0 + sway * (1 - f * 0.3), wy, ww / pleats + 1, wh);
    // the hem: a scallop, and the pleat swings most at the bottom
    const hx = x0 + ww / pleats / 2 + sway, hy = wy + wh;
    ctx.beginPath(); ctx.arc(hx, hy - wh * 0.012, ww / pleats * 0.62, 0, Math.PI);
    ctx.fillStyle = hexA(pal.bg, 0.30); ctx.fill();
  }
  // lace holes
  for (let i = 0; i < 150; i++) {
    const hx = wx + hash(i) * ww, hy = wy + hash(i + 71) * wh * 0.92;
    ctx.fillStyle = hexA(pal.glow, 0.22 * e);
    ctx.beginPath(); ctx.arc(hx, hy, px(0.0012, H) * (0.5 + hash(i + 3)), 0, TAU); ctx.fill();
  }
  // frame + sill
  ctx.strokeStyle = hexA(pal.ink, 0.55 * e); ctx.lineWidth = px(0.0032, H);
  ctx.strokeRect(wx, wy, ww, wh);
  ctx.beginPath(); ctx.moveTo(wx, wy + wh * 0.5); ctx.lineTo(wx + ww, wy + wh * 0.5); ctx.stroke();
  ctx.fillStyle = hexA(pal.raised, 0.9);
  ctx.fillRect(wx - ww * 0.03, wy + wh, ww * 1.06, r.h * 0.035);
  return r.h;
};

// ---- この星の子孫 — everyone is a child of this planet --------------------------
S.star = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  for (let i = 0; i < 190; i++) {
    const x = r.x + hash(i) * r.w, y = r.y + hash(i + 99) * r.h;
    const s = px(0.0022, H) * (0.5 + hash(i + 7) * 1.9);
    const tw = 0.75 + 0.25 * Math.sin(u * 1.1 + i);          // they twinkle, so the field lives
    ctx.fillStyle = hexA(i % 11 === 0 ? pal.glow : pal.sub, (0.35 + hash(i + 13) * 0.65) * e * tw);
    ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
  }
  // the band of the galaxy, low and wide
  const mg = ctx.createLinearGradient(0, r.y + r.h * 0.62, 0, r.y + r.h);
  mg.addColorStop(0, hexA(pal.accent, 0));
  mg.addColorStop(0.5, hexA(pal.accent, 0.16 * e));
  mg.addColorStop(1, hexA(pal.accent, 0));
  ctx.fillStyle = mg; ctx.fillRect(r.x, r.y + r.h * 0.62, r.w, r.h * 0.38);
  // a constellation being joined up, one line at a time
  const pts = b.pts || [[0.26, 0.34], [0.40, 0.22], [0.56, 0.36], [0.50, 0.58], [0.32, 0.54], [0.26, 0.34]];
  const P = pts.map((p) => [r.x + p[0] * r.w, r.y + p[1] * r.h]);
  for (let i = 1; i < P.length; i++) {
    const ki = easeOut(clamp01(u * 1.4 - i * 0.55)) * e;
    if (ki <= 0.01) continue;
    ctx.strokeStyle = hexA(pal.accent, 0.75 * ki);
    ctx.lineWidth = px(0.0018, H);
    ctx.beginPath(); ctx.moveTo(P[i - 1][0], P[i - 1][1]); ctx.lineTo(P[i][0], P[i][1]); ctx.stroke();
  }
  P.forEach((p, i) => {
    const ki = easeOut(clamp01(u * 1.4 - i * 0.5)) * e;
    ctx.fillStyle = hexA(pal.accentHot, 0.95 * ki);
    ctx.beginPath(); ctx.arc(p[0], p[1], px(0.0032, H), 0, TAU); ctx.fill();
    glow(ctx, p[0], p[1], px(0.016, H), pal.accentHot, 0.6 * ki);
  });
  // the one bright star
  const bx = r.x + r.w * 0.72, by = r.y + r.h * 0.30;
  const pulse = 0.72 + 0.28 * Math.sin(u * 1.6);
  glow(ctx, bx, by, r.w * 0.13, ambient(pal), pulse * e);
  ctx.strokeStyle = hexA(pal.glow, 0.85 * e); ctx.lineWidth = px(0.0022, H);
  ctx.beginPath();
  ctx.moveTo(bx - r.w * 0.10, by); ctx.lineTo(bx + r.w * 0.10, by);
  ctx.moveTo(bx, by - r.h * 0.09); ctx.lineTo(bx, by + r.h * 0.09);
  ctx.stroke();
  ctx.fillStyle = pal.glow;
  ctx.beginPath(); ctx.arc(bx, by, px(0.0042, H), 0, TAU); ctx.fill();
  return r.h;
};

// ---- 温かく残ってる — still warm ------------------------------------------------
S.ember = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const cx = r.x + r.w * 0.5, cy = r.y + r.h * 0.66;
  glow(ctx, cx, cy, r.w * 0.46, ambient(pal), 0.95 * e);
  // a deeper body under the pale halo: on a light theme the bloom alone is paler than the
  // paper, so without this the ember is a smudge on cream.
  const body = ctx.createRadialGradient(cx, cy, 0, cx, cy, r.w * 0.36);
  body.addColorStop(0, hexA(pal.accent, 0.40 * e));
  body.addColorStop(0.5, hexA(pal.accent, 0.16 * e));
  body.addColorStop(1, hexA(pal.accent, 0));
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(cx, cy, r.w * 0.36, 0, TAU); ctx.fill();
  // slow heat rings
  for (let i = 0; i < 4; i++) {
    const q = (u * 0.22 + i / 4) % 1;
    ctx.strokeStyle = hexA(pal.accent, (1 - q) * 0.30 * e);
    ctx.lineWidth = px(0.0026, H) * (1 - q) + 0.5;
    ctx.beginPath(); ctx.arc(cx, cy, r.w * (0.08 + q * 0.40), Math.PI, TAU); ctx.stroke();
  }
  // motes rising
  for (let i = 0; i < 52; i++) {
    const q = (u * 0.15 + hash(i)) % 1;
    const x = cx + (hash(i) - 0.5) * r.w * 0.44 + Math.sin(q * 6 + i) * r.w * 0.028;
    const y = r.y + r.h * 0.92 - q * r.h * 0.84;
    const a = Math.sin(q * Math.PI) * (0.30 + hash(i + 5) * 0.55) * e;
    ctx.fillStyle = hexA(pal.accentHot, a);
    ctx.beginPath(); ctx.arc(x, y, px(0.0017, H) * (0.55 + hash(i + 2) * 1.8), 0, TAU); ctx.fill();
  }
  // the core that has not gone out
  const pulse = 0.9 + 0.1 * Math.sin(u * 2.1);
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r.w * 0.11);
  cg.addColorStop(0, hexA(pal.accentHot, 0.98 * e * pulse));
  cg.addColorStop(0.5, hexA(pal.accent, 0.55 * e * pulse));
  cg.addColorStop(1, hexA(pal.accent, 0));
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(cx, cy, r.w * 0.11, 0, TAU); ctx.fill();
  return r.h;
};

// ---- 遠くなる — moving away without being forgotten -----------------------------
S.drift = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  // a faint ruled field, drawn first: the space that opened up has to be somewhere
  for (let i = 0; i < 22; i++) {
    const yy = r.y + (i / 22) * r.h;
    ctx.strokeStyle = hexA(pal.sub, 0.26 * e); ctx.lineWidth = px(0.0013, H);
    ctx.beginPath(); ctx.moveTo(r.x, yy); ctx.lineTo(r.x + r.w, yy); ctx.stroke();
  }
  const t = easeOut(clamp01(u / 3.4));
  const y = r.y + r.h * 0.52;
  const d = r.w * (0.11 + t * 0.40);
  const x1 = r.x + r.w * 0.5 - d, x2 = r.x + r.w * 0.5 + d;
  // the thread between them, breaking up: a thread that thins reads, one that snaps instantly does not
  const seg = 26;
  ctx.lineWidth = px(0.0028, H) * (1 - t * 0.7) + 0.5;
  ctx.strokeStyle = hexA(pal.sub, (1 - t) * 0.9 * e);
  for (let i = 0; i < seg; i++) {
    if (hash(i + 2) < t * 0.95) continue;
    const f0 = i / seg, f1 = (i + 1) / seg;
    ctx.beginPath();
    ctx.moveTo(x1 + (x2 - x1) * f0, y + Math.sin(f0 * 5 + u) * r.h * 0.012);
    ctx.lineTo(x1 + (x2 - x1) * f1, y + Math.sin(f1 * 5 + u) * r.h * 0.012);
    ctx.stroke();
  }
  // distance marks that accumulate in the gap
  for (let i = 0; i < 9; i++) {
    const f = (i + 0.5) / 9;
    const mx = x1 + (x2 - x1) * f;
    const ki = clamp01(t * 1.4 - i * 0.06) * e;
    ctx.strokeStyle = hexA(pal.mute, 0.5 * ki); ctx.lineWidth = px(0.0014, H);
    ctx.beginPath(); ctx.moveTo(mx, y - r.h * 0.022); ctx.lineTo(mx, y + r.h * 0.022); ctx.stroke();
  }
  [[x1, pal.accentHot, 1], [x2, pal.accent, 0.45 + t * 0.4]].forEach(([x, c, a]) => {
    glow(ctx, x, y, r.w * 0.16, ambient(pal), 0.8 * a * e);
    glow(ctx, x, y, r.w * 0.10, c, 0.85 * a * e);
    // a filled body and two rings, so the orb reads as a thing under a light rather than as a
    // smudge: two dots and a thread measured 11% ink and looked like nothing at all.
    ctx.fillStyle = hexA(c, 0.22 * a * e);
    ctx.beginPath(); ctx.arc(x, y, r.w * 0.060, 0, TAU); ctx.fill();
    ctx.strokeStyle = hexA(c, 0.55 * a * e); ctx.lineWidth = px(0.0016, H);
    ctx.beginPath(); ctx.arc(x, y, r.w * 0.060, 0, TAU); ctx.stroke();
    ctx.strokeStyle = hexA(c, 0.85 * e); ctx.lineWidth = px(0.0024, H);
    ctx.beginPath(); ctx.arc(x, y, r.w * 0.034, 0, TAU); ctx.stroke();
    ctx.fillStyle = hexA(c, 0.95 * e);
    ctx.beginPath(); ctx.arc(x, y, r.w * 0.022, 0, TAU); ctx.fill();
    ctx.strokeStyle = hexA(pal.ink, 0.45 * e); ctx.lineWidth = px(0.0016, H); ctx.stroke();
  });
  return r.h;
};

// ---- 涙 — the tears that will come ----------------------------------------------
S.rain = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  for (let i = 0; i < 90; i++) {
    const q = (u * 0.46 + hash(i)) % 1;
    const x = r.x + hash(i + 50) * r.w * 1.15 - r.w * 0.08;
    const y = r.y + q * r.h * 1.05;
    const len = r.h * 0.055 * (0.5 + hash(i));
    ctx.strokeStyle = hexA(pal.sub, 0.28 * (1 - Math.abs(q - 0.5)) * 1.4 * e);
    ctx.lineWidth = px(0.0013, H) * (0.7 + hash(i + 6) * 0.9);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len * 0.30, y + len); ctx.stroke();
  }
  // one drop, and the ring it leaves
  const cx = r.x + r.w * 0.5, cy = r.y + r.h * 0.80;
  const q = (u * 0.42) % 1;
  const dy = r.y + r.h * 0.18 + q * (cy - r.y - r.h * 0.18);
  ctx.save(); ctx.globalAlpha *= e * (1 - q * 0.2);
  ctx.fillStyle = hexA(pal.accent, 0.9);
  ctx.beginPath(); ctx.ellipse(cx, dy, r.w * 0.012, r.h * 0.026, 0, 0, TAU); ctx.fill();
  ctx.restore();
  for (let i = 0; i < 3; i++) {
    const p = (q * 1.6 + i * 0.2) % 1;
    if (q < 0.85) continue;
    ctx.strokeStyle = hexA(pal.accent, (1 - p) * 0.6 * e);
    ctx.lineWidth = px(0.0024, H) * (1 - p) + 0.5;
    ctx.beginPath(); ctx.ellipse(cx, cy, r.w * (0.02 + p * 0.22), r.w * (0.006 + p * 0.07), 0, 0, TAU); ctx.stroke();
  }
  glow(ctx, cx, cy, r.w * 0.18, pal.accent, 0.35 * e * clamp01(q * 3));
  return r.h;
};

// ---- 歩こう — walking on, wrapped in a memory ------------------------------------
S.path = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const hz = r.y + r.h * 0.30;                     // the vanishing point
  const cx = r.x + r.w * 0.52;
  const yAt = (f) => hz + f * (r.y + r.h - hz);
  // ground: darker at the near edge, so the light is where the distance is
  const gg = ctx.createLinearGradient(0, hz, 0, r.y + r.h);
  gg.addColorStop(0, hexA(pal.ink, 0.10 * e));
  gg.addColorStop(1, hexA(pal.ink, 0.02 * e));
  ctx.fillStyle = gg; ctx.fillRect(r.x, hz, r.w, r.y + r.h - hz);
  glow(ctx, cx, hz, r.w * 0.30, ambient(pal), 0.75 * e);

  // A NARROW band whose half-width grows with depth. Widening it is what made this motif read
  // as a mountain: a wedge that is bright near its apex and wide at the base IS a mountain.
  const farHalf = r.w * 0.010, nearHalf = r.w * 0.105;
  const halfAt = (f) => farHalf + (nearHalf - farHalf) * Math.pow(f, 1.25);
  ctx.beginPath();
  ctx.moveTo(cx - halfAt(1), yAt(1));
  ctx.lineTo(cx - farHalf, hz); ctx.lineTo(cx + farHalf, hz);
  ctx.lineTo(cx + halfAt(1), yAt(1));
  ctx.closePath();
  const pg = ctx.createLinearGradient(0, hz, 0, r.y + r.h);
  pg.addColorStop(0, hexA(pal.accent, 0.42 * e));
  pg.addColorStop(0.20, hexA(pal.ink, 0.06 * e));
  pg.addColorStop(1, hexA(pal.ink, 0.20 * e));
  ctx.fillStyle = pg; ctx.fill();
  ctx.strokeStyle = hexA(pal.accent, 0.50 * e); ctx.lineWidth = px(0.0020, H); ctx.stroke();

  // footprints, far first, stance scaled to the local width so they follow the perspective
  const N = 11;
  for (let i = N - 1; i >= 0; i--) {
    const f = 1 - i / (N - 1);                     // 1 = nearest
    const ki = easeOut(clamp01(u * 1.3 - (N - 1 - i) * 0.26)) * e;
    if (ki <= 0.01) continue;
    const s = px(0.0092, H) * (0.22 + Math.pow(f, 1.5) * 1.05);
    const sep = halfAt(f) * 0.44;
    ctx.save(); ctx.globalAlpha *= ki;
    [-1, 1].forEach((sd) => {
      ctx.fillStyle = hexA(pal.ink, 0.62);
      ctx.beginPath(); ctx.ellipse(cx + sd * sep, yAt(f), s * 0.58, s, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = hexA(pal.bg, 0.30); ctx.lineWidth = px(0.0012, H); ctx.stroke();
    });
    ctx.restore();
  }
  // grass along the near edges: without sides the band is just a shape
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1;
    const f = 0.45 + hash(i) * 0.55;
    const x = cx + side * halfAt(f) * (1.15 + hash(i + 5) * 0.55);
    const bh = r.h * (0.020 + hash(i + 9) * 0.045) * f;
    ctx.strokeStyle = hexA(pal.sub, 0.50 * e); ctx.lineWidth = px(0.0015, H);
    ctx.beginPath(); ctx.moveTo(x, yAt(f));
    ctx.quadraticCurveTo(x + side * r.w * 0.008, yAt(f) - bh * 0.6, x + side * r.w * 0.020, yAt(f) - bh);
    ctx.stroke();
  }
  return r.h;
};

// ---- 心の奥底 — kept at the bottom of the heart -----------------------------------
S.layers = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const cx = r.x + r.w * 0.5, cy = r.y + r.h * 0.5;
  const N = 10;
  for (let i = N; i >= 1; i--) {
    const f = i / N;
    const ki = easeOut(clamp01(u * 0.85 - (N - i) * 0.16)) * e;
    if (ki <= 0.01) continue;
    ctx.beginPath(); ctx.arc(cx, cy, r.w * 0.47 * f, 0, TAU);
    // Alternating bands, not one flat plate: at a single alpha the rings merge into a blob
    // and the page measures 76% ink while reading as empty.
    ctx.fillStyle = hexA(i % 2 ? pal.raised : pal.bg, (i % 2 ? 0.90 : 0.55) * ki); ctx.fill();
    ctx.strokeStyle = hexA(pal.sub, 1.0 * ki); ctx.lineWidth = px(0.0024, H); ctx.stroke();
  }
  // radial hairlines, so the layers read as depth and not as a target
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    const ki = easeOut(clamp01(u * 0.6 - (i / 36) * 0.3)) * e;
    ctx.strokeStyle = hexA(pal.sub, 0.30 * ki); ctx.lineWidth = px(0.0014, H);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r.w * 0.06, cy + Math.sin(a) * r.w * 0.06);
    ctx.lineTo(cx + Math.cos(a) * r.w * 0.47, cy + Math.sin(a) * r.w * 0.47);
    ctx.stroke();
  }
  const pulse = 0.65 + 0.35 * Math.sin(u * 2.0);
  glow(ctx, cx, cy, r.w * 0.19, pal.accentHot, pulse * e);
  ctx.fillStyle = hexA(pal.accentHot, 0.96 * e);
  ctx.beginPath(); ctx.arc(cx, cy, r.w * 0.026, 0, TAU); ctx.fill();
  return r.h;
};

// ---- 鼻歌 — humming, so nobody notices --------------------------------------------
S.hum = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const sx = r.x + r.w * 0.24, sy = r.y + r.h * 0.54;
  for (let i = 0; i < 8; i++) {
    const q = (u * 0.40 + i / 8) % 1;
    ctx.strokeStyle = hexA(pal.accent, (1 - q) * 0.62 * e);
    ctx.lineWidth = px(0.0028, H) * (1 - q) + 0.5;
    ctx.beginPath(); ctx.arc(sx, sy, r.w * 0.05 + q * r.w * 0.46, 0, TAU); ctx.stroke();
  }
  glow(ctx, sx, sy, r.w * 0.14, pal.accent, 0.6 * e);
  ctx.fillStyle = hexA(pal.accentHot, 0.95 * e);
  ctx.beginPath(); ctx.arc(sx, sy, r.w * 0.028, 0, TAU); ctx.fill();
  // the tune, as a line
  const y0 = r.y + r.h * 0.54, amp = r.h * 0.11;
  ctx.beginPath();
  for (let s = 0; s <= 160; s++) {
    const f = s / 160, x = r.x + r.w * 0.36 + f * r.w * 0.58;
    const env2 = Math.sin(f * Math.PI);
    const y = y0 - Math.sin(f * TAU * 3.2 + u * 2.6) * amp * env2 * (0.55 + 0.45 * Math.sin(f * 9 + u));
    if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.strokeStyle = hexA(pal.accentHot, 0.85 * e); ctx.lineWidth = px(0.0032, H); ctx.stroke();
  return r.h;
};

// ---- 帰りたい場所 — there is a place to go back to ----------------------------------
S.door = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const dw = r.w * 0.22, dh = r.h * 0.54;
  const dx = r.x + r.w * 0.54, dy = r.y + r.h * 0.20;
  glow(ctx, dx + dw / 2, dy + dh / 2, r.w * 0.62, ambient(pal), 0.9 * e);
  // the wall it is cut into — without this the opening is an orange rectangle on nothing
  ctx.fillStyle = hexA(pal.plate, 0.94 * e);
  ctx.fillRect(r.x + r.w * 0.26, r.y + r.h * 0.06, r.w * 0.68, r.h * 0.92);
  ctx.fillStyle = hexA(pal.ink, 0.22 * e);
  ctx.fillRect(r.x + r.w * 0.26, r.y + r.h * 0.06, r.w * 0.68, r.h * 0.92);
  ctx.strokeStyle = hexA(pal.sub, 0.45 * e); ctx.lineWidth = px(0.0016, H);
  ctx.strokeRect(r.x + r.w * 0.26, r.y + r.h * 0.06, r.w * 0.68, r.h * 0.92);
  // the opening: it has to be the brightest thing on the page, on every theme
  const hot = mixHex(pal.glow, '#ffffff', 0.45);
  const g = ctx.createLinearGradient(0, dy, 0, dy + dh);
  g.addColorStop(0, mixHex(pal.accent, hot, 0.55));   // warm at the lintel
  g.addColorStop(0.35, hexA(hot, 0.95));
  g.addColorStop(1, hexA(hot, 1));
  ctx.fillStyle = g; ctx.fillRect(dx, dy, dw, dh);
  ctx.fillStyle = hexA(pal.glow, 0.30 * e);
  ctx.fillRect(dx - dw * 0.05, dy - dh * 0.05, dw * 1.1, dh * 1.13);   // bleed around the jamb
  ctx.fillStyle = g; ctx.fillRect(dx, dy, dw, dh);
  ctx.strokeStyle = hexA(pal.ink, 0.65 * e); ctx.lineWidth = px(0.0034, H);
  ctx.strokeRect(dx, dy, dw, dh);
  // it is a double door, and it has a handle: two details that make a rectangle a door
  ctx.beginPath(); ctx.moveTo(dx + dw * 0.5, dy); ctx.lineTo(dx + dw * 0.5, dy + dh); ctx.stroke();
  ctx.fillStyle = hexA(pal.ink, 0.75 * e);
  ctx.beginPath(); ctx.arc(dx + dw * 0.42, dy + dh * 0.55, px(0.005, H), 0, TAU); ctx.fill();
  // light spilling onto the floor
  ctx.beginPath();
  ctx.moveTo(dx, dy + dh); ctx.lineTo(dx + dw, dy + dh);
  ctx.lineTo(dx + dw * 1.9, r.y + r.h); ctx.lineTo(dx - dw * 0.9, r.y + r.h);
  ctx.closePath();
  const fg = ctx.createLinearGradient(0, dy + dh, 0, r.y + r.h);
  fg.addColorStop(0, hexA(pal.glow, 0.55 * e)); fg.addColorStop(1, hexA(pal.glow, 0));
  ctx.fillStyle = fg; ctx.fill();
  // someone standing in front of it, small
  const fx = r.x + r.w * 0.34, fy = r.y + r.h * 0.90;
  ctx.fillStyle = hexA(pal.ink, 0.82 * e);
  ctx.beginPath(); ctx.arc(fx, fy - r.h * 0.135, r.h * 0.026, 0, TAU); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(fx - r.h * 0.036, fy); ctx.lineTo(fx - r.h * 0.024, fy - r.h * 0.10);
  ctx.lineTo(fx + r.h * 0.024, fy - r.h * 0.10); ctx.lineTo(fx + r.h * 0.036, fy);
  ctx.closePath(); ctx.fill();
  return r.h;
};

// ---- 思い出 — the memory, held as frames ----------------------------------------------
S.frames = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const N = 7, fw = r.w * 0.34, fh = r.h * 0.44;
  const cx = r.x + r.w * 0.5, cy = r.y + r.h * 0.48;
  for (let i = 0; i < N; i++) {
    const ki = easeOut(clamp01(u * 0.75 - (N - 1 - i) * 0.13)) * e;
    if (ki <= 0.01) continue;
    const spread = 1 + (N - 1 - i) * 0.10;
    const ox = (hash(i) - 0.5) * r.w * 0.11 * spread;
    const oy = (hash(i + 5) - 0.5) * r.h * 0.07 * spread - (N - 1 - i) * r.h * 0.010;
    ctx.save();
    ctx.translate(cx + ox, cy + oy); ctx.rotate((hash(i + 11) - 0.5) * 0.30);
    ctx.globalAlpha *= ki;
    ctx.fillStyle = hexA(pal.raised, 0.90); ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
    ctx.strokeStyle = hexA(pal.sub, 0.9); ctx.lineWidth = px(0.002, H);
    ctx.strokeRect(-fw / 2, -fh / 2, fw, fh);
    // something inside: a horizon and a sun, so the frame holds a picture and not a blank
    const ig = ctx.createLinearGradient(0, -fh / 2, 0, fh / 2);
    ig.addColorStop(0, hexA(pal.glow, 0.55)); ig.addColorStop(1, hexA(pal.accent, 0.20));
    ctx.fillStyle = ig;
    ctx.fillRect(-fw / 2 + fw * 0.06, -fh / 2 + fh * 0.06, fw * 0.88, fh * 0.88);
    ctx.fillStyle = hexA(pal.accentHot, 0.75);
    ctx.beginPath(); ctx.arc(-fw * 0.14, -fh * 0.10, fw * 0.09, 0, TAU); ctx.fill();
    ctx.fillStyle = hexA(pal.ink, 0.45);
    ctx.beginPath();
    ctx.moveTo(-fw / 2 + fw * 0.06, fh * 0.20);
    ctx.lineTo(fw * 0.10, -fh * 0.06); ctx.lineTo(fw / 2 - fw * 0.06, fh * 0.20);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  return r.h;
};

// ---- 寂しさ — a wide field and one small figure ----------------------------------------
S.wide = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  const hz = r.y + r.h * 0.66;
  const sky = ctx.createLinearGradient(0, r.y, 0, hz);
  sky.addColorStop(0, hexA(pal.raised, 0.75 * e)); sky.addColorStop(1, hexA(pal.accent, 0.28 * e));
  ctx.fillStyle = sky; ctx.fillRect(r.x, r.y, r.w, hz - r.y);
  ctx.fillStyle = hexA(pal.bg, 0.62 * e); ctx.fillRect(r.x, hz, r.w, r.y + r.h - hz);
  // cloud bands: the only thing moving, and the reason the emptiness reads as distance
  for (let i = 0; i < 9; i++) {
    const q = (u * 0.06 + hash(i)) % 1;
    const y = r.y + r.h * (0.10 + hash(i + 3) * 0.44);
    const w = r.w * (0.18 + hash(i + 8) * 0.30);
    const x = r.x + q * (r.w + w) - w;
    ctx.fillStyle = hexA(pal.sub, 0.16 * e);
    ctx.beginPath(); ctx.ellipse(x, y, w / 2, r.h * 0.016, 0, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = hexA(pal.sub, 0.6 * e); ctx.lineWidth = px(0.0018, H);
  ctx.beginPath(); ctx.moveTo(r.x, hz); ctx.lineTo(r.x + r.w, hz); ctx.stroke();
  // the ground: receding rows, and a low field. Emptiness only reads as DISTANCE when there
  // is something with a size beside it; without a floor this motif measured 45% ink and
  // still looked like nothing at all.
  for (let i = 0; i < 11; i++) {
    const f = (i + 1) / 11;
    const y = hz + Math.pow(f, 1.8) * (r.y + r.h - hz);
    ctx.strokeStyle = hexA(pal.sub, (0.18 + f * 0.22) * e);
    ctx.lineWidth = px(0.0012, H) * (0.7 + f);
    ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(r.x, r.y + r.h);
  ctx.lineTo(r.x, r.y + r.h * 0.90);
  for (let s = 0; s <= 34; s++) {
    const f = s / 34;
    ctx.lineTo(r.x + f * r.w, r.y + r.h * (0.90 + Math.sin(f * 13 + 1) * 0.012 + Math.sin(f * 31) * 0.005));
  }
  ctx.lineTo(r.x + r.w, r.y + r.h);
  ctx.closePath();
  ctx.fillStyle = hexA(pal.ink, 0.13 * e); ctx.fill();
  // two birds, far off — the scale reference for the whole frame
  [[0.62, 0.20, 1], [0.70, 0.26, 0.7]].forEach(([bx, by, s]) => {
    const w = r.w * 0.018 * s;
    ctx.strokeStyle = hexA(pal.sub, 0.55 * e); ctx.lineWidth = px(0.0016, H) * s;
    ctx.beginPath();
    ctx.moveTo(r.x + bx * r.w - w, r.y + by * r.h);
    ctx.quadraticCurveTo(r.x + bx * r.w, r.y + by * r.h - w * 0.7, r.x + bx * r.w + w, r.y + by * r.h);
    ctx.stroke();
  });
  // the one small figure, and its long shadow
  const fx = r.x + r.w * 0.30, fy = hz + r.h * 0.10;
  ctx.fillStyle = hexA(pal.ink, 0.9 * e);
  ctx.beginPath(); ctx.arc(fx, fy - r.h * 0.052, r.h * 0.011, 0, TAU); ctx.fill();
  ctx.fillRect(fx - r.h * 0.006, fy - r.h * 0.042, r.h * 0.012, r.h * 0.042);
  ctx.fillStyle = hexA(pal.ink, 0.28 * e);
  ctx.beginPath(); ctx.ellipse(fx + r.h * 0.03, fy + r.h * 0.006, r.h * 0.055, r.h * 0.007, 0, 0, TAU); ctx.fill();
  return r.h;
};

// ---- 優しく包まれ — being wrapped ------------------------------------------------------
S.wrap = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const cx = r.x + r.w * 0.5, cy = r.y + r.h * 0.52;
  for (let i = 0; i < 6; i++) {
    const rr = r.w * (0.40 - i * 0.052);
    const ki = easeOut(clamp01(u * 0.9 - (5 - i) * 0.22)) * e;
    if (ki <= 0.01) continue;
    const a0 = -Math.PI * 0.62 + i * 0.42 + u * 0.05;
    ctx.strokeStyle = hexA(i < 3 ? pal.accent : pal.accentHot, (0.22 + i * 0.11) * ki);
    ctx.lineWidth = r.w * 0.030;
    ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a0 + TAU * 0.66 * easeOut(clamp01(u / 2.0))); ctx.stroke();
  }
  glow(ctx, cx, cy, r.w * 0.20, pal.accentHot, 0.85 * e);
  ctx.fillStyle = hexA(pal.glow, 0.95 * e);
  ctx.beginPath(); ctx.arc(cx, cy, r.w * 0.032, 0, TAU); ctx.fill();
  return r.h;
};

// ---- 咲く — opening --------------------------------------------------------------------
S.bloom = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  // With a body on the page the flower has to become SCENERY. At full size it reached past the
  // top of the frame and swallowed her whole — she stood inside a petal, invisible.
  const hasFig = !!b.figure;
  const cx = r.x + r.w * 0.5, cy = r.y + r.h * (hasFig ? 0.60 : 0.52);
  const open = easeOut(clamp01(u / 2.4));
  const petals = b.petals ?? 9;
  const sc = hasFig ? 0.58 : 1;
  glow(ctx, cx, cy, r.w * 0.34 * sc, pal.accent, 0.5 * e);
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU - Math.PI / 2 + u * 0.04;
    const len = r.w * 0.30 * sc * (0.20 + open * 0.80) * (0.85 + hash(i) * 0.3);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.globalAlpha *= e;
    const pg = ctx.createLinearGradient(0, 0, 0, -len);
    pg.addColorStop(0, hexA(pal.accentHot, hasFig ? 0.48 : 0.85));
    pg.addColorStop(1, hexA(pal.accent, hasFig ? 0.10 : 0.18));
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.30, -len * 0.32, len * 0.30, -len * 0.86, 0, -len);
    ctx.bezierCurveTo(-len * 0.30, -len * 0.86, -len * 0.30, -len * 0.32, 0, 0);
    ctx.fill();
    ctx.strokeStyle = hexA(pal.ink, 0.22); ctx.lineWidth = px(0.0014, H); ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = hexA(pal.glow, (hasFig ? 0.75 : 0.98) * e);
  ctx.beginPath(); ctx.arc(cx, cy, r.w * 0.035 * sc, 0, TAU); ctx.fill();
  glow(ctx, cx, cy, r.w * 0.10 * sc, ambient(pal), 0.9 * e);
  return r.h;
};

// ---- 終わりが来たら — a horizon, and the light low in it ----------------------------------
S.horizon = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  const hz = r.y + r.h * 0.58;
  const sky = ctx.createLinearGradient(0, r.y, 0, hz);
  sky.addColorStop(0, hexA(pal.raised, 0.85 * e));
  sky.addColorStop(0.7, hexA(pal.accent, 0.45 * e));
  sky.addColorStop(1, hexA(pal.accentHot, 0.60 * e));
  ctx.fillStyle = sky; ctx.fillRect(r.x, r.y, r.w, hz - r.y);
  ctx.fillStyle = hexA(pal.bg, 0.80 * e); ctx.fillRect(r.x, hz, r.w, r.y + r.h - hz);
  // the sun, low, coming up or going down
  const sx = r.x + r.w * 0.62, sy = hz - r.h * 0.06 + Math.sin(u * 0.4) * r.h * 0.012;
  glow(ctx, sx, sy, r.w * 0.30, pal.accentHot, 0.9 * e);
  ctx.fillStyle = hexA(pal.glow, 0.98 * e);
  ctx.beginPath(); ctx.arc(sx, sy, r.w * 0.055, 0, TAU); ctx.fill();
  // its reflection, broken by the water
  for (let i = 0; i < 14; i++) {
    const f = i / 14, y = hz + f * (r.y + r.h - hz) * 0.9;
    const w = r.w * 0.055 * (1 + f * 1.6) * (0.5 + hash(i) * 0.7);
    ctx.fillStyle = hexA(pal.accentHot, (1 - f) * 0.45 * e);
    ctx.fillRect(sx - w / 2 + Math.sin(u * 1.4 + i) * r.w * 0.012, y, w, r.h * 0.006);
  }
  ctx.strokeStyle = hexA(pal.ink, 0.5 * e); ctx.lineWidth = px(0.0018, H);
  ctx.beginPath(); ctx.moveTo(r.x, hz); ctx.lineTo(r.x + r.w, hz); ctx.stroke();
  return r.h;
};

// ---- 刺 / 温 — the two halves of this song, on one page ---------------------------------
S.duality = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const mid = r.x + r.w * 0.5;
  // cold half: hairlines, all pointing at one spot
  const lx = r.x + r.w * 0.26, ly = r.y + r.h * 0.54;
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w * 0.5, r.h); ctx.clip();
  ctx.fillStyle = hexA(pal.raised, 0.7 * e); ctx.fillRect(r.x, r.y, r.w * 0.5, r.h);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    const ki = easeOut(clamp01(u * 0.7 - (i / 40) * 0.4)) * e;
    ctx.strokeStyle = hexA(pal.sub, 0.55 * ki); ctx.lineWidth = px(0.0016, H);
    ctx.beginPath();
    ctx.moveTo(lx + Math.cos(a) * r.w * 0.05, ly + Math.sin(a) * r.w * 0.05);
    ctx.lineTo(lx + Math.cos(a) * r.w * (0.14 + hash(i) * 0.16), ly + Math.sin(a) * r.w * (0.14 + hash(i) * 0.16));
    ctx.stroke();
  }
  ctx.fillStyle = hexA(pal.accentHot, 0.9 * e);
  ctx.beginPath(); ctx.arc(lx, ly, r.w * 0.018, 0, TAU); ctx.fill();
  ctx.restore();
  // warm half
  const rx = r.x + r.w * 0.74, ry = r.y + r.h * 0.54;
  glow(ctx, rx, ry, r.w * 0.30, ambient(pal), 0.95 * e);
  for (let i = 0; i < 26; i++) {
    const q = (u * 0.14 + hash(i)) % 1;
    const x = rx + (hash(i) - 0.5) * r.w * 0.22, y = r.y + r.h * 0.88 - q * r.h * 0.72;
    ctx.fillStyle = hexA(pal.accentHot, Math.sin(q * Math.PI) * 0.6 * e);
    ctx.beginPath(); ctx.arc(x, y, px(0.0016, H) * (0.6 + hash(i + 4) * 1.5), 0, TAU); ctx.fill();
  }
  ctx.fillStyle = hexA(pal.glow, 0.95 * e);
  ctx.beginPath(); ctx.arc(rx, ry, r.w * 0.026, 0, TAU); ctx.fill();
  // the seam
  ctx.strokeStyle = hexA(pal.ink, 0.55 * e); ctx.lineWidth = px(0.0022, H);
  ctx.beginPath(); ctx.moveTo(mid, r.y + r.h * 0.06); ctx.lineTo(mid, r.y + r.h * 0.94); ctx.stroke();
  return r.h;
};

// ---- 帰りたい場所 — steps going up -------------------------------------------------
// She can stand on these, sit on them, or climb them; the ground is a real ledge, which is
// what makes a body on it read as standing somewhere instead of floating.
S.stairs = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const N = 9, cx = r.x + r.w * 0.5;
  const topY = r.y + r.h * 0.20, botY = r.y + r.h * 0.94;
  glow(ctx, cx, topY - r.h * 0.03, r.w * 0.32, ambient(pal), 0.85 * e);
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);                                  // 0 = top step
    const ki = easeOut(clamp01(u * 0.9 - (N - 1 - i) * 0.22)) * e;
    if (ki <= 0.01) continue;
    const y = topY + f * (botY - topY);
    const w = r.w * (0.20 + f * 0.54), th = r.h * 0.032 * (0.55 + f * 0.85);
    const x = cx - w / 2;
    ctx.save(); ctx.globalAlpha *= ki;
    ctx.fillStyle = hexA(pal.raised, 0.94); ctx.fillRect(x, y, w, th);
    ctx.fillStyle = hexA(pal.ink, 0.12); ctx.fillRect(x, y, w, th * 0.30);   // lit tread
    ctx.strokeStyle = hexA(pal.sub, 0.70); ctx.lineWidth = px(0.0016, H);
    ctx.strokeRect(x, y, w, th);
    ctx.restore();
  }
  for (let i = 0; i < 30; i++) {                            // dust in the shaft of light
    const q = (u * 0.10 + hash(i)) % 1;
    const x = r.x + hash(i + 3) * r.w, y = r.y + r.h * 0.92 - q * r.h * 0.80;
    ctx.fillStyle = hexA(pal.sub, Math.sin(q * Math.PI) * 0.42 * e);
    ctx.beginPath(); ctx.arc(x, y, px(0.0014, H) * (0.5 + hash(i + 8) * 1.4), 0, TAU); ctx.fill();
  }
  return r.h;
};

// ---- 揺れるカーテン の外側 — the window itself ----------------------------------------
// `curtain` is a close-up of cloth; this is the frame, the sill and the light outside, so
// she can stand at it and look out.
S.window = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const wx = r.x + r.w * 0.26, wy = r.y + r.h * 0.14;
  const ww = r.w * 0.48, wh = r.h * 0.60;
  glow(ctx, wx + ww / 2, wy + wh * 0.45, ww * 0.72, ambient(pal), 0.95 * e);
  const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
  g.addColorStop(0, hexA(ambient(pal), 0.98 * e));
  g.addColorStop(0.55, hexA(pal.glow, 0.92 * e));
  g.addColorStop(1, hexA(pal.accent, 0.70 * e));
  ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
  // mullions
  ctx.strokeStyle = hexA(bodyInk(pal), 0.85 * e); ctx.lineWidth = px(0.0052, H);
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
  ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2);
  ctx.stroke();
  ctx.lineWidth = px(0.0072, H);
  ctx.strokeRect(wx, wy, ww, wh);
  // the sill: where she would put her hand
  const sy = wy + wh;
  ctx.fillStyle = hexA(pal.raised, 0.96 * e);
  ctx.fillRect(wx - r.w * 0.05, sy, ww + r.w * 0.10, r.h * 0.055);
  ctx.fillStyle = hexA(pal.ink, 0.14 * e);
  ctx.fillRect(wx - r.w * 0.05, sy, ww + r.w * 0.10, r.h * 0.020);
  // light spilling onto the floor
  const fg = ctx.createLinearGradient(0, sy, 0, r.y + r.h);
  fg.addColorStop(0, hexA(pal.accent, 0.34 * e));
  fg.addColorStop(1, hexA(pal.accent, 0));
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(wx, sy + r.h * 0.055);
  ctx.lineTo(wx + ww, sy + r.h * 0.055);
  ctx.lineTo(wx + ww * 1.30, r.y + r.h);
  ctx.lineTo(wx - ww * 0.30, r.y + r.h);
  ctx.closePath(); ctx.fill();
  for (let i = 0; i < 18; i++) {                 // motes crossing the light
    const q = (u * 0.09 + hash(i)) % 1;
    const x = wx + hash(i + 2) * ww, y = wy + wh - q * wh * 0.95;
    ctx.fillStyle = hexA(pal.ink, Math.sin(q * Math.PI) * 0.30 * e);
    ctx.beginPath(); ctx.arc(x, y, px(0.0013, H) * (0.6 + hash(i + 6) * 1.3), 0, TAU); ctx.fill();
  }
  return r.h;
};

// ---- 遠くなる — falling UP, the opposite of rain --------------------------------------
S.snow = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const hz = r.y + r.h * 0.84;
  const gg = ctx.createLinearGradient(0, hz - r.h * 0.10, 0, r.y + r.h);
  gg.addColorStop(0, hexA(pal.ink, 0.05 * e));
  gg.addColorStop(1, hexA(pal.raised, 0.85 * e));
  ctx.fillStyle = gg; ctx.fillRect(r.x, hz - r.h * 0.10, r.w, r.y + r.h - hz + r.h * 0.10);
  glow(ctx, r.x + r.w * 0.5, hz, r.w * 0.46, ambient(pal), 0.55 * e);
  ctx.strokeStyle = hexA(pal.sub, 0.55 * e); ctx.lineWidth = px(0.0016, H);
  ctx.beginPath(); ctx.moveTo(r.x, hz); ctx.lineTo(r.x + r.w, hz); ctx.stroke();
  for (let i = 0; i < 150; i++) {
    const sp = 0.16 + hash(i) * 0.30;
    const q = 1 - (((u * sp + hash(i + 11)) % 1));        // 1 at the ground, 0 at the top
    const y = hz - q * r.h * 0.86;
    const x = r.x + hash(i + 5) * r.w + Math.sin(u * 0.5 + i) * r.w * 0.020;
    if (y < r.y) continue;
    ctx.fillStyle = hexA(pal.ink, (0.16 + hash(i + 3) * 0.42) * (1 - q * 0.45) * e);
    ctx.beginPath(); ctx.arc(x, y, px(0.0016, H) * (0.5 + hash(i + 7) * 1.5), 0, TAU); ctx.fill();
  }
  return r.h;
};

// ---- 温かく残ってる — light that comes when called --------------------------------------
S.firefly = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const cx = r.x + r.w * 0.5, cy = r.y + r.h * 0.58;
  glow(ctx, cx, cy, r.w * 0.34, ambient(pal), 0.75 * e);
  const N = 60;
  for (let i = 0; i < N; i++) {
    const ki = easeOut(clamp01(u * 0.55 - (i / N) * 0.30)) * e;
    if (ki <= 0.01) continue;
    // each one drifts in from the edge and then orbits, so the swarm gathers rather than blinks
    const ang = hash(i) * TAU + u * (0.12 + hash(i + 2) * 0.20);
    const rad = r.w * (0.06 + hash(i + 4) * 0.30) * (1 - 0.35 * Math.sin(u * 0.4 + i));
    const draw = easeOut(clamp01(u * 0.55 - (i / N) * 0.30));
    const x = cx + Math.cos(ang) * rad * (2 - draw);
    const y = cy + Math.sin(ang) * rad * (2 - draw) * 0.72;
    const pulse = 0.45 + 0.55 * Math.sin(u * 1.1 + i * 1.7);
    const s = px(0.0022, H) * (0.5 + hash(i + 9) * 1.3);
    ctx.fillStyle = hexA(ambient(pal), 0.30 * pulse * ki);
    ctx.beginPath(); ctx.arc(x, y, s * 4.5, 0, TAU); ctx.fill();
    ctx.fillStyle = hexA(pal.accentHot, 0.95 * pulse * ki);
    ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
  }
  return r.h;
};

// ---- the place she is walking through ------------------------------------------------
S.ruin = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const hz = r.y + r.h * 0.80, cx = r.x + r.w * 0.5;
  const gg = ctx.createLinearGradient(0, hz, 0, r.y + r.h);
  gg.addColorStop(0, hexA(pal.ink, 0.06 * e));
  gg.addColorStop(1, hexA(pal.ink, 0.16 * e));
  ctx.fillStyle = gg; ctx.fillRect(r.x, hz, r.w, r.y + r.h - hz);
  glow(ctx, cx, r.y + r.h * 0.30, r.w * 0.40, ambient(pal), 0.60 * e);
  // two piers and the arch over them
  const pw = r.w * 0.115, ph = r.h * 0.56, top = hz - ph;
  [-1, 1].forEach((sd) => {
    const x = cx + sd * r.w * 0.28 - pw / 2;
    const ki = easeOut(clamp01(u * 0.8 - (sd > 0 ? 0.15 : 0))) * e;
    ctx.save(); ctx.globalAlpha *= ki;
    ctx.fillStyle = hexA(pal.raised, 0.95); ctx.fillRect(x, top, pw, ph);
    ctx.fillStyle = hexA(pal.ink, 0.10); ctx.fillRect(x, top, pw * 0.42, ph);
    ctx.strokeStyle = hexA(pal.sub, 0.80); ctx.lineWidth = px(0.0018, H);
    ctx.strokeRect(x, top, pw, ph);
    for (let i = 0; i < 5; i++) {                    // stone courses
      const y = top + (i + 1) * (ph / 6);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + pw, y); ctx.stroke();
    }
    ctx.restore();
  });
  ctx.strokeStyle = hexA(pal.sub, 0.75 * e); ctx.lineWidth = px(0.0060, H);
  ctx.beginPath();
  ctx.moveTo(cx - r.w * 0.34, top + r.h * 0.02);
  ctx.quadraticCurveTo(cx, top - r.h * 0.10, cx + r.w * 0.34, top + r.h * 0.02);
  ctx.stroke();
  ctx.lineWidth = px(0.0016, H);
  ctx.beginPath();
  ctx.moveTo(cx - r.w * 0.30, top + r.h * 0.07);
  ctx.quadraticCurveTo(cx, top - r.h * 0.045, cx + r.w * 0.30, top + r.h * 0.07);
  ctx.stroke();
  // grass and rubble at the base
  for (let i = 0; i < 22; i++) {
    const x = r.x + hash(i) * r.w, y = hz + hash(i + 4) * (r.h - (hz - r.y)) * 0.7;
    const bh = r.h * (0.012 + hash(i + 7) * 0.030);
    ctx.strokeStyle = hexA(pal.sub, 0.45 * e); ctx.lineWidth = px(0.0014, H);
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + r.w * 0.006, y - bh * 0.6, x + r.w * 0.016, y - bh); ctx.stroke();
  }
  return r.h;
};

// ---- a way across nothing -----------------------------------------------------------
S.bridge = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const by = r.y + r.h * 0.62;                       // the deck
  // the drop: what makes it a bridge is that there is something under it
  const dg = ctx.createLinearGradient(0, by, 0, r.y + r.h);
  dg.addColorStop(0, hexA(pal.ink, 0.30 * e));
  dg.addColorStop(1, hexA(pal.bg, 0.98 * e));
  ctx.fillStyle = dg; ctx.fillRect(r.x, by, r.w, r.y + r.h - by);
  glow(ctx, r.x + r.w * 0.5, r.y + r.h * 0.22, r.w * 0.46, ambient(pal), 0.45 * e);
  for (let i = 0; i < 7; i++) {                      // mist below
    const y = by + (i / 7) * (r.y + r.h - by);
    ctx.fillStyle = hexA(pal.sub, (1 - i / 7) * 0.14 * e);
    ctx.fillRect(r.x, y, r.w, r.h * 0.02);
  }
  // planks, laid from the far end forwards
  const N = 16;
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const ki = easeOut(clamp01(u * 1.0 - (N - 1 - i) * 0.16)) * e;
    if (ki <= 0.01) continue;
    const y = by + f * r.h * 0.045;
    const w = r.w * (0.62 + f * 0.44), x = r.x + r.w * 0.5 - w / 2;
    ctx.save(); ctx.globalAlpha *= ki;
    ctx.fillStyle = hexA(pal.raised, 0.95); ctx.fillRect(x, y, w, r.h * 0.030);
    ctx.fillStyle = hexA(pal.ink, 0.13); ctx.fillRect(x, y, w, r.h * 0.010);
    ctx.strokeStyle = hexA(pal.sub, 0.55); ctx.lineWidth = px(0.0012, H);
    ctx.strokeRect(x, y, w, r.h * 0.030);
    ctx.restore();
  }
  // handrail posts, converging
  [-1, 1].forEach((sd) => {
    for (let i = 0; i < 8; i++) {
      const f = i / 7;
      const x = r.x + r.w * 0.5 + sd * r.w * (0.30 + f * 0.22);
      const y = by + f * r.h * 0.045;
      const ki = easeOut(clamp01(u * 1.0 - (7 - i) * 0.16)) * e;
      ctx.save(); ctx.globalAlpha *= ki;
      ctx.strokeStyle = hexA(pal.sub, 0.70); ctx.lineWidth = px(0.0022, H);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r.h * (0.10 + f * 0.06)); ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = hexA(pal.sub, 0.55 * e); ctx.lineWidth = px(0.0020, H);
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * 0.5 + sd * r.w * 0.30, by - r.h * 0.10);
    ctx.lineTo(r.x + r.w * 0.5 + sd * r.w * 0.52, by + r.h * 0.045 - r.h * 0.16);
    ctx.stroke();
  });
  return r.h;
};

// ---- a ledge over nothing ------------------------------------------------------------
// A HORIZONTAL frame. Everything else in this file is centred or vertical, and a film made
// only of centred frames looks like one wallpaper recoloured.
S.cliff = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const edgeY = r.y + r.h * 0.615;                  // where the rock stops
  glow(ctx, r.x + r.w * 0.5, edgeY - r.h * 0.04, r.w * 0.50, ambient(pal), 0.55 * e);
  // the sea of cloud, below the edge
  const cg = ctx.createLinearGradient(0, edgeY, 0, r.y + r.h);
  cg.addColorStop(0, hexA(pal.glow, 0.42 * e));
  cg.addColorStop(0.35, hexA(pal.raised, 0.80 * e));
  cg.addColorStop(1, hexA(pal.ink, 0.18 * e));
  ctx.fillStyle = cg; ctx.fillRect(r.x, edgeY, r.w, r.y + r.h - edgeY);
  for (let i = 0; i < 9; i++) {                      // cloud banks, sliding sideways
    const y = edgeY + r.h * (0.05 + i * 0.045);
    const dd = Math.sin(u * 0.12 + i * 0.9) * r.w * 0.03;
    ctx.fillStyle = hexA(pal.raised, (0.75 - i * 0.06) * e);
    ctx.beginPath();
    ctx.ellipse(r.x + r.w * (0.2 + hash(i) * 0.6) + dd, y, r.w * (0.34 + hash(i + 3) * 0.26), r.h * 0.030, 0, 0, TAU);
    ctx.fill();
  }
  // the rock she is standing on: near edge, so the drop reads as a drop
  ctx.beginPath();
  ctx.moveTo(r.x, r.y + r.h);
  ctx.lineTo(r.x, edgeY + r.h * 0.055);
  ctx.quadraticCurveTo(r.x + r.w * 0.16, edgeY - r.h * 0.012, r.x + r.w * 0.30, edgeY);
  ctx.lineTo(r.x + r.w * 0.30, edgeY);
  ctx.lineTo(r.x + r.w * 0.34, r.y + r.h);
  ctx.closePath();
  ctx.fillStyle = hexA(bodyInk(pal), 0.96 * e); ctx.fill();
  ctx.strokeStyle = hexA(pal.sub, 0.45 * e); ctx.lineWidth = px(0.0016, H); ctx.stroke();
  for (let i = 0; i < 7; i++) {                      // strata
    const y = edgeY + r.h * (0.03 + i * 0.055);
    ctx.strokeStyle = hexA(pal.sub, 0.22 * e); ctx.lineWidth = px(0.0012, H);
    ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w * (0.30 + hash(i) * 0.04), y - r.h * 0.006); ctx.stroke();
  }
  ctx.strokeStyle = hexA(pal.sub, 0.50 * e); ctx.lineWidth = px(0.0015, H);
  ctx.beginPath(); ctx.moveTo(r.x, edgeY + r.h * 0.052); ctx.lineTo(r.x + r.w * 0.30, edgeY); ctx.stroke();
  return r.h;
};

// ---- 灯 — small lights going up -------------------------------------------------------
// The only motif in the film with an UPWARD flow. Drift is downward, rain is downward,
// snow is upward but scattered; this one is a column, and that is its whole job.
S.lanterns = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const hz = r.y + r.h * 0.88;
  const gg = ctx.createLinearGradient(0, r.y, 0, hz);
  gg.addColorStop(0, hexA(pal.ink, 0.12 * e));
  gg.addColorStop(1, hexA(pal.ink, 0.02 * e));
  ctx.fillStyle = gg; ctx.fillRect(r.x, r.y, r.w, hz - r.y);
  ctx.fillStyle = hexA(bodyInk(pal), 0.55 * e);
  ctx.fillRect(r.x, hz, r.w, r.y + r.h - hz);
  const N = 26;
  for (let i = 0; i < N; i++) {
    const sp = 0.09 + hash(i) * 0.13;
    const q = (u * sp + hash(i + 21)) % 1;                  // 0 at the ground, 1 at the top
    const y = hz - q * r.h * 0.94;
    const x = r.x + r.w * (0.14 + hash(i + 5) * 0.72) + Math.sin(u * 0.35 + i * 1.3) * r.w * 0.030;
    const fade = Math.sin(clamp01(q * 1.15) * Math.PI) * 0.9 + 0.1;
    const s = px(0.0085, H) * (0.55 + hash(i + 9) * 0.75) * (1 - q * 0.35);
    const a = fade * e;
    glow(ctx, x, y, s * 5.5, ambient(pal), 0.42 * a);
    ctx.fillStyle = hexA(pal.accentHot, 0.94 * a);
    ctx.beginPath();
    ctx.moveTo(x, y - s * 1.25); ctx.lineTo(x + s * 0.78, y);
    ctx.lineTo(x, y + s * 1.25); ctx.lineTo(x - s * 0.78, y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hexA(pal.ink, 0.30 * a); ctx.lineWidth = px(0.0012, H); ctx.stroke();
  }
  return r.h;
};

// ---- 水面 — the frame that answers her with herself -------------------------------
// A mirrored composition. The reflection is drawn by the figure itself (figure.mirror), so
// what she sees under the water is really her, upside down and dimmed.
S.mirror = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const wy = r.y + r.h * 0.66;                            // the waterline
  glow(ctx, r.x + r.w * 0.5, wy - r.h * 0.18, r.w * 0.44, ambient(pal), 0.70 * e);
  ctx.fillStyle = hexA(pal.raised, 0.60 * e);
  ctx.fillRect(r.x, r.y, r.w, wy - r.y);
  // the water: darker than the air, and banded
  const wg = ctx.createLinearGradient(0, wy, 0, r.y + r.h);
  wg.addColorStop(0, hexA(pal.ink, 0.16 * e));
  wg.addColorStop(1, hexA(pal.ink, 0.36 * e));
  ctx.fillStyle = wg; ctx.fillRect(r.x, wy, r.w, r.y + r.h - wy);
  for (let i = 0; i < 22; i++) {                          // ripples, sparse and slow
    const y = wy + Math.pow(i / 22, 1.5) * (r.y + r.h - wy);
    const bw = r.w * (0.06 + hash(i) * 0.20);
    const x = r.x + r.w * 0.5 + Math.sin(u * 0.30 + i * 0.7) * r.w * 0.16 - bw / 2;
    ctx.fillStyle = hexA(pal.sub, (0.30 - (i / 22) * 0.20) * e);
    ctx.fillRect(x, y, bw, px(0.0016, H));
  }
  ctx.strokeStyle = hexA(pal.sub, 0.65 * e); ctx.lineWidth = px(0.0020, H);
  ctx.beginPath(); ctx.moveTo(r.x, wy); ctx.lineTo(r.x + r.w, wy); ctx.stroke();
  return r.h;
};

// ---- a long room ------------------------------------------------------------------
// The only strong one-point perspective in the file. Columns converging is a completely
// different graphic from a circle, which is why it is here.
S.corridor = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const vy = r.y + r.h * 0.60, vx = r.x + r.w * 0.5;
  glow(ctx, vx, vy, r.w * 0.22, ambient(pal), 0.85 * e);
  const gg = ctx.createLinearGradient(0, r.y + r.h * 0.78, 0, r.y + r.h);
  gg.addColorStop(0, hexA(pal.ink, 0.06 * e));
  gg.addColorStop(1, hexA(pal.ink, 0.20 * e));
  ctx.fillStyle = gg; ctx.fillRect(r.x, r.y + r.h * 0.78, r.w, r.h * 0.22);
  for (let i = 0; i < 7; i++) {
    const f = 1 - Math.pow(i / 7, 1.25);                  // 1 = nearest
    const ki = easeOut(clamp01(u * 0.8 - i * 0.16)) * e;
    if (ki <= 0.01) continue;
    [-1, 1].forEach((sd) => {
      const x = vx + sd * (r.w * 0.10 + f * r.w * 0.42);
      const topY = vy - f * r.h * 0.52, botY = vy + f * r.h * 0.34;
      const pw = r.w * (0.012 + f * 0.055);
      ctx.save(); ctx.globalAlpha *= ki;
      ctx.fillStyle = hexA(pal.raised, 0.94);
      ctx.fillRect(x - pw / 2, topY, pw, botY - topY);
      ctx.fillStyle = hexA(pal.ink, 0.13);
      ctx.fillRect(x - pw / 2, topY, pw * 0.40, botY - topY);
      ctx.strokeStyle = hexA(pal.sub, 0.62); ctx.lineWidth = px(0.0014, H);
      ctx.strokeRect(x - pw / 2, topY, pw, botY - topY);
      ctx.restore();
    });
    // the floor line and the ceiling line of that bay
    ctx.strokeStyle = hexA(pal.sub, 0.20 * ki); ctx.lineWidth = px(0.0012, H);
    ctx.beginPath();
    ctx.moveTo(vx - (r.w * 0.10 + f * r.w * 0.42), vy + f * r.h * 0.34);
    ctx.lineTo(vx + (r.w * 0.10 + f * r.w * 0.42), vy + f * r.h * 0.34);
    ctx.stroke();
  }
  return r.h;
};

// ---- 草 — a wide, low, lateral texture ----------------------------------------------
S.field = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const hz = r.y + r.h * 0.44;
  const gg = ctx.createLinearGradient(0, hz, 0, r.y + r.h);
  gg.addColorStop(0, hexA(pal.raised, 0.55 * e));
  gg.addColorStop(1, hexA(pal.ink, 0.20 * e));
  ctx.fillStyle = gg; ctx.fillRect(r.x, hz, r.w, r.y + r.h - hz);
  glow(ctx, r.x + r.w * 0.5, hz - r.h * 0.02, r.w * 0.60, ambient(pal), 0.45 * e);
  ctx.strokeStyle = hexA(pal.sub, 0.40 * e); ctx.lineWidth = px(0.0014, H);
  ctx.beginPath(); ctx.moveTo(r.x, hz); ctx.lineTo(r.x + r.w, hz); ctx.stroke();
  // blades, in three depth bands, all leaning the same way — the wind is one direction
  for (let i = 0; i < 210; i++) {
    const band = i % 3;
    const f = [0.22, 0.52, 0.84][band] + hash(i) * 0.16;
    const y = hz + f * (r.y + r.h - hz);
    const x = r.x + hash(i + 17) * r.w + Math.sin(u * 0.55 + f * 4) * r.w * 0.012;
    const bh = r.h * (0.035 + hash(i + 31) * 0.075) * (0.4 + f);
    const lean = r.w * 0.028 * (0.4 + f);
    ctx.strokeStyle = hexA(band === 2 ? pal.ink : pal.sub, (0.20 + f * 0.42) * e);
    ctx.lineWidth = px(0.0013 + f * 0.0012, H);
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.45, y - bh * 0.62, x + lean, y - bh);
    ctx.stroke();
  }
  return r.h;
};

// ---- 月 — the largest single shape the film has --------------------------------------
S.moon = (ctx, b, r, H, pal, k, env) => {
  const u = env.u || 0, e = easeOut(clamp01(k));
  wash(ctx, r, pal, e);
  const hz = r.y + r.h * 0.74;
  const mx = r.x + r.w * 0.63, my = r.y + r.h * 0.34, mr = r.h * 0.26;
  glow(ctx, mx, my, mr * 3.1, ambient(pal), 0.80 * e);
  ctx.fillStyle = hexA(pal.raised, 0.96 * e);
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
  ctx.strokeStyle = hexA(pal.sub, 0.35 * e); ctx.lineWidth = px(0.0016, H); ctx.stroke();
  for (let i = 0; i < 9; i++) {                         // maria, so it is a place not a disc
    const a = hash(i) * TAU, d = hash(i + 5) * mr * 0.72;
    ctx.fillStyle = hexA(pal.sub, 0.16 * e);
    ctx.beginPath();
    ctx.arc(mx + Math.cos(a) * d, my + Math.sin(a) * d, mr * (0.08 + hash(i + 9) * 0.16), 0, TAU);
    ctx.fill();
  }
  const gg = ctx.createLinearGradient(0, hz, 0, r.y + r.h);
  gg.addColorStop(0, hexA(pal.ink, 0.08 * e));
  gg.addColorStop(1, hexA(pal.ink, 0.26 * e));
  ctx.fillStyle = gg; ctx.fillRect(r.x, hz, r.w, r.y + r.h - hz);
  ctx.strokeStyle = hexA(pal.sub, 0.50 * e); ctx.lineWidth = px(0.0016, H);
  ctx.beginPath(); ctx.moveTo(r.x, hz); ctx.lineTo(r.x + r.w, hz); ctx.stroke();
  // the moon's road on the water
  for (let i = 0; i < 16; i++) {
    const f = i / 16;
    const y = hz + f * (r.y + r.h - hz);
    const w = r.w * (0.04 + f * 0.10) * (0.6 + hash(i) * 0.8);
    const x = mx + Math.sin(u * 0.25 + i * 1.1) * r.w * 0.02 - w / 2;
    ctx.fillStyle = hexA(ambient(pal), (1 - f) * 0.42 * e);
    ctx.fillRect(x, y, w, px(0.0018, H));
  }
  return r.h;
};

/** The motif names a deck may use. */
export const MOTIF_NAMES = Object.keys(S);

/**
 * Draw a `scene` block. b.motif picks the painter; anything else in b is passed through.
 *
 * `b.figure` is drawn AFTER the motif: she stands in the place, not in front of a backdrop.
 * That ordering is also why the same motif can come back later — same room, different body.
 */
export function drawScene(ctx, b, r, H, pal, k, env) {
  const fn = S[b.motif] || S.ember;
  const used = fn(ctx, b, r, H, pal, k, env);
  if (b.figure) drawFigure(ctx, b, r, H, pal, { ...(env || {}), k });
  return used;
}

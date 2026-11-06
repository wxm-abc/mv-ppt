// figure.js — the protagonist.
//
// A film about a song needs someone in it. Without a body, 83 shots of motifs are 83
// wallpapers; with one, the same motif photographed twice is two different shots, because
// she is somewhere else in the frame doing something else.
//
// She is drawn as a silhouette + rim light, never as a face: a face at this size is a smudge
// and a smudge reads as a mistake. What identifies her across the film is the long hair, the
// cloak, and the lamp she carries.
//
// Pure and deterministic, same contract as scenes.js: hash(i) for jitter, env.u (beats since
// the page turned) for motion, so frame 6000 renders identically on its own.

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const px = (f, H) => Math.max(1, f * H);

function hexA(hex, a) {
  const h = (hex || '#ffffff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function mixHex(a, b, t) {
  const p = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const m = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
}

const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function lum(hex) {
  const h = (hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

const light = (pal) => lum(pal.bg) > 0.6;
const ambient = (pal) => (light(pal) ? mixHex(pal.glow, pal.accent, 0.5) : pal.glow);

/**
 * What colour a body is on this page.
 *
 * On a dark page a silhouette has to be DARKER than the background or it is a cut-out hole;
 * on a light page it has to be darker too, but there it is made from the ink so it stays in
 * the palette instead of turning black. Same idea either way: a body is the absence of light.
 */
const bodyOf = (pal) => (light(pal) ? mixHex(pal.bg, pal.ink, 0.92) : mixHex(pal.bg, '#000000', 0.60));

/** The rim: the light behind her catching the edge of the cloak. */
const rimOf = (pal) => (light(pal) ? pal.accent : ambient(pal));

/** The one who is not here any more: present, but made of the room rather than of body. */
const ghostOf = (pal) => (light(pal) ? mixHex(pal.bg, pal.ink, 0.34) : mixHex(pal.bg, ambient(pal), 0.26));

const POSES = ['walk', 'stand', 'sit', 'kneel', 'reach', 'lookup', 'back', 'crouch'];

/**
 * The skeleton, per pose.
 *
 * `hip / sh / head / hr` are fractions of the height the pose OCCUPIES ON SCREEN. That
 * distinction is the whole point: an earlier version kept the standing skeleton and merely
 * squashed it, so sitting and kneeling both came out as the same figure that had been sat on.
 * A seated hip is at 0.115 of the seated height, not at 0.47 of it, and a seated head is
 * proportionally much bigger — which is exactly what makes the pose readable.
 * `H` is the pose height relative to standing: used to keep her WIDTH constant, so she does
 * not get thinner every time the camera comes closer.
 * `hem` = how far the cloak hangs above the ground; `hair` = hair length, in screen height.
 */
const BONES = {
  stand:  { H: 1.00, hip: 0.470, sh: 0.868, head: 0.938, hr: 0.060, hem: 0.300, hair: 0.500 },
  walk:   { H: 1.00, hip: 0.470, sh: 0.868, head: 0.938, hr: 0.060, hem: 0.330, hair: 0.500 },
  lookup: { H: 1.00, hip: 0.470, sh: 0.868, head: 0.938, hr: 0.060, hem: 0.300, hair: 0.530 },
  reach:  { H: 1.00, hip: 0.470, sh: 0.868, head: 0.938, hr: 0.060, hem: 0.300, hair: 0.500 },
  crouch: { H: 0.80, hip: 0.300, sh: 0.700, head: 0.872, hr: 0.079, hem: 0.130, hair: 0.440 },
  kneel:  { H: 0.72, hip: 0.235, sh: 0.650, head: 0.855, hr: 0.088, hem: 0.100, hair: 0.520 },
  sit:    { H: 0.56, hip: 0.115, sh: 0.605, head: 0.845, hr: 0.112, hem: 0.035, hair: 0.720 },
};

// ---- one body ------------------------------------------------------------------
/**
 * @param o  { x, y, h, facing, pose, u, body, rim, H, ghost, lamp, seed, alpha }
 *   x,y = ground point under the feet; h = full standing height.
 */
function person(ctx, o) {
  const { x, y, h, facing = 1, pose = 'stand', u = 0, body, rim, H, ghost = false } = o;
  const f = facing === 0 ? 1 : facing;          // 0 = seen from behind; geometry still needs a side
  const back = facing === 0;

  const B = BONES[pose] || BONES.stand;
  const hh = h;                    // the height this pose OCCUPIES — the vertical reference
  const hw = h / B.H;              // who she IS, independent of how close the camera is

  const hipY = y - h * B.hip;
  const shY = y - h * B.sh;
  const headR = h * B.hr;
  const headY = y - h * B.head;

  // stride: one step every ~1.5 beats at any tempo (u is in beats)
  const ph = u * (TAU / 3);
  const walking = pose === 'walk';
  const sw = walking ? Math.sin(ph) : 0;
  const bob = walking ? Math.abs(Math.cos(ph)) * hh * 0.012 : 0;

  ctx.save();
  ctx.translate(0, -bob);

  // ---- shadow on the ground: without it she floats
  if (!ghost) {
    ctx.fillStyle = hexA(body, o.groundA ?? 0.30);
    ctx.beginPath();
    ctx.ellipse(x, y + hw * 0.012, hw * 0.20, hw * 0.030, 0, 0, TAU);
    ctx.fill();
  }

  // ---- legs
  const legW = Math.max(1.6, hw * 0.052);
  ctx.strokeStyle = body; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (pose === 'sit') {
    // Sitting on the ground: the hip is nearly ON the floor (0.115 of the seated height, not
    // the standing 0.47), and both legs go out in front with the knee above the hip.
    ctx.lineWidth = legW;
    ctx.beginPath();
    ctx.moveTo(x - f * hw * 0.045, hipY);
    ctx.quadraticCurveTo(x + f * hw * 0.16, y - hh * 0.30, x + f * hw * 0.34, y - hh * 0.015);
    ctx.lineTo(x + f * hw * 0.42, y);                                   // shin down to the foot
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + f * hw * 0.035, hipY);
    ctx.quadraticCurveTo(x + f * hw * 0.20, y - hh * 0.25, x + f * hw * 0.30, y - hh * 0.010);
    ctx.stroke();
  } else if (pose === 'kneel') {
    // one knee down, the other foot planted in front — the pose in "she sinks to the floor"
    ctx.lineWidth = legW;
    ctx.beginPath();
    ctx.moveTo(x - f * hw * 0.055, hipY);
    ctx.lineTo(x + f * hw * 0.075, y - hh * 0.015);                     // this knee is on the ground
    ctx.lineTo(x - f * hw * 0.075, y - hh * 0.030);                     // and the shin trails behind
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + f * hw * 0.030, hipY);
    ctx.lineTo(x + f * hw * 0.190, y - hh * 0.235);                     // thigh up
    ctx.lineTo(x + f * hw * 0.215, y);                                  // shin down, foot flat
    ctx.stroke();
  } else if (pose === 'crouch') {
    ctx.lineWidth = legW;
    [-1, 1].forEach((sd) => {
      ctx.beginPath();
      ctx.moveTo(x + sd * hw * 0.040, hipY);
      ctx.lineTo(x + f * hw * 0.115 + sd * hw * 0.030, y - hh * 0.170);  // knee forward and up
      ctx.lineTo(x + f * hw * 0.045 + sd * hw * 0.030, y);
      ctx.stroke();
    });
  } else {
    const lift = walking ? hh * 0.030 : 0;
    [-1, 1].forEach((sd) => {
      const s2 = walking ? (sd === 1 ? sw : -sw) : 0;
      const footY = y - (walking && s2 > 0 ? lift : 0);
      ctx.lineWidth = legW;
      ctx.beginPath();
      ctx.moveTo(x + sd * hw * 0.035, hipY);
      ctx.quadraticCurveTo(x + sd * hw * 0.05 + s2 * hw * 0.05, (hipY + footY) / 2,
        x + sd * hw * 0.045 + s2 * hw * 0.10, footY);
      ctx.stroke();
    });
  }

  // ---- cloak: the actual mass of her. Wider at the hem than at the shoulder, and the hem
  // swings a beat behind the step, which is the only thing that sells "walking".
  const swing = walking ? -sw * hw * 0.045 : (pose === 'lookup' ? 0 : Math.sin(u * 0.5) * hw * 0.012);
  const wSh = hw * 0.115;
  // How far the hem hangs above the ground DEPENDS ON THE POSE. Standing it stops at the shin;
  // sitting or kneeling it has to reach the floor, or the cloth buries the bent legs and the
  // whole woman comes out as one lump.
  const hemY = y - h * B.hem;
  const wHem = hw * 0.185;
  // Cloak with a WAIST. Dropping straight from the shoulders to a wide hem is a bell, and a
  // bell is what she looked like before this: pinching at the middle is what makes the shape
  // read as a person wearing something.
  const waistY = shY + (hemY - shY) * 0.52, wWaist = wSh * 0.86;
  ctx.beginPath();
  ctx.moveTo(x - wSh, shY);
  ctx.quadraticCurveTo(x - wSh * 1.06, shY + (hemY - shY) * 0.30, x - wWaist, waistY);
  ctx.quadraticCurveTo(x - wHem * 0.95, waistY + (hemY - waistY) * 0.60, x - wHem + swing * 0.5, hemY);
  ctx.quadraticCurveTo(x, hemY + hw * 0.038, x + wHem + swing * 0.5, hemY);
  ctx.quadraticCurveTo(x + wHem * 0.95, waistY + (hemY - waistY) * 0.60, x + wWaist, waistY);
  ctx.quadraticCurveTo(x + wSh * 1.06, shY + (hemY - shY) * 0.30, x + wSh, shY);
  ctx.quadraticCurveTo(x, shY - hw * 0.055, x - wSh, shY);
  ctx.closePath();
  ctx.fillStyle = body; ctx.fill();
  if (!ghost) {
    ctx.strokeStyle = hexA(rim, 0.55 * (o.alpha ?? 1)); ctx.lineWidth = Math.max(1, hw * 0.008);
    ctx.stroke();
  }

  // ---- arm + the lamp. The lamp is her only light source; it is why she can be a silhouette
  // at all, and it is the thing the eye follows from shot to shot.
  const armW = Math.max(1.4, hw * 0.040);
  ctx.strokeStyle = body;
  if (pose === 'reach') {
    const t = 0.5 + 0.5 * Math.sin(u * 0.7);
    const ax = x + f * hw * (0.16 + t * 0.10), ay = shY + hw * (0.10 - t * 0.16);
    ctx.lineWidth = armW;
    ctx.beginPath(); ctx.moveTo(x + f * wSh * 0.7, shY + hw * 0.02);
    ctx.quadraticCurveTo(x + f * hw * 0.20, shY + hw * 0.10, ax, ay); ctx.stroke();
    if (o.lamp) lamp(ctx, ax, ay + hw * 0.06, hw, rim, o.alpha ?? 1, u);
  } else if (pose === 'lookup') {
    ctx.lineWidth = armW;
    ctx.beginPath(); ctx.moveTo(x - f * wSh * 0.7, shY + hw * 0.02);
    ctx.lineTo(x - f * hw * 0.13, shY + hw * 0.20); ctx.stroke();   // arm down, she is still
    if (o.lamp) lamp(ctx, x - f * hw * 0.15, shY + hw * 0.26, hw, rim, o.alpha ?? 1, u);
  } else {
    ctx.lineWidth = armW;
    ctx.beginPath(); ctx.moveTo(x + f * wSh * 0.75, shY + hw * 0.03);
    ctx.lineTo(x + f * hw * 0.145, shY + hw * 0.20); ctx.stroke();
    if (o.lamp) lamp(ctx, x + f * hw * 0.165, shY + hw * 0.26, hw, rim, o.alpha ?? 1, u);
  }

  // ---- head, tilted when she looks up or down
  const tilt = pose === 'lookup' ? -0.22 : pose === 'crouch' ? 0.26 : pose === 'sit' ? 0.12 : 0;
  ctx.save();
  ctx.translate(x, headY); ctx.rotate(tilt * f);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(0, 0, headR, 0, TAU); ctx.fill();
  if (!back) {
    // pointed ears — the only "character" detail; two triangles, no face
    ctx.beginPath();
    ctx.moveTo(f * headR * 0.55, -headR * 0.35);
    ctx.lineTo(f * headR * 2.15, -headR * 0.95);
    ctx.lineTo(f * headR * 0.75, headR * 0.10);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // ---- long hair. Drawn AFTER the head so it falls in front of the shoulders; this is the
  // silhouette cue that makes her the same person in shot 3 and in shot 70.
  const hairLen = h * B.hair;
  const hairW = headR * 0.86;
  const drift = Math.sin(u * 0.62 + (o.seed || 0)) * hw * 0.022 + swing * 0.35;
  ctx.fillStyle = body;
  [-1, 1].forEach((sd) => {
    ctx.beginPath();
    ctx.moveTo(x + sd * hairW * 0.95, headY - headR * 0.15);
    ctx.quadraticCurveTo(x + sd * hairW * 1.55, headY + hairLen * 0.55,
      x + sd * hairW * (1.05 + 0.5 * hash(o.seed || 0)) + drift, headY + hairLen);
    ctx.quadraticCurveTo(x + sd * hairW * 0.55, headY + hairLen * 0.72, x + sd * hairW * 0.30, headY + headR * 0.55);
    ctx.closePath(); ctx.fill();
    // one split end, so it is hair and not a cape
    ctx.beginPath();
    ctx.moveTo(x + sd * hairW * (1.0 + 0.4 * hash((o.seed || 0) + 3)) + drift, headY + hairLen * 0.86);
    ctx.quadraticCurveTo(x + sd * hairW * 1.7 + drift * 1.4, headY + hairLen * 1.16,
      x + sd * hairW * 0.85 + drift * 1.2, headY + hairLen * 1.20);
    ctx.closePath(); ctx.fill();
  });
  // the crown, so the silhouette closes at the top
  ctx.beginPath();
  ctx.ellipse(x, headY - headR * 0.18, hairW * 1.10, headR * 1.02, 0, Math.PI, TAU);
  ctx.fill();

  if (!ghost) {
    // rim light down one side: the light behind her, catching one edge only
    ctx.strokeStyle = hexA(rim, 0.85 * (o.alpha ?? 1));
    ctx.lineWidth = Math.max(1, hw * 0.0075); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - f * wSh * 0.98, shY + hw * 0.01);
    ctx.quadraticCurveTo(x - f * wSh * 1.22, (shY + hemY) / 2, x - f * wHem * 0.92 + swing * 0.5, hemY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - f * headR * 0.80, headY - headR * 0.55);
    ctx.quadraticCurveTo(x - f * headR * 1.05, headY - headR * 0.10, x - f * hairW * 1.02, headY + hairLen * 0.42);
    ctx.stroke();
  }

  ctx.restore();
}

/** A small lantern: a lit rectangle and the pool of light it throws. */
function lamp(ctx, x, y, h, rim, alpha, u) {
  const s = h * 0.055;
  const flick = 0.86 + 0.14 * Math.sin(u * 2.4);
  const g = ctx.createRadialGradient(x, y, 0, x, y, s * 7);
  g.addColorStop(0, hexA(rim, 0.42 * flick * alpha));
  g.addColorStop(0.4, hexA(rim, 0.14 * flick * alpha));
  g.addColorStop(1, hexA(rim, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, s * 7, 0, TAU); ctx.fill();
  ctx.fillStyle = hexA(rim, 0.95 * flick * alpha);
  ctx.fillRect(x - s * 0.5, y - s * 0.7, s, s * 1.4);
}

// ---- the public entry point ----------------------------------------------------
/**
 * Draw one or two figures. Called by drawScene() after the motif, so she stands IN the place
 * rather than in front of a backdrop.
 *
 * The block carries:
 *   { at:[x,y], s, facing, pose, ghost, lamp, alpha, seed }
 *   at  = [0..1, 0..1] within the shot rect, y = the ground under her feet
 *   s   = height as a fraction of frame height (0.10 = far away, 0.62 = close)
 *   and optionally `also`: a second figure (the one who is not here any more).
 */
export function drawFigure(ctx, b, r, H, pal, env) {
  const u = env?.u || 0;
  const fg = b.figure;
  if (!fg) return;
  const list = [fg, ...(fg.also ? [fg.also] : [])];
  const ap = easeOut(clamp01(env?.k ?? 1));

  // The reflection goes down before the body, and it is the SAME body — flipped about the
  // waterline and dimmed. Anything else (a second, separate drawing) drifts out of sync the
  // moment she moves.
  if (fg.mirror != null) {
    ctx.save();
    ctx.translate(0, 2 * (r.y + fg.mirror * r.h));
    ctx.scale(1, -1);
    ctx.globalAlpha *= 0.34;
    for (const o of list) drawOne(ctx, o, r, H, pal, u, ap * 0.9);
    ctx.restore();
  }

  for (const o of list) drawOne(ctx, o, r, H, pal, u, ap);
}

function drawOne(ctx, o, r, H, pal, u, ap) {    const ghost = !!o.ghost;
    const [fx, fy] = o.at || [0.5, 0.92];
    const s = o.s ?? 0.34;
    const h = px(s, H);
    const seed = o.seed ?? 0;
    ctx.save();
    ctx.globalAlpha *= clamp01((o.alpha ?? 1) * ap);
    person(ctx, {
      x: r.x + fx * r.w,
      y: r.y + fy * r.h,
      h,
      facing: o.facing ?? 1,
      pose: POSES.includes(o.pose) ? o.pose : 'stand',
      u: u + (seed % 7) * 0.31,
      body: ghost ? ghostOf(pal) : bodyOf(pal),
      rim: rimOf(pal),
      H,
      ghost,
      lamp: !!o.lamp && !ghost,
      seed,
      alpha: (o.alpha ?? 1) * ap,
      groundA: ghost ? 0 : 0.30,
    });
  ctx.restore();
}

export const FIGURE_POSES = POSES;

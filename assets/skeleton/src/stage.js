// The stage: the room the deck is projected into.
//
// The deck supplies the PAGES (grid, type, graphics). The stage supplies the PLACE: a lit wall
// behind the page, dust in the beam in front of it. Without it a code-rendered deck reads as a
// screencast; with it, the page is an object sitting in light.
//
// Two layers, because the page goes BETWEEN them:
//   back()        the wall, its light, and a faint grid — the slide master showing through
//   frontLayer()  dust in the beam, and one soft leak of light across the top of the frame
//
// Everything is a pure function of (film time, page, theme). No state carried between frames.
// Colours come from the page's theme, so the room changes colour with the page and never before it.

const VW = 1920, VH = 1080;
const TAU = Math.PI * 2;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const span = (t, a, b) => clamp01((t - a) / (b - a));

/** Stable pseudo-random in [0,1) from an integer — deterministic, so frame 6000 is reproducible. */
const hash = (n) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

const hexA = (hex, a) => {
  const h = (hex || '#ffffff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function mkCanvas() {
  const c = document.createElement('canvas');
  c.width = VW; c.height = VH;
  return c;
}

export class Stage {
  /** @param cfg the film's config.json  @param palettes buildPalettes(cfg.palettes) */
  constructor(cfg, palettes) {
    this.cfg = cfg || {};
    this.palettes = palettes || {};
    this.backCv = mkCanvas();
    this.frontCv = mkCanvas();
    this.b = this.backCv.getContext('2d', { alpha: false });
    this.f = this.frontCv.getContext('2d');
    this.tv = 0;
    this.shot = { index: 0, bounds: { a: 0, b: 1 } };
    this.th = null;
  }

  /** Called once per frame, before either layer is read. Returns this, so it chains. */
  update(tv, shot, theme) {
    this.tv = tv;
    this.shot = shot || this.shot;
    if (theme) this.th = theme;
    return this;
  }

  /** The wall behind the page. Returns a 1920x1080 canvas; the caller scales it to the frame. */
  back(cam) {
    const c = this.b, th = this.th;
    const tv = this.tv;
    const B = this.shot.bounds || { a: 0, b: 1 };
    const p = span(tv, B.a, B.b);

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, VW, VH);
    if (!th) { c.fillStyle = '#101014'; c.fillRect(0, 0, VW, VH); return this.backCv; }

    // the wall itself: lit from the upper left, cooling toward the lower right
    c.fillStyle = th.bg;
    c.fillRect(0, 0, VW, VH);
    let g = c.createLinearGradient(0, 0, VW, VH);
    g.addColorStop(0, hexA(th.plate, 0.85));
    g.addColorStop(0.55, hexA(th.bg, 0.20));
    g.addColorStop(1, hexA(th.plate, 0.55));
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);

    // the light on it: one soft pool, breathing slowly, opening up as the page runs on
    const breathe = 0.5 + 0.5 * Math.sin(tv * 0.42);
    const a = 0.16 + 0.07 * breathe + 0.06 * p;
    g = c.createRadialGradient(VW * 0.30, VH * 0.18, 0, VW * 0.30, VH * 0.18, VH * 1.05);
    g.addColorStop(0, hexA(th.glow, a));
    g.addColorStop(0.45, hexA(th.accent, a * 0.28));
    g.addColorStop(1, hexA(th.bg, 0));
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);

    g = c.createRadialGradient(VW * 0.86, VH * 0.92, 0, VW * 0.86, VH * 0.92, VH * 0.75);
    g.addColorStop(0, hexA(th.accentDim, 0.14));
    g.addColorStop(1, hexA(th.bg, 0));
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);

    // the grid: the slide master, barely there. It is what makes a page read as DESIGNED rather
    // than as words floating on a colour.
    const cols = 12, m = 0.078;
    c.strokeStyle = hexA(th.line, 0.16);
    c.lineWidth = 1.5;
    for (let i = 0; i <= cols; i++) {
      const x = VW * (m + (1 - 2 * m) * (i / cols));
      c.beginPath(); c.moveTo(x, VH * m * 0.7); c.lineTo(x, VH * (1 - m * 0.7)); c.stroke();
    }
    for (const y of [0.105, 0.5, 0.895]) {
      c.beginPath(); c.moveTo(VW * m * 0.8, VH * y); c.lineTo(VW * (1 - m * 0.8), VH * y); c.stroke();
    }

    // one slow sheen crossing the wall, so it is never a frozen gradient
    const sx = ((tv * 0.055) % 1.6) - 0.3;
    g = c.createLinearGradient(VW * sx, 0, VW * (sx + 0.45), VH);
    g.addColorStop(0, hexA(th.glow, 0));
    g.addColorStop(0.5, hexA(th.glow, 0.05));
    g.addColorStop(1, hexA(th.glow, 0));
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);

    // the page turn lifts the wall a little: the room notices the cut
    const into = span(tv, B.a, B.a + 0.42);
    if (this.shot.index > 0 && into < 1) {
      c.fillStyle = hexA(th.glow, 0.10 * (1 - into));
      c.fillRect(0, 0, VW, VH);
    }
    void cam;
    return this.backCv;
  }

  /** Dust in the beam, in front of the page. Returns a transparent 1920x1080 canvas. */
  frontLayer(cam) {
    const c = this.f, th = this.th;
    const tv = this.tv;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, VW, VH);
    if (!th) return this.frontCv;

    // a leak of light along the top edge
    const g = c.createLinearGradient(0, 0, VW * 0.55, VH * 0.42);
    g.addColorStop(0, hexA(th.glow, 0.075));
    g.addColorStop(1, hexA(th.glow, 0));
    c.fillStyle = g; c.fillRect(0, 0, VW, VH * 0.55);

    // dust: a fixed population, each mote on its own slow path. Positions come from hash(i), so
    // mote 40 is in the same place on frame 1 and on frame 6000.
    const N = 56, z = cam?.zoom || 1;
    for (let i = 0; i < N; i++) {
      const sx = hash(i * 3.1), sy = hash(i * 7.7 + 1), sr = hash(i * 11.3 + 2), ss = hash(i * 5.9 + 3);
      const x = ((sx + tv * (0.006 + 0.010 * ss)) % 1) * VW;
      const y = ((sy + tv * (0.004 + 0.006 * ss)) % 1) * VH;
      const r = (1.0 + sr * 2.6) * z;
      const a = (0.05 + 0.16 * sr) * (0.55 + 0.45 * Math.sin(tv * (0.5 + ss) + i));
      if (a <= 0) continue;
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fillStyle = hexA(th.glow, a);
      c.fill();
    }
    return this.frontCv;
  }
}

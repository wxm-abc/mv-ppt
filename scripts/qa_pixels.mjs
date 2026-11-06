// Judge a deck by measuring pixels, not by reading code.
//
// A page can pass deck_smoke (no crash, no NaN, turn on a bar) and still be unwatchable:
// the graphic never becomes visible against the background, or the page is just a headline
// floating in an empty field. Both are invisible in the source and obvious in the histogram.
//
// For every page we render it at "fully entered" (page turn + --settle beats) and measure:
//   ink%    pixels that differ from the page background by more than --ink-db of luma
//   lower%  the same, but only below y=35% — that is where the graphic element lives
//   edge%   neighbouring pixels that differ — how much actual drawn detail there is
//   p95     the brightest 5% — a page with no highlights reads as flat
//
//   node qa_pixels.mjs [projectDir] [--settle 4] [--w 960 --h 540]
//
// Warnings are thresholds, not truths: a deliberately empty page (a held title before a
// drop) is a real shot. Read the number next to what the song is doing at that bar.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(process.argv[2] || '.');
// playwright-core lives in the PROJECT's node_modules, not next to this script, so resolve
// it from the project root the same way the exporter does.
const req = createRequire(path.join(ROOT, 'package.json'));
const { chromium } = req('playwright-core');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SETTLE = +arg('settle', 4);          // beats after the turn before we measure
const W = +arg('w', 960), H = +arg('h', 540);

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const feats = JSON.parse(fs.readFileSync(path.join(ROOT, cfg.paths.features), 'utf8'));
const deck = JSON.parse(fs.readFileSync(path.join(ROOT, cfg.paths.deck || 'data/deck.json'), 'utf8'));
const g = feats.grid, barLen = 4 * (60 / g.bpm);
const beat0 = g.beat0 + (cfg.timing?.offset || 0);

const slides = deck.slides || deck.pages || [];
const times = slides.map((s) => beat0 + (s.atBar ?? 0) * barLen + SETTLE * (60 / g.bpm));

// ---- a static server on the project root (localhost only) -------------------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2', '.wav': 'audio/wav' };
const http = await import('node:http');
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;

const gpuArgs = ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--force_high_performance_gpu'];
let browser;
for (const channel of [cfg.export?.browserChannel, 'chrome', 'msedge', undefined]) {
  try { browser = await chromium.launch({ channel, headless: true, args: gpuArgs }); break; } catch {}
}
if (!browser) { server.close(); throw new Error('no Chrome/Edge for Playwright (npm i playwright-core)'); }

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('[page error]', e.message));

  // Two passes. With stage+post off the background is the flat theme colour, so "ink" means
  // ink the DECK actually drew. With them on we measure the frame the audience sees, where
  // contrast has to be read as a range (p95-p05) — on a light theme the text is DARKER than
  // the background, so any "p95 minus background" test simply measures the theme, not the page.
  const open = async (q) => {
    await page.goto(`${url}/?export=1&w=${W}&h=${H}&dur=${feats.duration}&${q}`);
    await page.waitForFunction(() => window.__mv && window.__mv.ready, null, { timeout: 60000 });
  };
  await open('stage=0&post=0');
  const deckRows = await page.evaluate(measure, times);
  await open('stage=1&post=1');
  const fullRows = await page.evaluate(measure, times);

  async function measure(ts) {
    const out = [];
    for (const t of ts) {
      const dataUrl = window.__mv.framePng(t);
      const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(bmp, 0, 0);
      const { data, width: w, height: h } = cx.getImageData(0, 0, bmp.width, bmp.height);
      const lum = new Float32Array(w * h);
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        lum[j] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      }
      // background: median of the four corner patches (the deck keeps margins clear)
      const corners = [];
      const pw = Math.floor(w * 0.06), ph = Math.floor(h * 0.06);
      for (const [ox, oy] of [[0, 0], [w - pw, 0], [0, h - ph], [w - pw, h - ph]]) {
        for (let y = oy; y < oy + ph; y++) for (let x = ox; x < ox + pw; x++) corners.push(lum[y * w + x]);
      }
      corners.sort((a, b) => a - b);
      const bg = corners[corners.length >> 1];
      const TH = 10;
      let ink = 0, lower = 0, lowerN = 0, edge = 0;
      const yStart = Math.floor(h * 0.35);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const d = Math.abs(lum[i] - bg);
          if (d > TH) { ink++; if (y >= yStart) lower++; }
          if (y >= yStart) lowerN++;
          if (x + 1 < w && Math.abs(lum[i] - lum[i + 1]) > TH) edge++;
        }
      }
      const srt = Float32Array.from(lum).sort();
      const q = (p) => srt[Math.min(srt.length - 1, Math.floor(srt.length * p))];
      out.push({
        ink: (ink / (w * h)) * 100,
        lower: (lower / lowerN) * 100,
        edge: (edge / (w * h)) * 100,
        p05: q(0.05), p50: q(0.5), p95: q(0.95),
        bg,
      });
    }
    return out;
  }

  console.log(`[qa] ${slides.length} pages at ${W}x${H}, measured ${SETTLE} beats after each turn`);
  console.log('ink/lower/edge measured with stage+post OFF (that is what the deck drew);');
  console.log('rng = p95-p05 of the finished frame. A light theme puts dark ink on a light page,');
  console.log('so contrast can only be judged as a range, never as "brighter than the background".\n');
  console.log('  #  page                  theme           ink%   lower%  edge%   rng   verdict');
  const warn = [];
  slides.forEach((s, i) => {
    const d = deckRows[i], f = fullRows[i];
    const rng = f.p95 - f.p05;
    // A text slide is only ~3-4% ink by nature, so "ink" alone flags every quiet page. The one
    // that matters is `lower`: the graphic slot, where a page that drew nothing shows ~1%.
    // `edge` alone cannot judge a motif page: a scene made of gradients is legitimately smooth
    // and measures 0.2% edge while being full of picture. It only means something when the
    // page has no density either — so it is now a compound check, not a standalone one.
    const v = [];
    if (d.ink < 1.8) v.push('EMPTY PAGE');
    if (d.lower < 1.5) v.push('graphic slot nearly empty');
    if (d.edge < 0.8 && d.ink < 12) v.push('empty and flat');
    if (rng < 20) v.push('flat');
    if (v.length) warn.push(`${s.id}: ${v.join(', ')}`);
    console.log(
      `  ${String(i + 1).padStart(2)}  ${(s.id || '?').padEnd(20)} ${(s.theme || '?').padEnd(14)}` +
      ` ${d.ink.toFixed(1).padStart(5)}  ${d.lower.toFixed(1).padStart(6)}  ${d.edge.toFixed(1).padStart(5)}` +
      `  ${rng.toFixed(0).padStart(4)}   ${v.join(', ') || 'ok'}`
    );
  });
  console.log(warn.length ? `\n[qa] ${warn.length} page(s) to look at:\n  - ${warn.join('\n  - ')}` : '\n[qa] all pages carry visible content');
} finally {
  await browser.close();
  server.close();
}

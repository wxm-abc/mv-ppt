// Frame-by-frame exporter: headless Chrome/Edge renders, PNGs stream into ffmpeg's stdin
// (no image files on disk), the song is muxed from config.paths.audio.
//
//   node export/export.mjs [--start s] [--end s] [--fps n] [--width w] [--height h] [--out f.mp4]
//   node export/export.mjs --sheet out/qa.png --times 4,8,12,16 [--cols 4] [--width 960 --height 540]
//
// Times are SONG time. On Windows, if ffmpeg is not on PATH set FFMPEG_BIN (this script never
// probes ffmpeg with spawnSync, because that call can fail spuriously on some machines).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { ROOT, startServer } from './server.mjs';

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const feats = JSON.parse(fs.readFileSync(path.join(ROOT, cfg.paths.features), 'utf8'));

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const SHEET = arg('sheet', null);
const W = +arg('width', SHEET ? 960 : cfg.video.width), H = +arg('height', SHEET ? 540 : cfg.video.height);
const FPS = +arg('fps', cfg.video.fps);
const DUR = feats.duration || 30;
const START = +arg('start', 0), END = Math.min(+arg('end', DUR), DUR);
// --q stage=0,post=0 is passed straight to the page, so one build can render the layers apart
const Q = arg('q', '').split(',').filter(Boolean).join('&');   // stage=0,post=0 -> stage=0&post=0
const OUT = path.resolve(ROOT, SHEET || arg('out', `out/film_${W}x${H}.mp4`));
if (W % 2 || H % 2) throw new Error('width/height must be even for yuv420p');

const times = SHEET
  ? (arg('times') ? arg('times').split(',').map(Number)
                  : Array.from({ length: 4 }, (_, i) => +(i * DUR / 4).toFixed(3)))
  : null;
const firstFrame = Math.round(START * FPS), lastFrame = Math.round(END * FPS);
const total = SHEET ? times.length : lastFrame - firstFrame;
if (total <= 0) throw new Error('empty range');

const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const rawIn = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', 'pipe:0'];
let ffArgs;
if (SHEET) {
  const cols = +arg('cols', 4), rows = Math.ceil(total / cols);
  ffArgs = [...rawIn, '-vf', `tile=${cols}x${rows}:padding=6:color=0x303030`, '-frames:v', '1', OUT];
} else {
  const audioPath = path.join(ROOT, cfg.paths.audio);
  const hasAudio = fs.existsSync(audioPath);
  if (!hasAudio) console.warn('[export] no audio at', audioPath, '- exporting silent video');
  // every input first, then every output option: ffmpeg applies options to the NEXT file, so an
  // output option placed before a second -i is an error.
  ffArgs = [
    ...rawIn,
    ...(hasAudio ? ['-ss', String(START), '-t', String(total / FPS), '-i', audioPath] : []),
    '-map', '0:v', ...(hasAudio ? ['-map', '1:a'] : []),
    '-vf', 'scale=out_color_matrix=bt709:out_range=limited,format=yuv420p',
    '-c:v', cfg.export.codec, ...cfg.export.x264,
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    ...(hasAudio ? [...cfg.export.audio, '-shortest'] : []),
    '-movflags', '+faststart', OUT,
  ];
}

const ff = spawn(FFMPEG, ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((res, rej) => ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
ff.stdin.on('error', (e) => console.error('[ffmpeg stdin]', e.message));

const { server, url } = await startServer({ port: 5180 });
const gpuArgs = ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11',
  '--force_high_performance_gpu', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
let browser;
for (const channel of [cfg.export.browserChannel, 'chrome', 'msedge', undefined]) {
  try { browser = await chromium.launch({ channel, headless: !argv.includes('--headed'), args: gpuArgs }); break; } catch {}
}
if (!browser) { server.close(); throw new Error('no Chrome/Edge for Playwright'); }

function write(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return new Promise((res, rej) => ff.stdin.write(Buffer.from(b64, 'base64'), (e) => (e ? rej(e) : res())));
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  await page.goto(`${url}/?export=1&w=${W}&h=${H}&dur=${DUR}${Q ? '&' + Q : ''}`);
  await page.waitForFunction(() => window.__mv && window.__mv.ready, null, { timeout: 60000 });
  const info = await page.evaluate(() => ({ renderer: window.__mv.renderer, layers: window.__mv.layers }));
  console.log(`[export] ${W}x${H} @ ${FPS}fps  frames ${firstFrame}..${lastFrame - 1} (${total})  layers=${JSON.stringify(info.layers)}`);
  console.log(`[export] renderer: ${info.renderer}`);
  if (/swiftshader|llvmpipe|basic render/i.test(info.renderer)) console.warn('[export] WARNING: software WebGL - the bloom pass will be wrong or slow');

  if (SHEET) {
    const urls = await page.evaluate((ts) => window.__mv.framePngs(ts), times);
    for (const u of urls) await write(u);
  } else {
    const t0 = Date.now();
    const chunk = cfg.export.chunkFrames || 60;
    for (let a = firstFrame; a < lastFrame; a += chunk) {
      const b = Math.min(lastFrame, a + chunk);
      const urls = await page.evaluate(([x, y, fps]) =>
        window.__mv.framePngs(Array.from({ length: y - x }, (_, i) => (x + i) / fps)), [a, b, FPS]);
      for (const u of urls) await write(u);
      const done = b - firstFrame, rate = done / ((Date.now() - t0) / 1000);
      process.stdout.write(`\r[export] ${done}/${total} frames  ${rate.toFixed(1)} fps  eta ${Math.ceil((total - done) / rate)}s   `);
    }
    process.stdout.write('\n');
  }
} finally {
  ff.stdin.end();
  await browser.close();
  server.close();
}
await ffDone;
console.log(`[export] wrote ${path.relative(ROOT, OUT)}  (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);

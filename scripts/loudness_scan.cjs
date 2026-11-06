// Scan per-second loudness + spectral centroid to find a 30s window with real dynamic arc.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SRC = process.argv[2];
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
const SR = 22050;

const raw = path.join(process.cwd(), '_scan.raw');
execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', SRC,
  '-ac', '1', '-ar', String(SR), '-c:a', 'pcm_f32le', '-f', 'f32le', raw], { stdio: 'inherit' });

const buf = fs.readFileSync(raw);
const N = buf.length / 4;
const dur = N / SR;
const x = new Float32Array(N);
for (let i = 0; i < N; i++) x[i] = buf.readFloatLE(i * 4);

// per-second rms in dB
const sec = Math.floor(dur);
const rms = [], peak = [];
for (let s = 0; s < sec; s++) {
  const a = s * SR, b = Math.min(N, (s + 1) * SR);
  let sum = 0, mx = 0;
  for (let i = a; i < b; i++) { const v = x[i]; sum += v * v; const av = Math.abs(v); if (av > mx) mx = av; }
  rms.push(Math.sqrt(sum / (b - a)));
  peak.push(mx);
}
const gmax = Math.max(...rms);
const db = rms.map(v => 20 * Math.log10(v / gmax + 1e-9));

console.log(`duration ${dur.toFixed(2)}s\n`);
console.log('--- per second (dB rel. global max) ---');
for (let s = 0; s < sec; s++) {
  const bar = '#'.repeat(Math.max(0, Math.round((db[s] + 42) / 1.6)));
  console.log(String(s).padStart(4) + 's ' + db[s].toFixed(1).padStart(6) + ' ' + bar);
}

// find the 30s window with the largest dynamic range, ignoring any window that
// touches silence (a fade-out would otherwise win on "range" alone)
const FLOOR = -22; // anything below this counts as silence, not dynamics
const ranked = [];
for (let s = 0; s + 30 <= sec; s++) {
  const w = db.slice(s, s + 30);
  const mn = Math.min(...w), mx = Math.max(...w);
  if (mn < FLOOR) continue;
  const mean = w.reduce((a, b) => a + b, 0) / 30;
  const score = (mx - mn) * 1.0 + (mean + 42) * 0.25;
  ranked.push({ s, range: mx - mn, mean, score, mn, mx });
}
ranked.sort((a, b) => b.score - a.score);
console.log('\n--- top 5 loud 30s windows by dynamics (silence excluded) ---');
for (const r of ranked.slice(0, 5)) {
  console.log(`start ${String(r.s).padStart(3)}s  range ${r.range.toFixed(1)}dB  mean ${r.mean.toFixed(1)}dB  (min ${r.mn.toFixed(1)} max ${r.mx.toFixed(1)})`);
}

fs.unlinkSync(raw);

// Measure the song's beat grid: bpm, the first downbeat, and the onset list.
// This is stage 2 of the pipeline — everything downstream is authored against it, so it is
// measured, never guessed. Pure Node, no dependencies (ffmpeg does the decoding).
//
//   node beatgrid.cjs input/song.wav --out data/features.json [--min-bpm 70] [--max-bpm 190]
//
// Method: STFT -> spectral flux (onset strength) -> autocorrelation for a tempo estimate ->
// a refined search that maximises how many onsets actually sit on the grid -> comb filter for
// the phase -> the phase is then shifted by whole beats onto the music, so beat(0) is a beat
// you can cut on rather than a beat inside the leading silence.
const fs = require('node:fs');
const nodePath = require('node:path');
const { spawnSync } = require('node:child_process');

const SR = 44100, NFFT = 1024, HOP = 512;
const FRAME_HZ = SR / HOP;                 // 86.13 frames per second
const TOL = 0.04;                          // "on the grid" tolerance, seconds

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const SRC = argv.find((a) => !a.startsWith('--'));
const OUT = arg('out', 'data/features.json');
const MIN_BPM = +arg('min-bpm', 70), MAX_BPM = +arg('max-bpm', 190);
if (!SRC) { console.error('usage: node beatgrid.cjs <audio> [--out data/features.json]'); process.exit(1); }
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';

// ---- decode -----------------------------------------------------------------
const tmp = nodePath.join(process.env.TMP || process.env.TEMP || '.', '_beatgrid.f32');
const dec = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', SRC,
  '-ac', '1', '-ar', String(SR), '-c:a', 'pcm_f32le', '-f', 'f32le', tmp], { stdio: 'inherit' });
if (dec.status !== 0) { console.error('ffmpeg failed to decode', SRC); process.exit(1); }
const raw = fs.readFileSync(tmp); fs.unlinkSync(tmp);
const N = raw.length / 4;
const sig = new Float32Array(N);
for (let i = 0; i < N; i++) sig[i] = raw.readFloatLE(i * 4);
const duration = N / SR;

// ---- fft --------------------------------------------------------------------
const rev = new Uint32Array(NFFT);
for (let i = 0, j = 0; i < NFFT; i++) { rev[i] = j; let m = NFFT >> 1; while (m >= 1 && j & m) { j ^= m; m >>= 1; } j |= m; }
const cosT = new Float64Array(NFFT / 2), sinT = new Float64Array(NFFT / 2);
for (let i = 0; i < NFFT / 2; i++) { cosT[i] = Math.cos(-2 * Math.PI * i / NFFT); sinT[i] = Math.sin(-2 * Math.PI * i / NFFT); }
const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
const hann = new Float64Array(NFFT);
for (let i = 0; i < NFFT; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / NFFT);

function mags(off) {
  for (let k = 0; k < NFFT; k++) { const v = (sig[off + k] || 0) * hann[k]; re[k] = v; im[k] = 0; }
  for (let k = 0; k < NFFT; k++) { const r = rev[k]; if (r > k) { let t = re[k]; re[k] = re[r]; re[r] = t; t = im[k]; im[k] = im[r]; im[r] = t; } }
  for (let size = 2; size <= NFFT; size <<= 1) {
    const half = size >> 1, step = NFFT / size;
    for (let i = 0; i < NFFT; i += size) for (let j = i, k = 0; j < i + half; j++, k += step) {
      const c = cosT[k], s = sinT[k];
      const tr = re[j + half] * c - im[j + half] * s, ti = re[j + half] * s + im[j + half] * c;
      re[j + half] = re[j] - tr; im[j + half] = im[j] - ti; re[j] += tr; im[j] += ti;
    }
  }
  const out = new Float64Array(NFFT / 2);
  for (let k = 0; k < NFFT / 2; k++) out[k] = Math.hypot(re[k], im[k]);
  return out;
}

// ---- onset strength ---------------------------------------------------------
const nFrames = Math.floor((N - NFFT) / HOP);
const flux = new Float64Array(nFrames);
let prev = mags(0);
for (let i = 1; i < nFrames; i++) {
  const cur = mags(i * HOP);
  let s = 0;
  for (let k = 0; k < NFFT / 2; k++) { const d = cur[k] - prev[k]; if (d > 0) s += d; }
  flux[i] = s; prev = cur;
}
// remove the local mean so steady loudness does not look like onset energy
const norm = new Float64Array(nFrames);
const MW = 20;
for (let i = 0; i < nFrames; i++) {
  let m = 0, c = 0;
  for (let j = Math.max(0, i - MW); j <= Math.min(nFrames - 1, i + MW); j++) { m += flux[j]; c++; }
  norm[i] = Math.max(0, flux[i] - m / c);
}

// ---- onsets -----------------------------------------------------------------
const W = 8, onsets = [];
for (let i = W; i < nFrames - W; i++) {
  const v = flux[i];
  if (v <= 0) continue;
  let isMax = true, mean = 0;
  for (let j = i - W; j <= i + W; j++) { mean += flux[j]; if (flux[j] > v) { isMax = false; break; } }
  if (!isMax) continue;
  mean /= (2 * W + 1);
  const t = (i * HOP + NFFT / 2) / SR;
  if (v > mean * 1.6 && (onsets.length === 0 || t - onsets[onsets.length - 1] > 0.05)) onsets.push(+t.toFixed(3));
}

// where does the sound actually start?
const peak = norm.reduce((a, b) => (b > a ? b : a), 0);
const floor = peak * 0.02;
let startFrame = 0;
for (let i = 0; i < nFrames; i++) if (norm[i] > floor) { startFrame = i; break; }
const soundStart = (startFrame * HOP + NFFT / 2) / SR;

/** Fraction of onsets that sit on beat0 + k*(60/bpm) within TOL. */
function gridFit(bpm, beat0) {
  const P = 60 / bpm;
  let hit = 0;
  for (const t of onsets) {
    const k = Math.round((t - beat0) / P);
    if (Math.abs(t - (beat0 + k * P)) <= TOL) hit++;
  }
  return onsets.length ? hit / onsets.length : 0;
}
/** Best phase for a tempo, by comb filter on the onset strength. */
function bestPhase(bpm) {
  const P = 60 / bpm;
  let best = -1, bestOff = 0;
  for (let o = 0; o < P; o += 0.004) {
    let s = 0, n = 0;
    for (let t = o; t < duration; t += P) { s += norm[Math.round(t * FRAME_HZ)] || 0; n++; }
    s /= Math.max(1, n);
    if (s > best) { best = s; bestOff = o; }
  }
  return bestOff;
}

// ---- tempo: autocorrelation gives the estimate, grid fit refines it ---------
const lagMin = Math.round(FRAME_HZ * 60 / MAX_BPM), lagMax = Math.round(FRAME_HZ * 60 / MIN_BPM);
let bestLag = lagMin, bestScore = -Infinity;
for (let lag = lagMin; lag <= lagMax; lag++) {
  let s = 0, n = 0;
  for (let i = 0; i + lag < nFrames; i++) { s += norm[i] * norm[i + lag]; n++; }
  s /= n;
  if (s > bestScore) { bestScore = s; bestLag = lag; }
}
let bpm0 = 60 * FRAME_HZ / bestLag;
if (bpm0 < MIN_BPM || bpm0 > MAX_BPM) bpm0 = Math.min(MAX_BPM, Math.max(MIN_BPM, bpm0 * 2));

// refine around it: a grid twice as dense always fits better, so prefer the simpler tempo
// unless the denser one is clearly better
const lo = Math.max(MIN_BPM, bpm0 * 0.85), hi = Math.min(MAX_BPM, bpm0 * 1.15);
let best = { bpm: bpm0, fit: -1, beat0: 0 };
for (let bpm = lo; bpm <= hi; bpm += 0.25) {
  const beat0 = bestPhase(bpm);
  const fit = gridFit(bpm, beat0);
  if (fit > best.fit) best = { bpm, fit, beat0 };
}
for (const alt of [best.bpm / 2, best.bpm / 3]) {
  if (alt < MIN_BPM) continue;
  const beat0 = bestPhase(alt);
  const fit = gridFit(alt, beat0);
  if (fit > best.fit - 0.03) best = { bpm: alt, fit, beat0 };   // simpler tempo, essentially as good
}
const bpm = +best.bpm.toFixed(3);
const fit = gridFit(bpm, best.beat0);
const period = 60 / bpm;

// shift the phase by whole beats onto the music, so beat(0) is usable
let beat0 = best.beat0;
if (beat0 < soundStart - period) {
  beat0 += Math.ceil((soundStart - period - beat0) / period) * period;
}
beat0 = +beat0.toFixed(4);

const features = {
  duration: +duration.toFixed(3),
  sampleRate: SR,
  grid: {
    bpm, beat0, periodSec: +period.toFixed(4),
    soundStart: +soundStart.toFixed(3),
    gridFit: +fit.toFixed(3),
    onsets: onsets.length,
  },
  onsets: { t: onsets },
  note: `measured by beatgrid.cjs from ${nodePath.basename(SRC)}; tempo from autocorrelation of spectral flux, refined by grid fit, phase from a comb filter and shifted onto the music. Verify by ear before authoring against it.`,
};
fs.mkdirSync(nodePath.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(features, null, 1));

console.log(`duration ${duration.toFixed(3)}s   sound starts ${soundStart.toFixed(3)}s`);
console.log(`bpm ${bpm}   beat length ${period.toFixed(4)}s   beat0 ${beat0}s`);
console.log(`onsets ${onsets.length}   on-grid (+-${TOL * 1000}ms) ${(fit * 100).toFixed(1)}%`);
if (fit < 0.45) console.log('WARNING: the grid is a poor fit - confirm the tempo by ear before authoring against it');
console.log(`wrote ${OUT}`);

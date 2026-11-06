// Decide a tempo by phase coherence + phase drift, not by fit%.
//
// For a candidate tempo we scan the phase offset b0 and measure
//   R = | mean( exp(i*2*pi*phase) ) |    (circular concentration of onsets around the grid)
// R in [0,1]; 1 = every onset sits at the identical place in the bar.
// Then we split the song in halves and compare each half's mean phase:
//   a wrong tempo slides, so the halves disagree -> high drift.
//   the real tempo does not -> drift near zero.
// This is what separates 87.5 from 175 from 131, where fit% cannot.
const fs = require('node:fs');

const FEAT = process.argv[2];
const F = JSON.parse(fs.readFileSync(FEAT, 'utf8'));
const onsets = F.onsets.t.filter(t => t >= 0).sort((a, b) => a - b);
const dur = F.duration;
console.log(`onsets ${onsets.length}  duration ${dur.toFixed(2)}s\n`);

function score(bpm) {
  const P = 60 / bpm;
  // scan b0 for max concentration
  let bestR = -1, bestB0 = 0;
  for (let b0 = 0; b0 < P; b0 += P / 400) {
    let sx = 0, sy = 0;
    for (const t of onsets) {
      const ph = 2 * Math.PI * (((t - b0) / P) % 1);
      sx += Math.cos(ph); sy += Math.sin(ph);
    }
    const R = Math.sqrt(sx * sx + sy * sy) / onsets.length;
    if (R > bestR) { bestR = R; bestB0 = b0; }
  }
  // phase of each half, using the global b0
  const mid = dur / 2;
  const halfPhase = (lo, hi) => {
    const xs = onsets.filter(t => t >= lo && t < hi);
    if (!xs.length) return null;
    let sx = 0, sy = 0;
    for (const t of xs) {
      const ph = 2 * Math.PI * (((t - bestB0) / P) % 1);
      sx += Math.cos(ph); sy += Math.sin(ph);
    }
    sx /= xs.length; sy /= xs.length;
    let a = Math.atan2(sy, sx); if (a < 0) a += 2 * Math.PI;
    return { n: xs.length, a, R: Math.sqrt(sx * sx + sy * sy) };
  };
  const h1 = halfPhase(0, mid), h2 = halfPhase(mid, dur + 1);
  let drift = 0;
  if (h1 && h2) {
    let d = Math.abs(h1.a - h2.a);
    if (d > Math.PI) d = 2 * Math.PI - d;
    drift = d; // radians of bar-phase difference between halves
  }
  return { bpm, R: bestR, b0: bestB0, drift };
}

const cands = [];
for (const b of [58.3, 65.6, 87.5, 116.6, 131.2, 175.0]) cands.push(b);
// fine scan around the detected value
const base = F.grid.bpm;
for (let b = base - 3; b <= base + 3; b += 0.5) cands.push(+b.toFixed(2));

const rows = cands.map(score).sort((a, b) => b.R - a.R);
console.log('bpm      R      drift(rad)  drift(beat)');
for (const r of rows) {
  console.log(
    String(r.bpm.toFixed(2)).padStart(6),
    r.R.toFixed(4).padStart(7),
    r.drift.toFixed(3).padStart(8),
    '   ' + (r.drift / (2 * Math.PI)).toFixed(3).padStart(6)
  );
}
console.log('\n(rule: pick high R with near-zero drift; a large drift means the tempo is wrong)');

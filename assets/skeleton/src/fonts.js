// Font loading for the three type roles (see config.json -> fonts).
//
// The faces are the @fontsource woff2 files copied into vendor/fonts, so the film renders the
// same on every machine and needs no network. Loaded with document.fonts.add() BEFORE the first
// frame is drawn: a canvas measures text the moment it draws it, and a face that arrives late
// makes the early frames wrap differently from the late ones.
const DIR = 'vendor/fonts';

/** [package, family, weight, style] for every file in vendor/fonts. */
function manifest(cfg) {
  const out = [];
  for (const role of ['mono', 'serif', 'sans']) {
    const f = cfg.fonts?.[role];
    if (!f) continue;
    for (const w of f.weights || []) out.push([f.pkg, f.family, w, 'normal']);
    for (const w of f.italic || []) out.push([f.pkg, f.family, w, 'italic']);
  }
  return out;
}

/** Load every face. Resolves when they are all usable; throws with the list of what failed. */
export async function loadFonts(cfg, onStep = null) {
  const jobs = manifest(cfg).map(([pkg, family, weight, style]) => {
    const url = `${DIR}/${pkg}-latin-${weight}-${style}.woff2`;
    return new FontFace(family, `url("${url}")`, { weight: String(weight), style })
      .load()
      .then((face) => { document.fonts.add(face); onStep?.(`font  ${family} ${weight}${style === 'italic' ? ' italic' : ''}`); })
      .catch(() => { throw new Error(`font not loaded: ${url}`); });
  });
  await Promise.all(jobs);
  return manifest(cfg).length;
}

/** How many faces config.json asks for (so a loader bar can count them before they arrive). */
export const fontCount = (cfg) => manifest(cfg).length;

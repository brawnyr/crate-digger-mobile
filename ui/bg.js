/* ASCII BREW — milk meeting coffee, spinning like a platter. Same brew as the
   homepage, personalized for Crate Digger: the whole field turns like vinyl and
   faint concentric grooves circle through the haze. Density picks the layer:
   sparse = dark roast, mids = caramel, crests = cream (see style.css .brew).
   External file for CSP (no inline scripts). */
(function () {
  const layers = [document.getElementById('coffee'),
                  document.getElementById('caramel'),
                  document.getElementById('cream')];
  if (layers.some(l => !l)) return;
  const SEED = Math.random() * 1e3;      /* every session spins a different record */

  /* density ramp, sparse → dense; codey glyphs ordered by ink */
  const RAMP = "  ..''\":;~-_=<>!ic(){}[]?*7fjzsL/\\|neoahk4XPBS%&#$@";
  const N = RAMP.length - 1;
  const T1 = .16, T2 = .40;              /* density cuts: roast | caramel | cream */

  /* value noise + fbm */
  function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7 + SEED) * 43758.5453; return s - Math.floor(s); }
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(x, y) { return noise(x, y) * .65 + noise(x * 2.13 + 7.7, y * 2.13 + 3.1) * .35; }

  /* grid sizing — measured from the real glyph box; re-measured when the
     webfont lands, since JetBrains Mono arrives async */
  let cols = 0, rows = 0, cw = 7.8, ch = 13;
  function measure() {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
    probe.className = 'brew';
    probe.textContent = 'M'.repeat(100);
    document.body.appendChild(probe);
    cw = probe.getBoundingClientRect().width / 100 || 7.8;
    document.body.removeChild(probe);
  }
  function size() {
    cols = Math.ceil(innerWidth / cw) + 1;
    rows = Math.ceil(innerHeight / ch) + 1;
  }

  /* one frame of the brew */
  const S = .055;      /* field scale — bigger = tighter billows           */
  const WARP = 2.1;    /* how hard the milk folds into the coffee          */
  const SPIN = .05;    /* rad/s — the platter's steady turn                */
  const STIR = .45;    /* extra twist near the spindle                     */
  const GROOVE = .045; /* faint concentric ripples, like vinyl grooves     */
  const out = [[], [], []];
  function frame(t) {
    const asp = cw / ch;            /* keep the noise isotropic on a non-square grid */
    const cx = cols / 2, cy = rows / 2;
    const rmax = Math.hypot(cx * asp, cy);
    out[0].length = out[1].length = out[2].length = 0;
    for (let y = 0; y < rows; y++) {
      let r0 = '', r1 = '', r2 = '';
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) * asp, dy = y - cy;
        const r = Math.hypot(dx, dy) / rmax;
        /* the platter: steady rotation everywhere, a touch more at the spindle */
        const th = t * SPIN + STIR * Math.exp(-2.4 * r * r);
        const co = Math.cos(th), si = Math.sin(th);
        const nx = (dx * co - dy * si) * S, ny = (dx * si + dy * co) * S;
        /* the pour: milk folding through coffee, slow and hazy */
        const qx = noise(nx + t * .06, ny), qy = noise(nx + 5.2, ny - t * .04);
        let v = fbm(nx + WARP * qx + t * .025, ny + WARP * qy - t * .017);
        /* grooves: concentric ripples riding the mid-radii, drifting inward */
        v += GROOVE * Math.sin(r * rmax * 1.6 - t * .9) * r * (1 - r) * 4;
        /* vignette: the brew fades into the dark rim */
        v *= 1.12 - .85 * r * r;
        const d = v * v;
        const g = RAMP[Math.max(0, Math.min(N, (d * (N + 6)) | 0))];
        if (d < T1) { r0 += g; r1 += ' '; r2 += ' '; }
        else if (d < T2) { r0 += ' '; r1 += g; r2 += ' '; }
        else { r0 += ' '; r1 += ' '; r2 += g; }
      }
      out[0].push(r0); out[1].push(r1); out[2].push(r2);
    }
    for (let i = 0; i < 3; i++) layers[i].textContent = out[i].join('\n');
  }

  /* loop */
  const RM = matchMedia('(prefers-reduced-motion:reduce)');
  const FRAME = 1000 / 24;              /* ASCII wants a chunky cadence */
  let raf = null, last = 0, t0 = performance.now();
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < FRAME) return; last = now;
    frame((now - t0) / 1000);
  }
  function start() { if (!raf && !RM.matches) raf = requestAnimationFrame(loop); }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

  measure(); size();
  if (RM.matches) frame(8); else start();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { measure(); size(); if (RM.matches) frame(8); });
  }
  window.addEventListener('resize', () => { size(); if (RM.matches) frame(8); });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  RM.addEventListener('change', () => { stop(); RM.matches ? frame(8) : start(); });
})();

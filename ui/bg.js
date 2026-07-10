/* PIXEL BREW — milk meeting coffee, spinning like a platter. The same brew
   field as the homepage's ASCII version, rendered as chunky posterized pixels
   instead of characters so it never competes with the app's text. The platter
   turns, faint grooves circle the mid-radii, the cream blooms where it crests.
   External file for CSP (no inline scripts). */
(function () {
  const cvs = document.getElementById('bg');
  if (!cvs) return;
  const ctx = cvs.getContext('2d', { alpha: false });
  if (!ctx) return;
  const SEED = Math.random() * 1e3;      /* every session spins a different record */

  /* value noise + fbm */
  function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7 + SEED) * 43758.5453; return s - Math.floor(s); }
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(x, y) { return noise(x, y) * .65 + noise(x * 2.13 + 7.7, y * 2.13 + 3.1) * .35; }

  /* the brew palette as a posterized LUT: density 0..1 → coffee dark → dark
     roast → caramel → latte → cream. 24 steps = visible banding = pixels. */
  const STOPS = [
    [0.00, 0x0f, 0x08, 0x03],   /* black coffee            */
    [0.18, 0x3a, 0x20, 0x10],   /* dark roast              */
    [0.42, 0x96, 0x60, 0x2a],   /* caramel — where they mix */
    [0.72, 0xd9, 0xb0, 0x77],   /* latte                   */
    [1.00, 0xef, 0xd9, 0xa8],   /* the cream bloom — never white */
  ];
  const LEVELS = 24;
  const LUT = new Uint8Array(LEVELS * 3);
  for (let i = 0; i < LEVELS; i++) {
    const d = i / (LEVELS - 1);
    let k = 0;
    while (k < STOPS.length - 2 && d > STOPS[k + 1][0]) k++;
    const [d0, r0, g0, b0] = STOPS[k], [d1, r1, g1, b1] = STOPS[k + 1];
    const f = Math.min(1, Math.max(0, (d - d0) / (d1 - d0)));
    LUT[i * 3] = r0 + (r1 - r0) * f;
    LUT[i * 3 + 1] = g0 + (g1 - g0) * f;
    LUT[i * 3 + 2] = b0 + (b1 - b0) * f;
  }

  /* grid: one field sample per pixel block */
  const PX = 10;                          /* CSS px per block */
  let cols = 0, rows = 0, img = null;
  function size() {
    cols = Math.max(1, Math.ceil(innerWidth / PX));
    rows = Math.max(1, Math.ceil(innerHeight / PX));
    if (cvs.width !== cols || cvs.height !== rows) {
      cvs.width = cols; cvs.height = rows;    /* tiny canvas, CSS scales it up */
      img = ctx.createImageData(cols, rows);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    }
  }

  /* one frame of the brew — same math as the ASCII version */
  const S = .045;      /* field scale — bigger = tighter billows           */
  const WARP = 2.1;    /* how hard the milk folds into the coffee          */
  const SPIN = .05;    /* rad/s — the platter's steady turn                */
  const STIR = .45;    /* extra twist near the spindle                     */
  const GROOVE = .032; /* faint concentric ripples, like vinyl grooves     */
  function frame(t) {
    const cx = cols / 2, cy = rows / 2;
    const rmax = Math.hypot(cx, cy);
    const px = img.data;
    let o = 0;
    for (let y = 0; y < rows; y++) {
      const dy = y - cy;
      for (let x = 0; x < cols; x++) {
        const dx = x - cx;
        const r = Math.hypot(dx, dy) / rmax;
        /* the platter: steady rotation everywhere, a touch more at the spindle */
        const th = t * SPIN + STIR * Math.exp(-2.4 * r * r);
        const co = Math.cos(th), si = Math.sin(th);
        const nx = (dx * co - dy * si) * S, ny = (dx * si + dy * co) * S;
        /* the pour: milk folding through coffee, slow and hazy */
        const qx = noise(nx + t * .06, ny), qy = noise(nx + 5.2, ny - t * .04);
        let v = fbm(nx + WARP * qx + t * .025, ny + WARP * qy - t * .017);
        /* grooves: confined to a mid-radius ring so their arcs never reach the
           edges, where they'd read as vertical scuff-stripes */
        const gr = (r - .48) / .16;
        v += GROOVE * Math.sin(r * rmax * 1.1 - t * .8) * Math.exp(-gr * gr);
        /* vignette: the brew fades into the dark rim */
        v *= 1.12 - .85 * r * r;
        const d = v * v;
        const i = 3 * Math.max(0, Math.min(LEVELS - 1, (d * LEVELS) | 0));
        px[o] = LUT[i]; px[o + 1] = LUT[i + 1]; px[o + 2] = LUT[i + 2];
        o += 4;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /* loop */
  const RM = matchMedia('(prefers-reduced-motion:reduce)');
  const FRAME = 1000 / 24;
  let raf = null, last = 0, t0 = performance.now();
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < FRAME) return; last = now;
    frame((now - t0) / 1000);
  }
  function start() { if (!raf && !RM.matches) raf = requestAnimationFrame(loop); }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

  size();
  if (RM.matches) frame(8); else start();
  window.addEventListener('resize', () => { size(); if (RM.matches) frame(8); });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  RM.addEventListener('change', () => { stop(); RM.matches ? frame(8) : start(); });
})();

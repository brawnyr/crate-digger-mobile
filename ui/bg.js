/* CREAM CLOUDS — a hazy off-white living brew. Everything stays white: the
   deepest cloud shadow is warm parchment, the crests glow near-white, and
   faint rose / lilac tints slowly trade places in the brightest folds — the
   psychedelia breathes instead of shouting. Field on a coarse lattice,
   rendered at 3px pixels with bilinear smoothing + 8x8 Bayer dithering.
   External file for CSP (no inline scripts). */
(function () {
  const cvs = document.getElementById('bg');
  if (!cvs) return;
  const ctx = cvs.getContext('2d', { alpha: false });
  if (!ctx) return;
  const SEED = Math.random() * 1e3;      /* every session brews different clouds */

  /* value noise + fbm */
  function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7 + SEED) * 43758.5453; return s - Math.floor(s); }
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(x, y) { return noise(x, y) * .65 + noise(x * 2.13 + 7.7, y * 2.13 + 3.1) * .35; }

  /* palette: all white, tinted. The two tint stops drift between rose and
     lilac over ~90s, so the LUT is rebuilt each frame (48 bytes — free). */
  const ROSE = [0xf4, 0xe2, 0xdf], LILAC = [0xea, 0xe3, 0xf4];
  const LEVELS = 16;
  const LUT = new Uint8Array(LEVELS * 3);
  function mixc(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
  function buildLUT(t) {
    const sway = .5 + .5 * Math.sin(t * .07);            /* rose ↔ lilac, slow */
    const STOPS = [
      [0.00, [0xe0, 0xd4, 0xbe]],                        /* warm parchment shadow */
      [0.30, [0xee, 0xe5, 0xd2]],
      [0.55, [0xf7, 0xf1, 0xe2]],                        /* the body of the haze  */
      [0.74, mixc(ROSE, LILAC, sway)],                   /* tint A               */
      [0.88, mixc(LILAC, ROSE, sway)],                   /* tint B               */
      [1.00, [0xff, 0xfd, 0xf4]],                        /* the bright crest      */
    ];
    for (let i = 0; i < LEVELS; i++) {
      const d = i / (LEVELS - 1);
      let k = 0;
      while (k < STOPS.length - 2 && d > STOPS[k + 1][0]) k++;
      const [d0, c0] = STOPS[k], [d1, c1] = STOPS[k + 1];
      const f = Math.min(1, Math.max(0, (d - d0) / (d1 - d0)));
      LUT[i * 3] = c0[0] + (c1[0] - c0[0]) * f;
      LUT[i * 3 + 1] = c0[1] + (c1[1] - c0[1]) * f;
      LUT[i * 3 + 2] = c0[2] + (c1[2] - c0[2]) * f;
    }
  }

  /* 8x8 Bayer matrix, normalized to ±half a quantization step */
  const BAYER = [
     0, 32,  8, 40,  2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44,  4, 36, 14, 46,  6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
     3, 35, 11, 43,  1, 33,  9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47,  7, 39, 13, 45,  5, 37,
    63, 31, 55, 23, 61, 29, 53, 21,
  ].map(v => (v / 64 - .5) / LEVELS);

  /* two grids: coarse field lattice, fine output pixels */
  const PX = 3;                           /* CSS px per output pixel        */
  const STEP = 3;                         /* field lattice: every STEP px   */
  let ow = 0, oh = 0, fw = 0, fh = 0, img = null, field = null;
  function size() {
    ow = Math.max(1, Math.ceil(innerWidth / PX));
    oh = Math.max(1, Math.ceil(innerHeight / PX));
    fw = Math.ceil(ow / STEP) + 2;
    fh = Math.ceil(oh / STEP) + 2;
    if (cvs.width !== ow || cvs.height !== oh) {
      cvs.width = ow; cvs.height = oh;    /* small canvas, CSS scales it up */
      img = ctx.createImageData(ow, oh);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
      field = new Float32Array(fw * fh);
    }
  }

  /* the cloud field, one sample per lattice point */
  const S = .03;       /* field scale — small = big soft clouds            */
  const WARP = 2.2;    /* how much the clouds fold into themselves         */
  const SWIRL = .015;  /* rad/s — the haze barely turns                    */
  const RISE = .03;    /* the brew drifts gently upward                    */
  function computeField(t) {
    const cx = fw / 2, cy = fh / 2;
    /* the breath: contrast swells and relaxes on a slow cycle */
    const breath = .82 + .18 * Math.sin(t * .21);
    const co = Math.cos(t * SWIRL), si = Math.sin(t * SWIRL);
    let o = 0;
    for (let y = 0; y < fh; y++) {
      const dy = y - cy;
      for (let x = 0; x < fw; x++) {
        const dx = x - cx;
        const nx = (dx * co - dy * si) * S, ny = (dx * si + dy * co) * S + t * RISE;
        /* the brewing: clouds folding through themselves, slow and soft */
        const qx = noise(nx + t * .045, ny), qy = noise(nx + 5.2, ny - t * .03);
        const v = fbm(nx + WARP * qx + t * .018, ny + WARP * qy - t * .012);
        field[o++] = .5 + (v - .5) * breath;
      }
    }
  }

  /* render: bilinear-sample the field per pixel, dither, quantize to the LUT */
  function frame(t) {
    buildLUT(t);
    computeField(t);
    const px = img.data;
    let o = 0;
    for (let y = 0; y < oh; y++) {
      const gy = y / STEP, iy = gy | 0, fy = gy - iy;
      const row0 = iy * fw, row1 = row0 + fw;
      const brow = (y & 7) << 3;
      for (let x = 0; x < ow; x++) {
        const gx = x / STEP, ix = gx | 0, fx = gx - ix;
        const a = field[row0 + ix], b = field[row0 + ix + 1];
        const c = field[row1 + ix], e = field[row1 + ix + 1];
        const d = a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy
                + BAYER[brow | (x & 7)];
        let i = (d * LEVELS) | 0;
        i = i < 0 ? 0 : i >= LEVELS ? LEVELS - 1 : i;
        i *= 3;
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

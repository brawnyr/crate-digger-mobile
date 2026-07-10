/* PIXEL BREW — abstract psychedelic coffee haze. Bright and creamy, with dark
   coffee glooping and floating up through the milk; a whisper of rose in the
   hottest cream. Field on a coarse lattice, rendered at 3px pixels with
   bilinear smoothing + 8x8 Bayer ordered dithering.
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

  /* brew palette LUT: creamy and bright, coffee lives in the gloops.
     density 0..1 → coffee → caramel → latte → cream → rose-milk shimmer → cream */
  const STOPS = [
    [0.00, 0x2b, 0x16, 0x0c],   /* the coffee gloop                */
    [0.22, 0x6e, 0x3a, 0x1c],
    [0.42, 0xb8, 0x7a, 0x3e],   /* bright caramel                  */
    [0.60, 0xe0, 0xb5, 0x7e],   /* latte                           */
    [0.78, 0xf2, 0xdc, 0xb2],   /* cream                           */
    [0.90, 0xf0, 0xc9, 0xc4],   /* rose-milk — the psychedelic sheen */
    [1.00, 0xf7, 0xec, 0xd2],
  ];
  const LEVELS = 16;                      /* few levels + dither = the texture */
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
    fw = Math.ceil(ow / STEP) + 2;        /* +2: bilinear headroom          */
    fh = Math.ceil(oh / STEP) + 2;
    if (cvs.width !== ow || cvs.height !== oh) {
      cvs.width = ow; cvs.height = oh;    /* small canvas, CSS scales it up */
      img = ctx.createImageData(ow, oh);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
      field = new Float32Array(fw * fh);
    }
  }

  /* the brew field, one sample per lattice point */
  const S = .028;      /* field scale — small = big soft gloops            */
  const WARP = 2.9;    /* how hard the coffee folds and gloops             */
  const SWIRL = .04;   /* rad/s — the whole haze slowly turns              */
  const STIR = .5;     /* extra twist near the center                      */
  const RISE = .045;   /* the gloop floats upward, like coffee in milk     */
  function computeField(t) {
    const cx = fw / 2, cy = fh / 2;
    const rmax = Math.hypot(cx, cy);
    let o = 0;
    for (let y = 0; y < fh; y++) {
      const dy = y - cy;
      for (let x = 0; x < fw; x++) {
        const dx = x - cx;
        const r = Math.hypot(dx, dy) / rmax;
        /* the swirl: everything slowly turns, more toward the middle */
        const th = t * SWIRL + STIR * Math.exp(-2.4 * r * r);
        const co = Math.cos(th), si = Math.sin(th);
        const nx = (dx * co - dy * si) * S, ny = (dx * si + dy * co) * S + t * RISE;
        /* the gloop: coffee folding up through the milk, slow and heavy */
        const qx = noise(nx + t * .05, ny), qy = noise(nx + 5.2, ny - t * .035);
        let v = fbm(nx + WARP * qx + t * .02, ny + WARP * qy - t * .015);
        /* soft rim — barely there, the haze stays bright */
        v *= 1.02 - .3 * r * r;
        field[o++] = v;
      }
    }
  }

  /* render: bilinear-sample the field per pixel, dither, quantize to the LUT */
  function frame(t) {
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

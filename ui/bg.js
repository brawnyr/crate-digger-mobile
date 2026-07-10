/* SOFT FALLS — glowing mid-tone psychedelia that breathes. A gentle waterfall
   of color down the center melting into slow layered pools at the sides. The
   palette is a closed loop of close neighbors (sand → peach → coral → pink →
   mauve → lavender → plum → back) so every dithered seam reads as glow, never
   contrast. Two breaths run underneath: the whole field's brightness swells
   and relaxes (~35s), and the pool-waves deepen and flatten (~50s).
   3px pixels; noise on a coarse lattice, bilinearly lifted, Bayer-dithered.
   External file for CSP (no inline scripts). */
(function () {
  const cvs = document.getElementById('bg');
  if (!cvs) return;
  const ctx = cvs.getContext('2d', { alpha: false });
  if (!ctx) return;
  const SEED = Math.random() * 1e3;

  /* the loop of neighbors — all mid-brightness, warm, no darks, no neon */
  const PAL = [
    [0xe6, 0xc2, 0x96],   /* warm sand      */
    [0xe8, 0xac, 0x8e],   /* peach          */
    [0xe2, 0x9a, 0x9e],   /* coral          */
    [0xdd, 0x93, 0xb4],   /* dusty pink     */
    [0xc9, 0x8c, 0xc4],   /* mauve          */
    [0xb2, 0x92, 0xd2],   /* warm lavender  */
    [0xc7, 0x9d, 0xbe],   /* soft plum      */
    [0xdc, 0xb2, 0xa0],   /* rosy sand      */
  ];
  const L = PAL.length;
  const lut = new Uint8Array(L * 3);      /* PAL × the breath, rebuilt per frame */

  /* value noise */
  function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7 + SEED) * 43758.5453; return s - Math.floor(s); }
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }

  /* 8x8 Bayer, ±.5 band, widened — with close neighbors the seams go gauzy */
  const DITHER = .85;
  const BAYER = [
     0, 32,  8, 40,  2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44,  4, 36, 14, 46,  6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
     3, 35, 11, 43,  1, 33,  9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47,  7, 39, 13, 45,  5, 37,
    63, 31, 55, 23, 61, 29, 53, 21,
  ].map(v => (v / 64 - .5) * DITHER);

  /* fine output pixels; the two noise fields live on a coarse lattice */
  const PX = 3;                           /* CSS px per output pixel      */
  const STEP = 4;                         /* lattice: every STEP px       */
  let ow = 0, oh = 0, fw = 0, fh = 0, img = null, wF = null, sF = null;
  function size() {
    ow = Math.max(1, Math.ceil(innerWidth / PX));
    oh = Math.max(1, Math.ceil(innerHeight / PX));
    fw = Math.ceil(ow / STEP) + 2;
    fh = Math.ceil(oh / STEP) + 2;
    if (cvs.width !== ow || cvs.height !== oh) {
      cvs.width = ow; cvs.height = oh;    /* small canvas, CSS scales it up */
      img = ctx.createImageData(ow, oh);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
      wF = new Float32Array(fw * fh);     /* pool-wave field   */
      sF = new Float32Array(fw * fh);     /* fall-streak field */
    }
  }

  const BANDS = 7;      /* pools stacked down the screen                  */
  const SX = .018;      /* pool-wave frequency across the screen          */
  const SY = 2.2;       /* how differently each pool waves                */
  const SCROLL = .02;   /* bands/s — the pools drift, glacially           */
  const FALLSPD = .5;   /* bands/s — the fall pours, unhurried            */
  const STREAK = 1.5;   /* how much the fall's streaks bend the color     */
  const FALLW = .15;    /* fall half-width, fraction of the screen        */

  function computeFields(t) {
    let o = 0;
    for (let ly = 0; ly < fh; ly++) {
      const u = (ly * STEP) / oh;
      for (let lx = 0; lx < fw; lx++) {
        const ox = lx * STEP;
        wF[o] = noise(ox * SX, u * SY + t * .03);          /* lazy pool wave  */
        sF[o] = noise(ox * .055, u * 2.0 - t * FALLSPD);   /* falling streaks */
        o++;
      }
    }
  }

  function frame(t) {
    /* breath one: the whole field's light swells and relaxes (~35s cycle) */
    const light = .93 + .07 * Math.sin(t * .18);
    for (let i = 0; i < L; i++) {
      lut[i * 3] = PAL[i][0] * light;
      lut[i * 3 + 1] = PAL[i][1] * light;
      lut[i * 3 + 2] = PAL[i][2] * light;
    }
    /* breath two: the pool-waves deepen and flatten (~50s cycle) */
    const wave = 1.1 * (.72 + .28 * Math.sin(t * .125 + 2));

    computeFields(t);
    const px = img.data;
    const cx = ow / 2;
    let o = 0;
    for (let y = 0; y < oh; y++) {
      const u = y / oh;
      const gy = y / STEP, iy = gy | 0, fy = gy - iy;
      const row0 = iy * fw, row1 = row0 + fw;
      const brow = (y & 7) << 3;
      const halfw = ow * (FALLW + .04 * u);   /* the fall widens a touch, like spray */
      const vBase = u * BANDS + t * SCROLL;
      const vFallBase = u * 4 - t * FALLSPD * 1.5;
      for (let x = 0; x < ow; x++) {
        const gx = x / STEP, ix = gx | 0, fx = gx - ix;
        const a0 = row0 + ix, a1 = row1 + ix;
        const bx = fx, by = fy;
        /* bilinear lift of both lattice fields */
        const w = wF[a0] + (wF[a0 + 1] - wF[a0]) * bx + (wF[a1] - wF[a0]) * by
                + (wF[a0] - wF[a0 + 1] - wF[a1] + wF[a1 + 1]) * bx * by;
        const s = sF[a0] + (sF[a0 + 1] - sF[a0]) * bx + (sF[a1] - sF[a0]) * by
                + (sF[a0] - sF[a0 + 1] - sF[a1] + sF[a1 + 1]) * bx * by;
        /* pools and fall, melted by distance from the center column */
        const vBand = vBase + wave * w;
        const vFall = vFallBase + STREAK * s;
        const dxx = Math.abs(x - cx) / halfw;
        const d4 = dxx * dxx * dxx * dxx;
        const m = 1 / (1 + d4);                 /* soft plateau, soft skirts */
        const v = vBand + (vFall - vBand) * m + BAYER[brow | (x & 7)];
        const i = 3 * (((v % L) + L) % L | 0);
        px[o] = lut[i]; px[o + 1] = lut[i + 1]; px[o + 2] = lut[i + 2];
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

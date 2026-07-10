/* PIXEL LAYERS — a pixel-art shader: flat psychedelic color bands with wavy
   boundaries, chunky 6px pixels, Bayer-dithered edges where bands meet. The
   bands undulate and slowly scroll upward, cycling through the palette.
   Simple: one noise call per pixel, one palette lookup. No gradients.
   External file for CSP (no inline scripts). */
(function () {
  const cvs = document.getElementById('bg');
  if (!cvs) return;
  const ctx = cvs.getContext('2d', { alpha: false });
  if (!ctx) return;
  const SEED = Math.random() * 1e3;      /* every session waves differently */

  /* the layers, cycling: coffee → rust → caramel → rose → violet → pink → latte → cream */
  const PAL = [
    [0x2b, 0x16, 0x0a],
    [0x5a, 0x28, 0x10],
    [0xb0, 0x5e, 0x24],
    [0xd8, 0x57, 0x8a],
    [0x7a, 0x4b, 0xb4],
    [0xe3, 0x9e, 0xc2],
    [0xe6, 0xb0, 0x6a],
    [0xf2, 0xdc, 0xae],
  ];
  const L = PAL.length;

  /* value noise (for the wavy boundaries) */
  function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7 + SEED) * 43758.5453; return s - Math.floor(s); }
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }

  /* 8x8 Bayer matrix, ±.5, scaled down so only band edges dither */
  const DITHER = .55;
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

  const PX = 6;                           /* chunky pixel-art blocks */
  let ow = 0, oh = 0, img = null;
  function size() {
    ow = Math.max(1, Math.ceil(innerWidth / PX));
    oh = Math.max(1, Math.ceil(innerHeight / PX));
    if (cvs.width !== ow || cvs.height !== oh) {
      cvs.width = ow; cvs.height = oh;    /* tiny canvas, CSS scales it up */
      img = ctx.createImageData(ow, oh);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    }
  }

  const BANDS = 10;    /* how many bands stack down the screen           */
  const WAVE = 1.4;    /* boundary wobble, in band-heights               */
  const SX = .035;     /* wave frequency across the screen               */
  const SY = 2.6;      /* how differently each band waves                */
  const SCROLL = .05;  /* bands/s — the stack slowly migrates upward     */
  function frame(t) {
    const px = img.data;
    let o = 0;
    for (let y = 0; y < oh; y++) {
      const u = y / oh;
      const brow = (y & 7) << 3;
      for (let x = 0; x < ow; x++) {
        /* band value: vertical position + its own wave + the slow scroll */
        const w = noise(x * SX, u * SY + t * .05);
        const v = u * BANDS + WAVE * w + t * SCROLL + BAYER[brow | (x & 7)];
        const c = PAL[((v % L) + L) % L | 0];
        px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
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

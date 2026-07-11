/* LIVING BREW — every pixel is alive. Domain-warped noise churns slow organic
   blobs across the screen (the brew), and each 3px pixel carries its own
   random phase and pulse rate, so the whole surface shimmers like a colony:
   no two pixels breathe together. The palette is a vibrant closed loop —
   violet → magenta → blood → orange → amber → rust → wine — saturated enough
   to pop, still dark enough that text glass floats on it. One global breath
   (~30s) swells the light underneath. External file for CSP (no inline). */
(function () {
  const cvs = document.getElementById('bg');
  if (!cvs) return;
  const ctx = cvs.getContext('2d', { alpha: false });
  if (!ctx) return;
  const SEED = Math.random() * 1e3;

  /* the vibrant loop — hot saturated neighbors, no white, no pastel */
  const PAL = [
    [0x4a, 0x18, 0x82],   /* electric violet */
    [0x7c, 0x1c, 0xa8],   /* purple          */
    [0xb2, 0x1e, 0x92],   /* magenta         */
    [0xd6, 0x24, 0x58],   /* hot crimson     */
    [0xe8, 0x44, 0x1e],   /* blood orange    */
    [0xf2, 0x7c, 0x14],   /* amber           */
    [0xc2, 0x4e, 0x1a],   /* rust            */
    [0x8a, 0x22, 0x66],   /* wine bridge     */
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

  /* sine table for the per-pixel pulse — one lookup per pixel per frame */
  const SINE = new Float32Array(256);
  for (let i = 0; i < 256; i++) SINE[i] = Math.sin((i / 256) * Math.PI * 2);

  /* fine output pixels; the brew field lives on a coarse lattice */
  const PX = 3;                           /* CSS px per output pixel      */
  const STEP = 4;                         /* lattice: every STEP px       */
  let ow = 0, oh = 0, fw = 0, fh = 0, img = null, bF = null;
  let phase = null, rate = null;          /* each pixel's own heartbeat   */
  function size() {
    ow = Math.max(1, Math.ceil(innerWidth / PX));
    oh = Math.max(1, Math.ceil(innerHeight / PX));
    fw = Math.ceil(ow / STEP) + 2;
    fh = Math.ceil(oh / STEP) + 2;
    if (cvs.width !== ow || cvs.height !== oh) {
      cvs.width = ow; cvs.height = oh;    /* small canvas, CSS scales it up */
      img = ctx.createImageData(ow, oh);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
      bF = new Float32Array(fw * fh);     /* brew field */
      const n = ow * oh;
      phase = new Uint8Array(n);          /* where in its breath it starts */
      rate = new Uint8Array(n);           /* how fast it breathes (1–4×)   */
      for (let i = 0, y = 0; y < oh; y++) for (let x = 0; x < ow; x++, i++) {
        const h = hash(x * 1.37, y * 2.11);
        phase[i] = (h * 256) | 0;
        rate[i] = 1 + ((h * 4096) & 3);
      }
    }
  }

  const SCALE = .011;   /* blob size — smaller = bigger blobs           */
  const WARP = 3.2;     /* how hard the churn folds the blobs           */
  const CYCLES = 2.2;   /* palette loops across the field's range       */
  const DRIFT = .06;    /* palette-steps/s — the whole brew slowly turns */
  const LIFE = .5;      /* pulse depth, in palette steps — the aliveness */
  const BEAT = 12;      /* base pulse speed (ticks/s into the 256 table) */

  function computeField(t) {
    let o = 0;
    for (let ly = 0; ly < fh; ly++) {
      const py = ly * STEP;
      for (let lx = 0; lx < fw; lx++) {
        const px_ = lx * STEP;
        /* two churn layers moving against each other warp the brew */
        const w1 = noise(px_ * .020 + t * .031, py * .020 - t * .022);
        const w2 = noise(px_ * .017 - t * .026, py * .023 + t * .034);
        bF[o++] = noise(px_ * SCALE + WARP * w1, py * SCALE + WARP * w2);
      }
    }
  }

  function frame(t) {
    /* the one global breath: the field's light swells and relaxes (~30s) */
    const light = .92 + .08 * SINE[((t * .21 / (Math.PI * 2) * 256) & 255)];
    for (let i = 0; i < L; i++) {
      lut[i * 3] = PAL[i][0] * light;
      lut[i * 3 + 1] = PAL[i][1] * light;
      lut[i * 3 + 2] = PAL[i][2] * light;
    }

    computeField(t);
    const px = img.data;
    const drift = t * DRIFT;
    const tick = (t * BEAT) | 0;
    let o = 0, p = 0;
    for (let y = 0; y < oh; y++) {
      const gy = y / STEP, iy = gy | 0, fy = gy - iy;
      const row0 = iy * fw, row1 = row0 + fw;
      for (let x = 0; x < ow; x++, p++) {
        const gx = x / STEP, ix = gx | 0, fx = gx - ix;
        const a0 = row0 + ix, a1 = row1 + ix;
        /* bilinear lift of the brew */
        const b = bF[a0] + (bF[a0 + 1] - bF[a0]) * fx + (bF[a1] - bF[a0]) * fy
                + (bF[a0] - bF[a0 + 1] - bF[a1] + bF[a1 + 1]) * fx * fy;
        /* this pixel's own heartbeat */
        const life = LIFE * SINE[(phase[p] + tick * rate[p]) & 255];
        const v = b * L * CYCLES + drift + life;
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

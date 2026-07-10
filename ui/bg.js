/* WHITE BLANKNESS — started from scratch 2026-07-10. The background is a blank
   warm white; whatever the brew becomes next grows from here.
   External file for CSP (no inline scripts). */
(function () {
  const cvs = document.getElementById('bg');
  if (!cvs) return;
  const ctx = cvs.getContext('2d', { alpha: false });
  if (!ctx) return;
  function paint() {
    cvs.width = 1; cvs.height = 1;      /* one pixel, CSS scales it up */
    ctx.fillStyle = '#fbf9f3';
    ctx.fillRect(0, 0, 1, 1);
  }
  paint();
  window.addEventListener('resize', paint);
})();

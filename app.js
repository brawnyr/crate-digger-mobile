"use strict";

// ===========================================================================
// Crate Digger — pocket PLAYER for your KEPT crate. The desktop auditioner digs
// the Internet Archive and keeps the good ones into library.json; this phone app
// just reads that list and plays those records back-to-back, streamed from the
// Archive. No digging, no keep/toss, no sync, no token — pure playback.
// ===========================================================================

const LIBRARY_URL = "./library.json";

// Friendly names for the crate a kept record came from (its `source`), so the
// filter dropdown reads nicely. Unknown sources fall back to the raw key.
const SOURCE_LABELS = {
  lp_soul_blues: "LP Soul · Blues · Funk",
  lp_soul_funk: "LP Soul / Funk",
  lp_blues: "LP Blues (electric)",
  lp_soul_jazz: "LP Soul-Jazz / organ",
  lp_jazz: "LP Jazz (full band)",
  lp_soul_blues_alt: "LP Soul/Blues — alt library",
  vocal_legends: "Soul-jazz vocal legends (Nina & co.)",
};

const $ = (id) => document.getElementById(id);
const els = {
  record: $("record"), placeholder: $("placeholder"), card: $("card"),
  title: $("title"), artist: $("artist"), year: $("year"), genre: $("genre"),
  label: $("label"), player: $("player"), ppBtn: $("ppBtn"), seek: $("seek"),
  seekFill: $("seekFill"), ptime: $("ptime"), pdur: $("pdur"), archive: $("archive"),
  genreSelect: $("genre-select"), asciiRecord: $("asciiRecord"), logo: $("logo"),
  cueing: $("cueing"), skip: $("skip"), toast: $("toast"),
};

// ---- spinning disc ------------------------------------------------------
const D_COLS = 35, D_ROWS = 21;
const D_CX = (D_COLS - 1) / 2, D_CY = (D_ROWS - 1) / 2;
const D_ASPECT = 1.7, D_OUTER = D_CX;
const D_RAMP = " .:-=+*#%@";
function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function renderDisc(phase) {
  let out = "";
  for (let y = 0; y < D_ROWS; y++) {
    for (let x = 0; x < D_COLS; x++) {
      const dx = x - D_CX, dy = (y - D_CY) * D_ASPECT, r = Math.hypot(dx, dy);
      if (r > D_OUTER + 0.5) { out += " "; continue; }
      if (r < 1.2) { out += " "; continue; }
      const th = Math.atan2(dy, dx);
      const arm = smoothstep(0.45, 0.96, Math.sin(2 * th + 0.5 * r - phase));
      const surface = 0.12 * (0.5 + 0.5 * Math.sin(r * 2.3));
      let n = Math.max(arm, surface) * smoothstep(D_OUTER + 0.4, D_OUTER - 3.2, r);
      n = n < 0 ? 0 : n > 1 ? 1 : n;
      out += D_RAMP[Math.round(n * (D_RAMP.length - 1))];
    }
    if (y < D_ROWS - 1) out += "\n";
  }
  els.asciiRecord.textContent = out;
}
let discPlaying = false, discLoading = false;
function setLoading(on, label) {
  discLoading = on;
  els.record.classList.toggle("loading", on);
  els.cueing.classList.toggle("hidden", !on);
  if (on && label != null) els.cueing.textContent = label;
}
(function spinDisc() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { renderDisc(0.8); return; }
  let phase = 0, speed = 0, last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const target = discLoading ? 9.0 : (discPlaying ? 2.6 : 0.5);
    speed += (target - speed) * 0.05;
    phase += speed * dt;
    renderDisc(phase);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

// ---- helpers ------------------------------------------------------------
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
function encPath(p) { return p.split("/").map(encodeURIComponent).join("/"); }
function playUrlFor(identifier, mp3Name) {
  return "https://archive.org/download/" + encodeURIComponent(identifier) + "/" + encPath(mp3Name);
}

// ---- the kept crate -----------------------------------------------------
// Read library.json (written by the desktop auditioner) and keep only the
// records that were KEPT — the ones saved into your sample folder.
let KEPT = [];
function isKept(e) {
  return e && e.identifier && e.mp3_name &&
    (e.downloaded === true || (Array.isArray(e.kept_files) && e.kept_files.length > 0));
}
async function loadLibrary() {
  const r = await fetch(LIBRARY_URL, { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const raw = await r.json();
  const entries = Array.isArray(raw) ? raw : Object.values(raw);
  KEPT = entries.filter(isKept).map((e) => ({
    title: e.title || "(untitled)",
    creator: e.creator || "Unknown artist",
    year: String(e.year || e.date || "").split("-")[0],
    genre: e.genre || "",
    album: e.album || "",
    label: e.label || "",
    source: e.source || "",
    archive_url: e.archive_url || ("https://archive.org/details/" + e.identifier),
    play_url: playUrlFor(e.identifier, e.mp3_name),
  }));
}

// ---- crate filter (which of your kept crates) ---------------------------
function loadSources() {
  const present = [...new Set(KEPT.map((e) => e.source).filter(Boolean))];
  const opts = ['<option value="">🎧 All kept — shuffle</option>'];
  for (const s of present) opts.push(`<option value="${s}">${SOURCE_LABELS[s] || s}</option>`);
  els.genreSelect.innerHTML = opts.join("");
  els.genreSelect.value = "";
}

// ---- playlist -----------------------------------------------------------
let playlist = [], pos = -1;
function buildPlaylist() {
  const filter = els.genreSelect.value;
  playlist = shuffle(filter ? KEPT.filter((e) => e.source === filter) : KEPT.slice());
  pos = -1;
}
function nextRecord() {
  if (!playlist.length) return null;
  pos = (pos + 1) % playlist.length;
  return playlist[pos];
}

// ---- audio player -------------------------------------------------------
let currentRecord = null, busy = false;
function toast(msg, kind) { els.toast.textContent = msg; els.toast.className = "toast " + (kind || ""); }
function clearToast() { els.toast.className = "toast hidden"; }
function setBusy(state) { busy = state; els.skip.disabled = state; els.genreSelect.disabled = state; }

els.player.addEventListener("playing", () => { discPlaying = true; });
els.player.addEventListener("pause", () => { discPlaying = false; });

function fmtTime(s) { if (!isFinite(s) || s < 0) return "0:00"; s = Math.floor(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
els.ppBtn.addEventListener("click", () => { if (els.player.paused) els.player.play().catch(() => {}); else els.player.pause(); });
els.player.addEventListener("play", () => { els.ppBtn.textContent = "⏸"; });
els.player.addEventListener("pause", () => { els.ppBtn.textContent = "▶"; });
els.player.addEventListener("loadstart", () => { els.seekFill.style.width = "0%"; els.ptime.textContent = "0:00"; els.pdur.textContent = "0:00"; });
els.player.addEventListener("loadedmetadata", () => { els.pdur.textContent = fmtTime(els.player.duration); });
els.player.addEventListener("timeupdate", () => {
  const d = els.player.duration || 0;
  els.seekFill.style.width = (d ? (els.player.currentTime / d) * 100 : 0) + "%";
  els.ptime.textContent = fmtTime(els.player.currentTime);
});
// when a track finishes, roll straight into the next kept record — radio style
els.player.addEventListener("ended", () => { discPlaying = false; els.ppBtn.textContent = "▶"; if (!busy) play(); });

let seeking = false;
function seekTo(clientX) {
  const rect = els.seek.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  els.seekFill.style.width = ratio * 100 + "%";
  if (els.player.duration) els.player.currentTime = ratio * els.player.duration;
}
els.seek.addEventListener("pointerdown", (e) => { seeking = true; els.seek.setPointerCapture(e.pointerId); seekTo(e.clientX); });
els.seek.addEventListener("pointermove", (e) => { if (seeking) seekTo(e.clientX); });
els.seek.addEventListener("pointerup", () => { seeking = false; });
els.seek.addEventListener("keydown", (e) => {
  if (!els.player.duration) return;
  if (e.key === "ArrowRight") els.player.currentTime = Math.min(els.player.duration, els.player.currentTime + 5);
  else if (e.key === "ArrowLeft") els.player.currentTime = Math.max(0, els.player.currentTime - 5);
});
function loadAudio(url) {
  return new Promise((resolve) => {
    const onReady = () => { cleanup(); resolve(true); };
    const onErr = () => { cleanup(); resolve(false); };
    function cleanup() { els.player.removeEventListener("canplay", onReady); els.player.removeEventListener("error", onErr); }
    els.player.addEventListener("canplay", onReady, { once: true });
    els.player.addEventListener("error", onErr, { once: true });
    els.player.src = url; els.player.load();
  });
}

// ---- present + play ------------------------------------------------------
async function present(rec) {
  currentRecord = rec;
  els.title.textContent = rec.title || "(untitled)";
  els.artist.textContent = rec.creator || "Unknown artist";
  els.year.textContent = rec.year || "";
  els.genre.textContent = rec.genre || "";
  els.label.textContent = rec.album ? "💿 " + rec.album : (rec.label ? "Label: " + rec.label : "");
  els.archive.href = rec.archive_url || "#";
  setLoading(true, "📻 cueing it up…");
  const ready = await loadAudio(rec.play_url);
  if (currentRecord !== rec) return;
  setLoading(false);
  els.placeholder.classList.add("hidden");
  els.card.classList.remove("hidden", "in");
  void els.card.offsetWidth;
  els.card.classList.add("in");
  if (!ready) { toast("⚠️ Couldn't load that one — skipping…", "err"); setTimeout(() => { if (!busy) play(); }, 900); return; }
  els.player.play().catch(() => {});
}

async function play() {
  if (busy) return;
  const rec = nextRecord();
  if (!rec) { setLoading(false); toast("Your kept crate is empty — keep some records on the desktop first.", "err"); return; }
  setBusy(true);
  els.player.pause();
  try {
    clearToast();
    await present(rec);
  } catch (e) {
    toast("⚠️ " + e.message + " — tap ⏭ to try the next one.", "err");
  } finally {
    setBusy(false);
  }
}

els.skip.addEventListener("click", () => { clearToast(); play(); });
els.genreSelect.addEventListener("change", () => { clearToast(); buildPlaylist(); play(); });

// ---- empty state --------------------------------------------------------
function showEmpty(lead, sub) {
  const l = els.placeholder.querySelector(".ph-lead"), s = els.placeholder.querySelector(".ph-sub");
  if (l) l.textContent = lead;
  if (s) s.textContent = sub;
  els.placeholder.classList.remove("hidden");
  els.card.classList.add("hidden");
}

// ---- startup wordmark reel ----------------------------------------------
const LOGO_GLYPHS = "▚▞▜▙▛▟▖▗▘▝░▒▓#%*+=";
function animateLogo() {
  return new Promise((resolve) => {
    const el = els.logo;
    if (!el) return resolve();
    const real = el.textContent;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = real; return resolve(); }
    const lines = real.split("\n");
    const width = Math.max(...lines.map((l) => l.length));
    setLoading(true, "◇ warming up the turntable…");
    const DUR = 1150, t0 = performance.now();
    function frame(now) {
      const k = Math.min(1, (now - t0) / DUR), front = k * (width + 3);
      let out = "";
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        for (let c = 0; c < line.length; c++) {
          const ch = line[c];
          if (ch === " ") out += " ";
          else if (c < front - 2) out += ch;
          else out += LOGO_GLYPHS[(Math.random() * LOGO_GLYPHS.length) | 0];
        }
        if (li < lines.length - 1) out += "\n";
      }
      el.textContent = out;
      if (k < 1) { requestAnimationFrame(frame); return; }
      el.textContent = real; el.classList.add("locked"); resolve();
    }
    requestAnimationFrame(frame);
  });
}
// autoplay is blocked until a gesture — the next tap starts the cued record
function armAutoplayUnlock() {
  const go = () => {
    window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go);
    if (currentRecord && els.player.paused) els.player.play().catch(() => {});
  };
  window.addEventListener("pointerdown", go);
  window.addEventListener("keydown", go);
}

async function boot() {
  if ("serviceWorker" in navigator) { try { navigator.serviceWorker.register("./sw.js"); } catch (_) {} }
  armAutoplayUnlock();
  let loadErr = null;
  try { await loadLibrary(); } catch (e) { loadErr = e; }
  if (!loadErr) loadSources();
  await animateLogo();
  setLoading(false);
  if (loadErr) {
    toast("⚠️ Couldn't load your crate: " + loadErr.message, "err");
    showEmpty("◇ Couldn't reach your crate", "check your connection and reload");
    return;
  }
  if (!KEPT.length) {
    showEmpty("◇ Your crate is empty", "keep some records on the desktop — they'll play here");
    return;
  }
  buildPlaylist();
  play();
}
boot();

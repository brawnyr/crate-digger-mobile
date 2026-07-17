"use strict";

// ===========================================================================
// Crate Digger — a Tauri desktop auditioner. Digs the Internet Archive,
// keep/toss one record at a time, and saves kept records as WAVs into a folder
// you pick (the Rust backend owns the disk). The durable crate log is
// crate-log.json in that folder; localStorage is the working cache.
// ===========================================================================

// ---- config -------------------------------------------------------------
const invoke = window.__TAURI__.core.invoke;
const LS = { log: "cd_log_cache", pending: "cd_pending" };

// One crate, no picker. The whole thing is tuned to one sound: creamy,
// psychedelic, beautiful late-'60s/early-'70s soul — Nina in '69, the warm
// smoke-to records. Half 1 is the LP well (soul/blues/funk/soul-jazz +
// psychedelic soul); Half 2 is that era's voices by name. Not rap, not
// mixtapes — that's a different, rougher corner of the Archive. One crate
// means no overlap, which is the point: the "records left" count is exact
// (pool − everything you've judged), not an estimate.
const CRATE = {
  key: "the_good_stuff", pick: "track",
  query:
    '(collection:unlockedrecordings AND (subject:Soul OR subject:Blues OR subject:Funk ' +
    'OR subject:"Soul-Jazz" OR subject:"Jazz-Funk" OR subject:"Funk / Soul" ' +
    'OR subject:"Rhythm and blues" OR subject:"Psychedelic Soul")) ' +
    'OR (collection:(opensource_audio OR unlockedrecordings OR album_recordings) ' +
    'AND (creator:"Nina Simone" OR creator:"Aretha Franklin" OR creator:"Etta James" ' +
    'OR creator:"Roberta Flack" OR creator:"Nancy Wilson" OR creator:"Carmen McRae" ' +
    'OR creator:"Dinah Washington" OR creator:"Gloria Lynne" OR creator:"Esther Phillips" ' +
    'OR creator:"Donny Hathaway" OR creator:"Bill Withers" OR creator:"Curtis Mayfield" ' +
    'OR creator:"Gil Scott-Heron" OR creator:"Marlena Shaw" OR creator:"Roy Ayers" ' +
    'OR creator:"Terry Callier" OR creator:"Shuggie Otis" OR creator:"Minnie Riperton" ' +
    'OR creator:"Isaac Hayes" OR creator:"Al Green" OR creator:"Bobby Womack" ' +
    'OR creator:"Labi Siffre" OR creator:"Gene McDaniels" OR creator:"Leon Thomas") ' +
    'AND NOT creator:Various AND NOT title:Unofficial)',
};

// IA search won't page past 10k deep; rotating the sort exposes different windows.
const SORTS = ["", "titleSorter asc", "titleSorter desc", "date asc", "date desc",
  "publicdate asc", "publicdate desc", "addeddate asc", "addeddate desc",
  "downloads desc", "downloads asc"];

// ---- DOM ----------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const els = {
  record: $("record"), placeholder: $("placeholder"), card: $("card"),
  title: $("title"), artist: $("artist"), year: $("year"), genre: $("genre"),
  label: $("label"), player: $("player"), ppBtn: $("ppBtn"), seek: $("seek"),
  seekFill: $("seekFill"), ptime: $("ptime"), pdur: $("pdur"), archive: $("archive"),
  crateCount: $("crateCount"),
  toast: $("toast"),
  libCount: $("libCount"), libList: $("libList"), libEmpty: $("libEmpty"),
  asciiRecord: $("asciiRecord"), logo: $("logo"), cueing: $("cueing"),
  folderPick: $("folderPick"), folderStatus: $("folderStatus"),
};

// ---- spinning disc --------------------------------------------------------
const D_COLS = 35, D_ROWS = 21;
const D_CX = (D_COLS - 1) / 2, D_CY = (D_ROWS - 1) / 2;
const D_ASPECT = 1.7, D_OUTER = D_CX;
const D_RAMP = " .:-=+*#%@";

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
// The verdict plays out on the disc itself, both on the same sine breath —
// keep: the whole vinyl morphs, a ripple running through the grooves and
// twisting the arms before it settles; toss: the disc crumbles to dust and
// breathes back together. CSS handles the color wash (fx-*).
let discFx = null, discFxT0 = 0, discFxMs = 0;
function discEffect(kind) {
  const ms = 1500;
  els.asciiRecord.classList.remove("fx-keep", "fx-toss");
  void els.asciiRecord.offsetWidth;
  els.asciiRecord.classList.add("fx-" + kind);
  setTimeout(() => els.asciiRecord.classList.remove("fx-" + kind), ms);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;  // still disc — skip the shape pass
  discFx = kind; discFxT0 = performance.now(); discFxMs = ms;
}
function renderDisc(phase) {
  let fxK = 0;
  if (discFx) {
    fxK = (performance.now() - discFxT0) / discFxMs;
    if (fxK >= 1) { discFx = null; fxK = 0; }
  }
  let out = "";
  for (let y = 0; y < D_ROWS; y++) {
    for (let x = 0; x < D_COLS; x++) {
      const dx = x - D_CX;
      const dy = (y - D_CY) * D_ASPECT;
      const r = Math.hypot(dx, dy);
      if (r > D_OUTER + 0.5) { out += " "; continue; }
      if (r < 1.2) { out += " "; continue; }
      const th = Math.atan2(dy, dx);
      // keep: no overlay — the vinyl itself morphs. A radial ripple runs
      // through the grooves and the arms twist with it, then it all
      // settles back to a plain spinning record.
      let wr = r, wth = th, swell = 0;
      if (discFx === "keep") {
        const env = Math.sin(Math.PI * fxK);            // 0 → 1 → 0, no hard stop
        const wave = Math.sin(r * 1.5 - fxK * Math.PI * 4);
        wr = r + env * 2.2 * wave;
        wth = th + env * 0.5 * Math.sin(fxK * Math.PI * 2 + r * 0.7);
        swell = env * 0.22 * (0.5 + 0.5 * wave);        // the crests glow a little
      }
      const arm = smoothstep(0.45, 0.96, Math.sin(2 * wth + 0.5 * wr - phase));
      const surface = 0.12 * (0.5 + 0.5 * Math.sin(wr * 2.3));
      let n = (Math.max(arm, surface) + swell) * smoothstep(D_OUTER + 0.4, D_OUTER - 3.2, r);
      n = n < 0 ? 0 : n > 1 ? 1 : n;
      let ch = D_RAMP[Math.round(n * (D_RAMP.length - 1))];
      if (discFx === "toss") {           // crumble to dust, then breathe back together
        const d = Math.sin(Math.PI * fxK);        // 0 → 1 → 0, no hard stop
        const h = Math.abs(Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1;
        if (h < d * 1.15) ch = h < d * 0.6 ? " " : "·";
      }
      out += ch;
    }
    if (y < D_ROWS - 1) out += "\n";
  }
  els.asciiRecord.textContent = out;
}
let discPlaying = false, discLoading = false;
// The disc can spin fast to signal loading, but the text caption only shows when a
// label is passed — "cueing it up…" is gone; a bare setLoading(true) just spins.
function setLoading(on, label) {
  discLoading = on;
  els.record.classList.toggle("loading", on);
  const showCaption = on && !!label;
  els.cueing.classList.toggle("hidden", !showCaption);
  if (showCaption) els.cueing.textContent = label;
}
(function spinDisc() {
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  let phase = 0, speed = 0, last = performance.now(), raf = null;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const target = discLoading ? 9.0 : (discPlaying ? 2.6 : 0.5);
    speed += (target - speed) * 0.05;
    phase += speed * dt;
    renderDisc(phase);
    raf = requestAnimationFrame(frame);
  }
  function start() { if (raf == null) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { if (raf != null) { cancelAnimationFrame(raf); raf = null; } }
  function apply() { if (RM.matches) { stop(); renderDisc(0.8); } else start(); }
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : apply()));
  RM.addEventListener("change", apply);
  apply();
})();

// ---- little helpers -----------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"'`]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
}
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function firstOf(v) { return Array.isArray(v) ? (v[0] || "") : (v || ""); }
function joined(v) { return Array.isArray(v) ? v.filter(Boolean).join(", ") : (v || ""); }
function nameToTitle(name) {
  let base = name.split("/").pop().replace(/\.[^.]*$/, "").replace(/_/g, " ");
  base = base.replace(/^\s*\d+\s*[-.)]?\s*/, "");
  return base.replace(/\s+/g, " ").trim() || name.split("/").pop();
}
// Stable per-track key — must stay format-compatible with existing crate-log.json keys.
function cacheNameFor(identifier, mp3Name) {
  const clean = (s) => s.replace(/[^A-Za-z0-9._-]/g, "_");
  const ident = clean(identifier).slice(0, 80);
  const track = clean(mp3Name.replace(/\.[^.]*$/, "")).slice(0, 48);
  return ident + "__" + track + ".mp3";
}
// encode a file path for the IA download URL, preserving the slashes
function encPath(p) { return p.split("/").map(encodeURIComponent).join("/"); }
function playUrlFor(identifier, mp3Name) {
  return "https://archive.org/download/" + encodeURIComponent(identifier) + "/" + encPath(mp3Name);
}
// clean up metadata so WAVs land with a tidy "Title - Artist.wav"
function safeName(text) {
  text = String(text || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().replace(/^[.\s]+|[.\s]+$/g, "");
  return (text || "record").slice(0, 110);
}
// ---- Internet Archive client ----------------------------------------------
async function iaJson(url) {
  // the Rust side owns the user-facing message ("Internet Archive is busy…")
  try { return await invoke("ia_json", { url }); }
  catch (e) { throw new Error(String(e)); }
}
const _numCache = new Map();
async function numFound(query) {
  if (_numCache.has(query)) return _numCache.get(query);
  const url = "https://archive.org/advancedsearch.php?" +
    new URLSearchParams({ q: query, rows: "0", output: "json" }).toString();
  const n = (await iaJson(url)).response.numFound;
  _numCache.set(query, n);
  return n;
}
async function recordInfo(identifier, pick) {
  const meta = await iaJson("https://archive.org/metadata/" + encodeURIComponent(identifier));
  const md = meta.metadata || {};
  if (String(md["access-restricted-item"] || "").trim().toLowerCase() === "true") return null;
  const files = meta.files || [];
  const isTrack = (f) => !(f.name || "").toLowerCase().endsWith("_sample.mp3");
  let audio = files.filter((f) => f.format === "VBR MP3" && isTrack(f));
  if (!audio.length) audio = files.filter((f) => (f.name || "").toLowerCase().endsWith(".mp3") && isTrack(f));
  if (!audio.length) return null;
  const chosen = pick === "track" ? audio[Math.floor(Math.random() * audio.length)] : audio[0];
  const itemTitle = firstOf(md.title) || identifier;
  let title, album;
  if (pick === "track") { title = firstOf(chosen.title) || nameToTitle(chosen.name); album = itemTitle; }
  else { title = itemTitle; album = ""; }
  return {
    identifier, mp3_name: chosen.name, cache_name: cacheNameFor(identifier, chosen.name),
    title, album, creator: joined(md.creator) || "Unknown artist",
    year: String(md.year || md.date || "").split("-")[0],
    label: firstOf(md.publisher), genre: joined(md.genre || md.subject),
    archive_url: "https://archive.org/details/" + identifier,
    play_url: playUrlFor(identifier, chosen.name),
  };
}
async function pickRandom(query, pick, tries, exclude) {
  tries = tries || 10;
  const total = await numFound(query);
  if (total === 0) return null;
  const rows = 10;
  const reachable = Math.min(total, 10000);
  const maxPage = Math.max(1, Math.ceil(reachable / rows));
  for (let t = 0; t < tries; t++) {
    const params = new URLSearchParams({ q: query, "fl[]": "identifier", rows: String(rows),
      page: String(randInt(1, maxPage)), output: "json" });
    const sort = SORTS[randInt(0, SORTS.length - 1)];
    if (sort) params.set("sort[]", sort);
    let docs;
    try { docs = (await iaJson("https://archive.org/advancedsearch.php?" + params.toString())).response.docs; }
    catch (_) { continue; }
    shuffle(docs);
    // Fetch all candidates' metadata concurrently, then take the first usable one
    // in shuffled order — much faster than probing them one at a time.
    const infos = await Promise.all(docs.map((d) => recordInfo(d.identifier, pick).catch(() => null)));
    for (const info of infos) {
      if (!info) continue;
      if (exclude && exclude.has(info.cache_name)) continue;
      return info;
    }
  }
  return null;
}

// ---- crate log ------------------------------------------------------------
// Two layers, merged newest-verdict-wins:
//   1. localStorage — the working copy, updated on every verdict.
//   2. crate-log.json in your sample folder — the source of truth on disk,
//      written on every verdict once a folder is set.
let LIBRARY = {};

function logStamp(e) { return e.downloaded_at || e.listened_at || e.seen_at || 0; }
// Union two logs; per key keep the entry that was judged/seen most recently.
function mergeLogs(a, b) {
  const out = Object.assign({}, a);
  for (const k in b) { if (!out[k] || logStamp(b[k]) >= logStamp(out[k])) out[k] = b[k]; }
  return out;
}
function saveLocal() {
  try { localStorage.setItem(LS.log, JSON.stringify(LIBRARY)); } catch (_) {}
}
function loadLocal() {
  try { LIBRARY = JSON.parse(localStorage.getItem(LS.log) || "{}") || {}; } catch (_) { LIBRARY = {}; }
}
// every verdict: update the working copy and mirror it to disk
function persistLog() {
  saveLocal();
  invoke("save_log", { log: LIBRARY }).catch(() => {});   // fire-and-forget
}

function libEntryFrom(rec, sourceKey) {
  return {
    identifier: rec.identifier || "", mp3_name: rec.mp3_name || "",
    cache_name: rec.cache_name || "", title: rec.title || "", creator: rec.creator || "",
    year: rec.year || "", album: rec.album || "", genre: rec.genre || "", label: rec.label || "",
    archive_url: rec.archive_url || "", source: sourceKey || rec.source || "",
    listened: false, downloaded: false, kept_files: [],
    seen_at: Date.now() / 1000, listened_at: null, downloaded_at: null,
  };
}
function libExcludedKeys() {
  const s = new Set();
  for (const k in LIBRARY) { const e = LIBRARY[k]; if (e.listened || e.downloaded) s.add(k); }
  return s;
}
function libCounts() {
  let all = 0, heard = 0, kept = 0;
  for (const k in LIBRARY) { const e = LIBRARY[k]; all++; if (e.listened) heard++; if (e.downloaded) kept++; }
  return { all, heard, kept };
}
function libList(filt) {
  let items = Object.values(LIBRARY);
  if (filt === "heard") items = items.filter((e) => e.listened);
  else if (filt === "kept") items = items.filter((e) => e.downloaded);
  items.sort((a, b) => (b.seen_at || 0) - (a.seen_at || 0));
  return items;
}
// upsert + mark (kept/tossed are opposites)
function markVerdict(rec, sourceKey, kind) {
  const key = rec.cache_name;
  if (!key) return;
  let e = LIBRARY[key];
  if (!e) { e = libEntryFrom(rec, sourceKey); LIBRARY[key] = e; }
  const now = Date.now() / 1000;
  if (kind === "keep") { e.downloaded = true; e.downloaded_at = now; e.listened = false; e.listened_at = null; }
  else { e.listened = true; e.listened_at = now; e.downloaded = false; e.downloaded_at = null; }
}
function entryToRecord(e) {
  return Object.assign({}, e, { play_url: playUrlFor(e.identifier, e.mp3_name) });
}

// ---- audio player ---------------------------------------------------------
let currentRecord = null, busy = false;
let toastTimer = null;
function toast(msg, kind) {
  els.toast.textContent = msg;
  els.toast.className = "toast " + (kind || "");
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  // "busy" toasts track an in-flight op and are cleared by its result; others fade.
  if (kind !== "busy") toastTimer = setTimeout(clearToast, kind === "err" ? 9000 : 5000);
}
function clearToast() { if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; } els.toast.className = "toast hidden"; }
function setBusy(state, msg) {
  busy = state;
  if (state && msg) toast(msg, "busy");
}
// Two audio elements double-buffer the crate: one is live (els.player), the
// other quietly buffers the next dig. Handlers guard on liveness so the
// standby's events never touch the UI.
let standby = new Audio();
standby.preload = "auto";
function wireAudio(p) {
  const live = () => p === els.player;
  p.addEventListener("playing", () => { if (!live()) return; discPlaying = true; setLoading(false); });
  p.addEventListener("play", () => { if (!live()) return; els.ppBtn.textContent = "⏸"; els.ppBtn.setAttribute("aria-label", "Pause"); });
  for (const ev of ["pause", "ended"]) p.addEventListener(ev, () => {
    if (!live()) return;
    discPlaying = false;
    els.ppBtn.textContent = "▶"; els.ppBtn.setAttribute("aria-label", "Play");
  });
  // mid-track buffering: spin the disc faster (no text), settle once audio resumes
  p.addEventListener("waiting", () => { if (live() && currentRecord) setLoading(true); });
  p.addEventListener("loadstart", () => {
    if (!live()) return;
    els.seekFill.style.width = "0%"; els.ptime.textContent = "0:00"; els.pdur.textContent = "0:00";
  });
  p.addEventListener("loadedmetadata", () => { if (!live()) return; els.pdur.textContent = fmtTime(p.duration); updateSeekAria(); });
  p.addEventListener("timeupdate", () => {
    if (!live()) return;
    const d = p.duration || 0;
    els.seekFill.style.width = (d ? (p.currentTime / d) * 100 : 0) + "%";
    els.ptime.textContent = fmtTime(p.currentTime);
    updateSeekAria();
  });
}
wireAudio(els.player);
wireAudio(standby);

function fmtTime(s) {
  if (!isFinite(s) || s < 0) return "0:00";
  s = Math.floor(s);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
function updateSeekAria() {
  const d = Math.floor(els.player.duration || 0), c = Math.floor(els.player.currentTime || 0);
  els.seek.setAttribute("aria-valuemax", String(d));
  els.seek.setAttribute("aria-valuenow", String(c));
  els.seek.setAttribute("aria-valuetext", fmtTime(c) + " of " + fmtTime(d));
}
els.ppBtn.addEventListener("click", () => {
  if (els.player.paused) els.player.play().catch(() => {}); else els.player.pause();
});
let seeking = false;
function seekTo(clientX) {
  const rect = els.seek.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  els.seekFill.style.width = ratio * 100 + "%";
  if (els.player.duration) { els.player.currentTime = ratio * els.player.duration; updateSeekAria(); }
}
els.seek.addEventListener("pointerdown", (e) => { seeking = true; els.seek.setPointerCapture(e.pointerId); seekTo(e.clientX); });
els.seek.addEventListener("pointermove", (e) => { if (seeking) seekTo(e.clientX); });
els.seek.addEventListener("pointerup", () => { seeking = false; });
els.seek.addEventListener("keydown", (e) => {
  if (!els.player.duration) return;
  if (e.key === "ArrowRight") els.player.currentTime = Math.min(els.player.duration, els.player.currentTime + 5);
  else if (e.key === "ArrowLeft") els.player.currentTime = Math.max(0, els.player.currentTime - 5);
  else if (e.key === "Home") els.player.currentTime = 0;
  else if (e.key === "End") els.player.currentTime = Math.max(0, els.player.duration - 1);
  else return;
  e.preventDefault();
  updateSeekAria();
});
// Resolve on canplay/error, but also on a timeout — a stalled stream (socket opens,
// no bytes, no error) must never leave the disc spinning and the controls disabled.
function loadAudio(p, url, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (done) return; done = true; cleanup(); resolve(ok); };
    const onReady = () => finish(true);
    const onErr = () => finish(false);
    function cleanup() {
      clearTimeout(timer);
      p.removeEventListener("canplay", onReady);
      p.removeEventListener("error", onErr);
    }
    const timer = setTimeout(() => finish(false), timeoutMs || 18000);
    p.addEventListener("canplay", onReady, { once: true });
    p.addEventListener("error", onErr, { once: true });
    p.src = url; p.load();
  });
}

// ---- crate count --------------------------------------------------------
// One crate, so this number is exact: pool size minus everything you've judged
// (every LIBRARY entry is a verdict). No crate overlap, nothing to estimate.
function renderCrateCount() {
  if (!els.crateCount) return;            /* the crate bar left the UI */
  const n = _numCache.get(CRATE.query);
  if (typeof n !== "number") { els.crateCount.textContent = ""; return; }
  const left = Math.max(0, n - libCounts().all);
  els.crateCount.textContent = left.toLocaleString() + " to dig";
}
async function loadCrate() {
  renderCrateCount();                    // instant (blank until the count resolves)
  try { await numFound(CRATE.query); } catch (_) {}
  renderCrateCount();
}

// ---- present / dig ------------------------------------------------------
// cuedEl is a live Audio element — it must never reach localStorage (it
// serializes as {} and would poison the next boot's deck swap)
function savePending(rec) { try { const { cuedEl, ...r } = rec; localStorage.setItem(LS.pending, JSON.stringify(r)); } catch (_) {} }
function clearPending() { try { localStorage.removeItem(LS.pending); } catch (_) {} }

// Nothing on the card changes until the audio is actually playable — the new
// title appearing IS the "ready" signal, so play always works the moment you see it.
async function presentRecord(rec) {
  currentRecord = rec;
  retryDelay = 6000;                      // a landed record rearms the fast retry
  els.card.classList.add("stale");        // outgoing record dims while the next one cues
  setLoading(true);
  let ready;
  // .play check heals a pending record restored from a poisoned cache ({} instead of an element)
  if (rec.cuedEl && typeof rec.cuedEl.play === "function") { // pre-buffered — swap decks
    const old = els.player;
    old.pause(); old.removeAttribute("src"); old.load();
    els.player = rec.cuedEl; standby = old; rec.cuedEl = null;
    // the cued element's load events were guarded out — sync the seek UI now
    els.seekFill.style.width = "0%"; els.ptime.textContent = "0:00";
    els.pdur.textContent = fmtTime(els.player.duration); updateSeekAria();
    ready = true;
  } else {
    ready = await loadAudio(els.player, rec.play_url);
    if (currentRecord !== rec) return;
  }
  setLoading(false);
  els.title.textContent = rec.title || "(untitled)";
  els.artist.textContent = rec.creator || "Unknown artist";
  els.year.textContent = rec.year || "";
  els.genre.textContent = rec.genre || "";
  els.label.textContent = rec.album ? "💿 " + rec.album : (rec.label ? "Label: " + rec.label : "");
  els.archive.href = rec.archive_url || "#";
  els.placeholder.classList.add("hidden");
  els.card.classList.remove("hidden", "in", "stale");
  void els.card.offsetWidth;
  els.card.classList.add("in");
  prefetchNext();                         // start cueing the next dig while this one plays
  if (!ready) { toast("⚠️ Couldn't load that record — toss it to move on.", "err"); return; }
  els.player.play().catch(() => {});
}

// ---- next-record prefetch -------------------------------------------------
// While a record plays, the next dig happens silently: pick a fresh record
// from the same crate and buffer its audio on the standby element, so a
// verdict swaps straight to it with no network wait.
let nextUp = null;          // { rec, el } — ready to swap in
let prefetching = false;
async function prefetchNext() {
  if (prefetching || nextUp) return;
  prefetching = true;
  try {
    const exclude = libExcludedKeys();
    if (currentRecord && currentRecord.cache_name) exclude.add(currentRecord.cache_name);
    const info = await pickRandom(CRATE.query, CRATE.pick, 4, exclude);
    if (!info) return;
    info.source = CRATE.key;
    const el = standby;
    const ok = await loadAudio(el, info.play_url);
    // a swap mid-buffer (deck flip) invalidates this prefetch
    if (ok && el === standby) nextUp = { rec: info, el };
  } catch (_) {
  } finally { prefetching = false; }
}

// Boot-dig resilience: the Archive has bad minutes, and a failed dig with
// nothing on the deck used to strand the app at "warming up" forever (the
// only other spin() callers are verdicts, which need a record). Retry on a
// doubling backoff until something lands; the placeholder is click-to-dig.
let retryTimer = null, retryDelay = 6000, crateDone = false;
function scheduleRetry() {
  if (retryTimer || currentRecord || crateDone) return;
  els.placeholder.innerHTML =
    '<span class="ph-lead">◇ The Archive is being slow…</span>' +
    '<span class="ph-sub">digging again in a moment — or click here to dig now</span>';
  retryTimer = setTimeout(() => { retryTimer = null; spin(); }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 60000);
}
els.placeholder.addEventListener("click", () => {
  if (currentRecord || busy || crateDone) return;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  spin();
});

// quiet: verdict-triggered spins skip the caption — the disc effect already said it
async function spin(quiet) {
  if (busy) return;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  setBusy(true);
  setLoading(true, quiet ? "" : "🪩 digging through the crate…");
  els.card.classList.add("stale");        // the old record fades back while we dig
  els.player.pause();
  try {
    // a record pre-buffered while the last one played? swap straight to it — no dig wait
    const cued = nextUp;
    nextUp = null;
    if (cued && !libExcludedKeys().has(cued.rec.cache_name)) {
      cued.rec.cuedEl = cued.el;
      if (els.toast.classList.contains("busy")) clearToast();
      savePending(cued.rec);
      await presentRecord(cued.rec);
      return;
    }
    const exclude = libExcludedKeys();
    let info = await pickRandom(CRATE.query, CRATE.pick, 10, exclude);
    if (!info) {
      if (exclude.size) {
        const probe = await pickRandom(CRATE.query, CRATE.pick, 6, null);
        if (probe) { showExhausted("You've dug through every fresh record in the crate."); return; }
      }
      throw new Error("Couldn't dig up a record.");
    }
    info.source = CRATE.key;
    // only clear a lingering busy toast — keep()'s result toast must survive the auto-spin
    if (els.toast.classList.contains("busy")) clearToast();
    savePending(info);
    await presentRecord(info);
  } catch (e) {
    // with a record still on the deck a failed dig is just a toast; with an
    // empty deck it must self-heal, or the app is a brick until relaunch
    if (currentRecord) toast("⚠️ " + e.message + " — try again in a moment.", "err");
    else scheduleRetry();
  } finally {
    els.card.classList.remove("stale");
    setLoading(false); setBusy(false);
  }
}
function showExhausted(msg) {
  crateDone = true;                       // a finished crate must not retry-dig
  currentRecord = null; clearPending(); els.player.pause();
  els.card.classList.add("hidden"); els.card.classList.remove("in");
  els.placeholder.classList.remove("hidden");
  els.placeholder.innerHTML =
    '<span class="ph-lead">🎉 ' + esc(msg) + '</span>' +
    '<span class="ph-sub">That\'s the whole crate — every record judged.</span>';
}

async function keep() {
  if (busy || !currentRecord) return;
  const rec = currentRecord;
  els.player.pause();
  discEffect("keep");
  setBusy(true);   // no caption — the disc's keep sweep IS the save indicator
  markVerdict(rec, rec.source, "keep");
  saveLocal();                                  // verdict survives even if the WAV save is abandoned
  rec.downloaded = true; rec.listened = false;
  clearPending();
  renderLibrary();
  let note = "⚠ no sample folder set — logged on this device only.";
  if (sampleDir) {                              // write a WAV into the sample folder
    try {
      const fn = await invoke("keep_record", {
        url: rec.play_url, baseName: safeName((rec.title || "") + " - " + (rec.creator || "")),
      });
      const e = LIBRARY[rec.cache_name];
      if (e && !(e.kept_files || (e.kept_files = [])).includes(fn)) e.kept_files.push(fn);
      note = "WAV → " + folderBaseName(sampleDir) + "/" + fn;
    } catch (e) {
      note = "⚠ WAV save failed: " + (e.message || e);
    }
  }
  persistLog();
  renderCrateCount();
  // silent on success — the disc's keep sweep is the confirmation; only problems speak up
  if (note[0] === "⚠") toast(note, "err"); else clearToast();
  setBusy(false);
  spin(true);
}

function toss() {
  if (busy || !currentRecord) return;
  els.player.pause();
  discEffect("toss");
  markVerdict(currentRecord, currentRecord.source, "toss");
  clearPending();
  renderLibrary();
  persistLog();
  renderCrateCount();
  spin(true);
}
// no verdict buttons — K keeps, T tosses (hinted below the disc)
window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(input|select|textarea)$/i.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === "k") keep();
  else if (k === "t") toss();
});

// ---- crate log render ---------------------------------------------------
let libFilter = "all";
function renderLibrary() {
  const items = libList(libFilter), counts = libCounts();
  els.libCount.textContent = counts.all;
  document.querySelectorAll(".lib-tab").forEach((t) => {
    const n = t.querySelector(".tab-n");
    if (n) n.textContent = counts[t.dataset.filter] != null ? counts[t.dataset.filter] : 0;
  });
  if (!items.length) { els.libList.innerHTML = ""; els.libEmpty.classList.remove("hidden"); return; }
  els.libEmpty.classList.add("hidden");
  els.libList.innerHTML = items.map((e) => {
    const sub = [e.creator, e.year].filter(Boolean).map(esc).join(" · ");
    const badge = e.downloaded
      ? '<span class="lib-b kept" title="Kept">💾 kept</span>'
      : '<span class="lib-b tossed" title="Tossed">🗑 tossed</span>';
    return '<li data-key="' + esc(e.cache_name) + '" tabindex="0" role="button" aria-label="Play ' + esc(e.title || "untitled") + '">' +
      '<span class="lib-play" aria-hidden="true">▶</span>' +
      '<span class="lib-main"><span class="lib-title">' + esc(e.title || "(untitled)") + '</span>' +
      '<span class="lib-artist">' + sub + '</span></span>' +
      '<span class="lib-badges">' + badge + '</span></li>';
  }).join("");
}
// tap a logged record to re-cue and play it (your kept list = a playlist)
els.libList.addEventListener("click", (ev) => {
  if (busy) return;
  const li = ev.target.closest("li[data-key]");
  if (!li) return;
  const e = LIBRARY[li.dataset.key];
  if (!e || !e.identifier) return;
  clearToast();
  presentRecord(entryToRecord(e));
  els.card.scrollIntoView({ behavior: "smooth", block: "center" });
});
// Enter / Space on a focused row plays it (rows are role="button" tabindex="0")
els.libList.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter" && ev.key !== " ") return;
  const li = ev.target.closest("li[data-key]");
  if (!li) return;
  ev.preventDefault();
  li.click();
});
document.querySelectorAll(".lib-tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".lib-tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    libFilter = t.dataset.filter;
    renderLibrary();
  });
});

// ---- Keep saves a WAV into a chosen folder (Tauri backend) ----------------
// The Rust side owns the disk: it remembers the folder in its config file,
// downloads + decodes the MP3, and writes a real 16-bit PCM WAV next to
// crate-log.json.
let sampleDir = null;

function folderBaseName(p) { return String(p).split(/[\\/]/).filter(Boolean).pop() || p; }
function updateFolderStatus() {
  els.folderStatus.textContent = sampleDir ? folderBaseName(sampleDir) : "no folder set";
}
// merge the on-disk log in, then mirror the union back out
async function syncLogWithFolder() {
  if (!sampleDir) return;
  try { LIBRARY = mergeLogs(await invoke("load_log"), LIBRARY); } catch (_) {}
  saveLocal();
  renderLibrary();
  renderCrateCount();
  invoke("save_log", { log: LIBRARY }).catch(() => {});
}
async function chooseSampleFolder() {
  let dir = null;
  try { dir = await invoke("pick_folder"); } catch (_) {}
  if (!dir) return;                             // user cancelled the picker
  sampleDir = dir;
  updateFolderStatus();
  await syncLogWithFolder();
}
async function restoreSampleFolder() {
  try { sampleDir = (await invoke("get_settings")).sample_dir; } catch (_) {}
  updateFolderStatus();
  await syncLogWithFolder();
}
els.folderPick.addEventListener("click", chooseSampleFolder);

// ---- startup wordmark reel ------------------------------------------------
const LOGO_GLYPHS = "▚▞▜▙▛▟▖▗▘▝░▒▓#%*+=";
function animateLogo() {
  return new Promise((resolve) => {
    const el = els.logo;
    if (!el) return resolve();
    const real = el.textContent;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = real; return resolve(); }
    const lines = real.split("\n");
    const width = Math.max(...lines.map((l) => l.length));
    setLoading(true);
    const DUR = 1150, t0 = performance.now();
    function frame(now) {
      const k = Math.min(1, (now - t0) / DUR);
      const front = k * (width + 3);
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
// dig / keep / toss, re-cueing whatever was pending last time
async function boot() {
  loadLocal();
  renderLibrary();
  restoreSampleFolder();      // reconnect the sample folder if one was picked
  loadCrate();
  await animateLogo();
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(LS.pending) || "null"); } catch (_) {}
  if (pending && pending.play_url) await presentRecord(pending);
  else spin();
}
boot();

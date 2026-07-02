"use strict";

// ===========================================================================
// Crate Digger — a serverless desktop auditioner. Digs the Internet Archive,
// keep/toss one record at a time, and saves kept records as WAVs into a folder
// you pick (File System Access API — desktop Chrome/Edge). The crate log lives
// in localStorage, seeded from library.json in the repo on first load.
// ===========================================================================

// ---- config -------------------------------------------------------------
const LS = { log: "cd_log_cache", pending: "cd_pending" };

const DEFAULT_SOURCE_KEY = "lp_soul_blues";

// The record pools.
const SOURCES = [
  { key: "lp_soul_blues", pick: "track", label: "LP Soul · Blues · Funk (warm vinyl)",
    query: 'collection:unlockedrecordings AND (subject:Soul OR subject:Blues OR subject:Funk OR subject:"Soul-Jazz" OR subject:"Rhythm and blues" OR subject:"Funk / Soul")',
    note: "The main crate: warm LP-era soul/blues/funk grooves." },
  { key: "lp_soul_funk", pick: "track", label: "LP Soul / Funk",
    query: 'collection:unlockedrecordings AND (subject:Soul OR subject:Funk OR subject:"Funk / Soul" OR subject:"Rhythm and blues")',
    note: "Soul & funk LPs — drums, bass, breaks." },
  { key: "lp_blues", pick: "track", label: "LP Blues (electric)",
    query: 'collection:unlockedrecordings AND (subject:Blues OR subject:"Rhythm and blues")',
    note: "Electric blues bands on LP — full bands, not dusty 78s." },
  { key: "lp_soul_jazz", pick: "track", label: "LP Soul-Jazz / organ",
    query: 'collection:unlockedrecordings AND (subject:"Soul-Jazz" OR subject:"Jazz-Funk")',
    note: "Organ-trio soul-jazz (McGriff, Ludwig, King Curtis)." },
  { key: "lp_jazz", pick: "track", label: "LP Jazz (full band)",
    query: 'collection:unlockedrecordings AND subject:Jazz',
    note: "Jazz LPs — drums, bass, breaks." },
  { key: "lp_soul_blues_alt", pick: "track", label: "LP Soul/Blues — alt library",
    query: 'collection:album_recordings AND (subject:Soul OR subject:Blues OR subject:Funk OR subject:"Rhythm and blues")',
    note: "Backup well (Long Playing Records lib)." },
  { key: "vocal_legends", pick: "track", label: "Soul-jazz vocal legends (Nina & co.)",
    query: 'collection:(opensource_audio OR unlockedrecordings OR album_recordings) AND (creator:"Nina Simone" OR creator:"Aretha Franklin" OR creator:"Etta James" OR creator:"Roberta Flack" OR creator:"Nancy Wilson" OR creator:"Carmen McRae" OR creator:"Dinah Washington" OR creator:"Gloria Lynne" OR creator:"Esther Phillips" OR creator:"Donny Hathaway" OR creator:"Bill Withers" OR creator:"Curtis Mayfield" OR creator:"Gil Scott-Heron" OR creator:"Marlena Shaw" OR creator:"Roy Ayers" OR creator:"Terry Callier") AND NOT creator:Various AND NOT title:Unofficial',
    note: "Nina Simone & kindred soul-jazz voices, by name." },
];

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
  keep: $("keep"), toss: $("toss"), genreSelect: $("genre-select"),
  verdictTag: $("verdictTag"), toast: $("toast"),
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
function renderDisc(phase) {
  let out = "";
  for (let y = 0; y < D_ROWS; y++) {
    for (let x = 0; x < D_COLS; x++) {
      const dx = x - D_CX;
      const dy = (y - D_CY) * D_ASPECT;
      const r = Math.hypot(dx, dy);
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
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { renderDisc(0.8); return; }
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
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  start();
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
// Stable per-track key — must stay format-compatible with existing library.json keys.
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
  const r = await fetch(url, { cache: "no-store" });
  const data = await r.json();
  if (data && data.error && !("response" in data)) {
    throw new Error("Internet Archive is busy — try again in a moment.");
  }
  return data;
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
    length: chosen.length || "", archive_url: "https://archive.org/details/" + identifier,
    play_url: playUrlFor(identifier, chosen.name),
  };
}
async function pickRandom(query, pick, tries, exclude) {
  tries = tries || 10;
  const total = await numFound(query);
  if (total === 0) return null;
  const rows = 10;
  const reachable = Math.min(total, 10000);
  const maxPage = Math.max(1, Math.floor(reachable / rows));
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

// ---- crate log — localStorage, seeded from library.json in the repo ------
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
// Merge in library.json (the log this repo shipped with) so history survives a
// cleared browser profile; from then on localStorage is the source of truth.
async function loadLog() {
  loadLocal();
  try {
    const r = await fetch("./library.json?ts=" + Date.now(), { cache: "no-store" });
    if (r.ok) { LIBRARY = mergeLogs(await r.json(), LIBRARY); saveLocal(); }
  } catch (_) { /* offline — run on the local cache */ }
}

function libEntryFrom(rec, sourceKey) {
  return {
    key: rec.cache_name || "", identifier: rec.identifier || "", mp3_name: rec.mp3_name || "",
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
function libJudgedBySource() {
  const c = {};
  for (const k in LIBRARY) { const e = LIBRARY[k]; if (e.listened || e.downloaded) { const s = e.source || ""; c[s] = (c[s] || 0) + 1; } }
  return c;
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
  const key = rec.cache_name || rec.key;
  if (!key) return;
  let e = LIBRARY[key];
  if (!e) { e = libEntryFrom(rec, sourceKey); LIBRARY[key] = e; }
  const now = Date.now() / 1000;
  if (kind === "keep") { e.downloaded = true; e.downloaded_at = now; e.listened = false; e.listened_at = null; }
  else { e.listened = true; e.listened_at = now; e.downloaded = false; e.downloaded_at = null; }
}
function entryToRecord(e) {
  return Object.assign({}, e, { key: e.cache_name, play_url: playUrlFor(e.identifier, e.mp3_name) });
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
  els.keep.disabled = state || !currentRecord;
  els.toss.disabled = state || !currentRecord;
  els.genreSelect.disabled = state;
  if (state && msg) toast(msg, "busy");
}
els.player.addEventListener("playing", () => { discPlaying = true; setLoading(false); });
els.player.addEventListener("pause", () => { discPlaying = false; });
els.player.addEventListener("ended", () => { discPlaying = false; });
// mid-track buffering: spin the disc faster (no text), settle once audio resumes
els.player.addEventListener("waiting", () => { if (currentRecord) setLoading(true); });

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
els.player.addEventListener("play", () => { els.ppBtn.textContent = "⏸"; els.ppBtn.setAttribute("aria-label", "Pause"); });
els.player.addEventListener("pause", () => { els.ppBtn.textContent = "▶"; els.ppBtn.setAttribute("aria-label", "Play"); });
els.player.addEventListener("ended", () => { els.ppBtn.textContent = "▶"; els.ppBtn.setAttribute("aria-label", "Play"); });
els.player.addEventListener("loadstart", () => {
  els.seekFill.style.width = "0%"; els.ptime.textContent = "0:00"; els.pdur.textContent = "0:00";
});
els.player.addEventListener("loadedmetadata", () => { els.pdur.textContent = fmtTime(els.player.duration); updateSeekAria(); });
els.player.addEventListener("timeupdate", () => {
  const d = els.player.duration || 0;
  els.seekFill.style.width = (d ? (els.player.currentTime / d) * 100 : 0) + "%";
  els.ptime.textContent = fmtTime(els.player.currentTime);
  updateSeekAria();
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
function loadAudio(url, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (done) return; done = true; cleanup(); resolve(ok); };
    const onReady = () => finish(true);
    const onErr = () => finish(false);
    function cleanup() {
      clearTimeout(timer);
      els.player.removeEventListener("canplay", onReady);
      els.player.removeEventListener("error", onErr);
    }
    const timer = setTimeout(() => finish(false), timeoutMs || 18000);
    els.player.addEventListener("canplay", onReady, { once: true });
    els.player.addEventListener("error", onErr, { once: true });
    els.player.src = url; els.player.load();
  });
}

// ---- crate dropdown -----------------------------------------------------
function renderSourceOptions() {
  const prev = els.genreSelect.value;
  const judged = libJudgedBySource();
  els.genreSelect.innerHTML = SOURCES.map((s) => {
    const n = _numCache.get(s.query);
    const label = (typeof n === "number")
      ? `${s.label} (${Math.max(0, n - (judged[s.key] || 0)).toLocaleString()})` : s.label;
    return `<option value="${s.key}" title="${esc(s.note)}">${esc(label)}</option>`;
  }).join("");
  if (prev && SOURCES.some((s) => s.key === prev)) els.genreSelect.value = prev;
  else els.genreSelect.value = DEFAULT_SOURCE_KEY;
}
async function loadSources() {
  renderSourceOptions();                 // instant, labels first
  // fill in live remaining-counts as they resolve
  SOURCES.forEach(async (s) => { try { await numFound(s.query); renderSourceOptions(); } catch (_) {} });
}

// ---- present / dig ------------------------------------------------------
function updateStateChips(rec) {
  if (!rec) return;
  const kept = !!rec.downloaded, tossed = !kept && !!rec.listened;
  els.verdictTag.textContent = kept ? "💾 kept" : (tossed ? "🗑 tossed" : "");
  els.verdictTag.className = "state-badge" + (kept ? " kept" : tossed ? " tossed" : " hidden");
}
function savePending(rec) { try { localStorage.setItem(LS.pending, JSON.stringify(rec)); } catch (_) {} }
function clearPending() { try { localStorage.removeItem(LS.pending); } catch (_) {} }

async function presentRecord(rec) {
  currentRecord = rec;
  els.keep.disabled = els.toss.disabled = false;
  els.title.textContent = rec.title || "(untitled)";
  els.artist.textContent = rec.creator || "Unknown artist";
  els.year.textContent = rec.year || "";
  els.genre.textContent = rec.genre || "";
  els.label.textContent = rec.album ? "💿 " + rec.album : (rec.label ? "Label: " + rec.label : "");
  els.archive.href = rec.archive_url || "#";
  // reflect any existing verdict from the log
  const logged = LIBRARY[rec.cache_name || rec.key];
  updateStateChips(logged || rec);

  setLoading(true);
  const ready = await loadAudio(rec.play_url);
  if (currentRecord !== rec) return;
  setLoading(false);
  els.placeholder.classList.add("hidden");
  els.card.classList.remove("hidden", "in");
  void els.card.offsetWidth;
  els.card.classList.add("in");
  if (!ready) { toast("⚠️ Couldn't load that record — 🗑 Toss it to move on.", "err"); return; }
  els.player.play().catch(() => {});
}

async function spin(forceNew) {
  if (busy) return;
  setBusy(true);
  setLoading(true, "🪩 digging through the crate…");
  els.player.pause();
  try {
    const src = SOURCES.find((s) => s.key === els.genreSelect.value) || SOURCES.find((s) => s.key === DEFAULT_SOURCE_KEY);
    const exclude = libExcludedKeys();
    let info = await pickRandom(src.query, src.pick, 10, exclude);
    if (!info) {
      if (exclude.size) {
        const probe = await pickRandom(src.query, src.pick, 6, null);
        if (probe) { showExhausted("You've dug through every fresh record in this crate."); return; }
      }
      throw new Error("Couldn't dig up a record.");
    }
    info.source = src.key; info.key = info.cache_name;
    clearToast();
    savePending(info);
    await presentRecord(info);
  } catch (e) {
    toast("⚠️ " + e.message + " — try switching crates.", "err");
  } finally {
    setLoading(false); setBusy(false);
  }
}
function showExhausted(msg) {
  currentRecord = null; clearPending(); els.player.pause();
  els.card.classList.add("hidden"); els.card.classList.remove("in");
  els.placeholder.classList.remove("hidden");
  els.placeholder.innerHTML =
    '<span class="ph-lead">🎉 ' + esc(msg) + '</span>' +
    '<span class="ph-sub">Pick another crate above to keep digging.</span>';
  els.keep.disabled = els.toss.disabled = true;
}

async function keep() {
  if (busy || !currentRecord) return;
  const rec = currentRecord;
  els.player.pause();
  setBusy(true, "💾 Keeping it…");
  markVerdict(rec, rec.source, "keep");
  rec.downloaded = true; rec.listened = false;
  updateStateChips(rec);
  clearPending();
  renderLibrary();
  let note = "logged on this device.";
  if (sampleDir) {                              // write a WAV into the sample folder
    try {
      setBusy(true, "💾 Converting to WAV → your sample folder…");
      const fn = await saveWavToFolder(rec);
      note = "WAV → " + sampleFolderName + "/" + fn;
    } catch (e) {
      note = "⚠ WAV save failed: " + e.message;
    }
  }
  saveLocal();
  renderSourceOptions();
  toast("✅ Kept — " + note, note[0] === "⚠" ? "err" : "ok");
  setBusy(false);
  spin();
}

els.toss.addEventListener("click", async () => {
  if (busy || !currentRecord) return;
  els.player.pause();
  els.keep.disabled = els.toss.disabled = true;
  markVerdict(currentRecord, currentRecord.source, "toss");
  clearPending();
  renderLibrary();
  saveLocal();
  renderSourceOptions();
  spin();
});
els.keep.addEventListener("click", keep);
els.genreSelect.addEventListener("change", () => { clearToast(); spin(true); });

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

// ---- Keep saves a WAV into a chosen folder (File System Access API) ------
// Browsers can't touch the disk freely, but desktop Chrome/Edge can write into a
// folder the user grants once. We remember the folder handle in IndexedDB, decode
// the MP3 with Web Audio, and write a real WAV — the same result as the old server.
let sampleDir = null, sampleFolderName = "";

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("crate-digger", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const g = db.transaction("kv", "readonly").objectStore("kv").get(key);
    g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error);
  });
}
async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(val, key);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
function updateFolderStatus() {
  if (!els.folderStatus) return;
  els.folderStatus.textContent = sampleDir ? sampleFolderName : "no folder set";
}
async function chooseSampleFolder() {
  try {
    const dir = await window.showDirectoryPicker({ mode: "readwrite", id: "crate-samples" });
    sampleDir = dir; sampleFolderName = dir.name;
    try { await idbSet("sampleDir", dir); } catch (_) {}
    updateFolderStatus();
  } catch (_) { /* user cancelled the picker */ }
}
async function restoreSampleFolder() {
  if (!window.showDirectoryPicker) {            // unsupported browser (Firefox/Safari)
    els.folderPick.classList.add("hidden");
    els.folderStatus.textContent = "needs desktop Chrome/Edge";
    return;
  }
  try {
    const dir = await idbGet("sampleDir");
    if (dir) { sampleDir = dir; sampleFolderName = dir.name || "your folder"; }
  } catch (_) {}
  updateFolderStatus();
}
// AudioBuffer -> 16-bit PCM WAV (Blob)
function audioBufferToWav(buf) {
  const numCh = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
  const bytes = 44 + n * numCh * 2, ab = new ArrayBuffer(bytes), view = new DataView(ab);
  let p = 0;
  const str = (s) => { for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i)); };
  const u16 = (d) => { view.setUint16(p, d, true); p += 2; };
  const u32 = (d) => { view.setUint32(p, d, true); p += 4; };
  str("RIFF"); u32(bytes - 8); str("WAVE"); str("fmt "); u32(16); u16(1); u16(numCh);
  u32(sr); u32(sr * numCh * 2); u16(numCh * 2); u16(16); str("data"); u32(n * numCh * 2);
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buf.getChannelData(c));
  for (let i = 0; i < n; i++)
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true); p += 2;
    }
  return new Blob([ab], { type: "audio/wav" });
}
async function uniqueName(dir, base, ext) {
  let name = base + ext;
  for (let n = 2; n < 999; n++) {
    try { await dir.getFileHandle(name); name = base + "_" + n + ext; }  // exists -> bump
    catch (_) { return name; }                                          // free
  }
  return base + "_" + Date.now() + ext;
}
async function saveWavToFolder(rec) {
  if ((await sampleDir.queryPermission({ mode: "readwrite" })) !== "granted") {
    if ((await sampleDir.requestPermission({ mode: "readwrite" })) !== "granted")
      throw new Error("folder permission denied");
  }
  const resp = await fetch(rec.play_url || playUrlFor(rec.identifier, rec.mp3_name));
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const ab = await resp.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let audio;
  try { audio = await ctx.decodeAudioData(ab); } finally { ctx.close(); }
  const blob = audioBufferToWav(audio);
  const name = await uniqueName(sampleDir, safeName((rec.title || "") + " - " + (rec.creator || "")), ".wav");
  const fh = await sampleDir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(blob); await w.close();
  return name;
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
    setLoading(true, "◇ warming up the turntable…");
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
function armAutoplayUnlock() {
  const go = () => {
    window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go);
    if (currentRecord && els.player.paused) els.player.play().catch(() => {});
  };
  window.addEventListener("pointerdown", go);
  window.addEventListener("keydown", go);
}

// dig / keep / toss, re-cueing whatever was pending last time
async function boot() {
  // The old PWA build registered a service worker that caches the app shell —
  // unregister it (and drop its caches) so returning visitors get this version.
  if ("serviceWorker" in navigator) {
    try {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      if (window.caches) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
    } catch (_) {}
  }
  armAutoplayUnlock();
  await loadLog();
  renderLibrary();
  restoreSampleFolder();      // reconnect the sample folder if one was picked
  loadSources();
  await animateLogo();
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(LS.pending) || "null"); } catch (_) {}
  if (pending && pending.play_url) await presentRecord(pending);
  else spin();
}
boot();

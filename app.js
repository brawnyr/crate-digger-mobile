"use strict";

// ===========================================================================
// Crate Digger — mobile / serverless edition.
// Everything the Python server did now runs in the browser:
//   • digs random records straight from the Internet Archive API (CORS-open)
//   • streams the MP3 straight from Archive.org (no download, no storage)
//   • the crate log lives in a GitHub repo — keep/toss commits there so the
//     phone and desktop stay in sync ("GitHub as the sync layer").
// ===========================================================================

// ---- config -------------------------------------------------------------
const GH = { owner: "brawnyr", repo: "crate-digger-mobile", branch: "main", path: "library.json" };
const LS = { token: "cd_gh_token", log: "cd_log_cache", sha: "cd_log_sha", pending: "cd_pending" };

const DEFAULT_SOURCE_KEY = "lp_soul_blues";

// Same record pools as the desktop app (app.py SOURCES).
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
  keep: $("keep"), toss: $("toss"), dl: $("dl"), genreSelect: $("genre-select"),
  verdictTag: $("verdictTag"), toast: $("toast"), syncState: $("syncState"),
  libCount: $("libCount"), libList: $("libList"), libEmpty: $("libEmpty"),
  asciiRecord: $("asciiRecord"), logo: $("logo"), cueing: $("cueing"),
  gear: $("gear"), settings: $("settings"), settingsClose: $("settingsClose"),
  tokenInput: $("tokenInput"), tokenSave: $("tokenSave"), tokenClear: $("tokenClear"),
  sheetStatus: $("sheetStatus"),
  folderRow: $("folderRow"), folderPick: $("folderPick"), folderStatus: $("folderStatus"),
};

// ---- spinning disc (verbatim from desktop) ------------------------------
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

// ---- little helpers -----------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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
// Must match app.py cache_name_for EXACTLY so keys line up across devices.
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
// mirror app.py _safe_filename so downloads land with a clean "Title - Artist.mp3"
function safeName(text) {
  text = String(text || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().replace(/^[.\s]+|[.\s]+$/g, "");
  return (text || "record").slice(0, 110);
}
// Fetch the MP3 bytes (CORS is open) and save them to the phone's Downloads.
async function downloadRecord(rec, btn) {
  if (!rec) return;
  const url = rec.play_url || playUrlFor(rec.identifier, rec.mp3_name);
  const name = safeName((rec.title || "") + " - " + (rec.creator || "")) + ".mp3";
  const restore = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.classList.add("working"); if (btn.id === "dl") btn.textContent = "⏳ Downloading…"; }
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const blob = await r.blob();
    const obj = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = obj; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(obj), 5000);
    toast("⬇ Saved to your phone: " + name, "ok");
  } catch (e) {
    toast("⚠️ Download failed: " + e.message + " — try again.", "err");
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove("working"); if (btn.id === "dl") btn.textContent = restore || "⬇ Download"; }
  }
}

// ---- Internet Archive client (ported from app.py) -----------------------
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
    for (const d of docs) {
      let info = null;
      try { info = await recordInfo(d.identifier, pick); } catch (_) { info = null; }
      if (info) {
        if (exclude && exclude.has(info.cache_name)) continue;
        return info;
      }
    }
  }
  return null;
}

// ---- crate log — stored in a GitHub repo (the sync layer) ---------------
let LIBRARY = {};
let LOG_SHA = null;

function token() { return (localStorage.getItem(LS.token) || "").trim(); }
function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64decode(b64) { return decodeURIComponent(escape(atob((b64 || "").replace(/\s/g, "")))); }
function ghHeaders() {
  return { "Authorization": "Bearer " + token(), "Accept": "application/vnd.github+json",
           "X-GitHub-Api-Version": "2022-11-28" };
}
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
async function ghGetRemote() {
  const url = `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${encodeURIComponent(GH.path)}?ref=${GH.branch}`;
  const r = await fetch(url, { headers: ghHeaders(), cache: "no-store" });
  if (!r.ok) throw new Error("read " + r.status);
  const j = await r.json();
  LOG_SHA = j.sha;
  const text = b64decode(j.content);
  return text ? JSON.parse(text) : {};
}
async function ghPutRemote(obj, message) {
  const url = `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${encodeURIComponent(GH.path)}`;
  const send = (sha) => fetch(url, {
    method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
    body: JSON.stringify({ message, branch: GH.branch, content: b64encode(JSON.stringify(obj, null, 1)), sha }),
  });
  let r = await send(LOG_SHA || undefined);
  if (r.status === 409 || r.status === 422) {          // someone else wrote — merge & retry
    const remote = await ghGetRemote();
    obj = mergeLogs(remote, obj); LIBRARY = obj;
    r = await send(LOG_SHA || undefined);
  }
  if (!r.ok) throw new Error("write " + r.status);
  const j = await r.json();
  LOG_SHA = j.content && j.content.sha;
}
// Pull the shared log on boot (authed = fresh; else public read of the repo file).
async function loadLog() {
  loadLocal();
  try {
    let remote = null;
    if (token()) remote = await ghGetRemote();
    else { const r = await fetch("./library.json?ts=" + Date.now(), { cache: "no-store" }); if (r.ok) remote = await r.json(); }
    if (remote) {
      const merged = mergeLogs(remote, LIBRARY);
      const localHadExtra = JSON.stringify(merged) !== JSON.stringify(remote);
      LIBRARY = merged; saveLocal();
      if (localHadExtra && token()) { try { await ghPutRemote(LIBRARY, "sync offline changes"); } catch (_) {} }
    }
  } catch (_) { /* offline — run on the local cache */ }
  updateSyncState();
}
// Persist a keep/toss: local first (instant), then commit to GitHub if we can.
async function persistLog(message) {
  saveLocal();
  if (!token()) { updateSyncState(); return; }
  try { await ghPutRemote(LIBRARY, message); updateSyncState(true); }
  catch (e) { updateSyncState(false, e.message); }
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
// upsert + mark, mirroring app.py lib_mark (kept/tossed are opposites)
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

// ---- audio player (from desktop) ----------------------------------------
let currentRecord = null, busy = false;
function toast(msg, kind) { els.toast.textContent = msg; els.toast.className = "toast " + (kind || ""); }
function clearToast() { els.toast.className = "toast hidden"; }
function setBusy(state, msg) {
  busy = state;
  els.keep.disabled = state || !currentRecord;
  els.toss.disabled = state || !currentRecord;
  els.genreSelect.disabled = state;
  if (state && msg) toast(msg, "busy");
}
els.player.addEventListener("playing", () => { discPlaying = true; });
els.player.addEventListener("pause", () => { discPlaying = false; });
els.player.addEventListener("ended", () => { discPlaying = false; });

function fmtTime(s) {
  if (!isFinite(s) || s < 0) return "0:00";
  s = Math.floor(s);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
els.ppBtn.addEventListener("click", () => {
  if (els.player.paused) els.player.play().catch(() => {}); else els.player.pause();
});
els.player.addEventListener("play", () => { els.ppBtn.textContent = "⏸"; });
els.player.addEventListener("pause", () => { els.ppBtn.textContent = "▶"; });
els.player.addEventListener("ended", () => { els.ppBtn.textContent = "▶"; });
els.player.addEventListener("loadstart", () => {
  els.seekFill.style.width = "0%"; els.ptime.textContent = "0:00"; els.pdur.textContent = "0:00";
});
els.player.addEventListener("loadedmetadata", () => { els.pdur.textContent = fmtTime(els.player.duration); });
els.player.addEventListener("timeupdate", () => {
  const d = els.player.duration || 0;
  els.seekFill.style.width = (d ? (els.player.currentTime / d) * 100 : 0) + "%";
  els.ptime.textContent = fmtTime(els.player.currentTime);
});
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

// ---- crate dropdown -----------------------------------------------------
function baseSourceLabel(key) { const s = SOURCES.find((x) => x.key === key); return s ? s.label : key; }
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
  els.keep.disabled = els.toss.disabled = els.dl.disabled = false;
  els.title.textContent = rec.title || "(untitled)";
  els.artist.textContent = rec.creator || "Unknown artist";
  els.year.textContent = rec.year || "";
  els.genre.textContent = rec.genre || "";
  els.label.textContent = rec.album ? "💿 " + rec.album : (rec.label ? "Label: " + rec.label : "");
  els.archive.href = rec.archive_url || "#";
  // reflect any existing verdict from the log
  const logged = LIBRARY[rec.cache_name || rec.key];
  updateStateChips(logged || rec);

  setLoading(true, "📻 cueing it up…");
  const ready = await loadAudio(rec.play_url);
  if (currentRecord !== rec) return;
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
  els.keep.disabled = els.toss.disabled = els.dl.disabled = true;
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
  let note = token() ? "synced to your crate log." : "saved on this device.";
  if (sampleDir) {                              // desktop: write a WAV into the sample folder
    try {
      setBusy(true, "💾 Converting to WAV → your sample folder…");
      const fn = await saveWavToFolder(rec);
      note = "WAV → " + sampleFolderName + "/" + fn;
    } catch (e) {
      note = "⚠ WAV save failed: " + e.message;
    }
  }
  await persistLog("keep: " + (rec.title || rec.cache_name));
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
  await persistLog("toss: " + (currentRecord.title || currentRecord.cache_name));
  renderSourceOptions();
  spin();
});
els.keep.addEventListener("click", keep);
els.dl.addEventListener("click", () => downloadRecord(currentRecord, els.dl));
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
    return '<li data-key="' + esc(e.cache_name) + '">' +
      '<span class="lib-play" aria-hidden="true">▶</span>' +
      '<span class="lib-main"><span class="lib-title">' + esc(e.title || "(untitled)") + '</span>' +
      '<span class="lib-artist">' + sub + '</span></span>' +
      '<span class="lib-badges">' + badge + '</span>' +
      '<button class="lib-dl" type="button" title="Download to phone" aria-label="Download">⬇</button></li>';
  }).join("");
}
// tap a logged record to re-cue and play it (your kept list = a playlist)
els.libList.addEventListener("click", (ev) => {
  const li = ev.target.closest("li[data-key]");
  if (!li) return;
  const e = LIBRARY[li.dataset.key];
  if (!e || !e.identifier) return;
  const dlBtn = ev.target.closest(".lib-dl");
  if (dlBtn) { downloadRecord(entryToRecord(e), dlBtn); return; }
  clearToast();
  presentRecord(entryToRecord(e));
  els.card.scrollIntoView({ behavior: "smooth", block: "center" });
});
document.querySelectorAll(".lib-tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".lib-tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    libFilter = t.dataset.filter;
    renderLibrary();
  });
});

// ---- sync status + settings sheet ---------------------------------------
function updateSyncState(ok, err) {
  let txt;
  if (!token()) txt = "local only · tap ⚙ to sync";
  else if (ok === false) txt = "⚠ token error (" + (err || "check token") + ")";
  else txt = "✓ synced to GitHub";
  els.syncState.textContent = txt;
}
function openSheet() {
  els.tokenInput.value = token();
  els.sheetStatus.textContent = token() ? "Token saved on this device." : "";
  if (window.showDirectoryPicker) { els.folderRow.classList.remove("hidden"); updateFolderStatus(); }
  els.settings.classList.remove("hidden");
  els.settings.setAttribute("aria-hidden", "false");
}
function closeSheet() { els.settings.classList.add("hidden"); els.settings.setAttribute("aria-hidden", "true"); }
els.gear.addEventListener("click", openSheet);
els.settingsClose.addEventListener("click", closeSheet);
els.settings.addEventListener("click", (e) => { if (e.target === els.settings) closeSheet(); });
els.tokenSave.addEventListener("click", async () => {
  const v = els.tokenInput.value.trim();
  if (!v) { els.sheetStatus.textContent = "Paste a token first."; return; }
  localStorage.setItem(LS.token, v);
  els.sheetStatus.textContent = "Checking token…";
  try {
    const remote = await ghGetRemote();
    LIBRARY = mergeLogs(remote, LIBRARY); saveLocal();
    await ghPutRemote(LIBRARY, "sync from phone");
    renderLibrary(); renderSourceOptions(); updateSyncState(true);
    els.sheetStatus.textContent = "✓ Connected — your log is syncing.";
  } catch (e) {
    updateSyncState(false, e.message);
    els.sheetStatus.textContent = "⚠ Couldn't connect: " + e.message + ". Check the token's repo + Contents permission.";
  }
});
els.tokenClear.addEventListener("click", () => {
  localStorage.removeItem(LS.token); LOG_SHA = null;
  els.tokenInput.value = ""; els.sheetStatus.textContent = "Token cleared — this device is local-only now.";
  updateSyncState();
});

// ---- desktop: Keep saves a WAV into a chosen folder (File System Access API) --
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
  els.folderStatus.textContent = sampleDir
    ? "✓ Keep saves a WAV into: " + sampleFolderName
    : "Not set — Keep just logs the record on this device.";
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
  if (!window.showDirectoryPicker) return;      // mobile / unsupported browser
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

// ---- startup wordmark reel (from desktop) -------------------------------
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

async function boot() {
  if ("serviceWorker" in navigator) { try { navigator.serviceWorker.register("./sw.js"); } catch (_) {} }
  await loadLog();
  renderLibrary();
  armAutoplayUnlock();
  restoreSampleFolder();      // desktop: reconnect the sample folder if one was picked
  loadSources();
  await animateLogo();
  // re-cue a record left pending from last time, else dig fresh
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(LS.pending) || "null"); } catch (_) {}
  if (pending && pending.play_url) await presentRecord(pending);
  else spin();
}
boot();

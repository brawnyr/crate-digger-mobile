# Crate Digger

> **Retired 2026-07-21.** Superseded by `myhomepage/dig.html` — THE Crate
> Digger on braknee.com. This repo stays as history.

Tauri desktop app for digging Internet Archive records and keeping samples as
WAVs. Pulls warm LP-era soul / blues / funk / soul-jazz LPs.

- **K** keeps a record, **T** tosses it; the next one cues automatically.
- A keep downloads the track and converts it to 16-bit WAV in the sample
  folder (picked once via the 📁 button). Raw audio — no de-hiss, no cleanup.
- Every verdict lands in the crate log; judged records never come back.
  Click a log row to re-cue it.

The real crate log is `crate-log.json`, saved in the sample folder next to
the WAVs. The app also keeps a working copy in localStorage; on boot the two
are merged, and for each record the newest verdict wins.

Build: `cargo tauri build --no-bundle` → `src-tauri/target/release/crate-digger.exe`.
Needs Windows WebView2 (preinstalled on 10/11) + Rust + Tauri CLI.

Dev notes: [CLAUDE.md](CLAUDE.md).

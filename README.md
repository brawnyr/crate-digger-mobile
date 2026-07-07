# Crate Digger

Tauri desktop app for digging Internet Archive records and keeping samples as
WAVs. Pulls warm LP-era soul / blues / funk / soul-jazz from one curated pool,
plays it on a spinning ASCII turntable over the psychedelic coffee swirl.

- **K** keeps a record, **T** tosses it; the next one cues automatically.
- A keep downloads the track and converts it to 16-bit WAV in the sample
  folder (picked once via the 📁 button). Raw audio — no de-hiss, no cleanup.
- Every verdict lands in the crate log; judged records never come back.
  Click a log row to re-cue it.

Crate log: `crate-log.json` in the sample folder, next to the WAVs.
localStorage is only a working copy; on boot the two merge, newest verdict
wins.

Build: `cargo tauri build --no-bundle` → `src-tauri/target/release/crate-digger.exe`.
Needs Windows WebView2 (preinstalled on 10/11) + Rust + Tauri CLI.

Dev notes: [CLAUDE.md](CLAUDE.md).

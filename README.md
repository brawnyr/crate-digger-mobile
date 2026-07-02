# Crate Digger

A vinyl-digging desktop app (Tauri). It pulls warm LP-era soul / blues / funk / jazz
straight from the [Internet Archive](https://archive.org), plays it on a spinning
ASCII turntable, and lets you keep the good ones for sampling.

## How it works

1. Pick a **crate** (a curated Internet Archive record pool) and the app digs up a
   random record you haven't judged yet.
2. Listen, then rule on it: **💾 Keep it** or **🗑 Toss it** — either way the next
   record is cued up automatically.
3. Every *keep* downloads the track, converts it to a **16-bit WAV**, and drops it
   into a sample folder you pick once (📁 button under the crate log). Ready for the DAW.
4. Everything you've judged lands in the **crate log**, so the same record never
   comes back around — click any row to re-cue it.

## Where the crate log lives

Every verdict is written to **`crate-log.json` in your sample folder**, right next to
the WAVs — a real file on disk, so your history survives anything. localStorage is
just the working copy; on boot the app merges the two (newest verdict wins).

## Building

```
cargo tauri build --no-bundle
```

The exe lands at `src-tauri/target/release/crate-digger.exe`.

## Requirements

Windows with **WebView2** (preinstalled on Windows 10/11). Rust + the Tauri CLI to build.

## Aesthetic

Everything is a psychedelic ASCII vinyl — the spinning disc, the loader, the
wordmark — over a WebGL coffee-and-milk swirl, set in JetBrains Mono.

## Stack

Vanilla HTML / CSS / JS in `ui/`, no framework, no bundler. A small Rust side
(`src-tauri/`) handles what a webview can't: the folder picker, the crate log on
disk, Internet Archive requests, and MP3 → WAV decoding (symphonia + hound).

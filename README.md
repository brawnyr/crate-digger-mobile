# Crate Digger

**▶ Open it: https://brawnyr.github.io/crate-digger/**

A serverless vinyl-digging web app for desktop. It pulls warm LP-era soul / blues /
funk / jazz straight from the [Internet Archive](https://archive.org), plays it on a
spinning ASCII turntable, and lets you keep the good ones for sampling.

No server, no build step — it's a static site on GitHub Pages.

## How it works

1. Pick a **crate** (a curated Internet Archive record pool) and the app digs up a
   random record you haven't judged yet.
2. Listen, then rule on it: **💾 Keep it** or **🗑 Toss it** — either way the next
   record is cued up automatically.
3. Every *keep* converts the track to a **WAV** and drops it into a sample folder you
   pick once (📁 button under the crate log). Ready for the DAW.
4. Everything you've judged lands in the **crate log**, so the same record never
   comes back around — click any row to re-cue it.

## Where the crate log lives

Every verdict is written to **`crate-log.json` in your sample folder**, right next to
the WAVs — a real file on disk, so your history survives anything that happens to the
browser. The browser's localStorage is just the working copy, and `library.json` in
this repo is the seed it all started from; on boot the app merges all three
(newest verdict wins).

## Requirements

Desktop **Chrome or Edge** — the WAV export uses the File System Access API. Other
browsers can still dig and listen; keeps are just logged without the WAV.

## Aesthetic

Everything is a psychedelic ASCII vinyl — the spinning disc, the loader, the
wordmark — over a WebGL coffee-and-milk swirl, set in JetBrains Mono.

## Stack

Vanilla HTML / CSS / JS, no framework, no build. Internet Archive advancedsearch +
metadata APIs for digging, `<audio>` for streaming, Web Audio + the File System
Access API for WAV export. Hosted on GitHub Pages from `main`.

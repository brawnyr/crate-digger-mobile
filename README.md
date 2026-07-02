# Crate Digger

**▶ Open it: https://brawnyr.github.io/crate-digger/**

A serverless vinyl-digging web app. It pulls warm LP-era soul / blues / funk / jazz
straight from the [Internet Archive](https://archive.org), plays it on a spinning
ASCII turntable, and lets you keep the good ones for sampling.

No server, no build step — it's a static site on GitHub Pages. One codebase runs in
**two modes**, chosen automatically by the device.

## Two modes, one app

|            | **Player** (phone / most browsers)   | **Auditioner** (desktop Chrome/Edge)        |
| ---------- | ------------------------------------ | ------------------------------------------- |
| Does       | plays your **kept** crate back-to-back | **digs** the Archive, keep / toss           |
| Source     | reads `library.json`                 | random Internet Archive search              |
| Saves      | nothing — read-only                  | kept track → **WAV** into a folder you pick |
| Needs      | nothing                              | a GitHub token (sync) + folder permission   |

Desktop Chromium exposes the File System Access API (needed to save WAVs), so it
becomes the auditioner; everything else (phones, Firefox, Safari) is the player.

## How the two stay in sync

There's no server between your devices — **`library.json` in this repo is the sync layer**:

1. On the **desktop**, you keep / toss records. Each *keep* saves a WAV into your
   sample folder and commits `library.json` to this repo via the GitHub API (a
   fine-grained token you paste into ⚙ Settings, stored only in your browser).
2. **GitHub Pages** serves that `library.json`.
3. On your **phone**, the player reads it and plays your kept records, streamed from
   the Archive. Read-only — the phone never writes back.

So **desktop publishes, phone subscribes**, with GitHub as the shared mailbox. (WAVs
stay on the desktop; only the kept-list metadata travels. Propagation takes ~a minute
while Pages rebuilds.)

## Install on your phone

Open the link and **Share → Add to Home Screen** — it installs as a full-screen PWA
with its own icon.

## Aesthetic

Everything is a psychedelic ASCII vinyl — the spinning disc, the loader, and every
app icon — over a WebGL coffee-and-milk swirl, set in JetBrains Mono.

## Stack

Vanilla HTML / CSS / JS, no framework, no build. Internet Archive advancedsearch +
metadata APIs for digging, `<audio>` for streaming, the GitHub Contents API for sync,
the File System Access API for WAV export, and a service worker for offline launch.
Hosted on GitHub Pages from `main`.

---

> The old desktop **Python server** (`app.py` + ffmpeg) is retired — the desktop
> auditioner above is the same web app running in desktop Chrome, not a local server.

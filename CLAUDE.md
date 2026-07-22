# Crate Digger — dev notes

> **Retired 2026-07-21.** Superseded by `myhomepage/dig.html` — THE Crate
> Digger on braknee.com. This repo stays as history; nothing here ships.

Native Tauri v2 Windows app for digging Internet Archive records and keeping
samples as WAVs. See README.md for what it does.

## Build

```
cargo tauri build --no-bundle
```

Exe: `src-tauri/target/release/crate-digger.exe`. Frontend is plain files in
`ui/` — no framework, no bundler, no npm; a UI change just needs a rebuild (the
webview serves `ui/` as `frontendDist`).

## Layout

- `ui/app.js` — all app logic: IA search/pick, ASCII disc, player, crate log, verdicts.
- `ui/bg.js` — WebGL domain-warp sky on the fat-pixel grid itself (180 rows): one fbm field folded through itself twice (iq's warp), Bayer-pressed into ten hard swatches of the warm-sunset palette (twilight indigo/periwinkle/lavender violet/hot pink/melted coral/peach glow), dusk-biased so indigo keeps the top and peach the floor. Twin of myhomepage's `dig.html` sky — change one, change both (separate file for CSP: no inline scripts).
- `src-tauri/src/main.rs` — only what a webview can't do: folder picker, crate log
  on disk, proxied IA requests, MP3 → 16-bit WAV (symphonia + hound).

## Data

`crate-log.json` in the user's sample folder is the durable keep/toss history;
localStorage is just the working cache. On boot the two are merged
newest-verdict-wins. Log keys come from `cacheNameFor()` — keep that format
stable or existing logs orphan.

## Conventions

- Keep code minimal — prefer deleting over abstracting; comments explain why, not what.
- Curation happens in the single `CRATE` query (the record pool), not in filters.
- Single branch (`main`), no PRs; commit and push deliberately (the old auto-commit Stop hook was removed 2026-07-12).
- CSP lives in `tauri.conf.json`, not a meta tag.

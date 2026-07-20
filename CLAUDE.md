# Crate Digger — dev notes

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
- `ui/bg.js` — WebGL drawn-sunset sprite sky, computed on the fat-pixel grid itself (180 rows): warm-sunset palette (twilight indigo/periwinkle/lavender violet/hot pink/melted coral/peach glow) in ten hard Bayer-stippled bands, per-column wax-tongue melt, low fat sun with ringed halo, three drifts of chunky cumulus with coral-lit bellies, blinking stars, four wandering glow motes (separate file for CSP: no inline scripts).
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

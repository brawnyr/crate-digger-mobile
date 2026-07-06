// ===========================================================================
// Crate Digger — the native side. The frontend still does all the digging
// logic; these commands cover what a webview can't: a real folder picker,
// the crate log on disk, proxied IA JSON calls, and MP3 → WAV keeps.
// ===========================================================================

// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::Manager;

// ---- settings -------------------------------------------------------------
// One tiny JSON file in the app config dir: { "sample_dir": "..." }.
#[derive(Serialize, Deserialize, Default)]
struct Settings {
    sample_dir: Option<String>,
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|_| "no config dir".to_string())?;
    fs::create_dir_all(&dir).map_err(|e| format!("couldn't create config dir: {e}"))?;
    Ok(dir.join("config.json"))
}

fn read_settings(app: &tauri::AppHandle) -> Settings {
    config_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn sample_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    match read_settings(app).sample_dir {
        Some(d) => Ok(PathBuf::from(d)),
        None => Err("no sample folder set".to_string()),
    }
}

#[tauri::command]
fn get_settings(app: tauri::AppHandle) -> Settings {
    read_settings(&app)
}

// Native folder dialog. rfd's blocking picker must stay off the main thread,
// so the async command hops onto a blocking worker for it.
#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
        .await
        .map_err(|e| format!("dialog failed: {e}"))?;
    let Some(dir) = picked else { return Ok(None) };
    let dir = dir.to_string_lossy().into_owned();
    let json = serde_json::to_string_pretty(&Settings { sample_dir: Some(dir.clone()) })
        .map_err(|e| e.to_string())?;
    fs::write(config_path(&app)?, json).map_err(|e| format!("couldn't save settings: {e}"))?;
    Ok(Some(dir))
}

// ---- crate log on disk ----------------------------------------------------
// crate-log.json lives next to the WAVs — the durable copy of keep/toss history.
const LOG_FILE: &str = "crate-log.json";

#[tauri::command]
fn load_log(app: tauri::AppHandle) -> serde_json::Value {
    sample_dir(&app)
        .ok()
        .and_then(|d| fs::read_to_string(d.join(LOG_FILE)).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

#[tauri::command]
fn save_log(app: tauri::AppHandle, log: serde_json::Value) -> Result<(), String> {
    let dir = sample_dir(&app)?;
    // indent 1 to match the format the web app has always written
    let fmt = serde_json::ser::PrettyFormatter::with_indent(b" ");
    let mut out = Vec::new();
    let mut ser = serde_json::Serializer::with_formatter(&mut out, fmt);
    log.serialize(&mut ser).map_err(|e| e.to_string())?;
    fs::write(dir.join(LOG_FILE), out).map_err(|e| format!("couldn't write crate log: {e}"))
}

// ---- Internet Archive -----------------------------------------------------
// reqwest's default client never times out — a stalled IA mirror would hang the
// UI's busy state forever — so every request gets connect + total deadlines.
fn http_client(total: Duration) -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(total)
        .build()
        .expect("couldn't build the HTTP client")
}

#[tauri::command]
async fn ia_json(url: String) -> Result<serde_json::Value, String> {
    if !url.starts_with("https://archive.org/") {
        return Err("blocked non-archive.org URL".to_string());
    }
    let busy = "Internet Archive is busy — try again in a moment.";
    let client = http_client(Duration::from_secs(30));
    let resp = client.get(&url).send().await.map_err(|_| busy.to_string())?;
    if !resp.status().is_success() {
        return Err(busy.to_string());
    }
    let body = resp.text().await.map_err(|_| busy.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&body).map_err(|_| busy.to_string())?;
    if data.get("error").is_some() && data.get("response").is_none() {
        return Err(busy.to_string());
    }
    Ok(data)
}

// ---- keep: MP3 → 16-bit PCM WAV --------------------------------------------
// A ceiling on the MP3 we'll pull into memory. 80 MB is a full LP side at 320
// kbps with room to spare; anything past it is a mislabeled file, not a track.
const MAX_KEEP_BYTES: u64 = 80 * 1024 * 1024;

// Decode every packet with symphonia, preserving channel count and sample rate.
fn decode_mp3(bytes: Vec<u8>) -> Result<(u32, u16, Vec<i16>), String> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::probe::Hint;

    let mss = MediaSourceStream::new(Box::new(std::io::Cursor::new(bytes)), Default::default());
    let mut hint = Hint::new();
    hint.with_extension("mp3");
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &Default::default(), &Default::default())
        .map_err(|_| "that file isn't a readable MP3".to_string())?;
    let mut format = probed.format;
    let track = format.default_track().ok_or("no audio track in the MP3")?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &Default::default())
        .map_err(|_| "couldn't open the MP3 decoder".to_string())?;

    let mut rate = 0u32;
    let mut channels = 0u16;
    let mut samples: Vec<i16> = Vec::new();
    let mut buf: Option<SampleBuffer<i16>> = None;
    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(_) => break, // end of stream (or a truncated tail — keep what we have)
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(_) => continue, // skip the odd corrupt frame
        };
        let spec = *decoded.spec();
        rate = spec.rate;
        channels = spec.channels.count() as u16;
        let need = decoded.capacity() * spec.channels.count();
        if buf.as_ref().map_or(true, |b| b.capacity() < need) {
            buf = Some(SampleBuffer::new(decoded.capacity() as u64, spec));
        }
        let sb = buf.as_mut().unwrap();
        sb.copy_interleaved_ref(decoded);
        samples.extend_from_slice(sb.samples());
    }
    if samples.is_empty() {
        return Err("the MP3 decoded to silence".to_string());
    }
    Ok((rate, channels, samples))
}

// "<base>.wav", bumping to _2, _3, … if taken.
fn unique_wav_path(dir: &PathBuf, base: &str) -> PathBuf {
    let mut path = dir.join(format!("{base}.wav"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{base}_{n}.wav"));
        n += 1;
    }
    path
}

#[tauri::command]
async fn keep_record(app: tauri::AppHandle, url: String, base_name: String) -> Result<String, String> {
    if !url.starts_with("https://archive.org/") {
        return Err("blocked non-archive.org URL".to_string());
    }
    let dir = sample_dir(&app)?;
    // the frontend sends a clean name; strip path separators anyway
    let base: String = base_name.chars().filter(|c| !matches!(c, '/' | '\\')).collect();
    let base = if base.trim().is_empty() { "record".to_string() } else { base };

    // The webview already streamed this MP3 to play it, but that buffer lives in
    // the WebView2 cache, which Rust can't reach — so a keep re-fetches the file.
    // reqwest follows the redirect to *.us.archive.org by default;
    // a generous deadline since whole MP3s can take a while on a slow mirror.
    let client = http_client(Duration::from_secs(180));
    let mut resp = client.get(&url).send().await.map_err(|e| format!("download failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("download failed: HTTP {}", resp.status()));
    }
    // Cap the download so a pathological file can't balloon memory (whole thing is
    // decoded in RAM). Reject up front on Content-Length, then cap the actual read
    // too, since a mirror can under-report or omit the length.
    if let Some(len) = resp.content_length() {
        if len > MAX_KEEP_BYTES {
            return Err("that track is too large to keep".to_string());
        }
    }
    let mut bytes: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("download failed: {e}"))? {
        if bytes.len() as u64 + chunk.len() as u64 > MAX_KEEP_BYTES {
            return Err("that track is too large to keep".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }

    // decode + write off the async runtime — big files take a few seconds
    tauri::async_runtime::spawn_blocking(move || {
        let (rate, channels, samples) = decode_mp3(bytes)?;
        let path = unique_wav_path(&dir, &base);
        let spec = hound::WavSpec {
            channels,
            sample_rate: rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut wav = hound::WavWriter::create(&path, spec)
            .map_err(|e| format!("couldn't create the WAV: {e}"))?;
        let mut w = wav.get_i16_writer(samples.len() as u32);
        for s in samples {
            w.write_sample(s);
        }
        w.flush().map_err(|e| format!("couldn't write the WAV: {e}"))?;
        wav.finalize().map_err(|e| format!("couldn't finish the WAV: {e}"))?;
        Ok(path.file_name().unwrap().to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| format!("save failed: {e}"))?
}

// ---- app ------------------------------------------------------------------
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_settings, pick_folder, load_log, save_log, ia_json, keep_record
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

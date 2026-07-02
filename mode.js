// Pick the mode before first paint so the UI never flashes the wrong controls.
// Desktop Chromium has the File System Access API (needed to save WAVs) → auditioner.
// Everything else (phone, Firefox, Safari) → player. Kept external so the page can
// run under a strict Content-Security-Policy (script-src 'self', no inline scripts).
document.documentElement.setAttribute("data-mode", window.showDirectoryPicker ? "audition" : "play");

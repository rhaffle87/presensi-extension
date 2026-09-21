# Attendance GPS Spoofer — v1.2.0

> Override `navigator.geolocation` on university attendance portals with configurable campus coordinates.

---

## Quick Start

1. **Download** → [release.zip on GitHub Releases](../../releases/latest)
2. **Extract** the zip to any folder
3. Open **Chrome** → `chrome://extensions`
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** → select the extracted folder
6. Pin the extension icon 📌 → click it → select a campus preset → toggle ON → open your attendance portal

Done. Your portal will receive your chosen campus coordinates.

---

## Installation Methods

| Method | Difficulty | Requirement |
|--------|-----------|-------------|
| Load unpacked (from zip) | Easy | Developer Mode ON |
| Drag-and-drop `.crx` | Easy | Developer Mode ON |
| Chrome Web Store | N/A | Not published |

See **[INSTALL.md](INSTALL.md)** for detailed screenshots and Android (Kiwi Browser) instructions.

---

## Features

- **Campus presets** — Tower 1, Tower 2, Koridor C (one-click, auto-saves)
- **Gaussian jitter** — ~15m random drift per call (defeats zero-variance analytics)
- **Sensor fusion** — DeviceMotion / DeviceOrientation spoofed to match GPS
- **Velocity limiter** — Haversine check warns if location jump would trigger backend flags
- **Submission telemetry** — Chrome notification on each presensi call + local log (50 entries)
- **DOM result detector** — Detects success / failure portal responses → updates log status
- **VPN Lock** — Blocks spoofing outside campus network by default (escape hatch in Options)
- **Device profiles** — Mobile GPS, Desktop IP, Weak Signal accuracy profiles
- **Kill switch** — `Alt+Shift+X` wipes all extension data instantly

---

## VPN / Remote Attendance

The extension checks your public IP when you enable spoofing:

- **On Campus Wi-Fi / Eduroam** → works automatically
- **Off-campus + Campus VPN** → works (VPN routes traffic through campus network)
- **Off-campus without VPN** → blocked by default if Network Lock is ON (opens Options when you tap the toast)

To allow spoofing from any network, go to **Options → VPN / Campus Network Lock → uncheck**.

---

## Build from Source

```bash
# Install dev dependencies
npm install

# Run unit tests
npm test

# Build dist/ + release.zip + .crx (if Chrome is in PATH)
npm run build
```

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

---

## Disclaimer

This tool is for educational and personal research purposes only. You are solely responsible for compliance with your university's academic integrity policies.

# Changelog

All notable changes to the **Attendance GPS Spoofer** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-02

### Added
- **Initial Public Release**: Base extension featuring Chrome manifest v3 configuration.
- **Global Toggle Switch**: Enable/disable spoofing globally.
- **Interactive Map**: Leaflet.js map for visualizing coordinate targets.
- **Quick Select Grid**: Pre-configured with campus presets (Tower 1, Tower 2, Koridor C) and manual coordinate entry.
- **"My Loc" Freeze**: Quickly fetches real physical coordinates and locks them in.
- **Device Accuracy Profiles**: Selectable accuracy profiles (Mobile GPS, Desktop / IP, Weak Signal) that apply distinct ranges for accuracy and altitude.
- **Submission Log**: Timestamped history of successful submissions viewable in the Options page.
- **IP Location Check Toast**: Non-blocking toast showing current city/region from public IP when spoofing is activated.
- **Impossible Travel Limiter**: Haversine-based cooldown system preventing trivially detectable impossible-travel velocity patterns.
- **Kill Switch (Alt+Shift+X)**: Panic shortcut to wipe all configurations and local storage instantly.
- **Cybersecurity Documentation**: Detailed `vulnerables.md` documenting structural flaws in geolocation portal design.

### Advanced OpSec & Stealth (Under-the-Hood)
- **Xray-Wrapper Bypass Handshake**: Bridge communication uses JSON-serialized primitives to bypass strict browser boundaries.
- **Per-Page Bridge Session Token**: Cryptographically random tokens generated on every page load to prevent signature sniffing.
- **Sensor Fusion Spoofing**: Synthesizes realistic micro-movements, device tilt, and compass readings.
- **Gaussian Jitter**: Applies Box-Muller Gaussian random offsets (~5m) to base coordinates on every save, defeating zero-variance telemetry.
- **Native Function Caching**: Deep closure caching of DOM/event primitives before page load to evade mutation observers.
- **`.toString()` Cloaking**: Geolocation functions are proxied to return exact `[native code]` strings against prototype integrity checks.
- **Storage Key Obfuscation**: All `chrome.storage.local` keys use terse, non-descriptive identifiers to defeat trivial storage inspection.
- **Dynamic Target Domain**: Target URL dynamically bridged via `<all_urls>`, preventing the extension's manifest from openly broadcasting its specific target.

### Architecture
- **Build System**: Production bundler (`build.js`) configured for JavaScript obfuscation and asset packaging.
- **CI/CD Pipeline**: GitHub Actions workflow for automated zip artifact generation.
- **UI Documentation**: Comprehensive `ui_components.md` detailing interface architecture.

# Changelog

All notable changes to the **Attendance GPS Spoofer** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),

## [1.5.0] - 2026-10-27

### Added
- **Automated CI/CD Pipeline**: Added `.github/workflows/ci.yml` verifying linting, unit tests, and E2E suites on every pull request and push to master.
- **Cryptographic Bridge Isolation**: 128-bit cryptographic nonces (`crypto.getRandomValues`) and event capture phase isolation (`stopImmediatePropagation`) between extension content scripts and webpage DOM.
- **Bidirectional Real-Time Options Sync**: Real-time `chrome.storage.onChanged` observers with sub-350ms echo suppression for seamless cross-tab configuration synchronization.
- **Unit Test Expansion**: Added Suites 21–23 to `test/unit/spoof-logic.test.js`, bringing automated testing to 23 suites and 61 assertions.

### Changed
- **Serverless Backend Consolidation**: Deprecated and purged legacy `serverless/` folder in favor of hardened `relay-worker/` with dynamic strict CORS, 6-digit OTP schema checks, and sliding-window IP rate limiting.
- **Pruned Redundant Permissions**: Removed invasive `"geolocation"` permission from `manifest.json`, eliminating browser warning "Detect your physical location" and honoring privacy standards.
- **Leaflet Clean Asset Neutralization**: Neutralized default Leaflet asset URLs with lightweight inline SVG `L.divIcon`, eliminating 404 image errors under extension URL schemes.
- **Automated Version Synchronization**: `build.js` now programmatically synchronizes `manifest.json`, `package.json`, and `package-lock.json`.

### Added
- **Autonomous Endpoint Prober**: Dispatches `GET /api/presensi/tm/{tmKey}/kode` with active session cookies and captured authorization tokens on poller ticks.
- **In-Flight Network Interception**: Proxies on `fetch` and `XMLHttpRequest.prototype` capture outgoing `/api/presensi/tm/.../mahasiswa` mutations (`/self`, `/{id_mhs}`, `/batch`), extracting OTP codes from JSON and `FormData` payloads while injecting spoofed coordinates.
- **Modal Auto-Fill & Radio Selection**: Automatically injects recovered 6-digit codes into Chakra UI dialogs using native prototype setters and selects the offline presence radio (`hadirTatapMuka = 'L'`).
- **Sibling Subdomain Matching**: Automatically resolves related institutional portals (e.g. `portal.university.edu` matches `attendance.university.edu`) via apex domain extraction.
- **Unit Test Suite 20**: Comprehensive regression tests covering code extraction, coordinate rewriting, and mesh broadcast payloads (20 suites, 52 assertions).

### Fixed
- **Cloudflare KV Expiration TTL**: Set minimum KV expiration TTL to 60 seconds to comply with Cloudflare KV storage requirements.
- **ESLint Global Alignment**: Registered `BroadcastChannel`, `Buffer`, and `I18N` globals in `eslint.config.mjs`.

## [1.4.1] - 2026-10-12

### Added
- **Swarm Mesh Relay**: Leader-follower peer network coordinated by Cloudflare Worker + KV relay.
- **Cross-Tab Synchronization**: Zero-latency peer code broadcast across tabs using `BroadcastChannel`.
- **Anti-Replay Skew Window**: 5-minute cryptographic timestamp verification rejecting expired or replayed relay payloads.

## [1.4.0] - 2026-10-12

### Added
- **Bilingual Localization (i18n)**: Runtime English (`en`) and Indonesian (`id`) language engine with complete key parity across popup and options.
- **Physiological Tremor Modeling**: Synthesized hand tremor on `DeviceMotionEvent` and `DeviceOrientationEvent` adhering to Earth gravity (`~9.81 m/s²`).
- **Dynamic True Bearing Kinematics**: Computes exact cardinal headings and walking velocity vectors.
- **Anti-Fingerprint Defenses**: Canvas 1-bit micro-noise and WebRTC RFC1918 private candidate preservation.

## [1.3.0] - 2026-10-10

### Added
- **Academic Timetable Scheduler**: Automatic active class detection matching weekly schedule slots (07:00–21:00 WIB).
- **Custom Facility Presets**: User-defined campus room presets with automatic DOM room name matching.
- **Profile Backup & Restore**: JSON import/export with strict schema validation.

## [1.2.0] - 2026-09-21

### Added
- **Submission Telemetry**: `content.js` now sends a `PRESENSI_SUBMIT` message to the service worker every time the spoofed GPS position is delivered to the portal. The service worker appends a log entry (max 50, FIFO) and fires a Chrome notification: *"✅ Presensi Submitted — GPS · -7.2852, 112.7952"*.
- **DOM Result Detector**: A `MutationObserver` on the target attendance portal watches for SweetAlert2, Bootstrap alert, and toast elements containing `berhasil` / `gagal` (and English equivalents). On detection, a `PRESENSI_RESULT` message updates the log entry status and fires a second Chrome notification: *"✅ Presensi Diterima!"* or *"❌ Presensi Ditolak"*.
- **Last Submission Diagnostic Row**: The popup Diagnostic Card now shows the most recent submission timestamp + status badge (✅ / ❌ / ⏳), updated on every popup open.
- **Actionable VPN Toast**: The "SPOOF ABORTED" toast is now tappable — clicking it opens the Options page directly to the VPN Lock toggle.
- **VPN Escape Hatch UI**: Options page VPN Lock toggle now has a clearer label, description explaining remote use, and a dynamic `⚠️ Warning` callout that appears when the lock is disabled.
- **CRX Packaging in Build**: `build.js` now auto-generates `key.pem` (gitignored) on first run and calls Chrome CLI to produce `dist/presensi-extension.crx`. Falls back gracefully if Chrome is not in PATH.
- **INSTALL.md**: New non-technical installation guide covering Windows Chrome (Load Unpacked + CRX), Android (Kiwi Browser), update procedure, and a troubleshooting table.
- **README.md rewrite**: User-facing Quick Start section, feature matrix, VPN instructions, and build-from-source steps.
- **`notifications` permission**: Added to `manifest.json` to enable Chrome notification API.

### Changed
- `showToast()` now accepts an optional `onClick` callback parameter — tapping the toast triggers the callback and dismisses it.
- Submission log capacity increased from 20 to 50 entries.
- Log entries now include a `status` field (`pending` → `accepted` | `rejected`) updated by the DOM detector.
- Options log renderer now displays a status emoji badge per entry.

## [1.1.0] - 2026-09-21


### Added
- **Health & Telemetry Diagnostic Card**: Live visual status for HTML5 GPS hook (`ACTIVE (Hooked)`) and Network IP / ISP (`Campus Network (OK)` vs `External`).
- **HTTPS IP Verification**: Upgraded IP detection to `https://ipwho.is/` (with `https://ipapi.co/` fallback), preventing SSL 403 hangs on Chrome.
- **One-Click Diagnostic Launchers**: Quick testing buttons for **BrowserLeaks Geo** and **HTML5 Demos** directly inside the popup.
- **Auto-Save on Preset Click**: Selecting presets (Tower 1, Tower 2, Koridor C) automatically saves coordinates to storage and syncs live to active portals.
- **Automatic Active Tab Reload**: Applying changes reloads the active tab immediately so fresh coordinates take effect without manual `F5`.
- **Comprehensive Unit & E2E Test Suite**: Node.js test runner covering schema parity, domain resolution, Gaussian jitter math, Haversine limits, and prototype cloaking (`npm test`).

### Fixed
- **Extension Context Invalidation**: Hardened `storage-bridge.js` with `isContextValid()` guards, automatic listener detachment, and safety try-catch wrappers.
- **Private Subnet Bail-out**: Fast bail-out on private IP ranges (`10.x.x.x`, `192.168.x.x`, `172.16-31.x.x`) to prevent interfering with local servers (e.g. Proxmox).
- **Stack Overflow (`RangeError: Maximum call stack size exceeded`)**: Added re-entrancy protection to `Function.prototype.toString` proxy and removed conflicting `selfDefending`/`debugProtection` options from `build.js` that previously froze Next.js on dynamic single-page portals.

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

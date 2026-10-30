# Attendance GPS Spoofer (presensi-extension) — v1.5.0

> High-assurance geolocation emulator, sensor fusion synthesizer, and autonomous attendance code synchronizer for university portals.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Target["Target Attendance System"]
        Portal["Institutional Attendance Portal<br/>(e.g., portal.university.edu)"]
    end

    Portal -->|"DOM Mutation / XHR & Fetch Probe"| Core

    subgraph Ext["presensi-extension (v1.5.0)"]
        direction TB
        Core["Extension Runtime Controller"]
        
        subgraph Group1["Sensory & Network Hooks"]
            direction LR
            Geo["Geolocation Hook<br/>• Box-Muller Jitter<br/>• True Bearing"]
            Sensor["Sensor Fusion<br/>• Tremor Synth<br/>• Gravity Vector"]
            Net["Network Proxy<br/>• XHR Sniffer<br/>• Fetch Proxy"]
        end

        subgraph Group2["Defenses & Scheduling"]
            direction LR
            AF["Anti-Fingerprint<br/>• WebRTC Candidate<br/>• Canvas MicroNoise"]
            TT["Timetable Match<br/>• Slot Auto-Set<br/>• Room Detector"]
            I18N["i18n Engine<br/>• EN / ID<br/>• Parity 100%"]
        end

        Core --- Group1
        Core --- Group2
    end

    Ext -->|"WebRTC DataChannel / BroadcastChannel / KV"| Mesh

    subgraph Mesh["Swarm Mesh Relay (Worker + KV)"]
        Relay["P2P Leader-Follower OTP Sync<br/>Zero-Latency Cross-Tab Distribution"]
    end
```

---

## Core Capabilities

### 1. Geolocation & Sensor Fusion Emulation
- **Gaussian Jitter Engine**: Employs Box-Muller transformation to inject realistic coordinate variance (~15m drift), neutralizing static coordinate detection algorithms.
- **Dynamic Kinematics & True Bearing**: Computes exact cardinal headings (`0°` North, `90°` East, `180°` South, `270°` West) and walking velocity vectors.
- **Physiological Hand Tremor**: Generates high-frequency micro-movements on `DeviceMotionEvent` and `DeviceOrientationEvent` adhering to Earth gravity acceleration magnitude (`~9.81 m/s²`).
- **Accuracy Profiles**: Mobile GPS (`±5-15m`), Desktop IP (`±25-65m`), and Weak Signal (`±45-120m`).

### 2. Autonomous Attendance Code Retrieval & Network Injection
- **Target Endpoint Probing**: Dispatches background probes (`GET /api/presensi/tm/{tmKey}/kode`) using active session credentials.
- **In-Flight Mutation Sniffing**: Deep proxies on `window.fetch` and `XMLHttpRequest.prototype` intercept all student attendance mutations (`/api/presensi/tm/.../mahasiswa`), extracting 6-digit OTP codes and rewriting payload coordinates.
- **Form & DOM Auto-Fill**: Automatically discovers attendance modal fields (`.chakra-modal__content input`, `[role="dialog"]`), writes the code using native prototype setters to trigger React revalidation cycles, and selects the offline presence radio button (`hadirTatapMuka = 'L'`).
- **Sibling Subdomain Resolution**: Automatically recognizes and binds to related institutional subdomains (e.g. `attendance.university.edu` matches `portal.university.edu`).

### 3. Swarm Mesh Networking
- **Leader-Follower Topology**: Cloudflare Worker with KV state coordinates connected peers. The first active peer harvesting a session code broadcasts it across the swarm.
- **Cross-Tab Synchronization**: In-memory `BroadcastChannel` guarantees instant zero-latency OTP distribution across all open tabs.
- **Anti-Replay Window**: Enforces strict 5-minute timestamp validation on relay sync packets to reject expired or replayed codes.

### 4. Anti-Fingerprinting & OpSec Guardrails
- **WebRTC Candidate Filtering**: Filters local mDNS and private RFC1918 candidates from leaking public IPs behind VPNs.
- **Canvas & Audio Cloaking**: Adds deterministic 1-bit micro-noise to canvas export APIs and neutralizes `OfflineAudioContext` fingerprint hashing.
- **Native Prototype Cloaking**: Geolocation, XHR, and Fetch hooks are protected with re-entrant `.toString()` proxies returning native code signatures.
- **Kill Switch**: `Alt+Shift+X` purges all stored state, active credentials, and configuration profiles instantly.

### 5. Multi-Language (i18n) Engine
- Full runtime language switching between **English (en)** and **Indonesian (id)** across popup and options interfaces with 100% dictionary key parity.

---

## Directory Structure

```
presensi-extension/
├── background/
│   └── service-worker.js      # Background telemetry, badge state, notifications
├── dist/
│   ├── chrome-webstore.zip    # Unpacked archive formatted for Chrome Web Store
│   ├── firefox-amo.zip        # Manifest-adapted archive for Firefox AMO
│   └── presensi-extension.crx # Self-signed packaged extension binary
├── options/
│   ├── options.html           # Full settings dashboard, timetable, preset manager
│   └── options.js             # Options logic, backup/restore, CSV export
├── relay-worker/
│   ├── README.md              # Worker architecture, deployment guide, API contract
│   ├── wrangler.toml          # Cloudflare Worker deployment manifest
│   └── worker.js              # KV-backed Mesh Relay, leader election, anti-replay
├── test/
│   ├── e2e/
│   │   ├── e2e.test.js        # Browser runtime and DOM integration suite
│   │   └── test-server.js     # Mock portal server with Chakra UI elements
│   ├── unit/
│   │   └── spoof-logic.test.js# 23 test suites (61 assertions)
│   ├── probe-all.js           # Full relay & configuration auditor
│   └── probe-target-domain.js # Target domain SSL, HSTS, and header probe
├── build.js                   # Packaging engine, obfuscation, zip/crx compiler
├── CHANGELOG.md               # Version history and upgrade notes
├── content.js                 # Core injected runtime: hooks, mesh, DOM automations
├── eslint.config.mjs          # Linting rules and globals
├── i18n.js                    # Bilingual dictionary and localization helpers
├── INSTALL.md                 # Step-by-step setup guide for Desktop & Android
├── manifest.json              # Chrome Extension Manifest V3
├── package.json               # Dependencies and scripts
├── popup.html                 # HUD popup interface
├── popup.js                   # HUD controller, quick presets, diagnostic cards
├── storage-bridge.js          # Shared storage adapter with context validation
├── ui_components.md           # UI catalog and styling reference
└── vulnerables.md             # Security analysis of portal geolocation architectures
```

---

## Installation Guide (Panduan Pemasangan)

### 1. Chromium Desktop (Google Chrome, Brave, Microsoft Edge)

1. **Unduh Paket Rilis**:
   - Buka halaman [Releases](../../releases/latest) dan unduh file `release.zip` versi terbaru (misal: `v1.5.0`).
2. **Ekstrak Arsip ZIP**:
   - Ekstrak file `release.zip` ke folder lokal permanen di komputer Anda (contoh: `D:\Extensions\presensi-extension\`).
   - *Penting: Jangan simpan di folder unduhan sementara agar browser tidak kehilangan akses saat folder dibersihkan.*
3. **Akses Halaman Ekstensi**:
   - Buka browser dan arahkan URL ke:
     - Google Chrome: `chrome://extensions`
     - Brave: `brave://extensions`
     - Microsoft Edge: `edge://extensions`
4. **Aktifkan Developer Mode**:
   - Nyalakan saklar **Developer mode** di pojok kanan atas.
5. **Muat Ekstensi (Load Unpacked)**:
   - Klik tombol **Load unpacked** di pojok kiri atas.
   - Pilih direktori hasil ekstraksi yang memuat file `manifest.json`.
   - Ekstensi **Attendance GPS Spoofer** akan muncul dan siap digunakan.
6. **Sematkan Ikon Ekstensi (Pin)**:
   - Klik ikon puzzle (Extensions) pada toolbar browser, lalu klik ikon pin di samping nama ekstensi agar selalu tampil di toolbar.

---

### 2. Android Mobile (Kiwi Browser)

1. **Instal Browser yang Mendukung Ekstensi Chrome**:
   - Pasang [Kiwi Browser](https://play.google.com/store/apps/details?id=com.kiwibrowser.browser) dari Google Play Store.
2. **Unduh & Ekstrak `release.zip`**:
   - Unduh file `release.zip` dari [Releases](../../releases/latest) ke penyimpanan internal perangkat Anda.
   - Ekstrak file ZIP tersebut menggunakan file manager bawaan atau aplikasi ZArchiver.
3. **Buka Menu Ekstensi di Kiwi Browser**:
   - Buka Kiwi Browser, ketuk menu tiga titik (`⋮`) di kanan atas → pilih **Extensions**.
   - Aktifkan saklar **Developer mode** di bagian atas menu ekstensi.
4. **Muat Ekstensi**:
   - Ketuk tombol **Load unpacked** atau **+(from .zip/.crx/.user.js)**.
   - Arahkan dan pilih folder hasil ekstraksi yang memuat `manifest.json`.
   - Ekstensi kini aktif dan dapat dibuka langsung melalui menu tiga titik (`⋮`) pada bagian daftar ekstensi paling bawah.

---

### 3. Langkah Penggunaan (Quick Usage)

1. **Buka Popup Ekstensi**: Klik ikon ekstensi di toolbar browser.
2. **Pilih Lokasi / Presets**: Pilih salah satu preset ruangan kampus yang tersedia atau masukkan koordinat (*Latitude* / *Longitude*) yang diinginkan.
3. **Aktifkan Master Toggle**: Geser saklar utama ke posisi **ON** untuk mulai memalsukan geolokasi & sensor.
4. **Buka Portal Presensi**: Arahkan browser ke portal kehadiran institusi Anda (contoh: `https://portal.university.edu/`). Lakukan presensi kehadiran secara normal.

---

## Verification & Build

```bash
# Run unit and regression test suite (20 suites, 52 tests)
npm test

# Run ESLint validation
npm run lint

# Probe Cloudflare Worker Relay
npm run probe:all

# Probe target domain headers and SSL certificates
npm run probe:domain

# Compile obfuscated bundles, release.zip, and .crx package
npm run build
```

---

## Storage Schema (`chrome.storage.local`)

| Identifier | Type | Role |
|------------|------|------|
| `cfg_e` | `boolean` | Master spoof switch state |
| `cfg_a` | `string` | Target latitude coordinate |
| `cfg_o` | `string` | Target longitude coordinate |
| `cfg_d` | `string` | Primary target domain (e.g. `portal.university.edu`) |
| `cfg_p` | `string` | Accuracy device profile (`mobile`, `desktop`, `weak`) |
| `cfg_v` | `boolean` | Campus network / VPN lock toggle |
| `cfg_cp` | `Array<Preset>` | Custom room and facility presets |
| `cfg_tt` | `Array<Slot>` | Academic timetable schedule entries |
| `cfg_ru` | `string` | Cloudflare Worker Relay endpoint |
| `cfg_ln` | `string` | Interface language (`en` or `id`) |
| `cfg_lg` | `Array<Log>` | Telemetry submission audit log |

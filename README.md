# Attendance GPS Spoofer

Chrome extension that overrides `navigator.geolocation` on `portal.university.edu` to report custom campus coordinates when submitting attendance.

## Features (v1.0.0)
- **Advanced Stealth**: Uses ISOLATED-to-MAIN world bridging with cryptographically random tokens and obfuscated storage keys. Resilient against anti-cheat checks.
- **Dynamic Profiles**: Quickly switch between different campus presets directly from the popup.
- **Submission Log**: Stores a persistent history of all successful mock submissions (accessible via the Options page).
- **IP Location Toast**: Verifies and displays your current IP location so you can ensure you are on the campus network before submitting.
- **Kill Switch**: Press `Alt+Shift+X` while the popup is open to instantly wipe all configuration, regenerate tokens, and reset the extension to defaults.

## How to Load in Chrome (Desktop)

1. Open Chrome → navigate to `chrome://extensions`
2. Enable **Developer Mode** (top-right toggle)
3. Click **"Load unpacked"**
4. Select the `dist` folder (if using the built version) or the `presensi-extension` folder.
5. The extension icon will appear in your toolbar.

## How to Load in Android (Recommended: Kiwi Browser)

Standard Firefox for Android blocks side-loading unsigned extensions. To use this on mobile without waiting for Mozilla AMO approval, use Kiwi Browser:

1. Install **Kiwi Browser** from the Google Play Store.
2. Open Kiwi, tap the 3-dot menu, and go to **Extensions**.
3. Turn on **Developer mode** (top right).
4. Tap **+(from .zip/.crx/.user.js)** and select the `release.zip` file.
5. The extension will install permanently and work exactly like the desktop version.

## How to Use

1. Click the extension icon to open the popup.
2. Select a **Profile** from the dropdown (e.g., Tower 2) or enter custom coordinates.
3. Flip the **Enable spoofing** toggle to ON.
4. Click **"Save & Apply Spoof"**.
5. Wait for the green toast confirming the save and the IP check toast.
6. Go to `portal.university.edu/attendance` and submit attendance — the map will show your spoofed location.

## IP Address Note

The system also records your **public IP address**. The extension can only spoof GPS coordinates, not your IP.

To fully appear as on-campus, combine this extension with:
- Campus Wi-Fi (you'll get a `10.x.x.x` IP automatically)
- Or a Campus VPN (if provided by the university)

## Files Architecture

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config (MV3) |
| `content.js` | Geolocation override and sensor jitter (MAIN world) |
| `storage-bridge.js` | Storage → MAIN world token bridge (ISOLATED world) |
| `background/service-worker.js` | Extension install handler & default provisioning |
| `popup/options` | Extension UI & Submission Log |
| `build.js` | Production obfuscation bundler |

## Campus Coordinate Presets

| Location | Latitude | Longitude |
|----------|----------|-----------|
| Location A | <redacted> | <redacted> |
| Location B | <redacted> | <redacted> |
| Location C | <redacted> | <redacted> |

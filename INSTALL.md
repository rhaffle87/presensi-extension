# INSTALL.md — Installation Guide

> Step-by-step instructions for Windows (Chrome) and Android (Kiwi Browser).

---

## Method 1 — Load Unpacked from ZIP (Recommended)

### Windows / Chrome

**Step 1 — Download the release**

Go to the [GitHub Releases page](../../releases/latest) and download `release.zip`.

**Step 2 — Extract the ZIP**

Right-click `release.zip` → **Extract All** → choose a permanent folder (e.g. `C:\Extensions\presensi-spoofer\`).

> ⚠ Do NOT extract to Downloads — Chrome loses access to the folder if you move it later.

**Step 3 — Enable Developer Mode in Chrome**

1. Open Chrome and go to: `chrome://extensions`
2. Toggle **Developer mode** ON (top-right corner)

**Step 4 — Load the extension**

1. Click **Load unpacked**
2. Navigate to and select the extracted folder (the one that contains `manifest.json`)
3. The extension icon 🛡 appears in your toolbar

**Step 5 — Use it**

1. Click the extension icon → popup opens
2. Click **Tower 2** (or your class location preset)
3. Toggle the switch to **ON**
4. Open your university attendance portal (e.g. `https://portal.university.edu/attendance/`)
5. Submit your attendance normally — the portal will receive your chosen campus GPS coordinates

---

## Method 2 — Drag-and-drop CRX

> The `.crx` file is included in the release folder after building from source.

1. Enable **Developer mode** (`chrome://extensions`)
2. Open `dist/presensi-extension.crx` in File Explorer
3. Drag it onto the `chrome://extensions` tab
4. Click **Add extension** in the confirmation dialog

---

## Method 3 — Android (Kiwi Browser)

[Kiwi Browser](https://play.google.com/store/apps/details?id=com.kiwibrowser.browser) is a Chromium-based Android browser that supports Chrome extensions.

1. Install **Kiwi Browser** from the Play Store
2. Download `release.zip` on your Android device
3. Extract it using **ZArchiver** or **Total Commander**
4. In Kiwi Browser, open the menu (`⋮`) → **Extensions**
5. Enable **Developer mode** (bottom toggle)
6. Tap **Load unpacked (+)** → navigate to the extracted folder → select it
7. The extension is now active in Kiwi Browser

> Note: Open your attendance portal in Kiwi Browser (not your default browser) for the spoof to work.

---

## Updating

When a new version is released:

1. Download the new `release.zip`
2. Extract to the **same folder** you chose in Step 2 (overwrite all files)
3. Go to `chrome://extensions` → click **↺ Update** on the extension card

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "This extension is not from Chrome Web Store" dialog | Click **Keep** — this is expected for Load Unpacked |
| Extension disappears after Chrome update | Re-enable Developer mode and reload the extension |
| Popup shows "Checking IP…" forever | Check your internet connection; try disabling other extensions temporarily |
| Attendance still shows real location | Hard-refresh the page (`Ctrl+Shift+R`) after enabling the toggle |
| "SPOOF ABORTED: Not on Campus VPN" | Connect to Campus Wi-Fi or VPN, or turn off VPN Lock in Options |
| Chrome notification not showing | Go to `chrome://settings/content/notifications` → allow extension notifications |

---

## Uninstall

Go to `chrome://extensions` → find **Attendance GPS Spoofer** → click **Remove**.

All stored data (coordinates, log) is deleted automatically.

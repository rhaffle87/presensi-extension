# Privacy Policy for Attendance GPS Spoofer

**Effective Date:** October 10, 2026  
**Extension Name:** Attendance GPS Spoofer  

This Privacy Policy explains how the Attendance GPS Spoofer browser extension ("the Extension") handles user data and permissions.

---

### 1. Zero Telemetry & Local Data Storage
The Extension is built with privacy-by-design:
- **No Data Collection:** The Extension does **not** collect, transmit, track, or share any personal identity information, student credentials, location history, or browsing habits.
- **Client-Side Only:** All user configurations, facility coordinates, custom presets, timetables, and local attendance logs are stored strictly inside your browser's local sandbox via `chrome.storage.local`.
- **No External Servers:** The developers operate no analytics servers, no remote tracking databases, and no cloud loggers.

---

### 2. Permissions Justification (Single Purpose)
The Extension requests only the minimum permissions necessary for its primary function:

- **`storage`**: Used to save your selected campus coordinates, custom presets, weekly timetable rules, and theme preferences locally on your machine.
- **`activeTab` / `scripting`**: Used to inject the mock geolocation sensor script and verify whether the current web page is your designated university attendance portal.
- **`geolocation`**: Allows the extension popup's "Use My Real Location" button to determine your current baseline coordinates upon explicit button click.
- **`declarativeNetRequest` / `declarativeNetRequestWithHostAccess`**: Used exclusively when the user selects mobile device spoofing (e.g. Android or iOS) to synchronize the outgoing HTTP `User-Agent` header for the portal.
- **`alarms` / `notifications`**: Used for autonomous background checks during Indonesian academic hours (06:30 - 18:30 WIB) to notify the user if an active attendance window is open on the portal.
- **`host_permissions`**:
  - University attendance domains: To inject geolocation overrides and detect check-in status.
  - Whitelisted diagnostic domains (`browserleaks.com`, `html5demos.com`, `my-location.org`, `localhost`): To allow developers and users to verify spoofing accuracy in safe test environments.
  - Public IP lookup APIs (`ipwho.is`, `ipapi.co`, `ip-api.com`): Queried directly from your client browser solely to check if your active connection matches the campus WiFi/VPN ASN without transmitting any identifying payloads.

---

### 3. Data Retention and Deletion
All data created by the Extension resides on your device. You can completely erase all stored coordinates, presets, and logs at any time by:
1. Clicking **Clear Log** or deleting presets in the Options page.
2. Uninstalling the Extension from `chrome://extensions` or `about:addons`, which immediately purges all associated local storage.

---

### 4. Open Source and Auditability
The Extension source code is open and verifiable. You can inspect the complete implementation on GitHub:  
[https://github.com/rhaffle87/presensi-extension](https://github.com/rhaffle87/presensi-extension)

---

### 5. Contact
For security inquiries or questions, open an issue on the project repository.

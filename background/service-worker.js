/**
 * background/service-worker.js
 *
 * MV3 Service Worker — handles initialization and message routing.
 * Ephemeral by design: it suspends when idle. State must be persisted in chrome.storage.
 */

'use strict';

// ── Obfuscated storage key map ──────────────────────────────────────────────
const K = {
  enabled: 'cfg_e',
  lat:     'cfg_a',
  lng:     'cfg_o',
  domain:  'cfg_d',
  prevLat: 'cfg_pa',
  prevLng: 'cfg_po',
  prevTs:  'cfg_pt',
  theme:   'cfg_t',
  profile: 'cfg_ap',
  log:     'cfg_sl',
  vpnLock: 'cfg_vl',
  deviceMode: 'cfg_dm',
  testMode: 'cfg_tm',
};


// --- Extension initialization ---
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const defaults = {};
    defaults[K.enabled] = false;
    defaults[K.lat]     = '-7.2852792';
    defaults[K.lng]     = '112.7952975';
    defaults[K.domain]  = 'mia.its.ac.id';
    defaults[K.profile] = 'mobile_gps';
    defaults[K.vpnLock] = true;
    defaults[K.deviceMode] = 'desktop';
    defaults[K.testMode] = false;
    chrome.storage.local.set(defaults);
  }

  // Register autonomous background polling alarm (15-min interval)
  try {
    chrome.alarms.create('presensi_auto_check', {
      periodInMinutes: 15
    });
  } catch (_) {}

  // Retroactively inject content scripts only into target portal & diagnostic tabs upon install/reload
  try {
    const targetDomain = 'mia.its.ac.id';
    const relevantPatterns = [
      `*://${targetDomain}/*`,
      `*://*.${targetDomain}/*`,
      '*://portal.university.edu/*',
      '*://*.portal.university.edu/*',
      '*://browserleaks.com/*',
      '*://*.browserleaks.com/*',
      '*://html5demos.com/*',
      '*://my-location.org/*',
      '*://localhost/*',
      '*://127.0.0.1/*'
    ];
    const tabs = await chrome.tabs.query({ url: relevantPatterns });
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
        world: 'MAIN'
      }).catch(() => {});
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['compat.js', 'storage-bridge.js'],
        world: 'ISOLATED'
      }).catch(() => {});
    }
  } catch (_) {}
});

// --- Autonomous Background Scheduler (chrome.alarms) ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'presensi_auto_check') return;

  // 1. Timezone Guard: Active only during Indonesian academic hours (06:30 - 18:30 WIB)
  const now = new Date();
  const utcHours = now.getUTCHours();
  const wibHours = (utcHours + 7) % 24;
  if (wibHours < 6 || wibHours > 18) {
    return;
  }

  // 2. Read current spoof state
  chrome.storage.local.get([K.enabled, K.domain, K.lat, K.lng, K.profile], async (cfg) => {
    if (chrome.runtime.lastError || !cfg[K.enabled]) return;

    const targetDomain = cfg[K.domain] || 'mia.its.ac.id';
    try {
      // 3. Headless ping to check if user has active session on portal
      const checkUrl = `https://${targetDomain}/dashboard`;
      const res = await fetch(checkUrl, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'text/html,application/xhtml+xml' }
      });

      if (res.ok) {
        const text = await res.text();
        // Check for presence of active attendance markers in DOM/response
        const hasActivePresensi = /presensi|kehadiran|daftar\s*hadir|absen/i.test(text) &&
                                  /buka|aktif|active|open/i.test(text);

        if (hasActivePresensi) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon48.png'),
            title: '📅 Presensi Window Active',
            message: `Sesi presensi aktif terdeteksi di ${targetDomain}. Koordinat spoof siap diterapkan.`,
            priority: 2
          });
        }
      }
    } catch (_) {
      // Offline or network error; silent recovery
    }
  });
});

// --- Device/User-Agent Spoofing (declarativeNetRequest) ---
function updateDeviceRules(deviceMode) {
  const RULE_ID = 1;
  if (!deviceMode || deviceMode === 'desktop') {
    // Remove the override rule
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [RULE_ID]
    });
    return;
  }

  const uas = {
    'android': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    'ios': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
  };

  const overrideUserAgent = uas[deviceMode];
  if (!overrideUserAgent) return;

  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
    addRules: [{
      id: RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'User-Agent', operation: 'set', value: overrideUserAgent }
        ]
      },
      condition: {
        urlFilter: '*',
        resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'stylesheet', 'image', 'font', 'ping']
      }
    }]
  });
}

// Re-apply rules on startup
chrome.storage.local.get([K.deviceMode], (res) => {
  if (chrome.runtime.lastError) return;
  updateDeviceRules(res[K.deviceMode]);
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes[K.deviceMode]) {
    updateDeviceRules(changes[K.deviceMode].newValue);
  }
});

// --- Message routing between popup and content scripts ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── Config fetch (popup / content) ─────────────────────────────────────────
  if (message.type === 'GET_CONFIG') {
    chrome.storage.local.get([K.enabled, K.lat, K.lng, K.domain, K.profile, K.deviceMode, K.testMode], (result) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({
        success: true,
        config: {
          enabled:    result[K.enabled]    === true,
          lat:        result[K.lat]        || null,
          lng:        result[K.lng]        || null,
          domain:     result[K.domain]     || atob('cG9ydGFsLnVuaXZlcnNpdHkuZWR1'),
          profile:    result[K.profile]    || 'mobile_gps',
          deviceMode: result[K.deviceMode] || 'desktop',
          testMode:   result[K.testMode]   === true,
        }
      });
    });
    return true;
  }

  // ── Submission telemetry: content.js → service worker ──────────────────────
  if (message.type === 'PRESENSI_SUBMIT') {
    const { lat, lng, profile, ts } = message;
    const entry = { ts: ts || Date.now(), lat, lng, profile: profile || 'mobile_gps', status: 'pending' };

    // Append to local log (max 50 entries, newest first)
    chrome.storage.local.get([K.log], (res) => {
      if (chrome.runtime.lastError) return;
      const log = Array.isArray(res[K.log]) ? res[K.log] : [];
      log.unshift(entry);
      if (log.length > 50) log.length = 50;
      const data = {};
      data[K.log] = log;
      chrome.storage.local.set(data);
    });

    // Fire a Chrome notification
    try {
      const latStr = parseFloat(lat).toFixed(4);
      const lngStr = parseFloat(lng).toFixed(4);
      const profileLabel = profile === 'mobile_gps' ? 'GPS' : profile === 'desktop' ? 'Desktop' : profile;
      chrome.notifications.create({
        type:    'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title:   '✅ Presensi Submitted',
        message: `${profileLabel} · ${latStr}, ${lngStr}`,
        priority: 1
      });
    } catch (_) {}

    sendResponse({ ok: true });
    return true;
  }

  // ── Result telemetry: accepted / rejected DOM detection ────────────────────
  if (message.type === 'PRESENSI_RESULT') {
    const { status, ts } = message; // status: 'accepted' | 'rejected'
    // Update the most recent log entry's status
    chrome.storage.local.get([K.log], (res) => {
      if (chrome.runtime.lastError) return;
      const log = Array.isArray(res[K.log]) ? res[K.log] : [];
      if (log.length > 0) {
        log[0].status = status;
      } else {
        // No prior PRESENSI_SUBMIT — create a synthetic entry
        log.unshift({ ts: ts || Date.now(), lat: null, lng: null, profile: null, status });
      }
      const data = {};
      data[K.log] = log;
      chrome.storage.local.set(data);
    });

    // Update Chrome notification with result
    try {
      const icon  = status === 'accepted' ? '✅' : '❌';
      const label = status === 'accepted' ? 'Presensi Diterima!' : 'Presensi Ditolak';
      chrome.notifications.create({
        type:    'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title:   `${icon} ${label}`,
        message: 'Lihat log di Options untuk detail.',
        priority: 2
      });
    } catch (_) {}

    sendResponse({ ok: true });
    return true;
  }

  return false;
});

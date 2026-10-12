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
  customPresets: 'cfg_cp',
  timetable: 'cfg_tt',
  relayUrl:  'cfg_ru',
};


// --- Extension initialization ---
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const defaults = {};
    defaults[K.enabled] = false;
    defaults[K.lat]     = '-7.2852792';
    defaults[K.lng]     = '112.7952975';
    defaults[K.domain]  = 'portal.university.edu';
    defaults[K.profile] = 'mobile_gps';
    defaults[K.vpnLock] = true;
    defaults[K.deviceMode] = 'desktop';
    defaults[K.testMode] = false;
    defaults[K.customPresets] = [];
    defaults[K.timetable] = [];
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
    const targetDomain = 'portal.university.edu';
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

// Re-verify alarms on browser startup / sleep wake-up
chrome.runtime.onStartup.addListener(() => {
  try {
    chrome.alarms.get('presensi_auto_check', (alarm) => {
      if (!alarm) {
        chrome.alarms.create('presensi_auto_check', { periodInMinutes: 15 });
      }
    });
  } catch (_) {}
});

// --- Autonomous Background Scheduler (chrome.alarms) ---
function getActiveTimetableSlot(timetable) {
  if (!Array.isArray(timetable) || !timetable.length) return null;
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const wibDate = new Date(utcMs + (7 * 3600000));
  const day = wibDate.getDay();
  const currentMinutes = wibDate.getHours() * 60 + wibDate.getMinutes();
  for (let i = 0; i < timetable.length; i++) {
    const slot = timetable[i];
    if (slot.day !== day) continue;
    const [startH, startM] = (slot.start || '00:00').split(':').map(Number);
    const [endH, endM] = (slot.end || '23:59').split(':').map(Number);
    const startMin = (startH || 0) * 60 + (startM || 0);
    const endMin = (endH || 0) * 60 + (endM || 0);
    if (currentMinutes >= startMin && currentMinutes <= endMin) return slot;
  }
  return null;
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'presensi_auto_check') return;

  // 1. Timezone Guard: Active only during Indonesian academic hours (06:30 - 18:30 WIB)
  const now = new Date();
  const utcHours = now.getUTCHours();
  const wibHours = (utcHours + 7) % 24;
  if (wibHours < 6 || wibHours > 18) {
    return;
  }

  // 2. Read current spoof state & timetable
  chrome.storage.local.get([K.enabled, K.domain, K.lat, K.lng, K.profile, K.timetable, K.relayUrl, 'cfg_sess'], async (cfg) => {
    if (chrome.runtime.lastError || !cfg[K.enabled]) return;

    const targetDomain = cfg[K.domain] || 'portal.university.edu';
    const activeSlot   = getActiveTimetableSlot(cfg[K.timetable]);
    const relayUrl     = cfg[K.relayUrl] || null;
    const sess         = cfg.cfg_sess || null;

    // ── Headless Auto-Checkin via Timetable + Swarm OTP ────────────────────
    if (activeSlot && relayUrl) {
      try {
        const stateRes = await fetch(`${relayUrl}/mesh/state`).catch(() => null);
        const stateData = stateRes && stateRes.ok ? await stateRes.json().catch(() => null) : null;
        const otp = stateData && stateData.otp ? String(stateData.otp) : null;
        const tmKey = stateData && stateData.tmKey ? String(stateData.tmKey) : null;

        if (otp && tmKey && (sess || true)) {
          const spoofLat = activeSlot.lat != null ? parseFloat(activeSlot.lat) : parseFloat(cfg[K.lat]);
          const spoofLng = activeSlot.lng != null ? parseFloat(activeSlot.lng) : parseFloat(cfg[K.lng]);
          const checkinUrl = `https://${targetDomain}/api/presensi/tm/${tmKey}/mahasiswa/self`;

          const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
          if (sess && sess.auth) headers['Authorization'] = sess.auth;

          const submitRes = await fetch(checkinUrl, {
            method:      'PUT',
            credentials: 'include',
            headers:     headers,
            body:        JSON.stringify({
              jenis_hadir_tm: 'L',
              kode:           otp,
              latitude:       spoofLat,
              longitude:      spoofLng
            })
          }).catch(() => null);

          if (submitRes && submitRes.ok) {
            // Append successful entry to log
            chrome.storage.local.get([K.log], (logRes) => {
              const log = Array.isArray(logRes[K.log]) ? logRes[K.log] : [];
              log.unshift({
                ts: Date.now(), lat: spoofLat, lng: spoofLng,
                profile: cfg[K.profile] || 'mobile_gps', status: 'accepted'
              });
              if (log.length > 50) log.length = 50;
              chrome.storage.local.set({ [K.log]: log });
            });

            chrome.notifications.create({
              type:    'basic',
              iconUrl: chrome.runtime.getURL('icons/icon48.png'),
              title:   '🎯 Presensi Otomatis Sukses (Headless)',
              message: `${activeSlot.subject || 'Kelas'}: Hadir dengan OTP ${otp}`,
              priority: 2
            });
            return;
          }
        }
      } catch (_) {}
    }

    // ── Fallback Portal Ping & Notification ────────────────────────────────
    try {
      const checkUrl = `https://${targetDomain}/dashboard`;
      const res = await fetch(checkUrl, {
        method:      'GET',
        credentials: 'include',
        headers:     { 'Accept': 'text/html,application/xhtml+xml' }
      });

      if (res.ok) {
        const text = await res.text();
        const hasActivePresensi = /presensi|kehadiran|daftar\s*hadir|absen/i.test(text) &&
                                  /buka|aktif|active|open/i.test(text);

        if (hasActivePresensi) {
          chrome.notifications.create({
            type:    'basic',
            iconUrl: chrome.runtime.getURL('icons/icon48.png'),
            title:   '📅 Presensi Window Active',
            message: `Sesi presensi aktif terdeteksi di ${targetDomain}. Koordinat spoof siap diterapkan.`,
            priority: 2
          });
        }
      }
    } catch (_) {}
  });
});

// --- Device/User-Agent Spoofing + Campus IP Header Injection (declarativeNetRequest) ---
function updateDeviceRules(deviceMode, campusIp) {
  const UA_RULE_ID = 1;
  const IP_RULE_ID = 2;

  // Campus IP injection: fakes X-Forwarded-For to an internal campus subnet.
  // Effective when the portal backend trusts proxy headers (common misconfiguration).
  const spoofIp = campusIp || '10.103.0.' + (Math.floor(Math.random() * 200) + 10);

  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [IP_RULE_ID],
    addRules: [{
      id: IP_RULE_ID,
      priority: 2,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'X-Forwarded-For',  operation: 'set', value: spoofIp },
          { header: 'X-Real-IP',        operation: 'set', value: spoofIp },
          { header: 'X-Originating-IP', operation: 'set', value: spoofIp },
          { header: 'X-Remote-IP',      operation: 'set', value: spoofIp },
          { header: 'X-Remote-Addr',    operation: 'set', value: spoofIp }
        ]
      },
      condition: {
        urlFilter: '*',
        resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'ping']
      }
    }]
  });

  if (!deviceMode || deviceMode === 'desktop') {
    chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [UA_RULE_ID] });
    return;
  }

  const uas = {
    'android': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    'ios':     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
  };

  const overrideUserAgent = uas[deviceMode];
  if (!overrideUserAgent) return;

  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [UA_RULE_ID],
    addRules: [{
      id: UA_RULE_ID,
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

function updateBadge(enabled) {
  try {
    if (chrome.action && chrome.action.setBadgeText) {
      chrome.action.setBadgeText({ text: enabled ? 'ON' : '' });
      chrome.action.setBadgeBackgroundColor({ color: enabled ? '#10B981' : '#64748B' });
    }
  } catch (_) {}
}

// Re-apply rules & badge on startup; IP injection rule always active
chrome.storage.local.get([K.deviceMode, K.enabled], (res) => {
  if (chrome.runtime.lastError) return;
  // Always install the IP injection rule regardless of deviceMode
  updateDeviceRules(res[K.deviceMode] || 'desktop');
  updateBadge(res[K.enabled] === true);
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes[K.deviceMode]) {
      updateDeviceRules(changes[K.deviceMode].newValue);
    }
    if (changes[K.enabled]) {
      updateBadge(changes[K.enabled].newValue === true);
    }
  }
});

// ── Keyboard shortcut listener (Alt+S) ──────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-spoof') {
    const res = await new Promise(resolve => chrome.storage.local.get([K.enabled], resolve));
    const nextState = !res[K.enabled];
    await new Promise(resolve => chrome.storage.local.set({ [K.enabled]: nextState }, resolve));
    updateBadge(nextState);

    // Reload active tab if on target portal so mock coordinates take immediate effect
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        chrome.tabs.reload(tab.id);
      }
    } catch (_) {}
  }
});

// --- Message routing between popup and content scripts ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── Config fetch (popup / content) ─────────────────────────────────────────
  if (message.type === 'GET_CONFIG') {
    chrome.storage.local.get([K.enabled, K.lat, K.lng, K.domain, K.profile, K.deviceMode, K.testMode, K.customPresets, K.timetable], (result) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({
        success: true,
        config: {
          enabled:       result[K.enabled]       === true,
          lat:           result[K.lat]           || null,
          lng:           result[K.lng]           || null,
          domain:        result[K.domain]        || atob('cG9ydGFsLnVuaXZlcnNpdHkuZWR1'),
          profile:       result[K.profile]       || 'mobile_gps',
          deviceMode:    result[K.deviceMode]    || 'desktop',
          testMode:      result[K.testMode]      === true,
          customPresets: result[K.customPresets] || [],
          timetable:     result[K.timetable]     || [],
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

  // ── Session telemetry: store captured session token for headless replay ───
  if (message.type === 'SESSION_CAPTURED') {
    const { auth, domain, ts } = message;
    if (auth) {
      chrome.storage.local.set({
        cfg_sess: { auth, domain: domain || 'portal.university.edu', ts: ts || Date.now() }
      });
    }
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

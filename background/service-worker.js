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
};


// --- Extension initialization ---
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    const defaults = {};
    defaults[K.enabled] = false;
    defaults[K.lat]     = '-7.2852792';
    defaults[K.lng]     = '112.7952975';
    defaults[K.domain]  = atob('bWlhLml0cy5hYy5pZA==');
    defaults[K.profile] = 'mobile_gps';
    defaults[K.vpnLock] = true;
    defaults[K.deviceMode] = 'desktop';
    chrome.storage.local.set(defaults);
  }
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


  if (message.type === 'GET_CONFIG') {
    chrome.storage.local.get([K.enabled, K.lat, K.lng, K.domain, K.profile, K.deviceMode], (result) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({
        success: true,
        config: {
          enabled: result[K.enabled] === true,
          lat:     result[K.lat]     || null,
          lng:     result[K.lng]     || null,
          domain:  result[K.domain]  || atob('bWlhLml0cy5hYy5pZA=='),
          profile: result[K.profile] || 'mobile_gps',
          deviceMode: result[K.deviceMode] || 'desktop',
        }
      });
    });
    return true;
  }


  return false;
});

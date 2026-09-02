/**
 * storage-bridge.js — Runs in ISOLATED world at document_start
 *
 * Bridges chrome.storage → MAIN world content script via CustomEvents.
 * Uses obfuscated storage keys and per-install randomized bridge event names.
 */

'use strict';

// ── Obfuscated key map (must mirror service-worker.js K object) ─────────────
const K = {
  enabled: 'cfg_e',
  lat:     'cfg_a',
  lng:     'cfg_o',
  domain:  'cfg_d',
  profile: 'cfg_ap',
  log:     'cfg_sl',
  vpnLock: 'cfg_vl',
  deviceMode: 'cfg_dm',
};

const ALL_KEYS = [K.enabled, K.lat, K.lng, K.domain, K.profile, K.vpnLock, K.deviceMode];

/**
 * Builds the normalized config object from raw chrome.storage payload.
 * @param {Object} result - Raw chrome.storage payload
 * @returns {Object}
 */
function buildConfig(result) {
  return {
    enabled: result[K.enabled] === true,
    lat:     result[K.lat]     || null,
    lng:     result[K.lng]     || null,
    targetDomain: result[K.domain]  || atob('bWlhLml0cy5hYy5pZA=='),
    profile:      result[K.profile] || 'mobile_gps',
    deviceMode:   result[K.deviceMode] || 'desktop',
  };
}

/**
 * Dispatches the configuration to the MAIN world scripts via a per-install
 * bridge event name derived from the stored token.
 * @param {Object} config
 * @param {string} token
 */
function dispatchConfigToMainWorld(config, token) {
  const evtName = '__gps_sync_res_' + token;
  window.dispatchEvent(new CustomEvent(evtName, { detail: JSON.stringify(config) }));
}


// --- Handshake: respond to MAIN world request --
// Listen in the capture phase to intercept the request before the page sees it.
window.addEventListener('__gps_sync_req', (e) => {
  e.stopImmediatePropagation();
  const token = (typeof e.detail === 'string') ? e.detail : 'fallback';
  
  chrome.storage.local.get(ALL_KEYS, (result) => {
    if (chrome.runtime.lastError) return;
    dispatchConfigToMainWorld(buildConfig(result), token);
  });
}, true); // true = capture phase

// --- Live updates: re-dispatch when relevant storage keys change ---
// We cannot broadcast live updates without a token request from the page.
// However, the page can re-request config anytime, or we can broadcast on a known
// live-update channel. But to maintain security, we only reply to requests.
// Actually, to support live updates securely, we need to know the active token.
// A simpler secure way: we just save the last seen token and broadcast to it!
let lastKnownToken = 'fallback';
window.addEventListener('__gps_sync_req', (e) => {
  if (typeof e.detail === 'string') lastKnownToken = e.detail;
}, true);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const relevant = [K.enabled, K.lat, K.lng, K.domain, K.profile, K.deviceMode];
  if (relevant.some(k => changes[k])) {
    chrome.storage.local.get(ALL_KEYS, (result) => {
      dispatchConfigToMainWorld(buildConfig(result), lastKnownToken);
    });
  }
});

/**
 * storage-bridge.js — Runs in ISOLATED world at document_start
 *
 * Bridges chrome.storage → MAIN world content script via CustomEvents.
 * Uses obfuscated storage keys and per-install randomized bridge event names.
 */

(function () {
  'use strict';

  // Fast bail-out on private internal infrastructure IPs (e.g. Proxmox, router, NAS)
  const host = window.location.hostname;
  if (/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(host)) {
    return;
  }

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
    testMode: 'cfg_tm',
  };

  const ALL_KEYS = [K.enabled, K.lat, K.lng, K.domain, K.profile, K.vpnLock, K.deviceMode, K.testMode];

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
      targetDomain: result[K.domain]  || atob('cG9ydGFsLnVuaXZlcnNpdHkuZWR1'),
      profile:      result[K.profile] || 'mobile_gps',
      deviceMode:   result[K.deviceMode] || 'desktop',
      testMode:     result[K.testMode] === true,
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

  /**
   * Safely checks if the extension context is still active.
   * When an extension is reloaded or updated, orphaned content scripts in pre-existing
   * tabs lose their context. Calling chrome.storage throws 'Extension context invalidated'.
   */
  function isContextValid() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  // --- Handshake & Live updates ---
  let lastKnownToken = 'fallback';

  // Listen in the capture phase to intercept the request before the page sees it.
  function handleSyncReq(e) {
    try {
      e.stopImmediatePropagation();
    } catch (_) {}

    if (!isContextValid()) {
      try { window.removeEventListener('__gps_sync_req', handleSyncReq, true); } catch (_) {}
      return;
    }

    const token = (typeof e.detail === 'string') ? e.detail : 'fallback';
    lastKnownToken = token;
    
    try {
      chrome.storage.local.get(ALL_KEYS, (result) => {
        try {
          if (!isContextValid()) return;
          dispatchConfigToMainWorld(buildConfig(result || {}), token);
        } catch (_) {}
      });
    } catch (_) {
      // Silently clean up and detach if extension was reloaded in chrome://extensions
      try { window.removeEventListener('__gps_sync_req', handleSyncReq, true); } catch (_) {}
    }
  }

  // --- Telemetry Bridge (MAIN world -> Service Worker) ---
  function handleTelemetry(e) {
    try {
      e.stopImmediatePropagation();
    } catch (_) {}

    if (!isContextValid()) {
      try { window.removeEventListener('__gps_telemetry_msg', handleTelemetry, true); } catch (_) {}
      return;
    }

    try {
      const data = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      if (data && (data.type === 'PRESENSI_SUBMIT' || data.type === 'PRESENSI_RESULT')) {
        chrome.runtime.sendMessage(data, () => {
          void chrome.runtime.lastError;
        });
      }
    } catch (_) {}
  }

  try {
    window.addEventListener('__gps_sync_req', handleSyncReq, true);
    window.addEventListener('__gps_telemetry_msg', handleTelemetry, true);
  } catch (_) {}

  try {
    if (isContextValid() && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        try {
          if (area !== 'local' || !isContextValid()) return;
          const relevant = [K.enabled, K.lat, K.lng, K.domain, K.profile, K.deviceMode, K.testMode];
          if (relevant.some(k => Boolean(changes && changes[k]))) {
            chrome.storage.local.get(ALL_KEYS, (result) => {
              try {
                if (!isContextValid()) return;
                dispatchConfigToMainWorld(buildConfig(result || {}), lastKnownToken);
              } catch (_) {}
            });
          }
        } catch (_) {}
      });
    }
  } catch (_) {}

})();

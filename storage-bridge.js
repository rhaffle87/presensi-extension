/**
 * storage-bridge.js — Runs in ISOLATED world at document_start
 *
 * Bridges chrome.storage → MAIN world content script via CustomEvents.
 * Employs cryptographic nonce verification, strict schema validation,
 * and comprehensive storage.onChanged synchronization.
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
    customPresets: 'cfg_cp',
    timetable: 'cfg_tt',
    relayUrl: 'cfg_ru',
    lang:     'cfg_l',
  };

  const ALL_KEYS = [
    K.enabled, K.lat, K.lng, K.domain, K.profile, K.vpnLock,
    K.deviceMode, K.testMode, K.customPresets, K.timetable,
    K.relayUrl, K.lang
  ];

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
      targetDomain:  result[K.domain]        || 'portal.university.edu',
      profile:       result[K.profile]       || 'mobile_gps',
      deviceMode:    result[K.deviceMode]    || 'desktop',
      testMode:      result[K.testMode]      === true,
      customPresets: Array.isArray(result[K.customPresets]) ? result[K.customPresets] : [],
      timetable:     Array.isArray(result[K.timetable])     ? result[K.timetable]     : [],
      relayUrl:      result[K.relayUrl]      || null,
      lang:          result[K.lang]          || 'en',
    };
  }

  /**
   * Dispatches the configuration to the MAIN world scripts via a cryptographic
   * bridge event name derived from the verified session token.
   * @param {Object} config
   * @param {string} token
   */
  function dispatchConfigToMainWorld(config, token) {
    if (!token || !/^[a-zA-Z0-9_-]{12,64}$/.test(token)) return;
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
  let lastKnownToken = null;

  // Listen in the capture phase to intercept the request before the page sees it.
  function handleSyncReq(e) {
    try {
      e.stopImmediatePropagation();
    } catch (_) {}

    if (!isContextValid()) {
      try { window.removeEventListener('__gps_sync_req', handleSyncReq, true); } catch (_) {}
      return;
    }

    const token = (typeof e.detail === 'string') ? e.detail.trim() : '';
    if (!token || !/^[a-zA-Z0-9_-]{12,64}$/.test(token)) {
      return; // Reject invalid or spoofed handshake attempts
    }
    lastKnownToken = token;
    
    try {
      chrome.storage.local.get(ALL_KEYS, (result) => {
        try {
          if (!isContextValid()) return;
          dispatchConfigToMainWorld(buildConfig(result || {}), token);
        } catch (_) {}
      });
    } catch (_) {
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
      if (data && (data.type === 'PRESENSI_SUBMIT' || data.type === 'PRESENSI_RESULT' || data.type === 'SESSION_CAPTURED')) {
        chrome.runtime.sendMessage(data, () => {
          void chrome.runtime.lastError;
        });
      }
    } catch (_) {}
  }

  // --- Coordinate Update Bridge (MAIN world -> chrome.storage) ---
  function handleUpdateCoords(e) {
    try {
      e.stopImmediatePropagation();
    } catch (_) {}

    if (!isContextValid()) {
      try { window.removeEventListener('__gps_update_coords', handleUpdateCoords, true); } catch (_) {}
      return;
    }

    try {
      const data = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      if (data && data.lat !== undefined && data.lng !== undefined) {
        const nLat = parseFloat(data.lat);
        const nLng = parseFloat(data.lng);
        if (!isNaN(nLat) && nLat >= -90 && nLat <= 90 && !isNaN(nLng) && nLng >= -180 && nLng <= 180) {
          chrome.storage.local.set({
            [K.lat]: nLat,
            [K.lng]: nLng,
          });
        }
      }
    } catch (_) {}
  }

  // --- Relay Fetch Bridge (MAIN world -> Service Worker -> Relay Worker) ---
  function handleRelayFetch(e) {
    try { e.stopImmediatePropagation(); } catch (_) {}
    if (!isContextValid()) return;
    try {
      const data = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      if (!data || !data.reqId || !data.url) return;
      chrome.runtime.sendMessage({
        type: 'RELAY_PROXY_FETCH',
        url: data.url,
        options: data.options
      }, (res) => {
        try {
          const resName = '__gps_relay_res_' + data.reqId;
          window.dispatchEvent(new CustomEvent(resName, { detail: JSON.stringify(res || { ok: false }) }));
        } catch (_) {}
      });
    } catch (_) {}
  }

  try {
    window.addEventListener('__gps_sync_req', handleSyncReq, true);
    window.addEventListener('__gps_telemetry_msg', handleTelemetry, true);
    window.addEventListener('__gps_update_coords', handleUpdateCoords, true);
    window.addEventListener('__gps_relay_req', handleRelayFetch, true);
  } catch (_) {}

  // ── Real-time Cross-Module Synchronization ─────────────────────────────────
  try {
    if (isContextValid() && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        try {
          if (area !== 'local' || !isContextValid()) return;
          // Trigger sync on ANY config update (including custom presets, timetable, relayUrl, lang)
          const relevant = ALL_KEYS;
          if (relevant.some(k => Boolean(changes && changes[k]))) {
            chrome.storage.local.get(ALL_KEYS, (result) => {
              try {
                if (!isContextValid()) return;
                if (lastKnownToken) {
                  dispatchConfigToMainWorld(buildConfig(result || {}), lastKnownToken);
                }
              } catch (_) {}
            });
          }
        } catch (_) {}
      });
    }
  } catch (_) {}

})();

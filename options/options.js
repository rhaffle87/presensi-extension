'use strict';

// ── Obfuscated key map (mirrors service-worker.js K) ──────────────────
const K = {
  enabled: 'cfg_e',
  lat:     'cfg_a',
  lng:     'cfg_o',
  domain:  'cfg_d',
  theme:   'cfg_t',
  profile: 'cfg_ap',
  vpnLock: 'cfg_vl',
  log:     'cfg_sl',
  deviceMode: 'cfg_dm',
};

const optLat      = document.getElementById('optLat');
const optLng      = document.getElementById('optLng');
const optTheme    = document.getElementById('optTheme');
const optDomain   = document.getElementById('optDomain');
const optDevice   = document.getElementById('optDevice');
const saveBtn     = document.getElementById('saveOptions');
const saveStatus  = document.getElementById('saveStatus');
const manageLink  = document.getElementById('manageLink');

// Set dynamic Chrome extension link
if (manageLink && chrome.runtime.id) {
  manageLink.addEventListener('click', (e) => {
    e.preventDefault();
    // chrome://extensions is Chromium-only. Firefox uses about:addons.
    // chrome.runtime.openOptionsPage and chrome.tabs.create work on both.
    if (typeof __extIsFirefox !== 'undefined' && __extIsFirefox) {
      chrome.tabs.create({ url: 'about:addons' });
    } else {
      chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
    }
  });
}

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      resolve(result);
    });
  });
}

function storageSet(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      resolve();
    });
  });
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Loads saved configuration from storage and initializes the UI.
 */
async function loadOptions() {
  const r = await storageGet([K.lat, K.lng, K.theme, K.domain, K.profile, K.vpnLock, K.deviceMode]);
  if (r[K.lat])    optLat.value = r[K.lat];
  if (r[K.lng])    optLng.value = r[K.lng];
  if (optDomain && r[K.domain]) optDomain.value = r[K.domain];
  if (optVpnLock)  optVpnLock.checked = r[K.vpnLock] !== false;
  if (optDevice)   optDevice.value = r[K.deviceMode] || 'desktop';

  const theme = r[K.theme] || 'system';
  setTheme(theme);
  optTheme.value = theme;

  // Render submission log if the log section exists
  renderSubmissionLog();
}

/**
 * Renders the stored submission log entries into the #logList element.
 * Each entry: { ts, lat, lng, profile }
 */
async function renderSubmissionLog() {
  const logList = document.getElementById('logList');
  if (!logList) return;

  const r   = await storageGet([K.log]);
  const log = Array.isArray(r[K.log]) ? r[K.log] : [];

  if (!log.length) {
    logList.textContent = 'No submissions recorded yet.';
    return;
  }

  logList.textContent = '';
  log.forEach((entry) => {
    const row = document.createElement('div');
    row.style.cssText = 'padding:6px 0; border-bottom:1px solid var(--border); font-size:12px; font-family:monospace;';

    const date = new Date(entry.ts).toLocaleString();
    const lat  = parseFloat(entry.lat).toFixed(6);
    const lng  = parseFloat(entry.lng).toFixed(6);
    const prof = entry.profile || 'mobile_gps';

    row.textContent = `${date}  |  ${lat}, ${lng}  |  ${prof}`;
    logList.appendChild(row);
  });
}

function isValidCoord(val) {
  if (!val || String(val).trim() === '') return false;
  const n = Number(val);
  return !isNaN(n);
}

saveBtn.addEventListener('click', async () => {
  const lat    = optLat.value.trim();
  const lng    = optLng.value.trim();
  const domain = optDomain.value.trim();
  const theme  = optTheme.value;

  if (lat && !isValidCoord(lat)) {
    alert('Invalid default latitude');
    optLat.focus();
    return;
  }
  if (lng && !isValidCoord(lng)) {
    alert('Invalid default longitude');
    optLng.focus();
    return;
  }

  const data = {
    [K.lat]: lat,
    [K.lng]: lng,
    [K.theme]: theme,
    [K.domain]: domain,
    [K.vpnLock]: optVpnLock.checked,
    [K.deviceMode]: optDevice.value
  };

  await storageSet(data);
  setTheme(theme);

  saveStatus.classList.add('show');
  setTimeout(() => saveStatus.classList.remove('show'), 2000);
});

optTheme.addEventListener('change', async () => {
  const theme = optTheme.value;
  document.documentElement.setAttribute('data-theme', theme);
  const data = {};
  data[K.theme] = theme;
  await storageSet(data);
});

// Smooth scroll for nav links
document.querySelectorAll('nav a').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    document.querySelector(this.getAttribute('href')).scrollIntoView({ behavior: 'smooth' });
  });
});

// Clear submission log
const clearLogBtn = document.getElementById('clearLogBtn');
if (clearLogBtn) {
  clearLogBtn.addEventListener('click', async () => {
    const data = {};
    data[K.log] = [];
    await storageSet(data);
    renderSubmissionLog();
  });
}

document.addEventListener('DOMContentLoaded', loadOptions);

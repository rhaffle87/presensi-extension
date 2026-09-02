'use strict';

// ── Elements ────────────────────────────────────────
const enableToggle   = document.getElementById('enableToggle');
const statusDot      = document.getElementById('statusDot');
const statusText     = document.getElementById('statusText');
const latInput       = document.getElementById('latInput');
const lngInput       = document.getElementById('lngInput');
const saveBtn        = document.getElementById('saveBtn');
const mapContainer   = document.getElementById('map');
const toast          = document.getElementById('toast');
const toastText      = document.getElementById('toastText');
const presetBtns     = document.querySelectorAll('.preset-btn:not(#preset-myloc)');
const myLocBtn       = document.getElementById('preset-myloc');
const themeSelect    = document.getElementById('themeSelect');
const optionsBtn     = document.getElementById('optionsBtn');

// ── Campus presets (ITS Sukolilo) ─────────────────────────────────────
const PRESETS = {
  'preset-tower2': { lat: -7.2852792,            lng: 112.7952975,       label: 'Tower 2' },
  'preset-tower1': { lat: -7.2849915,            lng: 112.793897,        label: 'Tower 1' },
  'preset-koridc': { lat: -7.284793988582386,    lng: 112.79570676550246, label: 'Koridor C' },
};

// ── Obfuscated storage key map (mirrors service-worker.js K) ───────────
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

// ── Velocity / Impossible Travel Limiter ───────────────────────────────
/**
 * Computes the great-circle distance between two geographic coordinates (km).
 * Uses the Haversine formula, which is accurate to within ~0.3% for typical distances.
 *
 * @param {number} lat1 - Source latitude in degrees
 * @param {number} lng1 - Source longitude in degrees
 * @param {number} lat2 - Destination latitude in degrees
 * @param {number} lng2 - Destination longitude in degrees
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R    = 6371; // Earth's mean radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Checks if switching from the last saved location to the proposed new coordinates
 * would imply an unrealistic travel velocity (> 100 km/h).
 * If a violation is detected, shows a warning toast and returns true.
 *
 * @param {string|number} newLat - Proposed latitude
 * @param {string|number} newLng - Proposed longitude
 * @returns {Promise<boolean>} True if the velocity would trigger a backend flag
 */
async function checkVelocityWarning(newLat, newLng) {
  const r = await storageGet([K.prevLat, K.prevLng, K.prevTs]);
  const prevLat = parseFloat(r[K.prevLat]);
  const prevLng = parseFloat(r[K.prevLng]);
  const prevTs  = r[K.prevTs];

  if (!prevLat || !prevLng || !prevTs) return false;

  const elapsedHours = (Date.now() - prevTs) / (1000 * 60 * 60);
  const distKm = haversineDistance(prevLat, prevLng, parseFloat(newLat), parseFloat(newLng));

  if (elapsedHours <= 0) return false;
  const velocityKmh = distKm / elapsedHours;

  if (velocityKmh > 100) {
    const minutesNeeded = Math.ceil((distKm / 100) * 60);
    showToast(`Velocity warning: ${distKm.toFixed(1)} km in ${Math.round(elapsedHours * 60)}m. Wait ~${minutesNeeded}m to avoid flag.`, true);
    return true;
  }
  return false;
}

/**
 * Applies a small Gaussian random jitter (~5m radius) to a coordinate.
 * Used to randomize stored baseline on save to defeat zero-variance analytics.
 * @param {number} deg - Coordinate in decimal degrees
 * @returns {number} Jittered coordinate
 */
function gaussianJitter(deg) {
  // Box-Muller transform: sigma = 0.000045 deg ≈ 5m at equator
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  return deg + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 0.000045;
}

/**
 * Checks the user's public IP geolocation.
 * If vpnLock is true, enforces that the ISP matches ITS.
 * Uses ip-api.com (free, no key).
 */
async function checkIpOnEnable() {
  try {
    const res  = await fetch('https://ip-api.com/json/?fields=city,regionName,countryCode,isp,org');
    if (!res.ok) return;
    const data = await res.json();
    const city = data.city || '?';
    const region = data.regionName || '?';
    const isp = data.isp || '';
    const org = data.org || '';
    
    const r = await storageGet([K.vpnLock]);
    const isStrict = r[K.vpnLock] !== false; // default true
    
    // Check if connected to ITS network
    const isItsNetwork = isp.toLowerCase().includes('institut teknologi sepuluh nopember') || 
                         org.toLowerCase().includes('institut teknologi sepuluh nopember');
                         
    if (isStrict && !isItsNetwork) {
      // Abort spoofing!
      await storageSet({ [K.enabled]: false });
      enableToggle.checked = false;
      updateStatus(false, '', '');
      showToast('SPOOF ABORTED: Not on ITS VPN! [BLOCKED]', true, 8000);
      return;
    }

    if (isItsNetwork) {
      showToast(`IP location: ITS Network (Verified)`, false, 4000);
    } else {
      showToast(`IP location: ${city}, ${region} — use VPN if remote`, false, 6000);
    }
  } catch (_) { /* non-blocking, fail silently */ }
}

/**
 * Appends an entry to the submission log (max 20 entries).
 * @param {Object} entry - { ts, lat, lng, ipCity, profile }
 */
async function appendLog(entry) {
  const r   = await storageGet([K.log]);
  const log = Array.isArray(r[K.log]) ? r[K.log] : [];
  log.unshift(entry);          // newest first
  if (log.length > 20) log.length = 20;
  const data = {};
  data[K.log] = log;
  await storageSet(data);
}

// ── Map helpers (Leaflet) ───────────────────────────
let map = null;
let marker = null;

const customIcon = L.divIcon({
  html: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent); filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.5));"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3" fill="var(--surface)"/></svg>`,
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 28]
});

/**
 * Initializes the Leaflet map and marker.
 * Binds drag and click events to update the coordinate inputs in real-time.
 * 
 * @param {number|string} lat - Initial latitude
 * @param {number|string} lng - Initial longitude
 */
function initMap(lat, lng) {
  if (map) return; // already initialized
  map = L.map('map', { attributionControl: false }).setView([lat, lng], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  marker = L.marker([lat, lng], { draggable: true, icon: customIcon }).addTo(map);

  marker.on('drag', (e) => {
    const pos = e.target.getLatLng();
    latInput.value = pos.lat.toFixed(7);
    lngInput.value = pos.lng.toFixed(7);
  });

  marker.on('dragend', () => {
    clearActivePreset();
    detectActivePreset(latInput.value, lngInput.value);
  });

  map.on('click', (e) => {
    const pos = e.latlng;
    marker.setLatLng(pos);
    latInput.value = pos.lat.toFixed(7);
    lngInput.value = pos.lng.toFixed(7);
    clearActivePreset();
    detectActivePreset(pos.lat, pos.lng);
  });
}

function updateMap(lat, lng) {
  if (!isValidCoord(lat) || !isValidCoord(lng)) return;
  if (!map) {
    initMap(lat, lng);
    return;
  }
  const pos = [parseFloat(lat), parseFloat(lng)];
  map.setView(pos, 16);
  marker.setLatLng(pos);
}

// ── Input flash animation ────────────────────────────
function flashInputs() {
  [latInput, lngInput].forEach(el => {
    el.classList.add('updated');
    setTimeout(() => el.classList.remove('updated'), 700);
  });
}

// ── Preset selection ─────────────────────────────────
function activatePreset(id) {
  // Clear all
  presetBtns.forEach(b => b.classList.remove('active'));
  // Activate selected
  const btn = document.getElementById(id);
  if (btn) btn.classList.add('active');
}

function clearActivePreset() {
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
}

// Check if current inputs match a preset (for restoring active state on load)
function detectActivePreset(lat, lng) {
  for (const [id, p] of Object.entries(PRESETS)) {
    if (
      Math.abs(parseFloat(lat) - p.lat) < 0.000001 &&
      Math.abs(parseFloat(lng) - p.lng) < 0.000001
    ) {
      activatePreset(id);
      return;
    }
  }
  clearActivePreset();
}

// Preset button click
presetBtns.forEach(btn => {
  btn.addEventListener('click', async () => {
    const lat = btn.dataset.lat;
    const lng = btn.dataset.lng;

    // Non-blocking velocity check — warns but does not block
    await checkVelocityWarning(lat, lng);

    latInput.value = lat;
    lngInput.value = lng;

    activatePreset(btn.id);
    flashInputs();
    updateMap(lat, lng);
  });
});

// My Location button logic
myLocBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showToast('Geolocation not supported', true);
    return;
  }

  // Visual loading state
  clearActivePreset();
  myLocBtn.classList.add('active');
  const originalSublabel = myLocBtn.querySelector('.preset-sublabel').textContent;
  myLocBtn.querySelector('.preset-sublabel').textContent = 'Locating...';
  myLocBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      // Success
      const lat = pos.coords.latitude.toFixed(7);
      const lng = pos.coords.longitude.toFixed(7);
      
      latInput.value = lat;
      lngInput.value = lng;
      
      flashInputs();
      updateMap(lat, lng);
      
      // Reset button state
      myLocBtn.querySelector('.preset-sublabel').textContent = originalSublabel;
      myLocBtn.disabled = false;
    },
    (err) => {
      // Error
      myLocBtn.querySelector('.preset-sublabel').textContent = originalSublabel;
      myLocBtn.disabled = false;
      myLocBtn.classList.remove('active');
      
      let errorMsg = 'Failed to get location';
      if (err.code === 1) errorMsg = 'Location permission denied';
      else if (err.code === 2) errorMsg = 'Position unavailable';
      else if (err.code === 3) errorMsg = 'Location request timed out';
      
      showToast(errorMsg, true);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
});

// ── Manual input → map sync (Debounced) ──────────────
/**
 * Creates a debounced function that delays invoking the provided function 
 * until after `wait` milliseconds have elapsed since the last time it was invoked.
 * This is crucial for map interactions to prevent layout thrashing and excessive DOM updates.
 *
 * @param {Function} func - The function to debounce
 * @param {number} wait - The delay in milliseconds
 * @returns {Function} The debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const handleManualInput = debounce(() => {
  clearActivePreset();
  detectActivePreset(latInput.value, lngInput.value);
  updateMap(latInput.value, lngInput.value);
}, 250);

latInput.addEventListener('input', handleManualInput);
lngInput.addEventListener('input', handleManualInput);



// ── Storage helpers (async/await) ────────────────────
function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        // Silently ignore storage errors to maintain stealth profile
        resolve({});
        return;
      }
      resolve(result);
    });
  });
}

function storageSet(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

// ── Load saved settings ──────────────────────────────
async function loadSettings() {
  const r = await storageGet([K.enabled, K.lat, K.lng, K.theme, K.profile]);

  const enabled  = r[K.enabled] === true;
  const lat      = r[K.lat]     || '';
  const lng      = r[K.lng]     || '';
  const theme    = r[K.theme]   || 'system';
  const profile  = r[K.profile] || 'mobile_gps';

  document.documentElement.setAttribute('data-theme', theme);
  themeSelect.value    = theme;
  enableToggle.checked = enabled;
  latInput.value       = lat;
  lngInput.value       = lng;

  // Sync accuracy profile selector if it exists
  const profileSelect = document.getElementById('profileSelect');
  if (profileSelect) profileSelect.value = profile;

  updateStatus(enabled, lat, lng);
  detectActivePreset(lat, lng);

  if (isValidCoord(lat) && isValidCoord(lng)) {
    updateMap(lat, lng);
  }
}

document.addEventListener('DOMContentLoaded', loadSettings);

// ── Toggle ───────────────────────────────────────────
enableToggle.addEventListener('change', async () => {
  const enabled = enableToggle.checked;
  const lat = latInput.value.trim();
  const lng = lngInput.value.trim();

  if (enabled && (!isValidCoord(lat) || !isValidCoord(lng))) {
    showToast('Enter valid coordinates first', true);
    enableToggle.checked = false;
    return;
  }

  try {
    const data = {};
    data[K.enabled] = enabled;
    await storageSet(data);
    updateStatus(enabled, lat, lng);
    showToast(enabled ? 'Spoof activated' : 'Spoof disabled');
    // Non-blocking IP check warning when enabling
    if (enabled) checkIpOnEnable();
  } catch (err) {
    showToast(err.message, true);
    enableToggle.checked = !enabled;
  }
});

// ── Save button ──────────────────────────────────────
saveBtn.addEventListener('click', async () => {
  const lat      = latInput.value.trim();
  const lng      = lngInput.value.trim();
  const enabled  = enableToggle.checked;

  if (!isValidCoord(lat)) {
    showToast('Invalid latitude', true);
    latInput.focus();
    return;
  }
  if (!isValidCoord(lng)) {
    showToast('Invalid longitude', true);
    lngInput.focus();
    return;
  }

  // Check for impossible travel
  await checkVelocityWarning(lat, lng);

  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving...';

  // Read current profile
  const pRes    = await storageGet([K.profile]);
  const profile = pRes[K.profile] || 'mobile_gps';

  // Gaussian jitter on the stored baseline (~5m offset) so stored value never
  // exactly matches the preset coordinate, defeating zero-variance analytics.
  const jLat = gaussianJitter(parseFloat(lat));
  const jLng = gaussianJitter(parseFloat(lng));

  try {
    const data = {};
    data[K.enabled] = enabled;
    data[K.lat]     = lat;
    data[K.lng]     = lng;
    data[K.prevLat] = String(jLat);
    data[K.prevLng] = String(jLng);
    data[K.prevTs]  = Date.now();
    await storageSet(data);

    updateStatus(enabled, lat, lng);
    updateMap(lat, lng);
    showToast(enabled ? 'Spoof activated' : 'Coordinates updated');

    // Append to submission log (non-blocking)
    appendLog({ ts: Date.now(), lat, lng, profile }).catch(() => {});

    // Non-blocking IP check warning when enabling
    if (enabled) checkIpOnEnable();
  } catch (err) {
    showToast('Error: ' + err.message, true);
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Apply Changes';
  }
});

// ── Theme & Options ──────────────────────────────────
themeSelect.addEventListener('change', async () => {
  const theme = themeSelect.value;
  document.documentElement.setAttribute('data-theme', theme);
  const data = {};
  data[K.theme] = theme;
  await storageSet(data);
});

// ── Accuracy Profile Quick-Switch ─────────────────────
const profileSelect = document.getElementById('profileSelect');
if (profileSelect) {
  profileSelect.addEventListener('change', async () => {
    const data = {};
    data[K.profile] = profileSelect.value;
    await storageSet(data);
  });
}

// ── Kill Switch: Alt+Shift+X ──────────────────────────
// Silently wipes all chrome.storage, regenerates a fresh bridge token, and resets to defaults.
document.addEventListener('keydown', async (e) => {
  if (e.altKey && e.shiftKey && e.key === 'X') {
    e.preventDefault();
    await new Promise(resolve => chrome.storage.local.clear(resolve));
    // Re-init defaults so extension stays functional
    const defaults = {};
    defaults[K.enabled] = false;
    defaults[K.lat]     = '-7.2852792';
    defaults[K.lng]     = '112.7952975';
    defaults[K.theme]   = themeSelect.value || 'system';
    defaults[K.profile] = 'mobile_gps';
    defaults[K.vpnLock] = true;
    await storageSet(defaults);
    // Reset UI
    enableToggle.checked = false;
    latInput.value       = '-7.2852792';
    lngInput.value       = '112.7952975';
    updateStatus(false, '', '');
    showToast('All data cleared', false);
  }
});

optionsBtn.addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options/options.html'));
  }
});

// ── Helpers ──────────────────────────────────────────
function isValidCoord(val) {
  if (!val || String(val).trim() === '') return false;
  const n = parseFloat(val);
  return !isNaN(n) && isFinite(n);
}

function updateStatus(enabled, lat, lng) {
  if (enabled && isValidCoord(lat) && isValidCoord(lng)) {
    statusDot.className = 'status-dot active';
    statusText.textContent = `Active • ${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`;
    statusText.className = 'status-text active';
  } else {
    statusDot.classList.remove('active');
    statusText.textContent = enabled ? 'Active (no coords set)' : 'Inactive';
    statusText.className   = 'status-text inactive';
  }
}

let toastTimer = null;
/**
 * Displays a non-blocking toast notification.
 * Safe DOM manipulation methods (createElementNS/createTextNode) are strictly used 
 * instead of innerHTML to mitigate any Cross-Site Scripting (XSS) risks.
 *
 * @param {string} msg - The message to display
 * @param {boolean} isError - If true, displays as an error alert
 * @param {number} duration - Time in ms to show toast
 */
function showToast(msg, isError = false, duration = 2800) {
  // Use safe DOM manipulation to prevent XSS
  toastText.textContent = ''; // clear existing content
  
  if (isError) {
    toastText.textContent = msg;
  } else {
    // Inject the SVG safely using DOM methods
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "3");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    
    const polyline = document.createElementNS(svgNS, "polyline");
    polyline.setAttribute("points", "20 6 9 17 4 12");
    svg.appendChild(polyline);
    
    toastText.appendChild(svg);
    const textNode = document.createTextNode(' ' + msg);
    toastText.appendChild(textNode);
  }

  toast.className   = 'toast' + (isError ? ' error' : '');
  void toast.offsetWidth;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

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
  testMode: 'cfg_tm',
  customPresets: 'cfg_cp',
  timetable: 'cfg_tt',
};

const optLat      = document.getElementById('optLat');
const optLng      = document.getElementById('optLng');
const optTheme    = document.getElementById('optTheme');
const optDomain   = document.getElementById('optDomain');
const optDevice   = document.getElementById('optDevice');
const optVpnLock  = document.getElementById('optVpnLock');
const optTestMode = document.getElementById('optTestMode');
const saveBtn     = document.getElementById('saveOptions');
const saveStatus  = document.getElementById('saveStatus');
const manageLink  = document.getElementById('manageLink');

// Set dynamic Chrome extension link
if (manageLink && chrome.runtime.id) {
  manageLink.addEventListener('click', (e) => {
    e.preventDefault();
    // chrome://extensions is Chromium-only. Firefox uses about:addons.
    // chrome.runtime.openOptionsPage and chrome.tabs.create work on both.
    if (typeof globalThis !== 'undefined' && globalThis.__extIsFirefox) {
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
  const r = await storageGet([K.lat, K.lng, K.theme, K.domain, K.profile, K.vpnLock, K.deviceMode, K.testMode]);
  if (r[K.lat])    optLat.value = r[K.lat];
  if (r[K.lng])    optLng.value = r[K.lng];
  if (optDomain && r[K.domain]) optDomain.value = r[K.domain];
  if (optVpnLock)  optVpnLock.checked = r[K.vpnLock] !== false;
  if (optTestMode) optTestMode.checked = r[K.testMode] === true;
  if (optDevice)   optDevice.value = r[K.deviceMode] || 'desktop';

  const theme = r[K.theme] || 'system';
  setTheme(theme);
  optTheme.value = theme;

  // Render submission log if the log section exists
  renderSubmissionLog();

  // Render custom facility presets
  renderCustomPresets();

  // Render weekly academic timetable
  renderTimetable();
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
    row.style.cssText = 'padding:6px 0; border-bottom:1px solid var(--border); font-size:12px; font-family:monospace; display:flex; gap:8px; align-items:center;';

    const date   = new Date(entry.ts).toLocaleString();
    const lat    = entry.lat   ? parseFloat(entry.lat).toFixed(6)  : 'n/a';
    const lng    = entry.lng   ? parseFloat(entry.lng).toFixed(6)  : 'n/a';
    const prof   = entry.profile || 'mobile_gps';
    const status = entry.status || 'pending';
    const emoji  = status === 'accepted' ? '\u2705' : status === 'rejected' ? '\u274c' : '\u23f3';

    const badge = document.createElement('span');
    badge.textContent = emoji;
    badge.style.cssText = 'flex-shrink:0; font-size:14px;';
    row.appendChild(badge);

    const text = document.createElement('span');
    text.textContent = `${date}  |  ${lat}, ${lng}  |  ${prof}`;
    row.appendChild(text);

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
    [K.vpnLock]: optVpnLock ? optVpnLock.checked : true,
    [K.deviceMode]: optDevice ? optDevice.value : 'desktop',
    [K.testMode]: optTestMode ? optTestMode.checked : false,
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

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

const exportCsvBtn = document.getElementById('exportCsvBtn');
if (exportCsvBtn) {
  exportCsvBtn.addEventListener('click', async () => {
    const r = await storageGet([K.log]);
    const log = Array.isArray(r[K.log]) ? r[K.log] : [];
    if (!log.length) return alert('No submission log records to export.');

    const headers = ['Timestamp', 'ISO_Date', 'Status', 'Latitude', 'Longitude', 'Profile'];
    const rows = log.map(entry => [
      entry.ts || '',
      entry.ts ? new Date(entry.ts).toISOString() : '',
      `"${(entry.status || 'pending').replace(/"/g, '""')}"`,
      entry.lat != null ? entry.lat : '',
      entry.lng != null ? entry.lng : '',
      `"${(entry.profile || 'mobile_gps').replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadFile(csvContent, `presensi-log-${dateStr}.csv`, 'text/csv;charset=utf-8;');
  });
}

const exportJsonBtn = document.getElementById('exportJsonBtn');
if (exportJsonBtn) {
  exportJsonBtn.addEventListener('click', async () => {
    const r = await storageGet([K.log]);
    const log = Array.isArray(r[K.log]) ? r[K.log] : [];
    if (!log.length) return alert('No submission log records to export.');
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadFile(JSON.stringify(log, null, 2), `presensi-log-${dateStr}.json`, 'application/json');
  });
}

// VPN Lock toggle — show/hide warning callout in real-time
if (optVpnLock) {
  const vpnWarning = document.getElementById('vpnLockWarning');
  function _updateVpnWarning() {
    if (vpnWarning) {
      vpnWarning.style.display = optVpnLock.checked ? 'none' : 'block';
    }
  }
  optVpnLock.addEventListener('change', _updateVpnWarning);
  // Run once on load after optVpnLock value is set
  document.addEventListener('DOMContentLoaded', () => setTimeout(_updateVpnWarning, 50));
}

// ── Custom Facility Presets Manager ──────────────────────────────────────────
async function renderCustomPresets() {
  const container = document.getElementById('customPresetsList');
  if (!container) return;
  const res = await storageGet([K.customPresets]);
  const presets = Array.isArray(res[K.customPresets]) ? res[K.customPresets] : [];

  container.innerHTML = '';
  if (presets.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = 'var(--text-muted)';
    empty.style.fontSize = '12px';
    empty.textContent = 'No custom presets added yet.';
    container.appendChild(empty);
    return;
  }

  presets.forEach((p, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '8px 12px';
    row.style.background = 'var(--border)';
    row.style.borderRadius = '6px';

    const info = document.createElement('div');
    info.style.display = 'flex';
    info.style.flexDirection = 'column';
    const nameEl = document.createElement('strong');
    nameEl.textContent = p.name || 'Preset';
    const detailEl = document.createElement('span');
    detailEl.style.fontSize = '11.5px';
    detailEl.style.color = 'var(--text-muted)';
    const regexText = p.regex ? ` • Match: ${p.regex}` : '';
    detailEl.textContent = `${p.lat}, ${p.lng}${regexText}`;
    info.appendChild(nameEl);
    info.appendChild(detailEl);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn';
    delBtn.style.padding = '3px 8px';
    delBtn.style.fontSize = '11px';
    delBtn.style.background = 'var(--red-bg, rgba(239, 68, 68, 0.15))';
    delBtn.style.color = 'var(--red, #EF4444)';
    delBtn.style.border = '1px solid var(--red, #EF4444)';
    delBtn.textContent = 'Delete';
    delBtn.onclick = async () => {
      presets.splice(idx, 1);
      await storageSet({ [K.customPresets]: presets });
      renderCustomPresets();
    };

    row.appendChild(info);
    row.appendChild(delBtn);
    container.appendChild(row);
  });
}

const addPresetBtn = document.getElementById('addCustomPresetBtn');
if (addPresetBtn) {
  addPresetBtn.addEventListener('click', async () => {
    const nameEl  = document.getElementById('customPresetName');
    const latEl   = document.getElementById('customPresetLat');
    const lngEl   = document.getElementById('customPresetLng');
    const regexEl = document.getElementById('customPresetRegex');

    const name  = nameEl?.value.trim();
    const lat   = latEl?.value.trim();
    const lng   = lngEl?.value.trim();
    const regex = regexEl?.value.trim();

    if (!name) return alert('Enter a facility or room name');
    const nLat = parseFloat(lat);
    const nLng = parseFloat(lng);
    if (!lat || isNaN(nLat) || nLat < -90 || nLat > 90) return alert('Enter a valid latitude between -90 and 90');
    if (!lng || isNaN(nLng) || nLng < -180 || nLng > 180) return alert('Enter a valid longitude between -180 and 180');

    const res = await storageGet([K.customPresets]);
    const presets = Array.isArray(res[K.customPresets]) ? res[K.customPresets] : [];
    presets.push({
      id: 'cp_' + Date.now(),
      name,
      lat: nLat,
      lng: nLng,
      regex: regex || null,
    });

    await storageSet({ [K.customPresets]: presets });
    if (nameEl)  nameEl.value = '';
    if (latEl)   latEl.value = '';
    if (lngEl)   lngEl.value = '';
    if (regexEl) regexEl.value = '';
    renderCustomPresets();
  });
}

// ── Weekly Academic Timetable Scheduler ──────────────────────────────────
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function renderTimetable() {
  const container = document.getElementById('timetableList');
  if (!container) return;
  const res = await storageGet([K.timetable]);
  const timetable = Array.isArray(res[K.timetable]) ? res[K.timetable] : [];

  container.innerHTML = '';
  if (timetable.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = 'var(--text-muted)';
    empty.style.fontSize = '12px';
    empty.textContent = 'No timetable slots scheduled yet.';
    container.appendChild(empty);
    return;
  }

  timetable.forEach((slot, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '8px 12px';
    row.style.background = 'var(--border)';
    row.style.borderRadius = '6px';

    const info = document.createElement('div');
    info.style.display = 'flex';
    info.style.flexDirection = 'column';
    const dayName = DAY_NAMES[slot.day] || 'Day ' + slot.day;
    const titleEl = document.createElement('strong');
    titleEl.textContent = `${dayName} (${slot.start} - ${slot.end}) • ${slot.subject || 'Class'}`;
    const coordEl = document.createElement('span');
    coordEl.style.fontSize = '11.5px';
    coordEl.style.color = 'var(--text-muted)';
    coordEl.textContent = `${slot.lat}, ${slot.lng}`;
    info.appendChild(titleEl);
    info.appendChild(coordEl);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn';
    delBtn.style.padding = '3px 8px';
    delBtn.style.fontSize = '11px';
    delBtn.style.background = 'var(--red-bg, rgba(239, 68, 68, 0.15))';
    delBtn.style.color = 'var(--red, #EF4444)';
    delBtn.style.border = '1px solid var(--red, #EF4444)';
    delBtn.textContent = 'Delete';
    delBtn.onclick = async () => {
      timetable.splice(idx, 1);
      await storageSet({ [K.timetable]: timetable });
      renderTimetable();
    };

    row.appendChild(info);
    row.appendChild(delBtn);
    container.appendChild(row);
  });
}

const addTimetableBtn = document.getElementById('addTimetableBtn');
if (addTimetableBtn) {
  addTimetableBtn.addEventListener('click', async () => {
    const dayEl     = document.getElementById('ttDay');
    const startEl   = document.getElementById('ttStart');
    const endEl     = document.getElementById('ttEnd');
    const subjectEl = document.getElementById('ttSubject');
    const latEl     = document.getElementById('ttLat');
    const lngEl     = document.getElementById('ttLng');

    const day     = parseInt(dayEl?.value, 10);
    const start   = startEl?.value.trim();
    const end     = endEl?.value.trim();
    const subject = subjectEl?.value.trim();
    const lat     = latEl?.value.trim();
    const lng     = lngEl?.value.trim();

    if (isNaN(day) || day < 0 || day > 6) return alert('Select a valid day of the week');
    if (!start || !end) return alert('Provide both start and end time');
    if (!subject) return alert('Enter a subject or class name');
    const nLat = parseFloat(lat);
    const nLng = parseFloat(lng);
    if (!lat || isNaN(nLat) || nLat < -90 || nLat > 90) return alert('Enter a valid latitude between -90 and 90');
    if (!lng || isNaN(nLng) || nLng < -180 || nLng > 180) return alert('Enter a valid longitude between -180 and 180');

    const res = await storageGet([K.timetable]);
    const timetable = Array.isArray(res[K.timetable]) ? res[K.timetable] : [];
    timetable.push({
      id: 'tt_' + Date.now(),
      day,
      start,
      end,
      subject,
      lat: nLat,
      lng: nLng,
    });

    await storageSet({ [K.timetable]: timetable });
    if (subjectEl) subjectEl.value = '';
    renderTimetable();
  });
}

// ── Backup & Restore Configuration ───────────────────────────────────────
const exportBackupBtn = document.getElementById('exportBackupBtn');
if (exportBackupBtn) {
  exportBackupBtn.addEventListener('click', async () => {
    const keysToBackup = [K.lat, K.lng, K.domain, K.theme, K.profile, K.vpnLock, K.deviceMode, K.testMode, K.customPresets, K.timetable];
    const data = await storageGet(keysToBackup);
    const backupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      config: data
    };
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadFile(JSON.stringify(backupPayload, null, 2), `presensi-backup-${dateStr}.json`, 'application/json');
    const status = document.getElementById('backupStatus');
    if (status) {
      status.style.color = 'var(--green)';
      status.textContent = '✓ Configuration backup downloaded successfully.';
    }
  });
}

const importBackupBtn = document.getElementById('importBackupBtn');
const importFileInput = document.getElementById('importFileInput');
if (importBackupBtn && importFileInput) {
  importBackupBtn.addEventListener('click', () => importFileInput.click());

  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const config = parsed.config || parsed;
        if (!config || typeof config !== 'object') {
          throw new Error('Invalid backup file structure.');
        }

        const dataToSave = {};
        if (config[K.lat]) dataToSave[K.lat] = config[K.lat];
        if (config[K.lng]) dataToSave[K.lng] = config[K.lng];
        if (config[K.domain]) dataToSave[K.domain] = config[K.domain];
        if (config[K.theme]) dataToSave[K.theme] = config[K.theme];
        if (config[K.profile]) dataToSave[K.profile] = config[K.profile];
        if (typeof config[K.vpnLock] === 'boolean') dataToSave[K.vpnLock] = config[K.vpnLock];
        if (config[K.deviceMode]) dataToSave[K.deviceMode] = config[K.deviceMode];
        if (typeof config[K.testMode] === 'boolean') dataToSave[K.testMode] = config[K.testMode];
        if (Array.isArray(config[K.customPresets])) dataToSave[K.customPresets] = config[K.customPresets];
        if (Array.isArray(config[K.timetable])) dataToSave[K.timetable] = config[K.timetable];

        await storageSet(dataToSave);
        await loadOptions();

        const status = document.getElementById('backupStatus');
        if (status) {
          status.style.color = 'var(--green)';
          status.textContent = '✓ Configuration imported successfully!';
        }
      } catch (err) {
        alert('Failed to import backup: ' + err.message);
      } finally {
        importFileInput.value = '';
      }
    };
    reader.readAsText(file);
  });
}

document.addEventListener('DOMContentLoaded', loadOptions);

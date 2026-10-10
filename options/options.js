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
    logList.innerHTML = '<div style="padding:16px; color:var(--text-muted); font-size:12px; text-align:center;">No submissions recorded yet.</div>';
    return;
  }

  logList.innerHTML = '';
  log.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'log-row';

    const date   = new Date(entry.ts).toLocaleString();
    const lat    = entry.lat   ? parseFloat(entry.lat).toFixed(6)  : 'n/a';
    const lng    = entry.lng   ? parseFloat(entry.lng).toFixed(6)  : 'n/a';
    const prof   = entry.profile || 'mobile_gps';
    const status = entry.status || 'pending';

    const left = document.createElement('div');
    left.className = 'log-row-left';

    const badge = document.createElement('span');
    if (status === 'accepted') {
      badge.className = 'badge badge-success';
      badge.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> OK';
    } else if (status === 'rejected') {
      badge.className = 'badge badge-danger';
      badge.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> FAIL';
    } else {
      badge.className = 'badge badge-warning';
      badge.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> WAIT';
    }
    left.appendChild(badge);

    const ts = document.createElement('span');
    ts.style.fontWeight = '500';
    ts.textContent = date;
    left.appendChild(ts);

    const coords = document.createElement('span');
    coords.className = 'log-coords';
    coords.textContent = `${lat}, ${lng} (${prof})`;

    row.appendChild(left);
    row.appendChild(coords);
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
    const card = document.createElement('div');
    card.className = 'item-card';

    const left = document.createElement('div');
    left.className = 'item-card-left';

    const iconBox = document.createElement('div');
    iconBox.className = 'item-card-icon';
    iconBox.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 7v14M21 7v14M6 11h2M6 15h2M16 11h2M16 15h2M10 21V11h4v10"/></svg>';
    left.appendChild(iconBox);

    const meta = document.createElement('div');
    meta.className = 'item-card-meta';

    const title = document.createElement('div');
    title.className = 'item-card-title';
    title.textContent = p.name || 'Preset';
    meta.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'item-card-subtitle';
    const coordTag = document.createElement('span');
    coordTag.className = 'item-tag';
    coordTag.textContent = `${p.lat}, ${p.lng}`;
    sub.appendChild(coordTag);

    if (p.regex) {
      const regexTag = document.createElement('span');
      regexTag.className = 'item-tag';
      regexTag.textContent = `Regex: ${p.regex}`;
      sub.appendChild(regexTag);
    }
    meta.appendChild(sub);
    left.appendChild(meta);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-danger';
    delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete';
    delBtn.onclick = async () => {
      presets.splice(idx, 1);
      await storageSet({ [K.customPresets]: presets });
      renderCustomPresets();
    };

    card.appendChild(left);
    card.appendChild(delBtn);
    container.appendChild(card);
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
    const card = document.createElement('div');
    card.className = 'item-card';

    const left = document.createElement('div');
    left.className = 'item-card-left';

    const iconBox = document.createElement('div');
    iconBox.className = 'item-card-icon';
    iconBox.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    left.appendChild(iconBox);

    const meta = document.createElement('div');
    meta.className = 'item-card-meta';

    const dayName = DAY_NAMES[slot.day] || 'Day ' + slot.day;
    const title = document.createElement('div');
    title.className = 'item-card-title';
    title.textContent = `${slot.subject || 'Class'} (${dayName})`;
    meta.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'item-card-subtitle';
    const timeTag = document.createElement('span');
    timeTag.className = 'item-tag';
    timeTag.textContent = `${slot.start} - ${slot.end}`;
    sub.appendChild(timeTag);

    const coordTag = document.createElement('span');
    coordTag.className = 'item-tag';
    coordTag.textContent = `${slot.lat}, ${slot.lng}`;
    sub.appendChild(coordTag);

    meta.appendChild(sub);
    left.appendChild(meta);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-danger';
    delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete';
    delBtn.onclick = async () => {
      timetable.splice(idx, 1);
      await storageSet({ [K.timetable]: timetable });
      renderTimetable();
    };

    card.appendChild(left);
    card.appendChild(delBtn);
    container.appendChild(card);
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
      status.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Configuration backup downloaded successfully.';
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
          status.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Configuration imported successfully!';
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

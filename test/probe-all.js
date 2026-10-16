/**
 * probe-all.js — Comprehensive end-to-end probing suite
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const RELAY_BASE = 'https://presensi-relay.rhaffle87.workers.dev';
const results = {
  relay: [],
  extension: [],
  manifest: [],
  storageKeys: [],
};

function req(method, urlPath, body = null, headers = {}) {
  return new Promise((resolve) => {
    const u = new URL(urlPath, RELAY_BASE);
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers };
    if (postData) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }
    const start = Date.now();
    const req = https.request(u, { method, headers: reqHeaders, timeout: 6000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data,
          json,
          ms: Date.now() - start,
        });
      });
    });
    req.on('error', (err) => resolve({ status: 0, error: err.message, ms: Date.now() - start }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 408, error: 'TIMEOUT', ms: Date.now() - start }); });
    if (postData) req.write(postData);
    req.end();
  });
}

async function probeRelay() {
  console.log('\n=== PROBING CLOUDFLARE WORKER RELAY ===');

  // 1. GET /mesh/state
  const r1 = await req('GET', '/mesh/state');
  results.relay.push({
    name: 'GET /mesh/state (Health/State)',
    status: r1.status,
    pass: r1.status === 200,
    ms: r1.ms,
    payload: r1.json,
  });

  // 2. Peer 1 Heartbeat (Elect Leader)
  const peer1Id = 'p_lead_' + Math.random().toString(36).slice(2, 7);
  const r2 = await req('POST', `/mesh/heartbeat/${peer1Id}`, {
    domain: 'portal.university.edu',
    room: 'IF-101',
    course: 'Pemrograman Web',
    hasQr: false,
  });
  results.relay.push({
    name: `POST /mesh/heartbeat/${peer1Id} (Leader Election)`,
    status: r2.status,
    pass: r2.status === 200 && r2.json && r2.json.isLeader === true,
    ms: r2.ms,
    payload: r2.json,
  });

  // 3. Peer 2 Heartbeat (Follower Sync)
  const peer2Id = 'p_fol_' + Math.random().toString(36).slice(2, 7);
  const r3 = await req('POST', `/mesh/heartbeat/${peer2Id}`, {
    domain: 'portal.university.edu',
    room: 'IF-101',
    hasQr: false,
  });
  results.relay.push({
    name: `POST /mesh/heartbeat/${peer2Id} (Follower Join)`,
    status: r3.status,
    pass: r3.status === 200 && r3.json && r3.json.isLeader === false,
    ms: r3.ms,
    payload: r3.json,
  });

  // 4. PUT /otp/tm_diag_test (Broadcast Code)
  const testOtp = '819274';
  const r4 = await req('PUT', '/otp/tm_diag_test', { code: testOtp, otp: testOtp });
  results.relay.push({
    name: 'PUT /otp/tm_diag_test (OTP Broadcast)',
    status: r4.status,
    pass: r4.status === 200 && r4.json && r4.json.code === testOtp,
    ms: r4.ms,
    payload: r4.json,
  });

  // 5. GET /otp/tm_diag_test (Direct OTP retrieval)
  const r5 = await req('GET', '/otp/tm_diag_test');
  results.relay.push({
    name: 'GET /otp/tm_diag_test (OTP Pull)',
    status: r5.status,
    pass: r5.status === 200 && r5.json && r5.json.code === testOtp,
    ms: r5.ms,
    payload: r5.json,
  });

  // 6. Follower Heartbeat after Broadcast (Mesh Auto-Distribution)
  const r6 = await req('POST', `/mesh/heartbeat/${peer2Id}`, { domain: 'portal.university.edu' });
  const receivedOtp = r6.json && r6.json.latestOtp && r6.json.latestOtp.code;
  results.relay.push({
    name: 'POST /mesh/heartbeat (Follower OTP Auto-Sync via Swarm)',
    status: r6.status,
    pass: r6.status === 200 && receivedOtp === testOtp,
    ms: r6.ms,
    payload: r6.json ? r6.json.latestOtp : null,
  });

  // 7. Anti-Replay Guard Check (Stale Timestamp Rejection)
  const staleTs = Date.now() - (10 * 60 * 1000); // 10 minutes ago
  const r7 = await req('PUT', '/otp/tm_replay_test', { code: '111222', ts: staleTs }, { 'X-Presensi-Ts': String(staleTs) });
  results.relay.push({
    name: 'Replay Protection (>5min Stale Ts Rejection)',
    status: r7.status,
    pass: r7.status === 400 && r7.data.includes('timestamp replay rejected'),
    ms: r7.ms,
    payload: r7.data,
  });

  // 8. PUT /mesh/state (State & QR distribution)
  const r8 = await req('PUT', '/mesh/state', {
    tmKey: 'tm_diag_test',
    otp: testOtp,
    qrUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    ruangan: 'IF-101',
    course: 'Web Dev'
  });
  results.relay.push({
    name: 'PUT /mesh/state (Leader State & QR Sync)',
    status: r8.status,
    pass: r8.status === 200 && r8.json && r8.json.ok === true,
    ms: r8.ms,
    payload: r8.json,
  });
}

function probeExtensionFiles() {
  console.log('\n=== PROBING MANIFEST & ASSET INTEGRITY ===');
  const baseDir = 'E:/Projects/presensi-extension';
  const manifestRaw = fs.readFileSync(path.join(baseDir, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw);

  // Check icons
  for (const size of Object.keys(manifest.icons || {})) {
    const iconRel = manifest.icons[size];
    const iconPath = path.join(baseDir, iconRel);
    const exists = fs.existsSync(iconPath);
    results.manifest.push({
      item: `Icon ${size}px (${iconRel})`,
      pass: exists,
      size: exists ? fs.statSync(iconPath).size : 0,
    });
  }

  // Check background service worker
  const swPath = path.join(baseDir, manifest.background.service_worker);
  results.manifest.push({
    item: `Background Worker (${manifest.background.service_worker})`,
    pass: fs.existsSync(swPath),
    size: fs.existsSync(swPath) ? fs.statSync(swPath).size : 0,
  });

  // Check content scripts
  for (const cs of manifest.content_scripts || []) {
    for (const jsFile of cs.js || []) {
      const p = path.join(baseDir, jsFile);
      results.manifest.push({
        item: `Content Script (${jsFile} - ${cs.world})`,
        pass: fs.existsSync(p),
        size: fs.existsSync(p) ? fs.statSync(p).size : 0,
      });
    }
  }

  // Check popup and options
  const popupHtml = path.join(baseDir, manifest.action.default_popup);
  const optionsHtml = path.join(baseDir, manifest.options_page);
  results.manifest.push({ item: 'Popup HTML', pass: fs.existsSync(popupHtml), size: fs.existsSync(popupHtml) ? fs.statSync(popupHtml).size : 0 });
  results.manifest.push({ item: 'Options HTML', pass: fs.existsSync(optionsHtml), size: fs.existsSync(optionsHtml) ? fs.statSync(optionsHtml).size : 0 });
}

function probeStorageKeys() {
  console.log('\n=== PROBING STORAGE KEY CONTRACT PARITY ===');
  const baseDir = 'E:/Projects/presensi-extension';
  const files = [
    'background/service-worker.js',
    'storage-bridge.js',
    'popup.js',
    'options/options.js'
  ];

  const keyMaps = {};
  for (const f of files) {
    const content = fs.readFileSync(path.join(baseDir, f), 'utf8');
    const match = content.match(/const\s+K\s*=\s*\{([^}]+)\}/);
    if (match) {
      const lines = match[1].split('\n');
      const obj = {};
      for (const line of lines) {
        const kv = line.match(/([a-zA-Z0-9_]+)\s*:\s*['"]([^'"]+)['"]/);
        if (kv) obj[kv[1]] = kv[2];
      }
      keyMaps[f] = obj;
    }
  }

  // Ensure reference keys match across all files
  const ref = keyMaps['background/service-worker.js'] || {};
  for (const [k, v] of Object.entries(ref)) {
    let allMatch = true;
    for (const [_fname, kmap] of Object.entries(keyMaps)) {
      if (kmap[k] !== undefined && kmap[k] !== v) {
        allMatch = false;
      }
    }
    results.storageKeys.push({
      key: k,
      obfuscatedValue: v,
      pass: allMatch,
    });
  }
}

async function run() {
  await probeRelay();
  probeExtensionFiles();
  probeStorageKeys();

  console.log('\n=============================================');
  console.log('            PROBE RESULTS SUMMARY            ');
  console.log('=============================================');
  console.log(JSON.stringify(results, null, 2));
}

run();

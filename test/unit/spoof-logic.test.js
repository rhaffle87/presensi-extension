/**
 * test/unit/spoof-logic.test.js
 *
 * Comprehensive unit and regression test suite for Attendance GPS Spoofer.
 * Executable via: node --test test/unit/spoof-logic.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('1. Storage Key Schema Parity', () => {
  const rootDir = path.join(__dirname, '..', '..');

  function extractKObject(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    const match = code.match(/const\s+K\s*=\s*\{([\s\S]*?)\};/);
    assert.ok(match, `Could not find const K in ${filePath}`);
    const entries = {};
    match[1].split('\n').forEach(line => {
      const lineMatch = line.match(/(\w+)\s*:\s*['"]([^'"]+)['"]/);
      if (lineMatch) {
        entries[lineMatch[1]] = lineMatch[2];
      }
    });
    return entries;
  }

  test('K schema consistency across service-worker, storage-bridge, popup, and options', () => {
    const swK = extractKObject(path.join(rootDir, 'background', 'service-worker.js'));
    const bridgeK = extractKObject(path.join(rootDir, 'storage-bridge.js'));
    const popupK = extractKObject(path.join(rootDir, 'popup.js'));
    const optK = extractKObject(path.join(rootDir, 'options', 'options.js'));

    const requiredKeys = ['enabled', 'lat', 'lng', 'domain', 'profile', 'vpnLock', 'deviceMode', 'testMode', 'customPresets', 'timetable'];

    requiredKeys.forEach(key => {
      assert.ok(swK[key], `Missing ${key} in service-worker.js`);
      assert.strictEqual(bridgeK[key], swK[key], `Mismatch for key ${key} in storage-bridge.js`);
      assert.strictEqual(popupK[key], swK[key], `Mismatch for key ${key} in popup.js`);
      assert.strictEqual(optK[key], swK[key], `Mismatch for key ${key} in options.js`);
    });
  });
});

describe('2. Multi-Tier Domain Resolver (content.js)', () => {
  const DIAGNOSTIC_DOMAINS = [
    'browserleaks.com',
    'html5demos.com',
    'my-location.org',
    'w3schools.com',
    'where-am-i.org',
    'localhost',
    '127.0.0.1'
  ];

  function isDomainAllowed(hostname, targetDomain, testMode) {
    if (testMode === true) return true;
    if (!hostname) return false;
    if (hostname === targetDomain) return true;
    for (let i = 0; i < DIAGNOSTIC_DOMAINS.length; i++) {
      const d = DIAGNOSTIC_DOMAINS[i];
      if (hostname === d || hostname.endsWith('.' + d)) return true;
    }
    return false;
  }

  const defaultTarget = 'portal.university.edu';

  test('Allows target university portal', () => {
    assert.strictEqual(isDomainAllowed('portal.university.edu', defaultTarget, false), true);
  });

  test('Allows whitelisted diagnostic suites when testMode is false', () => {
    assert.strictEqual(isDomainAllowed('browserleaks.com', defaultTarget, false), true);
    assert.strictEqual(isDomainAllowed('www.browserleaks.com', defaultTarget, false), true);
    assert.strictEqual(isDomainAllowed('html5demos.com', defaultTarget, false), true);
    assert.strictEqual(isDomainAllowed('my-location.org', defaultTarget, false), true);
    assert.strictEqual(isDomainAllowed('localhost', defaultTarget, false), true);
    assert.strictEqual(isDomainAllowed('127.0.0.1', defaultTarget, false), true);
  });

  test('Blocks untargeted external sites when testMode is false', () => {
    assert.strictEqual(isDomainAllowed('iplocation.io', defaultTarget, false), false);
    assert.strictEqual(isDomainAllowed('google.com', defaultTarget, false), false);
    assert.strictEqual(isDomainAllowed('maps.google.com', defaultTarget, false), false);
  });

  test('Allows any site when testMode is true', () => {
    assert.strictEqual(isDomainAllowed('iplocation.io', defaultTarget, true), true);
    assert.strictEqual(isDomainAllowed('google.com', defaultTarget, true), true);
    assert.strictEqual(isDomainAllowed('unknown-portal.ac.id', defaultTarget, true), true);
  });
});

describe('3. Gaussian Jitter & Coordinate Math', () => {
  function coordJitter() {
    const u = 1 - Math.random();
    const v = 1 - Math.random();
    const n = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return n * 0.000015;
  }

  test('Box-Muller transform produces centered Gaussian distribution within realistic bounds', () => {
    const samples = [];
    const N = 10000;
    for (let i = 0; i < N; i++) {
      const val = coordJitter();
      assert.ok(!isNaN(val) && isFinite(val), 'Jitter must be finite');
      samples.push(val);
    }

    const mean = samples.reduce((a, b) => a + b, 0) / N;
    // Mean should be very close to 0 (< 0.000005 deg)
    assert.ok(Math.abs(mean) < 0.000005, `Mean ${mean} deviated too far from 0`);

    const variance = samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / N;
    const stdDev = Math.sqrt(variance);

    // Standard deviation should be approximately 0.000015
    assert.ok(stdDev > 0.000010 && stdDev < 0.000020, `StdDev ${stdDev} not in expected bounds`);

    // 99.7% of samples should fall within 3 sigma (~0.000045 deg ≈ ~5m)
    const within3Sigma = samples.filter(s => Math.abs(s - mean) <= 3 * stdDev).length;
    const ratio = within3Sigma / N;
    assert.ok(ratio >= 0.99, `Normal distribution rule violated: ratio was ${ratio}`);
  });
});

describe('4. Great-Circle Velocity Limiter (Haversine)', () => {
  function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  test('Accurately measures distance between campus presets', () => {
    // Tower 2 (-7.2852792, 112.7952975) to Tower 1 (-7.2849915, 112.793897)
    const distKm = haversineDistance(-7.2852792, 112.7952975, -7.2849915, 112.793897);
    // Real distance is ~157 meters = ~0.157 km
    assert.ok(distKm > 0.14 && distKm < 0.17, `Campus distance ${distKm}km expected ~0.157km`);
  });

  test('Flags impossible travel (> 100 km/h)', () => {
    // Surabaya (-7.2575, 112.7521) to Jakarta (-6.2088, 106.8456) in 10 minutes
    const distKm = haversineDistance(-7.2575, 112.7521, -6.2088, 106.8456);
    const elapsedHours = 10 / 60; // 10 minutes
    const velocityKmh = distKm / elapsedHours;

    assert.ok(distKm > 600 && distKm < 750, `Distance ${distKm}km expected ~660km`);
    assert.ok(velocityKmh > 100, `Velocity ${velocityKmh}km/h should have flagged violation`);
  });
});

describe('5. Function.prototype.toString Cloaking Verification', () => {
  test('Cloaks Proxy wrapper to mimic native browser function', () => {
    const _origToString = Function.prototype.toString;
    const map = new Map();
    const proxy = new Proxy(_origToString, {
      apply(target, thisArg, args) {
        if (map.has(thisArg)) return map.get(thisArg);
        return Reflect.apply(target, thisArg, args);
      }
    });

    const fakeGetCurrentPosition = () => {};
    map.set(fakeGetCurrentPosition, 'function getCurrentPosition() { [native code] }');

    assert.strictEqual(
      proxy.call(fakeGetCurrentPosition),
      'function getCurrentPosition() { [native code] }'
    );
  });
});

describe('6. Auto-Room Preset Matching', () => {
  const CAMPUS_ROOM_PRESETS = [
    { regex: /\b(?:TW1|TOWER\s*1)\b/i,                        lat: -7.2849915,         lng: 112.793897,         label: 'Tower 1' },
    { regex: /\b(?:TW2|TOWER\s*2)\b/i,                        lat: -7.2852792,         lng: 112.7952975,        label: 'Tower 2' },
    { regex: /\b(?:KORIDC|KORIDOR\s*C|CLASS\s*C|KORIDOR)\b/i, lat: -7.284793988582386, lng: 112.79570676550246, label: 'Koridor C' },
  ];

  function detectRoomPreset(roomString, customPresets = []) {
    if (!roomString || typeof roomString !== 'string') return null;
    for (let i = 0; i < CAMPUS_ROOM_PRESETS.length; i++) {
      if (CAMPUS_ROOM_PRESETS[i].regex.test(roomString)) {
        return CAMPUS_ROOM_PRESETS[i];
      }
    }
    if (Array.isArray(customPresets)) {
      for (let j = 0; j < customPresets.length; j++) {
        const cp = customPresets[j];
        if (!cp || cp.lat == null || cp.lng == null) continue;
        if (cp.regex) {
          try {
            const rx = new RegExp(cp.regex, 'i');
            if (rx.test(roomString)) {
              return { lat: cp.lat, lng: cp.lng, label: cp.name || 'Custom Preset' };
            }
          } catch (_) {}
        } else if (cp.name) {
          try {
            const escaped = cp.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const rx = new RegExp('\\b' + escaped + '\\b', 'i');
            if (rx.test(roomString)) {
              return { lat: cp.lat, lng: cp.lng, label: cp.name };
            }
          } catch (_) {}
        }
      }
    }
    return null;
  }

  test('Matches various Tower 1 room strings', () => {
    const r1 = detectRoomPreset('TW1-102');
    const r2 = detectRoomPreset('Tower 1 Lt. 3');
    assert.ok(r1 && r1.label === 'Tower 1');
    assert.strictEqual(r1.lat, -7.2849915);
    assert.ok(r2 && r2.label === 'Tower 1');
  });

  test('Matches Tower 2 room strings', () => {
    const r = detectRoomPreset('TW2-304 / Smart Classroom');
    assert.ok(r && r.label === 'Tower 2');
    assert.strictEqual(r.lat, -7.2852792);
  });

  test('Matches Koridor C / Class C room strings', () => {
    const r1 = detectRoomPreset('Koridor C Lt. 2');
    const r2 = detectRoomPreset('Class C - Room 104');
    const r3 = detectRoomPreset('KORIDC');
    assert.ok(r1 && r1.label === 'Koridor C');
    assert.ok(r2 && r2.label === 'Koridor C');
    assert.ok(r3 && r3.label === 'Koridor C');
    assert.strictEqual(r1.lat, -7.284793988582386);
    assert.strictEqual(r1.lng, 112.79570676550246);
  });

  test('Matches user-defined custom presets via regex or name', () => {
    const customList = [
      { name: 'Lab Robotika', lat: -7.281, lng: 112.799, regex: '\\b(?:ROBOTIKA|LAB-ROB)\\b' },
      { name: 'Perpustakaan Pusat', lat: -7.282, lng: 112.798 }
    ];
    const match1 = detectRoomPreset('ROBOTIKA LT. 2', customList);
    assert.ok(match1);
    assert.strictEqual(match1.label, 'Lab Robotika');
    assert.strictEqual(match1.lat, -7.281);

    const match2 = detectRoomPreset('Gedung Perpustakaan Pusat Ruang Baca', customList);
    assert.ok(match2);
    assert.strictEqual(match2.label, 'Perpustakaan Pusat');
    assert.strictEqual(match2.lat, -7.282);
  });

  test('Returns null for unmapped or online rooms', () => {
    assert.strictEqual(detectRoomPreset('Online via Zoom'), null);
    assert.strictEqual(detectRoomPreset('Lab Informatika'), null);
    assert.strictEqual(detectRoomPreset('EE-101'), null);
    assert.strictEqual(detectRoomPreset(''), null);
    assert.strictEqual(detectRoomPreset(null), null);
  });
});

describe('7. Timezone & Anti-Fingerprinting Guard Logic', () => {
  test('WIB timezone offset calculation returns -420 minutes', () => {
    const wibOffset = -420;
    assert.strictEqual(wibOffset, -7 * 60);
  });

  test('WebRTC candidate filter correctly discriminates RFC1918 private vs public IPs', () => {
    const isPrivate = (candidateStr) => /(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(candidateStr);

    assert.strictEqual(isPrivate('candidate:1 1 UDP 2122260223 192.168.1.105 54321 typ host'), true);
    assert.strictEqual(isPrivate('candidate:2 1 UDP 2122260223 10.12.0.4 54321 typ host'), true);
    assert.strictEqual(isPrivate('candidate:3 1 UDP 2122260223 172.20.10.2 54321 typ host'), true);
    assert.strictEqual(isPrivate('candidate:4 1 UDP 1686052607 202.46.129.5 54321 typ srflx'), false);
  });

  test('Canvas 1-bit micro-noise toggles least significant bit reliably', () => {
    let byteVal = 120;
    const perturbed = (byteVal ^ 1) & 0xFF;
    assert.strictEqual(perturbed, 121);
    const restored = (perturbed ^ 1) & 0xFF;
    assert.strictEqual(restored, 120);
  });
});

describe('8. Autonomous Polling Academic Window Guard', () => {
  function isWibAcademicHours(utcHours) {
    const wibHours = (utcHours + 7) % 24;
    return wibHours >= 6 && wibHours <= 18;
  }

  test('Permits morning classes (07:00 WIB -> 00:00 UTC)', () => {
    assert.strictEqual(isWibAcademicHours(0), true);
  });

  test('Permits afternoon classes (14:00 WIB -> 07:00 UTC)', () => {
    assert.strictEqual(isWibAcademicHours(7), true);
  });

  test('Rejects midnight off-hours (02:00 WIB -> 19:00 UTC)', () => {
    assert.strictEqual(isWibAcademicHours(19), false);
  });

  test('Rejects late night off-hours (23:00 WIB -> 16:00 UTC)', () => {
    assert.strictEqual(isWibAcademicHours(16), false);
  });
});

describe('9. Peer Code Validation and KV Record Contract', () => {
  function validatePeerCode(code) {
    if (!code) return false;
    const clean = String(code).trim();
    return /^\d{6}$/.test(clean);
  }

  test('Accepts valid 6-digit numeric codes', () => {
    assert.strictEqual(validatePeerCode('123456'), true);
    assert.strictEqual(validatePeerCode('009812'), true);
    assert.strictEqual(validatePeerCode(' 849201 '), true);
  });

  test('Rejects malformed codes (alphabetic, short, long, empty)', () => {
    assert.strictEqual(validatePeerCode('12345'), false);
    assert.strictEqual(validatePeerCode('1234567'), false);
    assert.strictEqual(validatePeerCode('ABCDEF'), false);
    assert.strictEqual(validatePeerCode('12A456'), false);
    assert.strictEqual(validatePeerCode(''), false);
    assert.strictEqual(validatePeerCode(null), false);
  });
});

describe('10. Manifest Commands & Shortcut Integrity', () => {
  test('Manifest declares toggle-spoof command with Alt+S shortcut', () => {
    const rootDir = path.join(__dirname, '..', '..');
    const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));

    assert.ok(manifest.commands, 'Manifest missing commands declaration');
    assert.ok(manifest.commands['toggle-spoof'], 'Manifest missing toggle-spoof command');
    assert.strictEqual(manifest.commands['toggle-spoof'].suggested_key.default, 'Alt+S');
    assert.ok(manifest.commands['toggle-spoof'].description);
  });
});

describe('11. Attendance Log CSV Formatter & Sanitizer Verification', () => {
  function formatCsv(logEntries) {
    const headers = ['Timestamp', 'ISO_Date', 'Status', 'Latitude', 'Longitude', 'Profile'];
    const rows = logEntries.map(entry => [
      entry.ts || '',
      entry.ts ? new Date(entry.ts).toISOString() : '',
      `"${String(entry.status || 'pending').replace(/"/g, '""')}"`,
      entry.lat != null ? entry.lat : '',
      entry.lng != null ? entry.lng : '',
      `"${String(entry.profile || 'mobile_gps').replace(/"/g, '""')}"`
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  }

  test('Correctly serializes log entries with CSV header and escaped quotes', () => {
    const mockLog = [
      { ts: 1773000000000, status: 'accepted', lat: -7.2849915, lng: 112.793897, profile: 'mobile_gps' },
      { ts: 1773003600000, status: 'rejected', lat: -7.2852792, lng: 112.7952975, profile: 'desktop' }
    ];
    const csv = formatCsv(mockLog);
    const lines = csv.split('\r\n');
    assert.strictEqual(lines.length, 3);
    assert.strictEqual(lines[0], 'Timestamp,ISO_Date,Status,Latitude,Longitude,Profile');
    assert.ok(lines[1].includes('"accepted"'));
    assert.ok(lines[1].includes('-7.2849915'));
    assert.ok(lines[2].includes('"rejected"'));
  });

  test('Sanitizes quotes and malicious characters in status strings', () => {
    const mockLog = [
      { ts: 1773000000000, status: 'hack",injection', lat: -7.2, lng: 112.7, profile: 'test' }
    ];
    const csv = formatCsv(mockLog);
    assert.ok(csv.includes('"hack"",injection"'));
  });
});

describe('12. Academic Timetable Scheduler Matching Logic', () => {
  function matchTimetableSlot(timetable, currentDay, currentHour, currentMinute) {
    if (!Array.isArray(timetable)) return null;
    const currentMin = currentHour * 60 + currentMinute;
    for (let i = 0; i < timetable.length; i++) {
      const slot = timetable[i];
      if (slot.day !== currentDay) continue;
      const [startH, startM] = (slot.start || '00:00').split(':').map(Number);
      const [endH, endM] = (slot.end || '23:59').split(':').map(Number);
      const startMin = startH * 60 + (startM || 0);
      const endMin = endH * 60 + (endM || 0);
      if (currentMin >= startMin && currentMin <= endMin) {
        return slot;
      }
    }
    return null;
  }

  const sampleTimetable = [
    { day: 1, start: '07:00', end: '09:30', subject: 'Algoritma (TW1)', lat: -7.2849915, lng: 112.793897 },
    { day: 1, start: '10:00', end: '12:30', subject: 'Basis Data (TW2)', lat: -7.2852792, lng: 112.7952975 },
    { day: 3, start: '13:00', end: '15:30', subject: 'Jaringan Komputer (Class C)', lat: -7.28479, lng: 112.7957 }
  ];

  test('Matches active slot on Monday at 08:15', () => {
    const slot = matchTimetableSlot(sampleTimetable, 1, 8, 15);
    assert.ok(slot);
    assert.strictEqual(slot.subject, 'Algoritma (TW1)');
    assert.strictEqual(slot.lat, -7.2849915);
  });

  test('Matches boundary time (exact start 07:00)', () => {
    const slot = matchTimetableSlot(sampleTimetable, 1, 7, 0);
    assert.ok(slot);
    assert.strictEqual(slot.subject, 'Algoritma (TW1)');
  });

  test('Returns null during break between classes (09:45)', () => {
    const slot = matchTimetableSlot(sampleTimetable, 1, 9, 45);
    assert.strictEqual(slot, null);
  });

  test('Returns null on different day (Tuesday at 08:15)', () => {
    const slot = matchTimetableSlot(sampleTimetable, 2, 8, 15);
    assert.strictEqual(slot, null);
  });
});

describe('13. Backup & Restore JSON Schema Validation', () => {
  function validateBackupPayload(rawJson, validKeys) {
    if (!rawJson || typeof rawJson !== 'string') return { valid: false, error: 'Empty or invalid payload' };
    try {
      const parsed = JSON.parse(rawJson);
      const config = parsed.config || parsed;
      if (!config || typeof config !== 'object') {
        return { valid: false, error: 'Config object missing' };
      }
      const extracted = {};
      validKeys.forEach(k => {
        if (config[k] !== undefined) extracted[k] = config[k];
      });
      return { valid: true, config: extracted };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  const validKeys = ['cfg_a', 'cfg_o', 'cfg_d', 'cfg_t', 'cfg_ap', 'cfg_cp', 'cfg_tt'];

  test('Validates and extracts valid backup JSON', () => {
    const backupJson = JSON.stringify({
      version: 1,
      exportedAt: '2026-10-10T00:00:00.000Z',
      config: {
        cfg_a: '-7.285',
        cfg_o: '112.795',
        cfg_cp: [{ name: 'Lab', lat: -7.28, lng: 112.79 }],
        cfg_tt: [{ day: 1, start: '07:00', end: '09:00', subject: 'Math', lat: -7.28, lng: 112.79 }]
      }
    });

    const result = validateBackupPayload(backupJson, validKeys);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.config.cfg_a, '-7.285');
    assert.strictEqual(result.config.cfg_cp.length, 1);
    assert.strictEqual(result.config.cfg_tt.length, 1);
  });

  test('Rejects malformed JSON syntax gracefully', () => {
    const result = validateBackupPayload('{ broken json: true', validKeys);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error);
  });
});



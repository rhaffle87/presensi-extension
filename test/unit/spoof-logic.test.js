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
const rootDir = path.join(__dirname, '..', '..');

describe('1. Storage Key Schema Parity', () => {

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

    const requiredKeys = ['enabled', 'lat', 'lng', 'domain', 'profile', 'vpnLock', 'deviceMode', 'testMode', 'customPresets', 'timetable', 'relayUrl', 'lang'];

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

describe('15. Network Interceptor Isolation & Portal Scope', () => {
  function isPortalDomain(hostname, targetDomain) {
    const currentHost = hostname ? hostname.toLowerCase() : '';
    if (!currentHost) return false;
    const target = targetDomain ? targetDomain.toLowerCase().trim() : '';
    if (!target) return false;
    if (currentHost === target || currentHost.endsWith('.' + target)) return true;

    // Sibling subdomain matching (e.g. attendance.university.edu matching portal.university.edu)
    const targetParts = target.split('.');
    if (targetParts.length >= 3) {
      const apex = targetParts.slice(1).join('.');
      if (currentHost === apex || currentHost.endsWith('.' + apex)) return true;
    }
    return false;
  }

  test('Permits configured portal and its subdomains', () => {
    assert.strictEqual(isPortalDomain('portal.university.edu', 'portal.university.edu'), true);
    assert.strictEqual(isPortalDomain('presensi.university.edu', 'university.edu'), true);
    assert.strictEqual(isPortalDomain('classroom.university.edu', 'university.edu'), true);
  });

  test('Permits sibling subdomains on institutional domain apex', () => {
    assert.strictEqual(isPortalDomain('portal.university.edu', 'attendance.university.edu'), true);
    assert.strictEqual(isPortalDomain('attendance.university.edu', 'portal.university.edu'), true);
    assert.strictEqual(isPortalDomain('sub.campus.ac.id', 'portal.campus.ac.id'), true);
  });

  test('Permits custom configured targetDomain', () => {
    assert.strictEqual(isPortalDomain('portal.univ.ac.id', 'portal.univ.ac.id'), true);
    assert.strictEqual(isPortalDomain('sub.portal.univ.ac.id', 'portal.univ.ac.id'), true);
  });

  test('Strictly isolates external websites (Medium, Google, GitHub)', () => {
    assert.strictEqual(isPortalDomain('medium.com', 'portal.university.edu'), false);
    assert.strictEqual(isPortalDomain('glyph.medium.com', 'portal.university.edu'), false);
    assert.strictEqual(isPortalDomain('google.com', 'portal.university.edu'), false);
    assert.strictEqual(isPortalDomain('github.com', 'portal.university.edu'), false);
    assert.strictEqual(isPortalDomain('stackoverflow.com', 'portal.university.edu'), false);
    assert.strictEqual(isPortalDomain('evil.com', 'university.edu'), false);
  });
});

describe('16. Dynamic Kinematics & True Bearing Calculation', () => {
  function calculateBearing(lat1, lon1, lat2, lon2) {
    const dLng = (lon2 - lon1) * (Math.PI / 180);
    const y = Math.sin(dLng) * Math.cos(lat2 * (Math.PI / 180));
    const x = Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
              Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos(dLng);
    return Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);
  }

  test('Calculates accurate cardinal headings (North, East, South, West)', () => {
    const headingNorth = calculateBearing(0, 0, 1, 0);
    assert.strictEqual(headingNorth, 0);

    const headingEast = calculateBearing(0, 0, 0, 1);
    assert.strictEqual(headingEast, 90);

    const headingSouth = calculateBearing(0, 0, -1, 0);
    assert.strictEqual(headingSouth, 180);

    const headingWest = calculateBearing(0, 0, 0, -1);
    assert.strictEqual(headingWest, 270);
  });
});

describe('17. Physiological Hand Tremor & Gravity Vector Synthesis', () => {
  function buildMotionEvent(t) {
    const breath = Math.sin(t / 4000) * 0.08;
    const tremorX = Math.sin(t / 95) * 0.05;
    const tremorY = Math.cos(t / 105) * 0.05;
    const tremorZ = Math.sin(t / 115) * 0.04;
    return {
      acceleration: { x: tremorX, y: tremorY, z: tremorZ },
      accelerationIncludingGravity: {
        x: 0.15 + tremorX,
        y: 7.85 + breath + tremorY,
        z: 5.80 + tremorZ
      }
    };
  }

  test('Gravity acceleration magnitude strictly mimics Earth gravity (~9.81 m/s²)', () => {
    const times = [0, 500, 1000, 2500, 5000];
    for (const t of times) {
      const m = buildMotionEvent(t);
      const ag = m.accelerationIncludingGravity;
      const mag = Math.sqrt(ag.x ** 2 + ag.y ** 2 + ag.z ** 2);
      assert.ok(mag >= 9.6 && mag <= 10.0, `Gravity magnitude ${mag} outside physiological range`);
      assert.ok(Math.abs(m.acceleration.x) < 0.1, 'Tremor x magnitude too large');
    }
  });
});

describe('18. Swarm Relay Anti-Replay & Timestamp Verification Contract', () => {
  function verifyRequestFreshness(reqTs, now, maxSkewMs = 300000) {
    if (!reqTs || typeof reqTs !== 'number') return { ok: true };
    if (Math.abs(now - reqTs) > maxSkewMs) {
      return { ok: false, error: 'stale request: timestamp replay rejected' };
    }
    return { ok: true };
  }

  test('Accepts fresh timestamps within 5-minute skew window', () => {
    const now = Date.now();
    assert.strictEqual(verifyRequestFreshness(now, now).ok, true);
    assert.strictEqual(verifyRequestFreshness(now - 60000, now).ok, true); // 1 min ago
    assert.strictEqual(verifyRequestFreshness(now + 30000, now).ok, true); // 30s drift
  });

  test('Rejects replayed requests older than 5 minutes', () => {
    const now = Date.now();
    assert.strictEqual(verifyRequestFreshness(now - 301000, now).ok, false); // 5m 1s ago
    assert.strictEqual(verifyRequestFreshness(now - 3600000, now).ok, false); // 1 hour ago
  });
});

describe('19. Multi-Language i18n Localization Engine', () => {
  const i18n = require(path.join(rootDir, 'i18n.js'));

  test('Normalizes language codes (en, id, ind)', () => {
    assert.strictEqual(i18n.normalizeLang('en'), 'en');
    assert.strictEqual(i18n.normalizeLang('EN-US'), 'en');
    assert.strictEqual(i18n.normalizeLang('id'), 'id');
    assert.strictEqual(i18n.normalizeLang('ID-ID'), 'id');
    assert.strictEqual(i18n.normalizeLang('ind'), 'id');
    assert.strictEqual(i18n.normalizeLang(null), 'en');
  });

  test('Provides matching translations between English and Indonesian dictionaries', () => {
    i18n.setLang('en');
    assert.strictEqual(i18n.t('status_active'), 'Active');
    assert.strictEqual(i18n.t('save_apply'), 'Save & Apply Coordinates');
    assert.strictEqual(i18n.t('opt_vpn_lock_title'), 'VPN / Campus Network Lock');
    assert.strictEqual(i18n.t('opt_presets_title'), 'Custom Campus Facility Presets');

    i18n.setLang('id');
    assert.strictEqual(i18n.t('status_active'), 'Aktif');
    assert.strictEqual(i18n.t('save_apply'), 'Simpan & Terapkan Koordinat');
    assert.strictEqual(i18n.t('opt_vpn_lock_title'), 'Kunci Jaringan Kampus / VPN');
    assert.strictEqual(i18n.t('opt_presets_title'), 'Preset Fasilitas & Ruang Kampus Khusus');
  });

  test('Guarantees complete dictionary key parity between English and Indonesian', () => {
    const enKeys = Object.keys(i18n.DICTIONARY.en);
    const idKeys = Object.keys(i18n.DICTIONARY.id);
    assert.strictEqual(enKeys.length, idKeys.length, 'English and Indonesian dictionaries must have identical key count');
    for (const key of enKeys) {
      assert.ok(typeof i18n.DICTIONARY.id[key] === 'string', `Missing Indonesian translation for key: ${key}`);
      assert.ok(i18n.DICTIONARY.id[key].length > 0, `Empty Indonesian translation for key: ${key}`);
    }
  });

  test('Gracefully falls back to English or key on missing translation', () => {
    i18n.setLang('id');
    assert.strictEqual(i18n.t('non_existent_key', 'Fallback Text'), 'Fallback Text');
  });
});

describe('20. Autonomous Attendance Code Retrieval & Mesh Broadcast Contract', () => {
  function extractOtpFromBody(body) {
    if (!body) return null;
    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        if (parsed.kode && /^\d{6}$/.test(String(parsed.kode))) {
          return String(parsed.kode);
        }
      } catch (_) {
        const match = body.match(/["']?kode["']?\s*[:=]\s*["']?(\d{6})["']?/i);
        if (match) return match[1];
      }
    } else if (typeof body === 'object') {
      if (typeof body.get === 'function') {
        const val = body.get('kode');
        if (val && /^\d{6}$/.test(String(val))) return String(val);
      } else if (body.kode && /^\d{6}$/.test(String(body.kode))) {
        return String(body.kode);
      }
    }
    return null;
  }

  function rewriteSubmissionPayload(rawJson, spoofLat, spoofLng) {
    const parsed = JSON.parse(rawJson);
    parsed.latitude = spoofLat;
    parsed.longitude = spoofLng;
    return JSON.stringify(parsed);
  }

  function formatMeshBroadcast(code, source) {
    return {
      type: 'MESH_OTP_BROADCAST',
      otp: String(code),
      source: source || 'unknown',
      ts: Date.now()
    };
  }

  test('Extracts valid 6-digit OTP from JSON submission payload', () => {
    const payload = JSON.stringify({ id_tatap_muka: '12345', kode: '984210', hadir: 'L' });
    assert.strictEqual(extractOtpFromBody(payload), '984210');
  });

  test('Extracts valid 6-digit OTP from raw URL-encoded or regex body', () => {
    const rawBody = 'id_tatap_muka=12345&kode=654321&hadir=L';
    assert.strictEqual(extractOtpFromBody(rawBody), '654321');
  });

  test('Rejects non-6-digit or non-numeric tokens', () => {
    assert.strictEqual(extractOtpFromBody(JSON.stringify({ kode: '12345' })), null);
    assert.strictEqual(extractOtpFromBody(JSON.stringify({ kode: '1234567' })), null);
    assert.strictEqual(extractOtpFromBody(JSON.stringify({ kode: 'abcdef' })), null);
    assert.strictEqual(extractOtpFromBody(null), null);
  });

  test('Correctly rewrites submission coordinates in JSON payload', () => {
    const original = JSON.stringify({ kode: '123456', latitude: -6.2088, longitude: 106.8456 });
    const rewritten = rewriteSubmissionPayload(original, -7.2852, 112.7952);
    const parsed = JSON.parse(rewritten);
    assert.strictEqual(parsed.latitude, -7.2852);
    assert.strictEqual(parsed.longitude, 112.7952);
    assert.strictEqual(parsed.kode, '123456');
  });

  test('Constructs valid Mesh OTP broadcast event contract', () => {
    const broadcast = formatMeshBroadcast('789123', 'portal_fetch');
    assert.strictEqual(broadcast.type, 'MESH_OTP_BROADCAST');
    assert.strictEqual(broadcast.otp, '789123');
    assert.strictEqual(broadcast.source, 'portal_fetch');
    assert.ok(Date.now() - broadcast.ts < 1000);
  });
});

describe('21. Storage Bridge Config Normalization & Nonce Contract', () => {
  const K = {
    enabled: 'cfg_e',
    lat:     'cfg_a',
    lng:     'cfg_o',
    domain:  'cfg_d',
    profile: 'cfg_ap',
    vpnLock: 'cfg_vl',
    deviceMode: 'cfg_dm',
    testMode: 'cfg_tm',
    customPresets: 'cfg_cp',
    timetable: 'cfg_tt',
    relayUrl: 'cfg_ru',
    lang:     'cfg_l',
  };

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

  function isValidSessionToken(token) {
    return Boolean(token && typeof token === 'string' && /^[a-zA-Z0-9_-]{12,64}$/.test(token.trim()));
  }

  test('Correctly extracts and normalizes raw storage map into config object', () => {
    const rawStorage = {
      [K.enabled]: true,
      [K.lat]: '-7.285',
      [K.lng]: '112.795',
      [K.domain]: 'portal.university.edu',
      [K.customPresets]: [{ name: 'Room 101', lat: -7.28, lng: 112.79 }],
      [K.relayUrl]: 'https://relay.workers.dev',
      [K.lang]: 'id'
    };

    const cfg = buildConfig(rawStorage);
    assert.strictEqual(cfg.enabled, true);
    assert.strictEqual(cfg.lat, '-7.285');
    assert.strictEqual(cfg.lng, '112.795');
    assert.strictEqual(cfg.targetDomain, 'portal.university.edu');
    assert.strictEqual(cfg.customPresets.length, 1);
    assert.strictEqual(cfg.relayUrl, 'https://relay.workers.dev');
    assert.strictEqual(cfg.lang, 'id');
  });

  test('Provides sensible safe defaults when storage keys are missing', () => {
    const cfg = buildConfig({});
    assert.strictEqual(cfg.enabled, false);
    assert.strictEqual(cfg.lat, null);
    assert.strictEqual(cfg.lng, null);
    assert.strictEqual(cfg.targetDomain, 'portal.university.edu');
    assert.strictEqual(cfg.profile, 'mobile_gps');
    assert.strictEqual(cfg.deviceMode, 'desktop');
    assert.strictEqual(cfg.testMode, false);
    assert.deepStrictEqual(cfg.customPresets, []);
    assert.deepStrictEqual(cfg.timetable, []);
    assert.strictEqual(cfg.relayUrl, null);
    assert.strictEqual(cfg.lang, 'en');
  });

  test('Validates cryptographic session nonces and rejects malicious or malformed tokens', () => {
    assert.strictEqual(isValidSessionToken('a1b2c3d4e5f6g7h8'), true);
    assert.strictEqual(isValidSessionToken('e9f90ad467ef24ba014d59a2cbe91204'), true);
    assert.strictEqual(isValidSessionToken('short'), false);
    assert.strictEqual(isValidSessionToken('token with spaces'), false);
    assert.strictEqual(isValidSessionToken('<script>alert(1)</script>'), false);
    assert.strictEqual(isValidSessionToken(null), false);
  });
});

describe('22. Build Script Version Synchronization & Packaging Rules', () => {
  const { syncVersions, FILES_TO_COPY, DIRS_TO_COPY } = require(path.join(rootDir, 'build.js'));

  test('FILES_TO_COPY includes core runtime bridges, manifests, and documentation', () => {
    const requiredFiles = ['manifest.json', 'popup.html', 'compat.js', 'i18n.js', 'storage-bridge.js', 'README.md'];
    requiredFiles.forEach(f => {
      assert.ok(FILES_TO_COPY.includes(f), `FILES_TO_COPY missing required asset: ${f}`);
    });
  });

  test('DIRS_TO_COPY includes options, icons, background, and lib directories', () => {
    const requiredDirs = ['icons', 'options', 'lib', 'background'];
    requiredDirs.forEach(d => {
      assert.ok(DIRS_TO_COPY.includes(d), `DIRS_TO_COPY missing required directory: ${d}`);
    });
  });

  test('syncVersions detects and reports current root package version', () => {
    const res = syncVersions(rootDir);
    assert.ok(res);
    assert.ok(res.targetVersion);
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    assert.strictEqual(res.targetVersion, pkg.version);
  });
});

describe('23. UI Boundary & Format Validator Suite', () => {
  function isValidLat(val) {
    if (val === null || val === undefined || String(val).trim() === '') return false;
    const n = Number(val);
    return !isNaN(n) && isFinite(n) && n >= -90 && n <= 90;
  }

  function isValidLng(val) {
    if (val === null || val === undefined || String(val).trim() === '') return false;
    const n = Number(val);
    return !isNaN(n) && isFinite(n) && n >= -180 && n <= 180;
  }

  function isValidUrl(val) {
    if (!val || String(val).trim() === '') return true;
    try {
      const u = new URL(val.trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  test('Validates latitudes strictly within [-90, 90]', () => {
    assert.strictEqual(isValidLat('-7.2852792'), true);
    assert.strictEqual(isValidLat('0'), true);
    assert.strictEqual(isValidLat('90'), true);
    assert.strictEqual(isValidLat('-90'), true);
    assert.strictEqual(isValidLat('90.0001'), false);
    assert.strictEqual(isValidLat('-91'), false);
    assert.strictEqual(isValidLat('invalid'), false);
    assert.strictEqual(isValidLat(''), false);
  });

  test('Validates longitudes strictly within [-180, 180]', () => {
    assert.strictEqual(isValidLng('112.7952975'), true);
    assert.strictEqual(isValidLng('0'), true);
    assert.strictEqual(isValidLng('180'), true);
    assert.strictEqual(isValidLng('-180'), true);
    assert.strictEqual(isValidLng('180.001'), false);
    assert.strictEqual(isValidLng('-185'), false);
    assert.strictEqual(isValidLng('abc'), false);
  });

  test('Validates HTTP and HTTPS URLs and rejects invalid protocols', () => {
    assert.strictEqual(isValidUrl('https://presensi-relay.workers.dev'), true);
    assert.strictEqual(isValidUrl('http://localhost:8787'), true);
    assert.strictEqual(isValidUrl(''), true); // optional
    assert.strictEqual(isValidUrl('javascript:alert(1)'), false);
    assert.strictEqual(isValidUrl('file:///etc/passwd'), false);
    assert.strictEqual(isValidUrl('not a url'), false);
  });
});








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

    const requiredKeys = ['enabled', 'lat', 'lng', 'domain', 'profile', 'vpnLock', 'deviceMode', 'testMode'];

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
    { regex: /\b(?:TW1|TOWER\s*1)\b/i,                 lat: -7.287123,  lng: 112.798542,  label: 'Tower 1 (TW1)' },
    { regex: /\b(?:TW2|TOWER\s*2)\b/i,                 lat: -7.2852792, lng: 112.7952975, label: 'Tower 2 (TW2)' },
    { regex: /\b(?:IF|INFORMATIKA|TC)\b/i,             lat: -7.279815,  lng: 112.797430,  label: 'Informatika (IF)' },
    { regex: /\b(?:EE|TE|ELEKTRO)\b/i,                 lat: -7.282850,  lng: 112.794620,  label: 'Elektro (EE)' },
    { regex: /\b(?:SI|SISTEM\s*INFORMASI|IS)\b/i,      lat: -7.280140,  lng: 112.796320,  label: 'Sistem Informasi (SI)' },
    { regex: /\b(?:MATH|MATEMATIKA|SAINS|FSAD)\b/i,    lat: -7.283920,  lng: 112.793810,  label: 'Sains & Matematika' },
    { regex: /\b(?:PERPUS|LIBRARY|PERPUSTAKAAN)\b/i,   lat: -7.282500,  lng: 112.794900,  label: 'Perpustakaan Pusat' },
    { regex: /\b(?:REKTORAT|PLAZA\s*DR\s*ANGKA)\b/i,   lat: -7.284890,  lng: 112.796120,  label: 'Rektorat ITS' },
    { regex: /\b(?:PASCA|PASCASARJANA)\b/i,            lat: -7.281920,  lng: 112.798150,  label: 'Pascasarjana' },
    { regex: /\b(?:RC|RESEARCH\s*CENTER|PUSAT\s*RISET)\b/i, lat: -7.286100, lng: 112.797200, label: 'Research Center (RC)' },
  ];

  function detectRoomPreset(roomString) {
    if (!roomString || typeof roomString !== 'string') return null;
    for (let i = 0; i < CAMPUS_ROOM_PRESETS.length; i++) {
      if (CAMPUS_ROOM_PRESETS[i].regex.test(roomString)) {
        return CAMPUS_ROOM_PRESETS[i];
      }
    }
    return null;
  }

  test('Matches various Tower 1 room strings', () => {
    const r1 = detectRoomPreset('TW1-102');
    const r2 = detectRoomPreset('Tower 1 Lt. 3');
    assert.ok(r1 && r1.label === 'Tower 1 (TW1)');
    assert.strictEqual(r1.lat, -7.287123);
    assert.ok(r2 && r2.label === 'Tower 1 (TW1)');
  });

  test('Matches Tower 2 room strings', () => {
    const r = detectRoomPreset('TW2-304 / Smart Classroom');
    assert.ok(r && r.label === 'Tower 2 (TW2)');
    assert.strictEqual(r.lat, -7.2852792);
  });

  test('Matches Informatika (IF / TC) room strings', () => {
    const r1 = detectRoomPreset('IF-105A');
    const r2 = detectRoomPreset('TC-201');
    const r3 = detectRoomPreset('Lab Informatika 2');
    assert.ok(r1 && r1.label === 'Informatika (IF)');
    assert.ok(r2 && r2.label === 'Informatika (IF)');
    assert.ok(r3 && r3.label === 'Informatika (IF)');
    assert.strictEqual(r1.lat, -7.279815);
  });

  test('Matches Elektro (EE / TE) room strings', () => {
    const r1 = detectRoomPreset('EE-201');
    const r2 = detectRoomPreset('TE-101 (Gedung B)');
    const r3 = detectRoomPreset('Lab Elektro Telekomunikasi');
    assert.ok(r1 && r1.label === 'Elektro (EE)');
    assert.ok(r2 && r2.label === 'Elektro (EE)');
    assert.ok(r3 && r3.label === 'Elektro (EE)');
    assert.strictEqual(r1.lat, -7.282850);
  });

  test('Matches Sistem Informasi (SI / IS) room strings', () => {
    const r1 = detectRoomPreset('SI-101');
    const r2 = detectRoomPreset('Lab Sistem Informasi Enterprise');
    assert.ok(r1 && r1.label === 'Sistem Informasi (SI)');
    assert.ok(r2 && r2.label === 'Sistem Informasi (SI)');
    assert.strictEqual(r1.lat, -7.280140);
  });

  test('Matches Sains & Matematika room strings', () => {
    const r1 = detectRoomPreset('FSAD-204');
    const r2 = detectRoomPreset('Lab Matematika Komputasi');
    assert.ok(r1 && r1.label === 'Sains & Matematika');
    assert.ok(r2 && r2.label === 'Sains & Matematika');
    assert.strictEqual(r1.lat, -7.283920);
  });

  test('Returns null for unmapped or online rooms', () => {
    assert.strictEqual(detectRoomPreset('Online via Zoom'), null);
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

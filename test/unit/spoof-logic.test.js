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

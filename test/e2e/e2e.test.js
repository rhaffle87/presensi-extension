/**
 * test/e2e/e2e.test.js
 *
 * Automated verification of mock attendance and diagnostic endpoints.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { server, PORT } = require('./test-server.js');

describe('E2E Diagnostic and Attendance Mock Server', () => {
  before((done) => {
    server.listen(PORT, done);
  });

  after((done) => {
    server.close(done);
  });

  function get(path) {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${PORT}${path}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      }).on('error', reject);
    });
  }

  test('GET /diagnostic serves HTML5 geolocation testbed', async () => {
    const res = await get('/diagnostic');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('Diagnostic Geolocation Testbed'));
    assert.ok(res.body.includes('navigator.geolocation.getCurrentPosition'));
    assert.ok(res.body.includes('navigator.permissions.query'));
  });

  test('GET /attendance serves mock attendance portal with presence markers', async () => {
    const res = await get('/attendance');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('Hadir Kuliah'));
    assert.ok(res.body.includes('locStatus'));
    assert.ok(res.body.includes('Lokasi berhasil diperoleh'));
  });

  test('GET /ip-check returns Campus IP telemetry matching ITS ASN', async () => {
    const res = await get('/ip-check');
    assert.strictEqual(res.status, 200);
    const parsed = JSON.parse(res.body);
    assert.strictEqual(parsed.city, 'Surabaya');
    assert.strictEqual(parsed.isp, 'Institut Teknologi Sepuluh Nopember');
    assert.strictEqual(parsed.regionName, 'Jawa Timur');
  });
});

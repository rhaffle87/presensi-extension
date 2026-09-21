/**
 * test/e2e/test-server.js
 *
 * Lightweight local HTTP server providing mock pages for E2E and diagnostic verification:
 * - /diagnostic : Tests HTML5 Geolocation API and Permissions API
 * - /attendance : Mock campus attendance portal
 * - /ip-check   : Mock GeoIP JSON endpoint
 */

const http = require('http');

const PORT = 8765;

const diagnosticHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Diagnostic Geolocation Testbed</title>
  <style>
    body { font-family: sans-serif; margin: 30px; background: #121212; color: #eee; }
    .card { background: #1e1e1e; padding: 20px; border-radius: 8px; border: 1px solid #333; max-width: 600px; }
    h1 { font-size: 20px; margin-bottom: 12px; }
    pre { background: #0a0a0a; padding: 12px; border-radius: 4px; overflow-x: auto; color: #4ade80; }
    button { padding: 8px 16px; background: #3b82f6; border: none; border-radius: 4px; color: white; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>HTML5 Geolocation & Permissions Diagnostic</h1>
    <p>Tests browser <code>navigator.geolocation</code> and <code>navigator.permissions</code>.</p>
    <button id="btnQuery">Query Location Now</button>
    <h3>Results:</h3>
    <pre id="output">Waiting for query...</pre>
  </div>

  <script>
    async function runDiagnostics() {
      const out = document.getElementById('output');
      const results = {};

      // 1. Permissions API
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const perm = await navigator.permissions.query({ name: 'geolocation' });
          results.permissionState = perm.state;
        } else {
          results.permissionState = 'unsupported';
        }
      } catch (e) {
        results.permissionError = e.message;
      }

      // 2. Geolocation API
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            results.success = true;
            results.coords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              altitude: pos.coords.altitude
            };
            results.timestamp = pos.timestamp;
            out.textContent = JSON.stringify(results, null, 2);
          },
          (err) => {
            results.success = false;
            results.error = { code: err.code, message: err.message };
            out.textContent = JSON.stringify(results, null, 2);
          },
          { enableHighAccuracy: true, timeout: 5000 }
        );
      } else {
        results.error = 'navigator.geolocation unavailable';
        out.textContent = JSON.stringify(results, null, 2);
      }
    }

    document.getElementById('btnQuery').addEventListener('click', runDiagnostics);
    // Auto-run on load
    runDiagnostics();
  </script>
</body>
</html>`;

const attendanceHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Portal Presensi Mahasiswa</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
    .box { background: #1e293b; border: 1px solid #334155; padding: 24px; border-radius: 12px; max-width: 480px; }
    .status { color: #22c55e; font-weight: bold; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="box">
    <h2>Hadir Kuliah</h2>
    <div class="status" id="locStatus">Mendeteksi lokasi GPS...</div>
    <div id="locCoords"></div>
  </div>
  <script>
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        document.getElementById('locStatus').textContent = 'Lokasi berhasil diperoleh';
        document.getElementById('locCoords').textContent = 'Lokasi: ' + pos.coords.latitude.toFixed(6) + ', ' + pos.coords.longitude.toFixed(6);
      }, (err) => {
        document.getElementById('locStatus').textContent = 'Gagal mendapatkan lokasi: ' + err.message;
      });
    }
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/diagnostic') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(diagnosticHtml);
  } else if (req.url === '/attendance') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(attendanceHtml);
  } else if (req.url === '/ip-check') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      city: 'Surabaya',
      regionName: 'Jawa Timur',
      isp: 'Institut Teknologi Sepuluh Nopember',
      org: 'Institut Teknologi Sepuluh Nopember'
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Test server running at http://localhost:${PORT}/ (Endpoints: /diagnostic, /attendance, /ip-check)`);
  });
}

module.exports = { server, PORT };

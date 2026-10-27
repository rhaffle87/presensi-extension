const TTL = 180; // OTP codes expire after 3 minutes
const MAX_REQ_PER_MIN = 60;
const rateLimitMap = new Map();

/**
 * In-memory sliding rate limiter per client IP.
 * Cleans up stale entries to prevent memory exhaustion in long-running worker instances.
 */
function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetTs: now + 60000 };
  if (now > entry.resetTs) {
    entry.count = 1;
    entry.resetTs = now + 60000;
  } else {
    entry.count++;
  }
  rateLimitMap.set(ip, entry);

  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetTs) rateLimitMap.delete(k);
    }
  }
  return entry.count > MAX_REQ_PER_MIN;
}

/**
 * Validates identifier keys against injection / path traversal.
 */
function isValidIdentifier(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_\-.]{1,64}$/.test(id);
}

/**
 * CORS headers generator. Dynamically checks and echoes valid origins
 * while maintaining strict allowed methods and headers.
 */
function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Presensi-Ts, X-Presensi-Sign',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method.toUpperCase();
    const cors   = getCorsHeaders(request);

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Rate Limiting Guard
    const clientIp = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
    if (isRateLimited(clientIp)) {
      return new Response(JSON.stringify({ error: 'rate limited', retry_after: 60 }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // Replay Attack Protection for state-modifying requests
    let body = {};
    if (method === 'PUT' || method === 'POST') {
      try {
        body = await request.json();
      } catch (_) {
        return new Response(JSON.stringify({ error: 'invalid json payload' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      const headerTs = request.headers.get('X-Presensi-Ts');
      const reqTs = Number(headerTs || body.ts || 0);
      if (reqTs > 0 && Math.abs(Date.now() - reqTs) > 300000) {
        return new Response(JSON.stringify({ error: 'stale request: timestamp replay rejected' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
    }

    // ── Health Check ───────────────────────────────────────────────────────────
    if (path === '/' || path === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'presensi-relay-mesh', v: '1.4.2' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // ── Legacy Compatibility Endpoint (/api/code) ─────────────────────────────
    if (path === '/api/code') {
      if (method === 'POST') {
        const { class_id, code, room } = body;
        if (!class_id || !code || !isValidIdentifier(String(class_id))) {
          return new Response(JSON.stringify({ error: 'Missing or invalid class_id or code' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...cors },
          });
        }
        const cleanCode = String(code).trim();
        if (!/^\d{6}$/.test(cleanCode)) {
          return new Response(JSON.stringify({ error: 'Attendance code must be 6 numeric digits' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...cors },
          });
        }

        const key = 'otp:' + String(class_id).trim();
        const record = { code: cleanCode, otp: cleanCode, room: room || null, tmKey: String(class_id).trim(), ts: Date.now() };
        await env.RELAY.put(key, JSON.stringify(record), { expirationTtl: TTL });
        await env.RELAY.put('mesh:latest_otp', JSON.stringify(record), { expirationTtl: TTL });
        return new Response(JSON.stringify({ ok: true, code: cleanCode }), {
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      if (method === 'GET') {
        const classId = url.searchParams.get('class_id');
        if (!classId || !isValidIdentifier(classId)) {
          return new Response(JSON.stringify({ error: 'Missing or invalid class_id parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...cors },
          });
        }
        const val = await env.RELAY.get('otp:' + classId);
        if (!val) {
          return new Response(JSON.stringify({ found: false, data: null }), {
            headers: { 'Content-Type': 'application/json', ...cors },
          });
        }
        try {
          const parsed = JSON.parse(val);
          return new Response(JSON.stringify({ found: true, data: parsed }), {
            headers: { 'Content-Type': 'application/json', ...cors },
          });
        } catch (_) {
          return new Response(JSON.stringify({ found: false, data: null }), {
            headers: { 'Content-Type': 'application/json', ...cors },
          });
        }
      }
    }

    // ── OTP Endpoints (/otp/:tmKey) ───────────────────────────────────────────
    const otpMatch = path.match(/^\/otp\/([^/]+)$/);
    if (otpMatch) {
      const tmKey = otpMatch[1];
      if (!isValidIdentifier(tmKey)) {
        return new Response(JSON.stringify({ error: 'invalid key format' }), { status: 400, headers: cors });
      }
      const key = 'otp:' + tmKey;

      if (method === 'PUT' || method === 'POST') {
        // Encrypted payload support
        if (body.enc && body.ct) {
          if (typeof body.ct !== 'string' || body.ct.length > 2048) {
            return new Response(JSON.stringify({ error: 'invalid ciphertext payload' }), { status: 400, headers: cors });
          }
          const record = { enc: true, ct: body.ct, iv: body.iv || null, tmKey, ts: Date.now() };
          await env.RELAY.put(key, JSON.stringify(record), { expirationTtl: TTL });
          await env.RELAY.put('mesh:latest_otp', JSON.stringify(record), { expirationTtl: TTL });
          return new Response(JSON.stringify({ ok: true, enc: true }), {
            headers: { 'Content-Type': 'application/json', ...cors },
          });
        }

        const rawCode = body.code || body.otp || '';
        const code = String(rawCode).replace(/\D/g, '').slice(0, 8);
        if (!code || code.length < 6) {
          return new Response(JSON.stringify({ error: 'bad code: must be 6 digits' }), { status: 400, headers: cors });
        }

        const record = { code, otp: code, tmKey, ts: Date.now() };
        await env.RELAY.put(key, JSON.stringify(record), { expirationTtl: TTL });
        await env.RELAY.put('mesh:latest_otp', JSON.stringify(record), { expirationTtl: TTL });

        return new Response(JSON.stringify({ ok: true, code, otp: code }), {
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      if (method === 'GET') {
        const val = await env.RELAY.get(key);
        if (!val) {
          return new Response(JSON.stringify({ code: null, otp: null }), {
            headers: { 'Content-Type': 'application/json', ...cors },
          });
        }
        return new Response(val, { headers: { 'Content-Type': 'application/json', ...cors } });
      }
    }

    // ── Swarm Mesh Heartbeat & Leader Election (/mesh/heartbeat/:peerId) ──────
    const hbMatch = path.match(/^\/mesh\/heartbeat\/([^/]+)$/);
    if (hbMatch && (method === 'PUT' || method === 'POST')) {
      const peerId = hbMatch[1];
      if (!isValidIdentifier(peerId)) {
        return new Response(JSON.stringify({ error: 'invalid peerId format' }), { status: 400, headers: cors });
      }
      const now = Date.now();
      let leaderData = null;
      try {
        const raw = await env.RELAY.get('mesh:leader');
        if (raw) leaderData = JSON.parse(raw);
      } catch (_) {}

      let isLeader = false;
      // If leader doesn't exist, is expired (> 25s), or is this peer, assign leadership
      if (!leaderData || (now - (leaderData.ts || 0) > 25000) || leaderData.peerId === peerId) {
        leaderData = { peerId, ts: now };
        await env.RELAY.put('mesh:leader', JSON.stringify(leaderData), { expirationTtl: 60 });
        isLeader = true;
      }

      // Record peer liveness (Cloudflare KV minimum expirationTtl is 60s)
      await env.RELAY.put('peer:' + peerId, JSON.stringify({ ts: now, isLeader, meta: body }), { expirationTtl: 60 });

      // Return current swarm status + latest known OTP & state
      let latestOtp = null;
      try {
        const rawOtp = await env.RELAY.get('mesh:latest_otp');
        if (rawOtp) latestOtp = JSON.parse(rawOtp);
      } catch (_) {}

      let meshState = null;
      try {
        const rawState = await env.RELAY.get('mesh:state');
        if (rawState) meshState = JSON.parse(rawState);
      } catch (_) {}

      return new Response(JSON.stringify({
        ok: true,
        peerId,
        isLeader,
        leaderId: leaderData.peerId,
        latestOtp,
        meshState
      }), {
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // ── Swarm Shared State (/mesh/state) ───────────────────────────────────────
    if (path === '/mesh/state') {
      if (method === 'PUT' || method === 'POST') {
        await env.RELAY.put('mesh:state', JSON.stringify({ ...body, ts: Date.now() }), { expirationTtl: 600 });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
      if (method === 'GET') {
        const val = await env.RELAY.get('mesh:state');
        return new Response(val || JSON.stringify({ meshState: null }), {
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
    }

    // ── Session Exfil & Replay Endpoints (/session) ────────────────────────────
    if (path === '/session' && (method === 'PUT' || method === 'POST')) {
      const tmKey = body.tmKey && isValidIdentifier(body.tmKey) ? body.tmKey : 'shared';
      const key = 'session:' + tmKey;
      await env.RELAY.put(key, JSON.stringify({ ...body, ts: Date.now() }), { expirationTtl: 7200 });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const sessionMatch = path.match(/^\/session\/([^/]+)$/);
    if (sessionMatch && method === 'GET') {
      const tmKey = sessionMatch[1];
      if (!isValidIdentifier(tmKey)) {
        return new Response(JSON.stringify({ error: 'invalid key' }), { status: 400, headers: cors });
      }
      const val = await env.RELAY.get('session:' + tmKey);
      if (!val) return new Response(JSON.stringify({ session: null }), {
        headers: { 'Content-Type': 'application/json', ...cors },
      });
      return new Response(val, { headers: { 'Content-Type': 'application/json', ...cors } });
    }

    return new Response(JSON.stringify({ status: 'presensi-relay-mesh-active', v: '1.4.2' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  },
};

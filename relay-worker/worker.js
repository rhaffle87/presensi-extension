const TTL = 180; // OTP codes expire after 3 minutes
const MAX_REQ_PER_MIN = 60;
const rateLimitMap = new Map();

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
  // Periodic cleanup of stale entries if map grows large
  if (rateLimitMap.size > 2000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetTs) rateLimitMap.delete(k);
    }
  }
  return entry.count > MAX_REQ_PER_MIN;
}

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method.toUpperCase();

    const cors = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Presensi-Ts, X-Presensi-Sign',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Rate Limiting Guard
    const clientIp = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
    if (isRateLimited(clientIp)) {
      return new Response(JSON.stringify({ error: 'rate limited' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // Replay Attack Protection for state-modifying requests
    let body = {};
    if (method === 'PUT' || method === 'POST') {
      try { body = await request.json(); } catch (_) { body = {}; }
      const headerTs = request.headers.get('X-Presensi-Ts');
      const reqTs = Number(headerTs || body.ts || 0);
      if (reqTs > 0 && Math.abs(Date.now() - reqTs) > 300000) {
        return new Response(JSON.stringify({ error: 'stale request: timestamp replay rejected' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
    }

    // ── OTP Endpoints (/otp/:tmKey) ───────────────────────────────────────────
    const otpMatch = path.match(/^\/otp\/([^/]+)$/);
    if (otpMatch) {
      const key = 'otp:' + otpMatch[1];

      if (method === 'PUT' || method === 'POST') {
        // Support either encrypted ciphertext payload or raw code
        if (body.enc && body.ct) {
          const record = { enc: true, ct: body.ct, iv: body.iv || null, tmKey: otpMatch[1], ts: Date.now() };
          await env.RELAY.put(key, JSON.stringify(record), { expirationTtl: TTL });
          await env.RELAY.put('mesh:latest_otp', JSON.stringify(record), { expirationTtl: TTL });
          return new Response(JSON.stringify({ ok: true, enc: true }), {
            headers: { 'Content-Type': 'application/json', ...cors },
          });
        }

        const rawCode = body.code || body.otp || '';
        const code = String(rawCode).replace(/\D/g, '').slice(0, 8);
        if (!code) return new Response(JSON.stringify({ error: 'bad code' }), { status: 400, headers: cors });

        const record = { code, otp: code, tmKey: otpMatch[1], ts: Date.now() };
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
      const key = 'session:' + (body.tmKey || 'shared');
      await env.RELAY.put(key, JSON.stringify({ ...body, ts: Date.now() }), { expirationTtl: 7200 });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const sessionMatch = path.match(/^\/session\/([^/]+)$/);
    if (sessionMatch && method === 'GET') {
      const val = await env.RELAY.get('session:' + sessionMatch[1]);
      if (!val) return new Response(JSON.stringify({ session: null }), {
        headers: { 'Content-Type': 'application/json', ...cors },
      });
      return new Response(val, { headers: { 'Content-Type': 'application/json', ...cors } });
    }

    return new Response('presensi-relay-mesh-active', { status: 200, headers: cors });
  },
};

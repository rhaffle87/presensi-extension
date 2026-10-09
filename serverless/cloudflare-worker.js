/**
 * cloudflare-worker.js — Cloudflare Worker KV Code Peer Synchronizer
 *
 * Micro-service for anonymous peer-to-peer distribution of active 6-digit attendance codes.
 * Backed by Cloudflare KV with automated 1-hour expiration TTL.
 *
 * Deploy with:
 *   npx wrangler deploy
 */

export default {
  async fetch(request, env, ctx) {
    // 1. CORS Preflight & Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // 2. Health check
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'presensi-peer-sync' }), {
        status: 200,
        headers: corsHeaders
      });
    }

    // 3. POST /api/code — Share/Publish active attendance code
    if (request.method === 'POST' && url.pathname === '/api/code') {
      try {
        const body = await request.json();
        const { class_id, code, room } = body;

        if (!class_id || !code) {
          return new Response(JSON.stringify({ error: 'Missing class_id or code' }), {
            status: 400,
            headers: corsHeaders
          });
        }

        // Validate 6-digit code format
        const cleanCode = String(code).trim();
        if (!/^\d{6}$/.test(cleanCode)) {
          return new Response(JSON.stringify({ error: 'Attendance code must be 6 numeric digits' }), {
            status: 400,
            headers: corsHeaders
          });
        }

        const key = `class:${String(class_id).trim()}`;
        const record = {
          code: cleanCode,
          room: room || null,
          updated_at: Date.now()
        };

        // Store with 3600s (1 hour) expiration TTL
        if (env.PRESENSI_KV) {
          await env.PRESENSI_KV.put(key, JSON.stringify(record), { expirationTtl: 3600 });
        }

        return new Response(JSON.stringify({ success: true, message: 'Code published to peer pool', key }), {
          status: 200,
          headers: corsHeaders
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: corsHeaders
        });
      }
    }

    // 4. GET /api/code?class_id=XYZ — Retrieve shared attendance code
    if (request.method === 'GET' && url.pathname === '/api/code') {
      const classId = url.searchParams.get('class_id');
      if (!classId) {
        return new Response(JSON.stringify({ error: 'Missing class_id query parameter' }), {
          status: 400,
          headers: corsHeaders
        });
      }

      if (!env.PRESENSI_KV) {
        return new Response(JSON.stringify({ error: 'PRESENSI_KV binding not configured' }), {
          status: 500,
          headers: corsHeaders
        });
      }

      const key = `class:${String(classId).trim()}`;
      const dataStr = await env.PRESENSI_KV.get(key);

      if (!dataStr) {
        return new Response(JSON.stringify({ found: false, message: 'No active code found for this class' }), {
          status: 404,
          headers: corsHeaders
        });
      }

      const parsed = JSON.parse(dataStr);
      return new Response(JSON.stringify({ found: true, data: parsed }), {
        status: 200,
        headers: corsHeaders
      });
    }

    // 5. GET /api/codes — List recent active codes
    if (request.method === 'GET' && url.pathname === '/api/codes') {
      if (!env.PRESENSI_KV) {
        return new Response(JSON.stringify({ error: 'PRESENSI_KV binding not configured' }), {
          status: 500,
          headers: corsHeaders
        });
      }
      try {
        const list = await env.PRESENSI_KV.list({ prefix: 'class:', limit: 20 });
        const items = [];
        for (const key of list.keys) {
          const valStr = await env.PRESENSI_KV.get(key.name);
          if (valStr) {
            const data = JSON.parse(valStr);
            items.push({ class_id: key.name.replace('class:', ''), ...data });
          }
        }
        return new Response(JSON.stringify({ success: true, count: items.length, items }), {
          status: 200,
          headers: corsHeaders
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
  }
};

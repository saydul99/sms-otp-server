// SMS OTP relay — Cloudflare Worker
//
// Storage: Durable Object (SQLite) per routeId, NOT KV.
// Why: KV is eventually consistent — a POST followed by a GET can read a stale
// empty value for up to seconds (the "OTP aane mein late" problem). A Durable
// Object is a single point of truth per route: write → read is immediate at
// every edge. Strong read-after-write consistency = OTP shows up in the
// browser within one poll (250ms) — and with the /ws push endpoint it arrives
// in ~0ms, not after KV propagation.
//
// Endpoints (all CORS-open):
//   POST   /sms                 body { id, sender, content, timestamp }
//   GET    /check-otp/{route}   peek (does NOT delete) — 404 when empty
//   GET    /get-otp/{route}     read + delete — 404 when empty
//   DELETE /clear-all           clear all stored OTPs (known users x pairs)
//   DELETE /clear-all/{route}   clear a single route
//   GET    /check-all/{user}    peek all pairs for a user — 200 always
//   WS     /ws/{route}          WebSocket push — OTPs arrive instantly,
//                               no polling. Client sends "ping" every ~25s.
//   GET    /status              health check
//
// Push: when POST /sms stores an OTP it also broadcasts it to every live
// WebSocket on that route, so the browser shows the OTP in ~0ms instead of
// waiting for the next poll.

const OTP_TTL_MS = 60 * 1000; // 60 seconds for real OTP
const TEST_OTP_TTL_MS = 5 * 1000; // 5 seconds for test OTP

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders },
  });
}

const ROUTE_RE = /^\/(check-otp|get-otp|clear-all|check-all|ws)\/(.+)$/;

// Pairs/users used by the Faster Login desktop app — aggregated by /check-all and /clear-all
const USER_IDS = ['faster_login'];
const DEFAULT_PAIR = 'main';

// ---------------------------------------------------------------------------
// Durable Object — one instance per routeId (idFromName), SQLite-backed storage
// ---------------------------------------------------------------------------
export class OtpStore {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Cache-Control': 'no-store', ...corsHeaders } });
    }

    // POST /sms — the route id lives in the body
    if (path === '/sms' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { id, sender, content } = body;
        if (!id || !content) {
          return json({ error: 'Missing fields' }, 400);
        }
        const otpMatch = content.match(/\b(\d{4,8})\b/);
        const otp = otpMatch ? otpMatch[1] : content.trim();
        await this.state.storage.put('otp', JSON.stringify({ otp, timestamp: Date.now() }));
        await this.state.storage.setAlarm(Date.now() + OTP_TTL_MS);
        this.pushOtp(otp, sender);
        console.log(`[*] SMS for ${id} from ${sender}: ${otp}`);
        return json({ status: 'ok', otp });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // POST /test-sms — testing: store a fixed OTP directly without a real SMS.
    // body { id, otp } — otp can be any 4-8 digit number (e.g. "123456")
    if (path === '/test-sms' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { id, otp } = body;
        if (!id || !otp) {
          return json({ error: 'Missing fields' }, 400);
        }
        const otpClean = String(otp).match(/\d{4,8}/)?.[0] || null;
        if (!otpClean) {
          return json({ error: 'OTP must be 4-8 digits' }, 400);
        }
        await this.state.storage.put('otp', JSON.stringify({ otp: otpClean, timestamp: Date.now(), isTest: true }));
        await this.state.storage.setAlarm(Date.now() + TEST_OTP_TTL_MS);
        this.pushOtp(otpClean, 'TEST');
        console.log(`[*] TEST-SMS for ${id}: ${otpClean}`);
        return json({ status: 'ok', otp: otpClean });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    const m = path.match(ROUTE_RE);
    if (m) {
      const op = m[1];
      const method = request.method;

      // WebSocket upgrade — the extension keeps one long-lived connection open.
      // All OTP pushes for this route go out over it instantly.
      if (op === 'ws' && method === 'GET') {
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        server.accept();
        this.state.acceptWebSocket(server);
        return new Response(null, { status: 101, webSocket: client });
      }

      if (op === 'clear-all' && method === 'DELETE') {
        const existing = await this.state.storage.get('otp');
        if (existing) {
          await this.state.storage.delete('otp');
        }
        return json({ status: 'ok', deleted: existing ? 1 : 0 });
      }

      const raw = await this.state.storage.get('otp');
      if (!raw) {
        if (op === 'check-otp') {
          return json({ status: 'empty', otp: null, note: 'Abhi koi OTP nahi aaya ya 2 min mein expire ho gaya' }, 404);
        }
        if (op === 'check-all') {
          return json({ status: 'ok', otp: null });
        }
        return json({ status: 'pending', otp: null }, 404);
      }

      const data = JSON.parse(raw);
      const ttl = data.isTest ? TEST_OTP_TTL_MS : OTP_TTL_MS;
      if (Date.now() - data.timestamp > ttl) {
        await this.state.storage.delete('otp');
        if (op === 'check-otp') {
          return json({ status: 'empty', otp: null, note: 'Expired' }, 404);
        }
        if (op === 'check-all') {
          return json({ status: 'ok', otp: null });
        }
        return json({ status: 'pending', otp: null }, 404);
      }

      if (op === 'get-otp') {
        await this.state.storage.delete('otp');
        return json({ status: 'success', otp: data.otp, isTest: !!data.isTest });
      }

      const ageMs = Date.now() - data.timestamp;
      const remainingSec = Math.max(0, Math.round((OTP_TTL_MS - ageMs) / 1000));
      return json({
        status: 'received',
        otp: data.otp,
        isTest: !!data.isTest,
        expires_in_sec: remainingSec,
        note: 'OTP server pe hai - DELETE nahi hua',
      });
    }

    return json({ error: 'Not found' }, 404);
  }

  // Broadcast an OTP to every live WebSocket on this route (instant delivery).
  pushOtp(otp, sender) {
    const sockets = this.state.getWebSockets();
    if (!sockets || sockets.length === 0) return;
    const msg = JSON.stringify({ otp, timestamp: Date.now(), sender: sender || '' });
    for (const s of sockets) {
      try { s.send(msg); } catch (e) {}
    }
  }

  // Keep-alive: reply "pong" to the extension's periodic "ping".
  async webSocketMessage(ws, message) {
    if (message === 'ping') {
      try { ws.send('pong'); } catch (e) {}
    }
  }

  // Alarm fires 2 minutes after the last write → free the storage slot.
  async alarm() {
    await this.state.storage.delete('otp');
  }
}

// ---------------------------------------------------------------------------
// Entry point — route each request to its route's Durable Object
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Cache-Control': 'no-store', ...corsHeaders } });
    }

    // POST /sms — need the body to learn the route id
    if (path === '/sms' && request.method === 'POST') {
      let routeId;
      let body;
      try {
        body = await request.json();
        routeId = body && body.id;
      } catch (e) {
        return json({ error: e.message }, 400);
      }
      if (!routeId || !body.content) {
        return json({ error: 'Missing fields' }, 400);
      }
      const stub = env.OTP.get(env.OTP.idFromName(routeId));
      return stub.fetch(
        new Request('https://durable-object/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
    }

    // POST /test-sms — testing: store a fixed 4-8 digit OTP without a real SMS
    if (path === '/test-sms' && request.method === 'POST') {
      let routeId;
      let body;
      try {
        body = await request.json();
        routeId = body && body.id;
      } catch (e) {
        return json({ error: e.message }, 400);
      }
      if (!routeId || !body.otp) {
        return json({ error: 'Missing fields' }, 400);
      }
      const stub = env.OTP.get(env.OTP.idFromName(routeId));
      return stub.fetch(
        new Request('https://durable-object/test-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
    }

    // DELETE /clear-all — clear the single route for every user.
    if (path === '/clear-all' && request.method === 'DELETE') {
      let deleted = 0;
      for (const user of USER_IDS) {
        const stub = env.OTP.get(env.OTP.idFromName(`${user}_${DEFAULT_PAIR}`));
        try {
          const r = await stub.fetch(new Request('https://durable-object/clear-all', { method: 'DELETE' }));
          const d = await r.json();
          deleted += (d && d.deleted) || 0;
        } catch (e) {}
      }
      return json({ status: 'ok', deleted });
    }

    const m = path.match(ROUTE_RE);
    if (m) {
      const op = m[1];
      const routeId = decodeURIComponent(m[2]);

      // check-all/{user} — peek the single pair for a user, single response.
      if (op === 'check-all') {
        const stub = env.OTP.get(env.OTP.idFromName(`${routeId}_${DEFAULT_PAIR}`));
        try {
          const r = await stub.fetch(new Request('https://durable-object/check-all/self'));
          const d = await r.json();
          return json({ status: 'ok', otp: d && d.otp ? d.otp : null, isTest: d && d.isTest ? true : false });
        } catch (e) {
          return json({ status: 'ok', otp: null, isTest: false });
        }
      }

      const stub = env.OTP.get(env.OTP.idFromName(routeId));
      return stub.fetch(request);
    }

    if (path === '/status' && request.method === 'GET') {
      const stored = [];
      for (const user of USER_IDS) {
        const stub = env.OTP.get(env.OTP.idFromName(`${user}_${DEFAULT_PAIR}`));
        try {
          const r = await stub.fetch(new Request('https://durable-object/check-all/self'));
          const d = await r.json();
          if (d && d.otp) stored.push(`${user}_${DEFAULT_PAIR}`);
        } catch (e) {}
      }
      return json({
        server: 'running',
        stored_otps: stored,
        total: stored.length,
        worker: 'Cloudflare Workers',
        storage: 'durable-object',
      });
    }

    return json({ error: 'Not found' }, 404);
  },
};

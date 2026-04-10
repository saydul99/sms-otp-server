export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Each routeId gets its own KV key — no race condition
    const saveOTP = async (userId, otp) => {
      await env.OTP_STORE.put(`otp:${userId}`, JSON.stringify({ otp, timestamp: Date.now() }));
    };
    const getOTP = async (userId) => {
      // cacheTtl=60 forces fresh read from central KV store, bypasses edge cache
      const data = await env.OTP_STORE.get(`otp:${userId}`, { cacheTtl: 60 });
      return data ? JSON.parse(data) : null;
    };
    const deleteOTP = async (userId) => {
      await env.OTP_STORE.delete(`otp:${userId}`);
    };

    if (path === '/sms' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { id, sender, content, timestamp } = body;
        if (!id || !content) {
          return new Response(JSON.stringify({ error: 'Missing fields' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        const otpMatch = content.match(/\b(\d{4,8})\b/);
        const otp = otpMatch ? otpMatch[1] : content.trim();
        console.log(`[*] SMS for ${id} from ${sender}: ${otp}`);
        await saveOTP(id, otp);
        return new Response(JSON.stringify({ status: 'ok', otp: otp }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (path.startsWith('/check-otp/') && request.method === 'GET') {
      const userId = path.split('/check-otp/')[1];
      const data = await getOTP(userId);
      if (data) {
        return new Response(JSON.stringify({
          status: 'received',
          otp: data.otp,
          note: 'OTP server pe hai - DELETE nahi hua'
        }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
      return new Response(JSON.stringify({
        status: 'empty',
        otp: null,
        note: 'Abhi koi OTP nahi aaya'
      }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (path.startsWith('/get-otp/') && request.method === 'GET') {
      const userId = path.split('/get-otp/')[1];
      const data = await getOTP(userId);
      if (data) {
        await deleteOTP(userId);
        return new Response(JSON.stringify({
          status: 'success',
          otp: data.otp
        }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
      return new Response(JSON.stringify({
        status: 'pending',
        otp: null
      }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (path === '/clear-all' && request.method === 'DELETE') {
      const PAIR_IDS = ['P1', 'P2', 'P3', 'P4'];
      const USER_IDS = ['haque_1'];
      let deleted = 0;
      for (const user of USER_IDS) {
        for (const pair of PAIR_IDS) {
          const key = `otp:${user}_${pair}`;
          const existing = await env.OTP_STORE.get(key);
          if (existing) {
            await env.OTP_STORE.delete(key);
            deleted++;
          }
        }
      }
      return new Response(JSON.stringify({ status: 'ok', deleted }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Single request mein saare OTPs — polling ke liye efficient
    if (path.startsWith('/check-all/') && request.method === 'GET') {
      const userId = path.split('/check-all/')[1];
      const pairs = ['P1', 'P2', 'P3', 'P4'];
      const result = {};
      await Promise.all(pairs.map(async (pair) => {
        const data = await env.OTP_STORE.get(`otp:${userId}_${pair}`, { cacheTtl: 60 });
        result[pair] = data ? JSON.parse(data).otp : null;
      }));
      return new Response(JSON.stringify({ status: 'ok', otps: result }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (path === '/status' && request.method === 'GET') {
      const PAIR_IDS = ['P1', 'P2', 'P3', 'P4'];
      const USER_IDS = ['haque_1'];
      const stored = [];
      for (const user of USER_IDS) {
        for (const pair of PAIR_IDS) {
          const key = `otp:${user}_${pair}`;
          const data = await env.OTP_STORE.get(key);
          if (data) stored.push(`${user}_${pair}`);
        }
      }
      return new Response(JSON.stringify({
        server: 'running',
        stored_otps: stored,
        total: stored.length,
        worker: 'Cloudflare Workers'
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
};

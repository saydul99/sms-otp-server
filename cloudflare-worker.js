export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    const saveOTP = async (userId, otp) => {
      const data = await env.OTP_STORE.get('data');
      const store = data ? JSON.parse(data) : {};
      store[userId] = { otp, timestamp: Date.now() };
      await env.OTP_STORE.put('data', JSON.stringify(store));
    };
    const getOTP = async (userId) => {
      const data = await env.OTP_STORE.get('data');
      if (data) {
        const store = JSON.parse(data);
        return store[userId] || null;
      }
      return null;
    };
    const deleteOTP = async (userId) => {
      const data = await env.OTP_STORE.get('data');
      if (data) {
        const store = JSON.parse(data);
        delete store[userId];
        await env.OTP_STORE.put('data', JSON.stringify(store));
      }
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
      const data = await env.OTP_STORE.get('data');
      const store = data ? JSON.parse(data) : {};
      const deleted = Object.keys(store).length;
      await env.OTP_STORE.put('data', JSON.stringify({}));
      return new Response(JSON.stringify({ status: 'ok', deleted: deleted }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    if (path === '/status' && request.method === 'GET') {
      const data = await env.OTP_STORE.get('data');
      const store = data ? JSON.parse(data) : {};
      return new Response(JSON.stringify({
        server: 'running',
        stored_otps: Object.keys(store),
        total: Object.keys(store).length,
        worker: 'Cloudflare Workers'
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
};
